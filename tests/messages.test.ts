import { describe, expect, it } from 'vitest';
import { isBackgroundRequest, isRecord, isSegmentList, isStartMessage } from '../src/messages';

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('x')).toBe(false);
  });
});

describe('isStartMessage', () => {
  it('validates shape', () => {
    expect(isStartMessage({ type: 'voran:start', selectionText: 'a' })).toBe(true);
    expect(isStartMessage({ type: 'voran:start' })).toBe(false);
    expect(isStartMessage({ type: 'other', selectionText: 'a' })).toBe(false);
    expect(isStartMessage(undefined)).toBe(false);
  });
});

describe('isBackgroundRequest', () => {
  it('validates shape', () => {
    expect(isBackgroundRequest({ type: 'voran:fix', text: 'a' })).toBe(true);
    expect(isBackgroundRequest({ type: 'voran:open-options' })).toBe(true);
    expect(isBackgroundRequest({ type: 'voran:fix' })).toBe(false);
    expect(isBackgroundRequest({ type: 'nope' })).toBe(false);
    expect(isBackgroundRequest(1)).toBe(false);
  });
});

describe('isSegmentList', () => {
  it('validates shape', () => {
    const change = { original: 'a', fixed: 'b', reason: 'r' };
    expect(isSegmentList([{ text: 'x' }, change])).toBe(true);
    expect(isSegmentList([])).toBe(true);
    expect(isSegmentList([{ original: 'a', fixed: 'b' }])).toBe(false);
    expect(isSegmentList(['x'])).toBe(false);
    expect(isSegmentList({ text: 'x' })).toBe(false);
  });

  it('rejects objects that mix both segment shapes', () => {
    expect(isSegmentList([{ text: 'k', original: 'a' }])).toBe(false);
    expect(isSegmentList([{ text: 'k', original: 'a', fixed: 'b', reason: 'r' }])).toBe(true);
  });
});
