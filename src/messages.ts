export interface UnchangedSegment {
  readonly text: string;
}

export interface ChangedSegment {
  readonly original: string;
  readonly fixed: string;
  readonly reason: string;
}

/**
Part of the checked text, in order. Joining `text`/`original` gives the input; `text`/`fixed` the correction.
*/
export type Segment = UnchangedSegment | ChangedSegment;

export interface FixResult {
  readonly fixed: string;
  // Empty when no per-change reasons are available.
  readonly segments: readonly Segment[];
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

export function isChangedSegment(value: Segment): value is ChangedSegment {
  return 'original' in value;
}

export function isSegment(value: unknown): value is Segment {
  if (!isRecord(value)) {
    return false;
  }
  // The two shapes are mutually exclusive: `isChangedSegment` tells them apart by `original`.
  if ('original' in value) {
    return (
      typeof value['original'] === 'string' &&
      typeof value['fixed'] === 'string' &&
      typeof value['reason'] === 'string'
    );
  }
  return typeof value['text'] === 'string';
}

export function isSegmentList(value: unknown): value is Segment[] {
  return Array.isArray(value) && (value as unknown[]).every((item) => isSegment(item));
}
