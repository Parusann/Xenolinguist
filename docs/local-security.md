# Local application boundary

W09 gives each packaged desktop backend a fresh 256-bit session secret. Main sends it once over the utility process's parent message channel. The server binds only to `127.0.0.1`; it validates the exact Host, the request Origin when present, cross-site fetch metadata and the credential before API body parsers, including binary uploads. API responses are not cacheable. Case-insensitive API aliases receive the same checks.

The credential stays in main and the backend. Main strips caller-supplied session headers and attaches its own only for requests from the designated window's main frame to that launch's API origin. There is no renderer token getter, URL token, production pairing endpoint or authentication-disable setting. Draft and audio IPC also require that exact contents, main frame and origin. A reload retains authorization; a newly launched backend receives a new secret. An unexpected backend exit requires restarting the desktop app.

The renderer uses sandboxing, context isolation, disabled Node integration and web security. Navigation and redirects stay on the app origin; embedded navigation and webviews are blocked. New windows are denied. Validated HTTPS links can open externally only for `ollama.com` and `github.com/Parusann` paths. Permission checks and requests allow audio capture only for the trusted main frame; camera, geolocation and other permissions are denied.

The packaged app's CSP permits same-origin scripts and connections, local fonts, and the blob resources needed by audio and workers. It blocks evaluated and inline scripts, frames, objects and form submissions. Inline styles remain necessary for existing React style props. The former p5/Vanta background required evaluated JavaScript, so a small Canvas 2D contour animation replaces it without weakening script policy. It supports reduced motion. Fonts ship with their original licenses; see [font provenance](../client/public/fonts/README.md).

Recording uses MediaRecorder and does not start browser SpeechRecognition. Phone analysis and local whisper transcription remain explicit actions. This change does not certify every model or service as offline: Ollama model eligibility, automatic model setup, and readiness controls belong to W10. Updater checks and user-requested external links also remain network activity.

## Development pairing

1. Run `npm run dev` (or `npm run electron:dev`). Vite is fixed to `http://localhost:5173`, and its API proxy targets `http://127.0.0.1:3001` with the backend Host rewritten.
2. The development backend prints the path to its data folder's `.development-pairing` file. Open that file locally and paste its contents into the workbench's Development pairing code field. Do not paste the code into issue reports or URLs. The filename is ignored by Git.
3. Pairing sets an HttpOnly, SameSite=Strict cookie scoped to `/api`; the input is cleared, and the secret is not written to localStorage or sessionStorage. Reload works without pairing again. Pair again after a backend restart, which writes a new code.

Development pairing is deliberately separate from packaged desktop authentication. A desktop backend ignores development cookies. Browser cookies are scoped to hosts and paths, not ports; development use does not provide the desktop's per-window boundary. The file inherits the local account's directory permissions on Windows; Unix creation requests mode 0600. A user or process able to read that file can pair. Do not serve the data directory publicly. The production server entry requires controlled desktop startup.

## Verification and limits

`local-session.test.ts` tests credentials, case aliases, Host/Origin, cross-site metadata, stale secrets, malformed configuration and JSON, pairing and secret-free diagnostics. `electron-security.test.ts` tests sender/frame checks, header stripping and destination restrictions, navigation and permission decisions. The browser security probe loads an ordinary same-origin script to test CSP; Playwright's own evaluation bypasses CSP and cannot establish that protection.

`node scripts/verify-development.mjs` checks the actual direct development server and Vite proxy in a temporary data directory, including pairing, mutation, reload and secret-free startup output. Ports 3001 and 5173 must be free. The packaged verifier uses renderer fetches so legitimate API, inference and playback checks exercise main's real authentication path. Separate anonymous requests and another same-origin BrowserWindow must receive 401.

This boundary reduces exposure to unrelated pages, local HTTP clients, frames and windows. It is not a defense against a compromised operating system, a privileged debugger, malicious main-process code, or code execution within the trusted same-origin renderer. No claim of penetration-test certification, model accuracy or installer certification follows from these checks.

The controls follow Electron's [security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [webRequest API](https://www.electronjs.org/docs/latest/api/web-request) and [session permission APIs](https://www.electronjs.org/docs/latest/api/session). Electron keeps only the latest listener for a webRequest event; future integrations must preserve the existing header policy rather than register an independent replacement.
