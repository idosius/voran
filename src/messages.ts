export interface FixResult {
  readonly fixed: string;
  readonly notes: readonly string[];
}

export interface StartMessage {
  readonly type: 'voran:start';
  readonly selectionText: string;
}

export type BackgroundRequest =
  { readonly type: 'voran:fix'; readonly text: string } | { readonly type: 'voran:open-options' };

export type FixResponse =
  | { readonly ok: true; readonly result: FixResult }
  | { readonly ok: false; readonly error: string; readonly noKey: boolean };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStartMessage(value: unknown): value is StartMessage {
  return (
    isRecord(value) && value['type'] === 'voran:start' && typeof value['selectionText'] === 'string'
  );
}

export function isBackgroundRequest(value: unknown): value is BackgroundRequest {
  if (!isRecord(value)) {
    return false;
  }
  if (value['type'] === 'voran:open-options') {
    return true;
  }
  return value['type'] === 'voran:fix' && typeof value['text'] === 'string';
}

export function isFixResult(value: unknown): value is FixResult {
  return (
    isRecord(value) &&
    typeof value['fixed'] === 'string' &&
    Array.isArray(value['notes']) &&
    value['notes'].every((note) => typeof note === 'string')
  );
}
