# Model readiness and controlled inference

W10 separates a reachable Ollama daemon from an installed, verified local completion model. The workbench's **Runtime & setup** panel reports storage, local speech synthesis, transcription, phone assets and chat independently. It includes local CPU/memory diagnostics, probe timestamps, model sizes, digests, capabilities and eligibility explanations. These diagnostics stay on the local API.

Storage availability means a temporary write/delete probe succeeded. Audio availability means required files are present (and phone asset sizes match); execution and phone hashes are checked when analysis is requested. Neither a reachable service nor files being present proves a future inference will succeed. Model inventory is cached for five seconds for display. Every generation independently checks the selected exact tag and current metadata again when its queued execution begins.

Local chat requires a loopback HTTP Ollama service, nonempty local model metadata, a digest, nonzero model size and the `completion` capability. Remote-host/remote-model metadata and cloud tags are rejected, including ordinary-looking aliases. Models already marked remote in the tag inventory are not sent to the show endpoint. Embedding-only and unverifiable models are unavailable for chat. HTTP redirects are rejected. This relies on accurate metadata from the local daemon; it does not defend against a malicious daemon or someone replacing model tags concurrently outside the app.

## Setup and model choice

Desktop startup no longer pulls a model. Install/start Ollama, open Runtime & setup, and select an eligible installed model. To install one of the offered models, click its explicitly labelled Download button beside the approximate size. The choices are `gemma4:e4b` (about 9.61 GB) and optional `llama3.2:3b` (about 2.02 GB); extra temporary disk space is needed. The server requires explicit confirmation and rejects concurrent downloads. Progress, cancellation, failure and retry are shown in Recent work. Cancelled downloads may leave partial files in Ollama's cache for retry. Downloads require network access; the application does not silently install a model when an inference fails.

The existing default remains `gemma4:e4b`, overridable with `OLLAMA_MODEL` when the installed model passes the same server checks. All tasks use the selected model; the former automatic heavy/light routing is removed. A small synthetic dictionary probe on this Windows host returned the expected `sky blue` from the default in 9.10 seconds, including 8.98 seconds of reported model loading. The smaller model returned `Heaven` in 4.03 seconds. These are one-shot smoke observations, not a language-quality benchmark or a general model ranking. The final warm-model request through the actual authenticated backend returned `sky blue` in 0.429 seconds; these different loading conditions do not establish a speedup. See [retained model checks](verification/w10-local-models.json). Broader task-quality and hardware measurements remain necessary before changing routing policy.

## Jobs and cancellation

| Lane | Execution limit | Waiting limit | Total deadline |
| --- | --- | --- | --- |
| Language generation | 1 | 4 | 90–240 seconds, task dependent |
| Acoustic analysis: phones and whisper | 1 shared | 4 | 180 seconds; whisper also has its existing process timeout |
| Model download | 1 | No concurrent second download | 30 minutes |

Jobs move through queued, running and succeeded/failed/cancelled states. Up to 100 recent metadata records remain in memory; prompts, audio and generated output are not stored in that job list. A restart clears the list and does not resume inference. Deadlines include queue wait. A cancellation request shows stopping while execution exits; the lane remains occupied until cleanup finishes. Queue overflow returns HTTP 429.

Generation disconnects and Stop generation abort the upstream request. The NDJSON reader preserves split UTF-8 and partial records, rejects malformed/oversized data, enforces a 45-second generation idle limit and requires a completion marker. Download parsing has a 60-second idle limit and requires a success record followed by verified local metadata. Slow client buffering is bounded. A finite stream without completion becomes an error, even when it supplied useful partial text.

Phone analysis runs in a disposable process using the shipped Node/native runtime. Cancellation kills that process and waits for exit before admitting the next acoustic job. Whisper cancellation similarly kills its CLI process and cleans its temporary files. Starting a fresh phone process per job gives a clear termination boundary at the cost of reloading the model; a safe reusable-worker design is future performance work. The existing deterministic TTS route is separate from the inference queue.

## Task budgets and retained proposals

Task settings are server-owned: fixed context/output budgets, temperature 0.2, seed 42, disabled separate thinking output, no silent context truncation and a two-minute model keep-alive. Prompt length is also bounded by characters before generation; character limits are not represented as exact token counts.

| Task | Context tokens | Output tokens | Input characters | Total seconds |
| --- | ---: | ---: | ---: | ---: |
| Chat, pattern analysis, grammar, translation | 8,192 | 2,048 | 20,000 | 180 |
| Quick suggestions | 4,096 | 512 | 10,000 | 90 |
| Number and phonetic analysis | 4,096 | 1,024 | 10,000 | 120 |
| Generated practice language | 8,192 | 4,096 | 12,000 | 240 |

Chat and task proposals persist in the originating profile through the existing revision-checked save queue. Responses retain their model name, task, timestamp, partial/completed/cancelled/failed state and an error separately from useful text. Partial output is checkpointed at roughly one-second intervals and flushed on completion/cancellation; an abrupt process failure can lose the latest uncheckpointed fragment. A proposal is not automatically accepted as a verified linguistic claim.

Retention is bounded to the newest 40 records and 120,000 content characters, with a 60,000-character per-record maximum. Delete AI history clears the live profile history. Existing recovery snapshots or user-created exports may still contain earlier history; this is not secure erasure. Concurrent edits follow existing profile conflict handling. Full prompt/model-digest provenance, benchmark artifacts and independently evaluated linguistic claims belong to later work packages.

## Verification

The unit/integration tests exercise queue limits, actual cleanup before slot release, deadlines, split NDJSON, idle cancellation, premature EOF, remote and embedding rejection, current metadata revalidation, real HTTP disconnect propagation, download confirmation/cancellation/retry and bounded history. Browser tests cover readiness/setup and partial answer/error persistence, profile isolation, reload and deletion. The full suite has 22 working checks and the existing expected Unicode-translation failure.

The unpacked Windows verifier checks independent capabilities with Ollama unavailable, cancellation after a phone process spawns, subsequent native phone/transcription success, original audio playback and existing close/relaunch recovery. It also checks that a generated proposal survives the failed-save/native-relaunch flow. The generator response in that recovery test is a deterministic fixture. See [Windows evidence](verification/w10-windows-runtime.json). No signed-installer, clean-machine W10 CI, physical microphone or model-quality certification is implied.

`node scripts/verify-local-chat.mjs` runs the actual authenticated bundled backend against already-installed local models; it never downloads a model. It checks a positive default-model response, installed cloud/embedding rejection, cancellation after the first generated token, and a successful subsequent request. The observed cancellation cleanup was 8 milliseconds on this host, not a latency guarantee. These checks are separate from deterministic protocol tests. Build the desktop bundles before running it.

The metadata and protocol handling follow Ollama's [API types](https://github.com/ollama/ollama/blob/main/api/types.go), [model inventory endpoint](https://docs.ollama.com/api/tags) and [chat endpoint](https://docs.ollama.com/api/chat).
