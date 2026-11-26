# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Voran is a Chrome extension (Manifest V3, TypeScript, no framework). The user selects text, right-clicks **Fix text with Voran**, and Claude Haiku (`claude-haiku-5-5`) returns a corrected version. A dialog shows an inline word diff, and applying it (button or Enter) replaces the selection; Cancel, Esc or a click outside discards it. See `README.md` for the usage table, manual test checklist and known limitations.

## Commands

```sh
npm run build          # esbuild -> dist/ (load dist/ unpacked in chrome://extensions)
npm run watch          # rebuild on change; static files (manifest.json, options.html) copied only at start
npm run typecheck      # tsc for src+tests (tsconfig.json) and build/config files (tsconfig.node.json)
npm run lint           # eslint, --max-warnings 0
npm run format         # prettier --write (format:check to verify)
npm test               # vitest run --coverage (happy-dom, coverage thresholds enforced)
npm run check          # typecheck + lint + format:check + test
npx vitest run tests/diff.test.ts            # single test file
npx vitest run -t "name substring"           # single test by name
node eval/run.mjs --fake perfect             # free self-check of the model eval (lazy: must fail)
ANTHROPIC_API_KEY=... node eval/run.mjs --label NAME  # model eval (eval/cases.json); compares to eval/results/baseline.json
```

Commits use Conventional Commits (`type(scope)!: subject`).

Node >= 22. After a rebuild, reload the extension on `chrome://extensions` and reload the tested tab.

## Architecture

Three separate esbuild IIFE bundles (`background`, `content`, `options`), each entry in `src/`. They talk only via `chrome.runtime` messages typed in `src/messages.ts` (type guards like `isBackgroundRequest` validate every incoming message).

Flow: context-menu click in `background.ts` -> `voran:start` to the content script in the clicked frame (injects `content.js` if the tab predates install) -> `content.ts` shows a "Checking…" pill and sends `voran:fix` -> `background.ts` reads the API key and language settings from `chrome.storage.local`, calls `claude.ts` -> result returns to `content.ts` -> `modal.ts` shows the diff (plus the language the model detected in auto mode) -> if the user applies (`modal.closed` resolves `'apply'`), `replace.ts` applies the text.

Key points spanning files:

- API key is read and used only in the background service worker; it must never reach page context. Only `https://api.anthropic.com/*` is a host permission.
- `claude.ts` asks the model to call a tool (`tool_choice: auto`, since a forced call disables thinking; one retry if it ends its turn in plain text, then the text counts as correct; one 60 s deadline covers both): `submit_correction` (ordered `segments`: unchanged `{text}` or changed `{original, fixed, reason}`) or `confirm_correct`. No free-text parsing. `fixed` is derived by joining segments. Segment types and guards live in `messages.ts`.
- `cache.ts` keeps the last 50 results in `chrome.storage.session` (keyed by SHA-256 of model + settings + text), stores each applied correction as already correct, and merges concurrent identical requests. `claude.ts` marks tools + system prompt as a cacheable prompt prefix and skips the API for text without letters.
- `diff.ts` (uses the `diff` package) is the fallback inline diff when no per-change segments are available.
- `modal.ts` renders in a shadow root under `<voran-root>`. All page/model text goes in via `textContent`.
- `replace.ts` captures the selection at `contextmenu` time and replaces it by target type (input/textarea, contenteditable keeping undo stack, else clipboard fallback; also clipboard if text changed while dialog was open).
- `languages.ts` holds the curated language list and `normalizeSettings`, which validates stored settings; `combobox.ts` + `options.ts` + `options.html` are the options page (settings autosave).
- Storage keys and the menu id are in `constants.ts`.

## Conventions

- ESLint is strict (`typescript-eslint` strictTypeChecked + stylisticTypeChecked, unicorn). Notable: explicit function return types, no non-null assertions, `strict-boolean-expressions`, no `console`, and `innerHTML`/`outerHTML`/`insertAdjacentHTML` are errors. Build DOM with `createElement`/`textContent`.
- tsconfig is maximally strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly` — no enums/namespaces/parameter properties, `verbatimModuleSyntax` — use `import type`).
- Prettier: single quotes, width 100, trailing commas.
- `background.ts`, `content.ts`, `options.ts` are thin wiring, excluded from coverage and tested manually. Everything else in `src/` is covered by `tests/` (mocked `fetch`, happy-dom) with thresholds of 90% lines/functions/statements and 85% branches, so new logic should live in testable modules.
- DOM tests use Testing Library (`@testing-library/dom`, `user-event`, `jest-dom` matchers via `tests/setup.ts`), linted by `eslint-plugin-testing-library` and `eslint-plugin-jest-dom`. For the modal's shadow DOM use `within(shadowRoot())` from `tests/helpers.ts`. `src/` elements need accessible roles/labels for this to work (the diff is `role="group"`, the backdrop `role="presentation"`).
- **Always** write and change tests with Testing Library: query by role/text/label (`screen`, `within`), interact with `user-event`, assert with jest-dom. **Never** use `querySelector`, `querySelectorAll`, `getElementsBy*`, `firstChild`, `closest` or other raw DOM traversal in tests. For what Testing Library cannot reach (Range text nodes, the `<voran-root>` host) use `textNodeOf`/`hosts` from `tests/helpers.ts`, extending that file rather than inlining raw queries. If a role query fails, add an accessible role/label in `src/` instead of falling back to class selectors.
