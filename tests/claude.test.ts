import { describe, expect, it, vi } from 'vitest';
import { ClaudeError, fixGerman } from '../src/claude';
import { MAX_INPUT_CHARS, MODEL } from '../src/constants';

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function toolUse(input: unknown): unknown {
  return {
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: 'x' },
      { type: 'tool_use', name: 'submit_correction', input },
    ],
  };
}

function fetchReturning(response: Response | Error): typeof fetch {
  return vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

describe('fixGerman', () => {
  it('sends the expected request and returns the tool input', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(toolUse({ fixed: 'Die Kinder spielen.', notes: ['spielt -> spielen'] })),
      ),
    );
    const result = await fixGerman('Die Kinder spielt.', 'sk-test', fetchMock);

    expect(result).toEqual({ fixed: 'Die Kinder spielen.', notes: ['spielt -> spielen'] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'x-api-key': 'sk-test',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['model']).toBe(MODEL);
    expect(body['tool_choice']).toEqual({ type: 'any' });
    expect(body['messages']).toEqual([{ role: 'user', content: 'Die Kinder spielt.' }]);
  });

  it('rejects over-long input without calling the API', async () => {
    const fetchMock = vi.fn();
    await expect(
      fixGerman('x'.repeat(MAX_INPUT_CHARS + 1), 'k', fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/too long/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, /API key rejected/],
    [403, /API key rejected/],
    [429, /Rate limited/],
    [500, /unavailable/],
    [400, /HTTP 400/],
  ])('maps HTTP %i to a readable error', async (status, pattern) => {
    await expect(fixGerman('a', 'k', fetchReturning(jsonResponse({}, status)))).rejects.toThrow(
      pattern,
    );
  });

  it('maps network failures', async () => {
    await expect(fixGerman('a', 'k', fetchReturning(new TypeError('offline')))).rejects.toThrow(
      /Network error/,
    );
  });

  it('rejects unparsable bodies', async () => {
    await expect(fixGerman('a', 'k', fetchReturning(new Response('not json')))).rejects.toThrow(
      /Unreadable/,
    );
  });

  it('rejects truncated output', async () => {
    const body = { stop_reason: 'max_tokens', content: [] };
    await expect(fixGerman('a', 'k', fetchReturning(jsonResponse(body)))).rejects.toThrow(
      /too long/,
    );
  });

  it.each([
    ['non-object body', 'oops'],
    ['missing content', {}],
    ['no tool block', { content: [{ type: 'text', text: 'hi' }] }],
    ['invalid tool input', toolUse({ fixed: 1 })],
  ])('rejects %s', async (_label, body) => {
    let error: unknown;
    try {
      await fixGerman('a', 'k', fetchReturning(jsonResponse(body)));
    } catch (error_) {
      error = error_;
    }
    expect(error).toBeInstanceOf(ClaudeError);
    expect((error as ClaudeError).message).toMatch(/Unexpected response/);
  });
});

describe('fixGerman request limits', () => {
  const okBody = toolUse({ fixed: 'a', notes: [] });

  it('rejects blank input without calling the API', async () => {
    const fetchMock = vi.fn();
    await expect(fixGerman('  \n ', 'k', fetchMock)).rejects.toThrow(/Nothing to correct/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sizes max_tokens to at least one token per input character', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(okBody)));
    await fixGerman('x'.repeat(7000), 'k', fetchMock);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['max_tokens']).toBeGreaterThanOrEqual(7000);
  });

  it('passes an abort signal to fetch', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(okBody)));
    await fixGerman('a', 'k', fetchMock);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports a timeout while waiting for the response', async () => {
    const timeout = new DOMException('timed out', 'TimeoutError');
    await expect(fixGerman('a', 'k', fetchReturning(timeout))).rejects.toThrow(/timed out/);
  });

  it('reports a timeout while reading the body', async () => {
    const response = {
      ok: true,
      json: () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
    } as unknown as Response;
    await expect(fixGerman('a', 'k', fetchReturning(response))).rejects.toThrow(/timed out/);
  });
});

function confirmReply(): unknown {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', name: 'confirm_correct', input: {} }],
  };
}

describe('fixGerman confirm_correct reply', () => {
  it('treats confirm_correct as already correct and returns the original text', async () => {
    const result = await fixGerman(
      'Ich bin müde.',
      'k',
      fetchReturning(jsonResponse(confirmReply())),
    );
    expect(result).toEqual({ fixed: 'Ich bin müde.', notes: [] });
  });

  it('offers both tools and forces a tool call', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(confirmReply())));
    await fixGerman('a', 'k', fetchMock);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      tools: { name: string }[];
      tool_choice: unknown;
      system: string;
    };
    expect(body.tools.map((tool) => tool.name)).toEqual(['submit_correction', 'confirm_correct']);
    expect(body.tool_choice).toEqual({ type: 'any' });
    expect(body.system).toContain('confirm_correct');
  });

  it('rejects plain text replies', async () => {
    const body = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'AOK' }] };
    await expect(fixGerman('a', 'k', fetchReturning(jsonResponse(body)))).rejects.toThrow(
      /Unexpected response/,
    );
  });

  it('ignores malformed and unrelated blocks', async () => {
    const body = { content: ['junk', { type: 'tool_use', name: 'other', input: {} }] };
    await expect(fixGerman('a', 'k', fetchReturning(jsonResponse(body)))).rejects.toThrow(
      /Unexpected response/,
    );
  });
});
