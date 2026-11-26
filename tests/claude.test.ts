import { describe, expect, it, vi } from 'vitest';
import { buildSystemPrompt, CorrectionError, fixText } from '../src/correction';
import { MAX_INPUT_CHARS, MODELS } from '../src/constants';
import { DEFAULT_SETTINGS, type Settings } from '../src/languages';

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

interface SystemBlock {
  type: string;
  text: string;
  cache_control?: unknown;
}

function systemText(blocks: readonly SystemBlock[]): string {
  return blocks.map((block) => block.text).join('');
}

function fix(text: string, key: string, fetchImpl: typeof fetch): ReturnType<typeof fixText> {
  return fixText(text, key, DEFAULT_SETTINGS, fetchImpl);
}

function fetchReturning(response: Response | Error): typeof fetch {
  // A fresh copy per call: a retried request must not read an already consumed body.
  return vi.fn(() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response instanceof Response ? response.clone() : response),
  );
}

describe('fixText', () => {
  it('sends the expected request and returns the tool input', async () => {
    const segments = [
      { text: 'Die Kinder ' },
      { original: 'spielt', fixed: 'spielen', reason: 'verb agreement' },
      { text: '.' },
    ];
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(toolUse({ segments }))));
    const result = await fix('Die Kinder spielt.', 'sk-test', fetchMock);

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
    expect(body['model']).toBe(MODELS.anthropic);
    expect(body['tool_choice']).toEqual({ type: 'auto' });
    expect(body['output_config']).toEqual({ effort: 'low' });
    expect(body['messages']).toEqual([{ role: 'user', content: 'Die Kinder spielt.' }]);
  });

  it('realigns corrections onto the real input when the model re-typed unchanged text', async () => {
    const change = { original: 'spielt', fixed: 'spielen', reason: 'verb agreement' };
    const segments = [{ text: 'Die  Kinder\u{A0}' }, change, { text: '!' }];
    const result = await fix(
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
    const result = await fix(
      'und Tee und Kaffee',
      'k',
      fetchReturning(jsonResponse(toolUse({ segments: [{ text: 'und Tee ' }, change] }))),
    );
    expect(result.fixed).toBe('und Tee oder Kaffee');
  });

  it('places insertions and drops corrections it cannot find', async () => {
    const insert = { original: '', fixed: ',', reason: 'comma' };
    const ghost = { original: 'xyz', fixed: 'abc', reason: 'nope' };
    const result = await fix(
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
    const result = await fix(
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
    const result = await fix(
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
      fix('Hallo', 'k', fetchReturning(jsonResponse(toolUse({ segments: [ghost] })))),
    ).rejects.toThrow(/Unexpected response/);
  });

  it('ignores no-op corrections', async () => {
    const noop = { original: 'a', fixed: 'a', reason: 'same' };
    const result = await fix(
      'a b',
      'k',
      fetchReturning(jsonResponse(toolUse({ segments: [noop, { text: ' b' }] }))),
    );
    expect(result).toEqual({ fixed: 'a b', segments: [{ text: 'a b' }] });
  });

  it('rejects a submit_correction without valid segments', async () => {
    await expect(
      fix('a', 'k', fetchReturning(jsonResponse(toolUse({ segments: [{ nope: 1 }] })))),
    ).rejects.toThrow(/Unexpected response/);
  });

  it('rejects over-long input without calling the API', async () => {
    const fetchMock = vi.fn();
    await expect(
      fix('x'.repeat(MAX_INPUT_CHARS + 1), 'k', fetchMock as unknown as typeof fetch),
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
    await expect(fix('a', 'k', fetchReturning(jsonResponse({}, status)))).rejects.toThrow(pattern);
  });

  it('maps network failures', async () => {
    await expect(fix('a', 'k', fetchReturning(new TypeError('offline')))).rejects.toThrow(
      /Network error/,
    );
  });

  it('rejects unparsable bodies', async () => {
    await expect(fix('a', 'k', fetchReturning(new Response('not json')))).rejects.toThrow(
      /Unreadable/,
    );
  });

  it('rejects truncated output', async () => {
    const body = { stop_reason: 'max_tokens', content: [] };
    await expect(fix('a', 'k', fetchReturning(jsonResponse(body)))).rejects.toThrow(/too long/);
  });

  it.each([
    ['non-object body', 'oops'],
    ['missing content', {}],
    ['no tool block', { content: [{ type: 'text', text: 'hi' }] }],
    ['invalid tool input', toolUse({ fixed: 1 })],
  ])('rejects %s', async (_label, body) => {
    let error: unknown;
    try {
      await fix('a', 'k', fetchReturning(jsonResponse(body)));
    } catch (error_) {
      error = error_;
    }
    expect(error).toBeInstanceOf(CorrectionError);
    expect((error as CorrectionError).message).toMatch(/Unexpected response/);
  });
});

describe('fixText request limits', () => {
  const okBody = toolUse({ segments: [{ text: 'a' }] });

  it('rejects blank input without calling the API', async () => {
    const fetchMock = vi.fn();
    await expect(fix('  \n ', 'k', fetchMock)).rejects.toThrow(/Nothing to correct/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects input without letters without calling the API', async () => {
    const fetchMock = vi.fn();
    await expect(fix(' 12,345.67 € — 50% ', 'k', fetchMock)).rejects.toThrow(/Nothing to correct/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks a single letter in any script', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(okBody)));
    await fix('42 ש', 'k', fetchMock);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('marks the tools and system prompt as a cacheable prefix', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(okBody)));
    await fix('a', 'k', fetchMock);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { system: SystemBlock[]; messages: unknown };
    expect(body.system).toEqual([
      {
        type: 'text',
        text: buildSystemPrompt(DEFAULT_SETTINGS),
        cache_control: { type: 'ephemeral' },
      },
    ]);
    // The user text stays after the breakpoint, so it never takes part in the cached prefix.
    expect(body.messages).toEqual([{ role: 'user', content: 'a' }]);
  });

  it('sizes max_tokens to two tokens per input character plus room for thinking', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(okBody)));
    await fix('x'.repeat(7000), 'k', fetchMock);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['max_tokens']).toBeGreaterThanOrEqual(14_000 + 6000);
  });

  it('passes an abort signal to fetch', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(okBody)));
    await fix('a', 'k', fetchMock);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports a timeout while waiting for the response', async () => {
    const timeout = new DOMException('timed out', 'TimeoutError');
    await expect(fix('a', 'k', fetchReturning(timeout))).rejects.toThrow(/timed out/);
  });

  it('reports a timeout while reading the body', async () => {
    const response = {
      ok: true,
      json: () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
    } as unknown as Response;
    await expect(fix('a', 'k', fetchReturning(response))).rejects.toThrow(/timed out/);
  });
});

