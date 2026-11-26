# Voran

Chrome extension (Manifest V3). Select text in any language, right-click, choose **Voran**. Claude Haiku returns a corrected version. A dialog shows an inline word diff (removed words struck through, added words highlighted). Hover (or Tab to) a correction to see the reason in a tooltip. When you apply the correction, the corrected text replaces the selection; cancelling leaves it unchanged.

## Requirements

- Node.js 22 or newer
- Chrome 120 or newer
- An Anthropic API key

## Install

```sh
npm install
npm run build
```

1. Open `chrome://extensions` and enable Developer mode.
2. Click **Load unpacked** and select the `dist/` directory.
3. Open the extension's options page and enter your API key. There you can also set the language of the text you correct (default: auto-detect) and the language of the explanation tooltips (default: English). Changes save automatically.

## Usage

Select text, right-click, choose **Voran**. When changes are proposed, **Apply correction** (or Enter) applies them; **Cancel**, Esc or a click outside the dialog discards them and leaves the text alone.

Replacement depends on where the text was selected:

| Selection                                | Result                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<input>`, `<textarea>`, contenteditable | Replaced in place; the page's undo stack is kept. In rich text (e.g. pasted from Gmail or Docs) only the corrected words change, so bold, links and lists stay; a correction that crosses a line break falls back to plain text |
| Read-only page text                      | Corrected text is copied to the clipboard                                                                                                                                                                                       |
| Text changed while the dialog was open   | Corrected text is copied to the clipboard                                                                                                                                                                                       |

If nothing needs correcting, no dialog opens. A green checkmark appears briefly over the text and the text is left alone. While waiting for Claude, a small "Checking…" pill shows over the selected text.

## How it works

```
right-click -> background (context menu) -> content script (captures selection, shows dialog)
content script -> background (voran:fix) -> api.anthropic.com -> background -> content script
dialog applied -> content script replaces text
```

- `src/background.ts`: context menu, API key lookup, Claude call. The key never reaches page context.
- `src/content.ts`: captures the selection on `contextmenu`, drives the dialog, applies the replacement.
- `src/claude.ts`: Messages API request (model `claude-haiku-5-5`). The model must call one of two tools: `submit_correction` (ordered `segments`: unchanged `text` or `original`/`fixed`/`reason`, validated; `fixed` is derived) or `confirm_correct` (text already correct). No free text is parsed.
- `src/diff.ts`: inline word-level diff via the `diff` package.
- `src/modal.ts`: dialog and toast in a shadow root. All text is inserted with `textContent`; `innerHTML` is banned by lint.
- `src/replace.ts`: selection capture and replacement for fields, contenteditable and read-only text.
- `src/languages.ts`: supported languages (English and native names), settings validation.
- `src/options.ts`, `src/options.html`: API key and language settings (searchable language lists).

The selected text is sent to Anthropic. The API key is sent only to `api.anthropic.com`.

## Development

```sh
npm run watch
```

Rebuilds `dist/` on source changes. Static files (`manifest.json`, `options.html`) are copied once at start; rerun after editing them. After each rebuild, click the reload icon for Voran on `chrome://extensions`, then reload the tab you are testing in.

Debugging:

- Service worker: **service worker** link on the extension card on `chrome://extensions`.
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

ESLint runs with `--max-warnings 0`. `innerHTML`, `outerHTML` and `insertAdjacentHTML` are errors.

### Unit tests

`tests/` covers the diff output, the Claude request and error handling (mocked `fetch`), the dialog (including that untrusted text is never parsed as HTML), selection capture, and replacement. `background.ts`, `content.ts` and `options.ts` are thin wiring and excluded from coverage; test them manually.

### Manual test checklist

Create an HTML file with a `<textarea>`, an `<input>`, a `<div contenteditable>` and a `<p>`, open it in Chrome, and use text such as:

> Ich habe gestern ein Buch gelesen, das war sehr interessant gewesen. Die Kinder spielt im Garten.

- [ ] Menu item appears only when text is selected.
- [ ] Dialog shows an inline diff (struck-through removals, highlighted additions). Hovering or focusing a correction shows its reason in a tooltip; no bullet list.
- [ ] Textarea, input, contenteditable: text is replaced after **Apply correction** or Enter; **Cancel**, Esc and a click outside leave it unchanged. In contenteditable and textarea, Ctrl/Cmd+Z restores the original.
- [ ] `<p>`: corrected text is on the clipboard and a toast appears.
- [ ] Already-correct text: no dialog, green checkmark over the text, nothing changes.
- [ ] Wrong API key: error shown, nothing changes.
- [ ] No API key: error with an **Open options** button.
- [ ] Selection over 8000 characters: error, no request sent.
- [ ] Selection inside an iframe works.
- [ ] Options: typing "deu" or "日本" filters the language list; unknown text then leaving the field shows an error and saves nothing; changes save automatically and survive reloading the options page.
- [ ] Auto-detect: German, French and Japanese text are each corrected in their own language. With language = Spanish and explanations = Same as text, Spanish text is corrected with Spanish reasons.
- [ ] Detected language: with language = auto-detect, the dialog shows "Detected language: …" under the diff; with a fixed language, no such line appears.
- [ ] Arabic or Hebrew text renders right-to-left in the dialog.

## Project layout

```
manifest.json        extension manifest
build.mjs            esbuild bundling into dist/
src/                 extension source
tests/               unit tests
eslint.config.js     lint rules
tsconfig.json        strict config for src and tests
tsconfig.node.json   strict config for build and tool configs
```

## Limitations

- The API key is stored unencrypted in `chrome.storage.local`.
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
