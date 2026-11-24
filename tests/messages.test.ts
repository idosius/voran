import { describe, expect, it } from 'vitest';
import { isBackgroundRequest, isFixResult, isRecord, isStartMessage } from '../src/messages';

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

describe('isFixResult', () => {
  it('validates shape', () => {
    expect(isFixResult({ fixed: 'a', notes: ['b'] })).toBe(true);
    expect(isFixResult({ fixed: 'a', notes: [] })).toBe(true);
    expect(isFixResult({ fixed: 'a', notes: [1] })).toBe(false);
    expect(isFixResult({ fixed: 1, notes: [] })).toBe(false);
    expect(isFixResult({ fixed: 'a' })).toBe(false);
  });
});
