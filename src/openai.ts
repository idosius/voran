import { MODELS } from './constants';
import type { CorrectionRequest, ProviderAdapter, Reply, ToolCall } from './correction';
import { isRecord } from './messages';

const EFFORT = 'low';

function openaiBody(request: CorrectionRequest): unknown {
  return {
    model: request.model,
    // The system prompt and tools come first and stay the same per settings, so OpenAI's automatic
    // prompt caching can reuse them across requests and the retry.
    instructions: request.system,
    input: request.text,
    max_output_tokens: request.maxTokens,
    // As with Claude, a forced tool call would cut reasoning short; low effort keeps it quick.
    reasoning: { effort: EFFORT },
    tools: request.tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
      // Strict mode rejects the optional properties and anyOf of the segment schema.
      strict: false,
    })),
    tool_choice: 'auto',
    // Nothing to continue later: do not keep the text on OpenAI's side.
    store: false,
  };
}

function parseArguments(value: unknown): unknown {
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRefusal(item: Record<string, unknown>): boolean {
  const content = item['content'];
  return (
    item['type'] === 'message' &&
    Array.isArray(content) &&
    (content as unknown[]).some((part) => isRecord(part) && part['type'] === 'refusal')
  );
}

function readOpenai(body: unknown): Reply {
  if (!isRecord(body)) {
    return { kind: 'invalid' };
  }
  const details = body['incomplete_details'];
  if (
    body['status'] === 'incomplete' &&
    isRecord(details) &&
    details['reason'] === 'max_output_tokens'
  ) {
    return { kind: 'truncated' };
  }
  const output = body['output'];
  if (!Array.isArray(output)) {
    return { kind: 'invalid' };
  }
  const calls: ToolCall[] = [];
  let refused = false;
  for (const item of output as unknown[]) {
    if (!isRecord(item)) {
      continue;
    }
    if (item['type'] === 'function_call' && typeof item['name'] === 'string') {
      calls.push({ name: item['name'], input: parseArguments(item['arguments']) });
    }
    refused ||= isRefusal(item);
  }
  if (calls.length > 0) {
    return { kind: 'tool', calls };
  }
  // Finished normally (not truncated, not refused) without calling either tool.
  return !refused && body['status'] === 'completed' ? { kind: 'plain' } : { kind: 'invalid' };
}

/**
OpenAI Responses API.
*/
export const openaiAdapter: ProviderAdapter = {
  url: 'https://api.openai.com/v1/responses',
  model: MODELS.openai,
  headers: (apiKey) => ({
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
  }),
  body: openaiBody,
  read: readOpenai,
};
