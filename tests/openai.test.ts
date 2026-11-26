import { describe, expect, it, vi } from 'vitest';
import { MODELS } from '../src/constants';
import { buildSystemPrompt, CorrectionError, fixText } from '../src/correction';
import { DEFAULT_SETTINGS, type Settings } from '../src/languages';

const OPENAI: Settings = { ...DEFAULT_SETTINGS, provider: 'openai' };

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function functionCall(name: string, args: unknown): unknown {
  return {
    status: 'completed',
    output: [
      { type: 'reasoning', summary: [] },
      {
        type: 'function_call',
        call_id: 'call_1',
        name,
        arguments: typeof args === 'string' ? args : JSON.stringify(args),
      },
    ],
  };
}

function plainReply(): unknown {
  return {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Looks fine.' }] }],
  };
}

function fetchReturning(...bodies: unknown[]): ReturnType<typeof vi.fn<typeof fetch>> {
  const mock = vi.fn<typeof fetch>();
  for (const body of bodies) {
    mock.mockResolvedValueOnce(body instanceof Response ? body : jsonResponse(body));
  }
  return mock;
}

function fix(text: string, fetchImpl: typeof fetch): ReturnType<typeof fixText> {
  return fixText(text, 'sk-openai', OPENAI, fetchImpl);
}

function sentBody(fetchMock: ReturnType<typeof fetchReturning>, call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1];
  return JSON.parse(init?.body as string) as Record<string, unknown>;
}

describe('fixText with OpenAI', () => {
  it('sends a Responses API request with both tools', async () => {
    const segments = [
      { text: 'Die Kinder ' },
      { original: 'spielt', fixed: 'spielen', reason: 'verb agreement' },
      { text: '.' },
    ];
    const fetchMock = fetchReturning(
      functionCall('submit_correction', { language: 'German', segments }),
    );
    const result = await fix('Die Kinder spielt.', fetchMock);

    expect(result).toEqual({ fixed: 'Die Kinder spielen.', segments, language: 'German' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer sk-openai',
    });
    const body = sentBody(fetchMock);
    expect(body).toMatchObject({
      model: MODELS.openai,
      instructions: buildSystemPrompt(OPENAI),
      input: 'Die Kinder spielt.',
      reasoning: { effort: 'low' },
      tool_choice: 'auto',
      store: false,
    });
    expect(body['max_output_tokens']).toBeGreaterThan(18 * 2);
    expect(body['tools']).toMatchObject([
      { type: 'function', name: 'submit_correction', strict: false },
      { type: 'function', name: 'confirm_correct', strict: false },
    ]);
  });

  it('treats confirm_correct as already correct', async () => {
    const result = await fix('Ich bin müde.', fetchReturning(functionCall('confirm_correct', {})));
    expect(result).toEqual({ fixed: 'Ich bin müde.', segments: [] });
  });

  it('retries once on a plain answer, then treats the text as correct', async () => {
    const fetchMock = fetchReturning(plainReply(), plainReply());
    const result = await fix('Gut.', fetchMock);
    expect(result).toEqual({ fixed: 'Gut.', segments: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the tool call of the retry', async () => {
    const fetchMock = fetchReturning(plainReply(), functionCall('confirm_correct', {}));
    expect(await fix('Gut.', fetchMock)).toEqual({ fixed: 'Gut.', segments: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a refusal', async () => {
    const refusal = {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No.' }] }],
    };
    const fetchMock = fetchReturning(refusal);
    await expect(fix('a', fetchMock)).rejects.toThrow('Unexpected response from OpenAI.');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports output cut off by the token limit', async () => {
    const body = {
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [],
    };
    await expect(fix('a', fetchReturning(body))).rejects.toThrow(/too long/);
  });

  it.each([
    ['non-object body', 'oops'],
    ['missing output', { status: 'completed' }],
    ['unrelated function', functionCall('other', {})],
    ['incomplete for another reason', { status: 'incomplete', output: ['junk'] }],
  ])('rejects %s', async (_label, body) => {
    const result = fix('a', fetchReturning(body));
    await expect(result).rejects.toBeInstanceOf(CorrectionError);
    await expect(result).rejects.toThrow('Unexpected response from OpenAI.');
  });

  const nonStringArguments = {
    status: 'completed',
    output: [{ type: 'function_call', name: 'submit_correction', arguments: 1 }],
  };

  it.each([
    ['invalid arguments JSON', functionCall('submit_correction', '{not json')],
    ['non-string arguments', nonStringArguments],
  ])('retries %s once, then rejects instead of calling the text correct', async (_label, body) => {
    const fetchMock = fetchReturning(body, body);
    await expect(fix('a', fetchMock)).rejects.toThrow('Unexpected response from OpenAI.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses the retry after garbled arguments', async () => {
    const fetchMock = fetchReturning(
      functionCall('submit_correction', '{not json'),
      functionCall('confirm_correct', {}),
    );
    expect(await fix('Gut.', fetchMock)).toEqual({ fixed: 'Gut.', segments: [] });
  });

  it('never sends an Anthropic key to OpenAI', async () => {
    const fetchMock = fetchReturning();
    await expect(fixText('a', 'sk-ant-api03-x', OPENAI, fetchMock)).rejects.toThrow(
      'This is an Anthropic API key. Enter your OpenAI key in the extension options.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['sk-proj-abc', 'sk-svcacct-abc', 'sk-abc'])(
    'never sends the OpenAI key %s to Anthropic',
    async (key) => {
      const fetchMock = fetchReturning();
      await expect(fixText('a', key, DEFAULT_SETTINGS, fetchMock)).rejects.toThrow(
        'This is an OpenAI API key. Enter your Anthropic key in the extension options.',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('explains a 429 for an account without credit', async () => {
    const body = { error: { code: 'insufficient_quota', message: 'quota' } };
    await expect(fix('a', fetchReturning(jsonResponse(body, 429)))).rejects.toThrow(
      'No OpenAI credit left. Check billing for your API key.',
    );
  });

  it.each([
    ['another 429 code', jsonResponse({ error: { code: 'rate_limit_exceeded' } }, 429)],
    ['a 429 without JSON', new Response('slow down', { status: 429 })],
  ])('keeps the rate-limit message for %s', async (_label, response) => {
    await expect(fix('a', fetchReturning(response))).rejects.toThrow(/Rate limited/);
  });

  it('names OpenAI in server errors', async () => {
    await expect(fix('a', fetchReturning(jsonResponse({}, 503)))).rejects.toThrow(
      'OpenAI is temporarily unavailable. Try again.',
    );
  });

  it('names OpenAI for an unreadable body', async () => {
    await expect(fix('a', fetchReturning(new Response('not json')))).rejects.toThrow(
      'Unreadable response from OpenAI.',
    );
  });
});
