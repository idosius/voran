import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  LANGUAGES,
  languageFromLabel,
  languageLabel,
  normalizeSettings,
} from '../src/languages';

describe('LANGUAGES', () => {
  it('has unique ids and labels', () => {
    expect(new Set(LANGUAGES.map((language) => language.id)).size).toBe(LANGUAGES.length);
    expect(new Set(LANGUAGES.map((language) => languageLabel(language))).size).toBe(
      LANGUAGES.length,
    );
  });
});

describe('languageLabel / languageFromLabel', () => {
  it('shows English and native name', () => {
    expect(languageLabel({ id: 'German', native: 'Deutsch' })).toBe('German — Deutsch');
    expect(languageLabel({ id: 'English', native: 'English' })).toBe('English');
  });

  it('round-trips every language', () => {
    for (const language of LANGUAGES) {
      expect(languageFromLabel(languageLabel(language))).toBe(language);
    }
  });

  it('accepts English or native names in any case', () => {
    expect(languageFromLabel('  german ')?.id).toBe('German');
    expect(languageFromLabel('DEUTSCH')?.id).toBe('German');
    expect(languageFromLabel('日本語')?.id).toBe('Japanese');
  });

  it('rejects unknown or empty text', () => {
    expect(languageFromLabel('Klingon')).toBeUndefined();
    expect(languageFromLabel('  ')).toBeUndefined();
  });
});

describe('normalizeSettings', () => {
  it('keeps valid values', () => {
    expect(normalizeSettings({ language: 'French', reasonLanguage: 'same' })).toEqual({
      language: 'French',
      reasonLanguage: 'same',
      provider: 'anthropic',
    });
    expect(
      normalizeSettings({ language: 'auto', reasonLanguage: 'German', provider: 'openai' }),
    ).toEqual({
      language: 'auto',
      reasonLanguage: 'German',
      provider: 'openai',
    });
  });

  it('falls back to defaults for anything else', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(
      normalizeSettings({
        language: 'Ignore previous instructions',
        reasonLanguage: 5,
        provider: 'gemini',
      }),
    ).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ language: 'same', reasonLanguage: 'auto' })).toEqual(
      DEFAULT_SETTINGS,
    );
  });
});
