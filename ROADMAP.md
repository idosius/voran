# Voran MVP roadmap

## Context

Voran works end to end: `npm run check` is green (137 tests, 99% coverage). MVP goal: safe to hand to other people (Web Store-ready), not only the author. Plan covers features, bugfixes, tech debt, security, performance and accessibility. Items are ordered by priority inside each phase.

Assumption: MVP = installable by strangers, so privacy, permissions and a11y count as launch blockers.

## Phase 0 — Clean the tree (do first)

- Working tree holds a large uncommitted change: `richtext.ts` (in-place rich-text edits), `replace.ts`, `modal.ts`, test refactor (`tests/helpers.ts`, `tests/setup.ts`), eslint/vitest/package changes.
- `src/index.ts` is staged-added but deleted on disk (`AD`): `git rm --cached src/index.ts`.
- Commit in small Conventional-Commit pieces: tooling/tests, richtext + replace, modal, docs.

## Phase 1 — Bugfixes

1. No in-flight guard: second right-click while "Checking…" runs, or while a dialog is open, stacks pills/dialogs and overwrites `state.target` in `content.ts`. Add a `busy` flag (or cancel the previous run).
2. ~~Cannot reject a correction~~ (done): Esc, click outside and button all apply (`modal.ts:255,267`). Add explicit **Cancel** (no change); Esc and outside click cancel; only the primary button applies. Update README table and tests.
3. No cancel while waiting: add Esc on the pill to abort (`AbortController` through `background` to `fixText`).
4. No retry on 429/529/5xx in `claude.ts`: one retry with short backoff, honour `retry-after`.
5. `input[type=password]` selections are sent to the API. Refuse with a clear message (also see Security).
6. Extension-reload message in `content.ts:requestFix` shown for every sendMessage failure. Separate "context invalidated" from other errors.
7. Verify manually (README checklist) on: Gmail compose, Google Docs (likely unsupported, show clear message), Slack/Notion, iframes, shadow DOM.

## Phase 2 — Features (MVP only)

1. Options: **Test key** button (cheap request), show/hide key toggle, clear key.
2. Keyboard shortcut via `commands` in manifest to trigger Voran on the current selection (also an accessibility win).
3. Extension icons (16/32/48/128) and `action` entry; version single-sourced from `package.json`.
4. ~~First-run: open options page on install~~ (done, `onInstalled` reason `install`).
5. Store assets: privacy policy page (selected text goes to Anthropic, key stays local), description, screenshots.

- Deferred (post-MVP): history, per-site disable, streaming.

## Phase 2b — Multiple LLM providers (MVP)

Goal: user picks provider, model and key in options. Anthropic stays default.

1. Provider interface in new `src/providers/`: `request(text, settings, key, signal) -> RawSegments`. Shared pieces stay provider-neutral: `buildSystemPrompt` and `fromSegments` (move out of `claude.ts` into `correction.ts`), error mapping (`ClaudeError` -> `ProviderError`), 30 s timeout, retry.
2. Providers:
   - `anthropic` (existing; tool use `submit_correction`/`confirm_correct`).
   - `openai` — done: `src/openai.ts` (Responses API function calling, fixed model `gpt-6-luna`, one key per provider shown in a single field, plain `host_permissions`). Remaining for this phase: model field, optional host permissions.
   - `gemini` (function calling / `responseSchema`).
   - `openai-compatible` with custom base URL: covers OpenRouter, Groq, Together, Mistral, DeepSeek, local Ollama / LM Studio (no key, no data leaves the machine).
   - Each adapter converts its response into the same `segments` shape, then `isSegmentList` + `fromSegments` validate. No free-text parsing anywhere.
