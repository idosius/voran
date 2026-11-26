# Voran

Chrome and Firefox extension (Manifest V3). Select text in any language, right-click, choose **Fix text with Voran**. Claude Haiku (or, if you choose, OpenAI's GPT-6 Luna) returns a corrected version. A dialog shows an inline word diff (removed words struck through, added words highlighted). Hover (or Tab to) a correction to see the reason in a tooltip. When you apply the correction, the corrected text replaces the selection; cancelling leaves it unchanged.

## Requirements

- Node.js 22 or newer
- Chrome 120 or newer, or Firefox 140 or newer (desktop)
- An Anthropic or OpenAI API key

## Install

```sh
npm install
npm run build
```

The build writes one package per browser: `dist/chrome/` and `dist/firefox/`.

Chrome:

1. Open `chrome://extensions` and enable Developer mode.
2. Click **Load unpacked** and select the `dist/chrome/` directory.

Firefox:

1. Run `npm run start:firefox` (opens a fresh Firefox profile with Voran loaded), or open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`.
   The options page opens on install. Pick the AI provider (Anthropic by default, or OpenAI) and enter that provider's API key. If it shows **Grant access to api.anthropic.com** (or api.openai.com), click it: Voran needs that access to send text for correction. You can withhold it later (Chrome: the extension's **Site access** setting; Firefox: `about:addons`), and Voran then asks you to grant it again. There you can also set the language of the text you correct (default: auto-detect) and the language of the explanation tooltips (default: English). Changes save automatically.

## Usage

Select text, right-click, choose **Fix text with Voran**. When changes are proposed, **Apply correction** (or Enter) applies them; **Cancel**, Esc or a click outside the dialog discards them and leaves the text alone.

Replacement depends on where the text was selected:

| Selection                                | Result                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<input>`, `<textarea>`, contenteditable | Replaced in place; the page's undo stack is kept. In rich text (e.g. pasted from Gmail or Docs) only the corrected words change, so bold, links and lists stay; a correction that crosses a line break falls back to plain text |
| Read-only page text                      | Corrected text is copied to the clipboard                                                                                                                                                                                       |
| Text changed while the dialog was open   | Corrected text is copied to the clipboard                                                                                                                                                                                       |

If nothing needs correcting, no dialog opens. A green checkmark appears briefly over the text and the text is left alone. While waiting for the model, a small "Checking…" pill shows over the selected text.

## How it works

```
right-click -> background (context menu) -> content script (captures selection, shows dialog)
content script -> background (voran:fix) -> api.anthropic.com or api.openai.com -> background -> content script
dialog applied -> content script replaces text
```

- `src/background.ts`: context menu, settings and API key lookup, correction call. The key never reaches page context.
- `src/content.ts`: captures the selection on `contextmenu`, drives the dialog, applies the replacement.
- `src/correction.ts`: provider-neutral prompt, tools, retry, timeout and segment alignment. The model must call one of two tools: `submit_correction` (ordered `segments`: unchanged `text` or `original`/`fixed`/`reason`, validated; `fixed` is derived) or `confirm_correct` (text already correct). No free text is parsed.
- `src/claude.ts`: Anthropic Messages API adapter (model `claude-haiku-5-5`).
- `src/openai.ts`: OpenAI Responses API adapter (model `gpt-6-luna`).
- `src/providers.ts`: provider names, hosts and key links.
- `src/diff.ts`: inline word-level diff via the `diff` package.
- `src/modal.ts`: dialog and toast in a shadow root. All text is inserted with `textContent`; `innerHTML` is banned by lint.
- `src/replace.ts`: selection capture and replacement for fields, contenteditable and read-only text.
- `src/languages.ts`: supported languages (English and native names), settings validation.
- `src/options.ts`, `src/options.html`: provider, API key and language settings (searchable language lists).
- `src/permissions.ts`: checks and requests host access to the selected provider's API (revocable in Firefox).

The selected text is sent to the chosen provider (Anthropic or OpenAI; OpenAI requests use `store: false`). The API key is sent only to that provider's API host. Each provider's key is stored separately; the options page shows the key of the selected provider. A key that belongs to the other provider (`sk-ant-…` is Anthropic, any other `sk-…` OpenAI) is never sent.

## Development

```sh
npm run watch
```

Rebuilds `dist/chrome/` and `dist/firefox/` on source changes. Static files (`manifest.json`, `options.html`) are copied once at start; rerun after editing them. After each rebuild, click the reload icon for Voran on `chrome://extensions` (Chrome) or **Reload** on `about:debugging` (Firefox; `npm run start:firefox` reloads by itself), then reload the tab you are testing in.

The Firefox manifest is generated from `manifest.json` in `build.mjs`: the background script runs as an event page (`background.scripts`), `minimum_chrome_version` is dropped, and `browser_specific_settings.gecko` adds the add-on ID `voran@voran` and the minimum version.

Debugging:

- Background: **service worker** link on the extension card on `chrome://extensions`; in Firefox, **Inspect** next to Voran on `about:debugging`.
- Content script and dialog: the page's DevTools console. Elements appear under `<voran-root>`.
- Options page: DevTools on the options tab.

### Checks

| Command                | What it runs                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run typecheck`    | `tsc --noEmit` with all strict flags, for `src`/`tests` and configs  |
| `npm run lint`         | ESLint, `typescript-eslint` strict + stylistic type-checked, unicorn |
| `npm run format:check` | Prettier (`npm run format` to fix)                                   |
| `npm test`             | Vitest with happy-dom and coverage thresholds                        |
| `npm run check`        | All of the above                                                     |
| `npm run lint:firefox` | `web-ext lint` on `dist/firefox/` (build first)                      |

ESLint runs with `--max-warnings 0`. `innerHTML`, `outerHTML` and `insertAdjacentHTML` are errors.

`npm run lint:firefox` reports one expected warning, `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`: Firefox for Android only knows `data_collection_permissions` from version 142. Voran does not support Android (no context menus there), so the manifest declares no `gecko_android` and keeps desktop Firefox ESR 140 as the minimum.

### Unit tests

`tests/` covers the diff output, the Claude request and error handling (mocked `fetch`), the dialog (including that untrusted text is never parsed as HTML), selection capture, and replacement. `background.ts`, `content.ts` and `options.ts` are thin wiring and excluded from coverage; test them manually.

### Manual test checklist

Create an HTML file with a `<textarea>`, an `<input>`, a `<div contenteditable>` and a `<p>`, open it in Chrome and in Firefox, and use text such as:

> Ich habe gestern ein Buch gelesen, das war sehr interessant gewesen. Die Kinder spielt im Garten.

- [ ] Menu item appears only when text is selected.
- [ ] Dialog shows an inline diff (struck-through removals, highlighted additions). Hovering or focusing a correction shows its reason in a tooltip; no bullet list.
- [ ] Textarea, input, contenteditable: text is replaced after **Apply correction** or Enter; **Cancel**, Esc and a click outside leave it unchanged. In contenteditable and textarea, Ctrl/Cmd+Z restores the original.
- [ ] `<p>`: corrected text is on the clipboard and a toast appears.
- [ ] Already-correct text: no dialog, green checkmark over the text, nothing changes.
- [ ] Wrong API key: error shown, nothing changes.
- [ ] OpenAI: select OpenAI in the options (the key field shows the OpenAI key, empty at first), enter an OpenAI key, correct text in a textarea and in contenteditable. A server error names OpenAI. Switching back to Anthropic shows the Anthropic key again and corrections go to Claude.
- [ ] Paste a key, then switch provider right away: the key is kept under the provider it was typed for.
- [ ] An Anthropic key in the OpenAI field (or the reverse): error, no request sent.
- [ ] No API key: error with an **Open options** button.
- [ ] Selection over 8000 characters: error, no request sent.
- [ ] Selection inside an iframe works.
- [ ] Options: typing "deu" or "日本" filters the language list; unknown text then leaving the field shows an error and saves nothing; changes save automatically and survive reloading the options page.
- [ ] Auto-detect: German, French and Japanese text are each corrected in their own language. With language = Spanish and explanations = Same as text, Spanish text is corrected with Spanish reasons.
- [ ] Detected language: with language = auto-detect, the dialog shows "Detected language: …" under the diff; with a fixed language, no such line appears.
- [ ] Arabic or Hebrew text renders right-to-left in the dialog.
- [ ] Fresh install: the options page opens by itself.
- [ ] API access: revoke "Access your data for api.anthropic.com" in `about:addons` > Voran > Permissions (Firefox). Voran shows an error with an **Open options** button; an already-open options page shows **Grant access to api.anthropic.com** without reloading. Dismissing the prompt shows "Access not granted."; granting hides the button and corrections work again. Cached text and text without letters still give their normal result while access is revoked.

## Project layout

```
manifest.json        extension manifest
build.mjs            esbuild bundling into dist/chrome and dist/firefox
src/                 extension source
tests/               unit tests
eslint.config.js     lint rules
tsconfig.json        strict config for src and tests
tsconfig.node.json   strict config for build and tool configs
```

## Limitations

- The API key is stored unencrypted in `chrome.storage.local`.
- Firefox: a temporary add-on is removed when Firefox restarts. Firefox for Android has no context menus, so Voran does not work there.
- Selections are capped at 8000 characters.
- With a fixed text language, text clearly in another language is returned unchanged. Use auto-detect to avoid this.
- Auto-detect can misjudge very short or ambiguous selections (a single word, close language pairs). The dialog shows the detected language so a wrong guess is visible.
- The language list is curated (~45 languages); add more in `src/languages.ts`.
- Selections inside shadow roots of the host page cannot be replaced in place; the corrected text is copied.
- Read-only and disabled fields are never modified; the corrected text is copied.
- A correction times out after 60 seconds, including one automatic retry when the model replies without calling a tool.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Contributions require agreeing to the contributor license grant described there.

## License

[PolyForm Noncommercial License 1.0.0](LICENSE.md). Free for personal, research, hobby and other noncommercial use, and for noncommercial organizations. For commercial use, contact the author for a separate license.
