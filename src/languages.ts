import { isRecord } from './messages';
import { DEFAULT_PROVIDER, isProviderId, type ProviderId } from './providers';

export interface Language {
  // English name; used verbatim in the prompt and as the stored value.
  readonly id: string;
  readonly native: string;
}

export const AUTO_LANGUAGE = 'auto';
export const SAME_LANGUAGE = 'same';

export const AUTO_LABEL = 'Auto-detect';
export const SAME_LABEL = 'Same as text';

export interface Settings {
  // `AUTO_LANGUAGE` or a language id.
  readonly language: string;
  // `SAME_LANGUAGE` or a language id.
  readonly reasonLanguage: string;
  // Which API corrects the text.
  readonly provider: ProviderId;
}

export const DEFAULT_SETTINGS: Settings = {
  language: AUTO_LANGUAGE,
  reasonLanguage: 'English',
  provider: DEFAULT_PROVIDER,
};

export const LANGUAGES: readonly Language[] = [
  { id: 'Afrikaans', native: 'Afrikaans' },
  { id: 'Arabic', native: 'العربية' },
  { id: 'Bengali', native: 'বাংলা' },
  { id: 'Bulgarian', native: 'Български' },
  { id: 'Catalan', native: 'Català' },
  { id: 'Chinese (Simplified)', native: '简体中文' },
  { id: 'Chinese (Traditional)', native: '繁體中文' },
  { id: 'Croatian', native: 'Hrvatski' },
  { id: 'Czech', native: 'Čeština' },
  { id: 'Danish', native: 'Dansk' },
  { id: 'Dutch', native: 'Nederlands' },
  { id: 'English', native: 'English' },
  { id: 'Estonian', native: 'Eesti' },
  { id: 'Finnish', native: 'Suomi' },
  { id: 'French', native: 'Français' },
  { id: 'German', native: 'Deutsch' },
  { id: 'Greek', native: 'Ελληνικά' },
  { id: 'Hebrew', native: 'עברית' },
  { id: 'Hindi', native: 'हिन्दी' },
  { id: 'Hungarian', native: 'Magyar' },
  { id: 'Indonesian', native: 'Bahasa Indonesia' },
  { id: 'Italian', native: 'Italiano' },
  { id: 'Japanese', native: '日本語' },
  { id: 'Korean', native: '한국어' },
  { id: 'Latvian', native: 'Latviešu' },
  { id: 'Lithuanian', native: 'Lietuvių' },
  { id: 'Malay', native: 'Bahasa Melayu' },
  { id: 'Norwegian', native: 'Norsk' },
  { id: 'Persian', native: 'فارسی' },
  { id: 'Polish', native: 'Polski' },
  { id: 'Portuguese', native: 'Português' },
  { id: 'Romanian', native: 'Română' },
  { id: 'Russian', native: 'Русский' },
  { id: 'Serbian', native: 'Српски' },
  { id: 'Slovak', native: 'Slovenčina' },
  { id: 'Slovenian', native: 'Slovenščina' },
  { id: 'Spanish', native: 'Español' },
  { id: 'Swahili', native: 'Kiswahili' },
  { id: 'Swedish', native: 'Svenska' },
  { id: 'Tagalog', native: 'Tagalog' },
  { id: 'Tamil', native: 'தமிழ்' },
  { id: 'Thai', native: 'ไทย' },
  { id: 'Turkish', native: 'Türkçe' },
  { id: 'Ukrainian', native: 'Українська' },
  { id: 'Urdu', native: 'اردو' },
  { id: 'Vietnamese', native: 'Tiếng Việt' },
];

const SEPARATOR = ' — ';

function findLanguage(id: string): Language | undefined {
  return LANGUAGES.find((language) => language.id === id);
}

/**
Text shown in the options inputs: "German — Deutsch", or just the name when both are the same.
*/
export function languageLabel(language: Language): string {
  return language.id === language.native
    ? language.id
    : `${language.id}${SEPARATOR}${language.native}`;
}

/**
Maps what the user typed or picked back to a language. Accepts the full label, the English name or
the native name, ignoring case and surrounding whitespace.
*/
export function languageFromLabel(text: string): Language | undefined {
  const wanted = text.trim().toLowerCase();
  return wanted === ''
    ? undefined
    : LANGUAGES.find(
        (language) =>
          languageLabel(language).toLowerCase() === wanted ||
          language.id.toLowerCase() === wanted ||
          language.native.toLowerCase() === wanted,
      );
}

function pick(value: unknown, special: string, fallback: string): string {
  return typeof value === 'string' && (value === special || findLanguage(value) !== undefined)
    ? value
    : fallback;
}

/**
Validates stored values. Anything that is not a known language falls back to the default, so
arbitrary stored text never reaches the prompt.
*/
export function normalizeSettings(raw: unknown): Settings {
  const record = isRecord(raw) ? raw : {};
  return {
    language: pick(record['language'], AUTO_LANGUAGE, DEFAULT_SETTINGS.language),
    reasonLanguage: pick(record['reasonLanguage'], SAME_LANGUAGE, DEFAULT_SETTINGS.reasonLanguage),
    provider: isProviderId(record['provider']) ? record['provider'] : DEFAULT_SETTINGS.provider,
  };
}
