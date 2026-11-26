import { MODELS } from './constants';
import type { CorrectionRequest, ProviderAdapter, Reply, ToolCall } from './correction';
import { isRecord } from './messages';

const EFFORT = 'low';

function anthropicBody(request: CorrectionRequest): unknown {
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    // A forced tool call (tool_choice "any") skips thinking, and without it the model catches only
    // the most obvious error per pass (capitalization and agreement slip through). Letting it choose
    // the tool keeps adaptive thinking on; low effort recovers nearly all fixes at the least delay.
    output_config: { effort: EFFORT },
    // Tools and system prompt form a prefix that only changes with the settings. Caching it makes
    // repeat requests (and the retry) read it at a tenth of the price. Below the model's minimum
    // cacheable length the marker is silently ignored.
    system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
    tools: request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.schema,
    })),
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: request.text }],
  };
}

function readAnthropic(body: unknown): Reply {
  if (!isRecord(body)) {
    return { kind: 'invalid' };
  }
  if (body['stop_reason'] === 'max_tokens') {
    return { kind: 'truncated' };
  }
  const content = body['content'];
  if (!Array.isArray(content)) {
    return { kind: 'invalid' };
  }
  const calls: ToolCall[] = [];
  for (const block of content as unknown[]) {
    if (isRecord(block) && block['type'] === 'tool_use' && typeof block['name'] === 'string') {
      calls.push({ name: block['name'], input: block['input'] });
    }
  }
  if (calls.length > 0) {
    return { kind: 'tool', calls };
  }
  // Finished normally (not truncated, not refused) without calling either tool.
  return body['stop_reason'] === 'end_turn' ? { kind: 'plain' } : { kind: 'invalid' };
}

/**
Anthropic Messages API.
*/
export const anthropicAdapter: ProviderAdapter = {
  url: 'https://api.anthropic.com/v1/messages',
  model: MODELS.anthropic,
  headers: (apiKey) => ({
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }),
  body: anthropicBody,
  read: readAnthropic,
};
