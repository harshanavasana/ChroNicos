# ChroNicos Chrome extension

## Load locally

Using Node.js 22.13+ or 24+, install the extension dependency before loading the project folder as an unpacked extension:

```sh
npm ci
```

Then open `chrome://extensions`, enable Developer mode, and choose **Load unpacked** for this folder. Run `npm test` to execute the local tests. The manifest requires Chrome 103+.

## Resume privacy

PDF.js extracts selectable text inside the extension. The PDF itself is not stored or sent to a service; only structured resume sections are saved in Chrome local storage. Users can review and edit the extracted sections, replace the PDF, or delete saved details. Scanned/image-only PDFs are not supported yet.

At message review, resume inclusion is off by default. The user can opt in and select the specific saved facts to include. Email addresses, phone numbers, and recognizable street-address lines are filtered from resume details before storage and prompting. The PDF is never sent. AI request previews display the bounded request data, and each Quick Mode generation/regeneration and each Deep Mode research/generation operation requires its own approval.

## Quick Mode and Deep Mode

Quick Mode creates a message from the recipient details and resume facts you review. It does not search the web.

Deep Mode requires your own Anthropic API key and Anthropic Web Search access. Enter the recipient's name, role/headline, and current company, select only resume facts you want to use, then confirm the Deep Mode privacy notice. ChroNicos makes one bounded web-search request (at most five searches) and blocks LinkedIn as a search domain. Search receives only the recipient's name, role, company, headline, and skills. A separate verification/matching request receives the cited search evidence, objective, and selected resume facts. It does not read LinkedIn pages or send the LinkedIn profile URL or original PDF.

Deep Mode first displays an identity assessment, sourced person/company findings, possible resume connections, confidence labels, source credibility/relevance/publication-date assessments, limitations, and cited source links. Review these findings and the final request preview before clicking **Generate from reviewed research**. Only cited high/medium-confidence findings with acceptable AI-assessed sources are eligible for the message; low-confidence findings and person claims with a low identity match are excluded. If research finds nothing reliable, the message falls back to reviewed user-provided details and must not invent a finding. Message generation is a separate Anthropic request.

## Message validation

AI message generation now returns three variations in one API request. JavaScript first checks empty content, word and character limits, placeholders, duplicate sentences, basic formatting, URLs, and private contact details. A single Anthropic evaluation request ranks all three together for natural-language quality, tone, personalization, and factual support against the approved request data. Only the selected variation is rewritten, with at most two automatic rewrite attempts.

Evaluation results for unchanged variation and request-data combinations are cached for 24 hours. Cached evaluations are stored in session storage and the worker also keeps an in-memory cache while it remains active.

## Failure handling and operation recovery

Anthropic network errors, invalid keys, rate limits, server errors, timeouts, cancellation, invalid JSON, and storage failures are reported explicitly. A failed operation does not clear the reviewed recipient fields, saved resume, recent history, or any previous generated message; a successful message remains visible even if adding it to local history fails. Resume uploads are checked for PDF type and size before parsing, and parsing/storage failures leave the previously saved resume unchanged.

Generation and Deep Mode research use a request ID. The service worker stores only the request ID, operation kind/state, timestamps, and a short-lived completed result in `chrome.storage.session`; it does not persist the submitted profile, resume, or API prompts. Reopening the popup reconnects to a running request or recovers its completed result. Recovery records expire after 15 minutes and are removed after the popup acknowledges them. A request interrupted by service-worker termination is marked failed and can be retried; it is not automatically replayed because the request payload is deliberately not persisted. Deep research can be cancelled while the popup is open.

`npm test` includes simulated tests for network disconnects, invalid keys, rate limiting, server failures, timeouts, duplicate requests, cancellation, missing research evidence, invalid model JSON, retries, corrupted/unsupported resumes, local/session storage failures, popup reconnection, and service-worker interruption. Live Anthropic and Chrome UI behavior still require a manual smoke test before release.

## Automated testing and CI

- `npm test` runs Vitest unit tests and Node integration tests.
- `npm run test:coverage` runs the Vitest suites with a coverage report.
- `npm run test:e2e` launches Chromium with the unpacked extension and tests real popup workflows. Install Playwright's browser once with `npx playwright install chromium`.
- `npm run lint`, `npm run check:manifest`, and `npm run check:deps` run linting, extension resource/manifest validation, and the npm vulnerability audit.
- `npm run check` runs lint, unit/integration tests, manifest validation, and dependency audit; `npm run test:all` also runs the browser tests.

The Playwright workflows use isolated browser profiles and do not call Anthropic: they cover local Quick Mode generation and the missing-key Deep Mode recovery path. The workflow at `.github/workflows/ci.yml` defines quality and browser jobs for pull requests to `main` and pushes to `main` or `develop`; this folder must be the GitHub repository root for GitHub to discover it. Configure both CI jobs as required status checks in GitHub branch protection if merges must be blocked until they pass.

## Local data and credentials

The user-provided Anthropic key is stored in `chrome.storage.session`, not in extension files or local storage, and Chrome clears it when the browser session ends. Session storage is not encrypted secret storage; this is suitable only for a personal prototype. A production extension should use a backend to protect provider credentials. The key can be removed in Settings.

Preferences and structured resume details remain in `chrome.storage.local` and are not synced. Recipient details and research results exist only in the open popup's memory and are discarded when it closes. Recent messages are local-only, limited to five, and expire according to the configurable 1-, 7- (default), or 30-day setting. Settings provide controls to clear recipient/research data and all extension data; Recent also has a clear-history action.

The extension requests `storage`, `activeTab`, and `alarms` (for recent-message expiration), has no content scripts, and uses an explicit extension-page CSP. It does not read LinkedIn page content or send messages automatically. External search and AI processing involve Anthropic and public web sources.