function confirmReply(): unknown {
  return {
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', name: 'confirm_correct', input: {} }],
  };
}

describe('fixText confirm_correct reply', () => {
  it('treats confirm_correct as already correct and returns the original text', async () => {
    const result = await fix('Ich bin müde.', 'k', fetchReturning(jsonResponse(confirmReply())));
    expect(result).toEqual({ fixed: 'Ich bin müde.', segments: [] });
  });

  it('offers both tools and lets the model choose, keeping thinking on', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(confirmReply())));
    await fix('a', 'k', fetchMock);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      tools: { name: string }[];
      tool_choice: unknown;
      system: SystemBlock[];
    };
    expect(body.tools.map((tool) => tool.name)).toEqual(['submit_correction', 'confirm_correct']);
    expect(body.tool_choice).toEqual({ type: 'auto' });
    expect(systemText(body.system)).toContain('confirm_correct');
  });

  it('treats two plain text replies as already correct', async () => {
    const body = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Looks fine.' }] };
    const fetchMock = fetchReturning(jsonResponse(body));
    const result = await fix('Ich bin müde.', 'k', fetchMock);
    expect(result).toEqual({ fixed: 'Ich bin müde.', segments: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a reply cut off by max_tokens', async () => {
    const body = { stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] };
    const fetchMock = fetchReturning(jsonResponse(body));
    await expect(fix('a', 'k', fetchMock)).rejects.toThrow(/too long/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a refusal', async () => {
    const body = { stop_reason: 'refusal', content: [] };
    const fetchMock = fetchReturning(jsonResponse(body));
    await expect(fix('a', 'k', fetchMock)).rejects.toThrow(/Unexpected response/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one deadline between the first request and the retry', async () => {
    const plain = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Looks fine.' }] };
    const fetchMock = fetchReturning(jsonResponse(plain));
    await fix('a', 'k', fetchMock);
    const [first, second] = vi.mocked(fetchMock).mock.calls as unknown as [string, RequestInit][];
    expect(second?.[1].signal).toBe(first?.[1].signal);
  });

  it('retries once when the model answers without calling a tool', async () => {
    const plain = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Looks fine.' }] };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(plain))
      .mockResolvedValueOnce(jsonResponse(confirmReply()));
    const result = await fix('Ich bin müde.', 'k', fetchMock);
    expect(result).toEqual({ fixed: 'Ich bin müde.', segments: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [first, second] = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(second?.[1].body).toBe(first?.[1].body);
  });

  it('does not retry when the model called a tool', async () => {
    const fetchMock = fetchReturning(jsonResponse(confirmReply()));
    await fix('a', 'k', fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads the tool call after thinking blocks', async () => {
    const body = {
      stop_reason: 'tool_use',
      content: [
        { type: 'thinking', thinking: '', signature: 's' },
        ...(confirmReply() as { content: unknown[] }).content,
      ],
    };
    const result = await fix('Ich bin müde.', 'k', fetchReturning(jsonResponse(body)));
    expect(result).toEqual({ fixed: 'Ich bin müde.', segments: [] });
  });

  it('ignores malformed and unrelated blocks', async () => {
    const body = { content: ['junk', { type: 'tool_use', name: 'other', input: {} }] };
    await expect(fix('a', 'k', fetchReturning(jsonResponse(body)))).rejects.toThrow(
      /Unexpected response/,
    );
  });
});

function sentBody(fetchMock: { mock: { calls: unknown[][] } }): {
  system: SystemBlock[];
  tools: { name: string; input_schema: { properties: object; required?: string[] } }[];
} {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init.body as string) as ReturnType<typeof sentBody>;
}

describe('detected language', () => {
  const AUTO: Settings = { language: 'auto', reasonLanguage: 'English', provider: 'anthropic' };
  const SEGMENTS = [{ text: 'Ich bin müde.' }];

  async function detect(language: unknown, settings = AUTO): ReturnType<typeof fixText> {
    return fixText(
      'Ich bin müde.',
      'k',
      settings,
      fetchReturning(jsonResponse(toolUse({ language, segments: SEGMENTS }))),
    );
  }

  it('asks for the language first and requires it in auto mode', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(confirmReply())));
    await fixText('a', 'k', AUTO, fetchMock);
    const schema = sentBody(fetchMock).tools[0]?.input_schema;
    expect(Object.keys(schema?.properties ?? {})).toEqual(['language', 'segments']);
    expect(schema?.required).toEqual(['language', 'segments']);
  });

  it('does not ask for it with a fixed language', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(confirmReply())));
    await fixText(
      'a',
      'k',
      { language: 'German', reasonLanguage: 'English', provider: 'anthropic' },
      fetchMock,
    );
    const schema = sentBody(fetchMock).tools[0]?.input_schema;
    expect(Object.keys(schema?.properties ?? {})).toEqual(['segments']);
    expect(schema?.required).toEqual(['segments']);
  });

  it('returns the trimmed language', async () => {
    const result = await detect(' German ');
    expect(result.language).toBe('German');
  });

  it.each([
    ['empty', ''],
    ['blank', ' '],
    ['a number', 5],
    ['missing', undefined],
    ['overlong', 'x'.repeat(41)],
  ])('drops a language that is %s', async (_label, value) => {
    expect(await detect(value)).not.toHaveProperty('language');
  });

  it('ignores a language reported in fixed-language mode', async () => {
    const result = await detect('German', {
      language: 'German',
      reasonLanguage: 'English',
      provider: 'anthropic',
    });
    expect(result).not.toHaveProperty('language');
  });

  it('reports none for confirm_correct', async () => {
    const result = await fixText('a', 'k', AUTO, fetchReturning(jsonResponse(confirmReply())));
    expect(result).toEqual({ fixed: 'a', segments: [] });
  });
});

describe('buildSystemPrompt', () => {
  it('asks the model to detect the language in auto mode', () => {
    const prompt = buildSystemPrompt({
      language: 'auto',
      reasonLanguage: 'English',
      provider: 'anthropic',
    });
    expect(prompt).toContain('Detect its language');
    expect(prompt).toContain('written in English');
  });

  it('names a fixed language and a same-language reason', () => {
    const prompt = buildSystemPrompt({
      language: 'Spanish',
      reasonLanguage: 'same',
      provider: 'anthropic',
    });
    expect(prompt).toContain('Spanish text');
    expect(prompt).not.toContain('Detect its language');
    expect(prompt).toContain('the same language as the text');
  });

  it('sends the settings in the request', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse(toolUse({ segments: [{ text: 'a' }] }))),
    );
    await fixText(
      'a',
      'k',
      { language: 'French', reasonLanguage: 'German', provider: 'anthropic' },
      fetchMock,
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { system: SystemBlock[] };
    expect(systemText(body.system)).toContain('French text');
    expect(systemText(body.system)).toContain('written in German');
  });
});