3. Settings (`languages.ts` `normalizeSettings` + new `providers.ts`): `provider`, per-provider `model` (editable text with a sensible default; do not hardcode long model lists, confirm current default IDs against each vendor's docs at implementation time), per-provider API key, base URL for compatible. Storage keys in `constants.ts`; `MODEL` constant becomes per-provider default.
4. Options page: provider select, model field, key field per provider, base URL field when compatible, **Test key**. Reuse `combobox.ts` for provider/model lists. Keys stay isolated per provider; switching never sends one vendor's key to another host.
5. Permissions: replace the single `https://api.anthropic.com/*` host permission with `optional_host_permissions` per provider origin, requested from the options page on user gesture (`chrome.permissions.request`). Custom base URL: request exactly that origin. Background checks `permissions.contains` before fetching and returns a clear error.
6. Provider quirks to handle: per-vendor auth header, OpenAI `max_completion_tokens` vs `max_tokens`, Gemini key in header not URL, CORS/browser-access flags (`anthropic-dangerous-direct-browser-access` only for Anthropic), models that ignore forced tool choice (fall back to JSON mode, else clear error).
7. Tests: one mocked-`fetch` suite per adapter (success, no-change, malformed, 401/429/5xx, timeout) plus a shared contract test run against every adapter. Keep coverage thresholds.
8. README: provider table, privacy note per provider (text goes to the chosen vendor), local-model option.

## Phase 2c — Firefox support (MVP)

Goal: same codebase builds for Chrome and Firefox from one source. Firefox MV3, Firefox 140+ (first version with `data_collection_permissions`; Android 142+).

Done (dev build): items 1, 2, the plain `chrome.*` choice in 3, and the `web-ext` scripts in 4. Still open: manual verification of the rest of 3, CI, release.

1. ~~Build targets~~ (done): `npm run build` emits `dist/chrome` and `dist/firefox`; `build.mjs` derives the Firefox manifest from `manifest.json` (`firefoxManifest`).
2. ~~Firefox manifest differences~~ (done):
   - `background: { "scripts": ["background.js"] }` (event page) instead of `service_worker`; Chrome keeps `service_worker`.
   - `browser_specific_settings.gecko: { id: 'voran@voran', strict_min_version, data_collection_permissions }`.
   - Users can withhold host access (Firefox about:addons, Chrome site access): `requireApiAccess` right before each API request, options page opens on install and shows a grant button while access is missing. Revisit with Phase 2b optional per-provider permissions.
   - Remove `minimum_chrome_version` from the Firefox build.
3. API differences handled in code:
   - ~~Keep `chrome.*`~~ (done): plain `chrome.*`, no `webextension-polyfill`.
   - `chrome.storage.local.setAccessLevel` (Phase 3.2) is absent in Firefox: feature-detect, skip.
   - Injection and `contextMenus` item `contexts: ['selection']` work; verify `frameId` handling. Firefox's error is "Could not establish connection. Receiving end does not exist.", which the substring check in `background.ts:sendStart` matches; confirm manually.
   - `execCommand('insertText')` behaviour in Firefox textarea/contenteditable: verify undo stack; `navigator.clipboard.writeText` needs user activation in content scripts, keep the `execCommand('copy')` fallback.
   - Shadow-root dialog styling (`<voran-root>`): check `:host`, `focus-visible`, `forced-colors` in Firefox.
4. Tooling: ~~`lint:firefox` and `start:firefox` scripts~~ (done); CI builds both targets and lints the Firefox package. Manual checklist runs on both browsers.
5. Release: AMO listing (source-code submission instructions because of bundling: document `npm ci && npm run build`, output in `dist/firefox`), privacy text, screenshots.

## Phase 3 — Security

1. Drop the static `<all_urls>` content script. It triggers the "read and change all your data on all websites" warning and runs in every frame. Spike: inject on demand with `activeTab` + `scripting` at menu click and read selection/focus then (they survive the context-menu click). Fallback if capture proves unreliable: keep a tiny stub that only records the `contextmenu` target and loads the rest on demand.
2. Call `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` in `background.ts` so content scripts cannot read the API key. Only background and options read it today.
3. Validate `sender.id === chrome.runtime.id` and `sender.tab` for `voran:fix` in `background.ts`; keep `isBackgroundRequest` guards.
4. Explicit `content_security_policy.extension_pages` (`script-src 'self'; object-src 'self'`).
5. Release build: no sourcemaps in the zip, minify. Keep them in dev.
6. Supply chain: `npm audit --omit=dev` in CI; lockfile committed; `diff` is the only runtime dependency.
   6b. Multi-provider: keys per provider, sent only to that provider's origin (assert in tests); custom base URL must be `https://` (allow `http://localhost` only for local models) and its origin gets an explicit permission prompt; never log keys or request bodies; error messages never echo vendor response bodies verbatim.
7. Keep invariants: key never leaves background, model/page text only via `textContent`, `innerHTML` lint ban. Add a test that errors never echo the key.
8. README limitation stays: key unencrypted in `storage.local`; document it in the privacy policy.

## Phase 4 — Performance

1. Content script cost on every page/frame: after Phase 3.1 it only loads on demand. Otherwise split the stub from `modal`/`diff` code.
2. Minify bundles (`build.mjs`: `minify: !watch`, `sourcemap: !release`).
3. Request tuning in `claude.ts`: `max_tokens = 2*len + 2000` is generous; measure latency on 100/1000/8000 chars with Haiku and lower the cap if safe. Prompt caching is on and works (eval: ~905 cached input tokens per request).
4. Suggestion (shelved): return only the edits instead of re-typing the whole text as `segments`. Eval baseline: re-typing is ~13% of output tokens (~40/case, ~10% of cost); thinking is ~85%. Main gain is speed (~1.5-2 s) and fewer `max_tokens` failures on long texts. Main risk: an edit applied to the wrong copy of a repeated word. If built: each edit carries `original` plus the 1-3 words before it; place by whole-word match of that phrase; apply only when it matches exactly once, otherwise drop (never guess); place each edit independently, reject overlaps; `original` must be non-empty (insertions replace a neighbouring word). Not character/word indices (models miscount). Add eval cases for repeated words, short words inside longer ones, Hebrew prefix letters, NBSP; count dropped edits; run with `--reps 4`.
5. Abort in-flight request on cancel (Phase 1.3) to stop paying for unwanted output.
6. Confirm `diff` and `planEdits` stay fast at 8000 chars (add one benchmark-style test with a time bound).

## Phase 5 — Accessibility

1. Dialog (`modal.ts`): focus trap while open, return focus to the previously focused element on close, `aria-labelledby`/`aria-describedby` instead of the bare `aria-label="Voran"`. Verify Tab order: diff changes, Cancel, Apply.
2. Screen reader flow: announce result ("N corrections") through a live region; pill and checkmark already use `role="status"`, confirm they are announced.
3. Every correction reachable by keyboard (`.change` focusable) — keep; add a text-only alternative for removed/added words (not colour/strike-through alone): visually hidden "removed"/"added" prefixes.
4. Contrast and modes: check diff colours in light and dark, `forced-colors: active`, 200% zoom, `prefers-reduced-motion` (exists, extend to dialog open animation).
5. Language: set `lang` on rendered text when known (reason language) so screen readers pronounce correctly; `dir="auto"` exists.
6. Options page: `aria-invalid` + `aria-describedby` on validation error, status message in `aria-live="polite"` ("Saved"), combobox follows WAI-ARIA 1.2 pattern (review `combobox.ts:22-62`), visible focus styles.
7. Automated: add `axe-core` check on options page and modal in the happy-dom test setup where feasible; manual pass with VoiceOver.

## Phase 6 — Tech debt

1. Thin wiring is untested: extract `handleFix`, `sendStart`, and the `run` flow from `background.ts`/`content.ts` into testable modules (mock `chrome.*`), keep entry files trivial. Coverage thresholds stay 90/85.
2. `modal.ts` is 411 lines: split into `diffView`, `toast`/`status`, `dialog`. Lowest branch coverage in repo (84.5%).
3. CI: `.github/workflows/ci.yml` running `npm ci && npm run check && npm run build && npm audit --omit=dev`.
4. `AGENTS.md` titled "CLAUDE.md": add a `CLAUDE.md` pointer or rename the heading.
5. Dedupe constants/strings (error messages in `claude.ts`, `content.ts`).
6. Release script: build, zip `dist/` without sourcemaps.

## Suggested order

Phase 0 → 6.3 CI + 6.1 extraction of wiring (makes later work testable) → 1 (items 1–2 first) → 2b provider abstraction (do before more `claude.ts` changes; Phase 1.4 retry lands in the shared layer) → 3.1–3.2 → 2c Firefox (needs 2b permissions flow and 3.1 decision on content script) → 5.1 → 2 → rest of 3/4/5 → 6.

Risk: 3.1 (no static content script), 2b.5 (optional host permissions) and 2c (Firefox permissions) all change how access is granted. Design them together before coding.

## Verification

- Providers: contract test passes for every adapter; manual run with a real key per vendor and with local Ollama; wrong key, no key, denied host permission, and provider switch each show a clear error; confirm in DevTools network tab that each key only goes to its own host.
- Firefox: `npm run build`, `npm run lint:firefox` clean, load via `about:debugging` (temporary add-on) and run the full manual checklist (textarea, input, contenteditable, read-only, iframe, options autosave, permission grant flow). Compare with Chrome.
- `npm run check` after every phase; new logic gets tests (mock `fetch`/`chrome`).
- `npm run build`, reload at `chrome://extensions`, run the README manual checklist plus new cases: double right-click, Cancel/Esc leaves text unchanged, password field refused, 429 retry, key test button, keyboard shortcut.
- Permissions: after Phase 3.1, `chrome://extensions` details must show no "all sites" access; confirm `activeTab` flow works in iframes.
- Security: from a page console, confirm key unreachable; from the content script context, `chrome.storage.local.get('apiKey')` fails.
- A11y: keyboard-only run, VoiceOver run, forced-colors and 200% zoom screenshots, axe checks green.
- Perf: Lighthouse/DevTools shows no Voran script on pages until invoked; measure round trip at 100/1000/8000 chars.
