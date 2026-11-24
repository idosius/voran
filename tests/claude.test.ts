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
    const segments = [
      { text: 'Die Kinder ' },
      { original: 'spielt', fixed: 'spielen', reason: 'verb agreement' },
      { text: '.' },
    ];
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(toolUse({ segments }))));
    const result = await fixGerman('Die Kinder spielt.', 'sk-test', fetchMock);

    expect(result).toEqual({ fixed: 'Die Kinder spielen.', segments });
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

  it('realigns corrections onto the real input when the model re-typed unchanged text', async () => {
    const change = { original: 'spielt', fixed: 'spielen', reason: 'verb agreement' };
    const segments = [{ text: 'Die  Kinder\u{A0}' }, change, { text: '!' }];
    const result = await fixGerman(
      'Die Kinder spielt.',
      'k',
      fetchReturning(jsonResponse(toolUse({ segments }))),
    );
    expect(result).toEqual({
      fixed: 'Die Kinder spielen.',
      segments: [{ text: 'Die Kinder ' }, change, { text: '.' }],
    });
  });

  it('anchors a repeated word at the position the model reached', async () => {
    const change = { original: 'und', fixed: 'oder', reason: 'meaning' };
    const result = await fixGerman(
      'und Tee und Kaffee',
      'k',
      fetchReturning(jsonResponse(toolUse({ segments: [{ text: 'und Tee ' }, change] }))),
    );
    expect(result.fixed).toBe('und Tee oder Kaffee');
  });

  it('places insertions and drops corrections it cannot find', async () => {
    const insert = { original: '', fixed: ',', reason: 'comma' };
    const ghost = { original: 'xyz', fixed: 'abc', reason: 'nope' };
    const result = await fixGerman(
      'Ich weiß dass es geht',
      'k',
      fetchReturning(jsonResponse(toolUse({ segments: [{ text: 'Ich weiß' }, insert, ghost] }))),
    );
    expect(result).toEqual({
      fixed: 'Ich weiß, dass es geht',
      segments: [{ text: 'Ich weiß' }, insert, { text: ' dass es geht' }],
    });
  });

  it('anchors an insertion by its preceding text when the model re-typed whitespace', async () => {
    const insert = { original: '', fixed: ',', reason: 'comma' };
    const result = await fixGerman(
      'Heute  und morgen weiß dass es geht',
      'k',
      fetchReturning(
        jsonResponse(
          toolUse({ segments: [{ text: 'Heute und morgen weiß' }, insert, { text: ' dass' }] }),
        ),
      ),
    );
    expect(result.fixed).toBe('Heute  und morgen weiß, dass es geht');
  });

  it('keeps later anchors right after dropping an unfindable correction', async () => {
    const ghost = { original: 'Y', fixed: 'Z', reason: 'nope' };
    const change = { original: 'und', fixed: 'oder', reason: 'meaning' };
    const result = await fixGerman(
      'und Tee X und Kaffee',
      'k',
      fetchReturning(
        jsonResponse(
          toolUse({
            segments: [{ text: 'und Tee ' }, ghost, { text: ' ' }, change, { text: ' Kaffee' }],
          }),
        ),
      ),
    );
    expect(result.fixed).toBe('und Tee X oder Kaffee');
  });

  it('errors instead of reporting "correct" when no correction can be placed', async () => {
    const ghost = { original: 'xyz', fixed: 'abc', reason: 'nope' };
    await expect(
      fixGerman('Hallo', 'k', fetchReturning(jsonResponse(toolUse({ segments: [ghost] })))),
    ).rejects.toThrow(/Unexpected response/);
  });

  it('ignores no-op corrections', async () => {
    const noop = { original: 'a', fixed: 'a', reason: 'same' };
    const result = await fixGerman(
      'a b',
      'k',
      fetchReturning(jsonResponse(toolUse({ segments: [noop, { text: ' b' }] }))),
    );
    expect(result).toEqual({ fixed: 'a b', segments: [{ text: 'a b' }] });
  });

  it('rejects a submit_correction without valid segments', async () => {
    await expect(
      fixGerman('a', 'k', fetchReturning(jsonResponse(toolUse({ segments: [{ nope: 1 }] })))),
    ).rejects.toThrow(/Unexpected response/);
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
  const okBody = toolUse({ segments: [{ text: 'a' }] });

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
    expect(result).toEqual({ fixed: 'Ich bin müde.', segments: [] });
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
