# Audio storage and recovery

Audio import and microphone capture use one preparation and save flow. The accepted original remains available for playback and download; a separate mono PCM16, 16 kHz WAV feeds local speech and phone recognition. Analysis is an explicit action. A failed upload or profile save leaves the attachment, waveform, text, notes, phone output and word segments available to retry.

## Supported input

- PCM16 RIFF/WAVE, one or two channels, 8–96 kHz. Chunk lengths, format, alignment, byte rate and duration are validated before decoding. Ancillary RIFF chunks are supported.
- WebM/Opus, decoded by the browser's media implementation. The server checks container/codec markers, size and the derived WAV; it does not independently decode compressed originals or prove that a submitted derivative represents their acoustic content.
- Originals are limited to 32 MiB; decoded audio must be 25 ms–120 seconds. The recorder stops around 119 seconds to stay inside this boundary. Other formats are rejected explicitly.

Browser decoding receives a temporary ArrayBuffer, so buffer detachment cannot consume the original Blob. A Web Worker mixes decoded channels, extracts peaks, and applies a 64-tap Hann-windowed sinc filter before resampling to 16 kHz. The numerical test verifies a 1 kHz tone's amplitude and at least 40 dB suppression of a 12 kHz tone when converting 48 kHz audio. This is a regression measurement, not a complete resampler quality benchmark. Already prepared analysis WAVs are passed directly to model services without another decode/resample cycle.

## Commit boundary

1. Persist the accepted original as a draft, using IndexedDB in the browser or a binary file under desktop user data. The desktop path is independent of the backend's changing port. Local storage errors remain visible and participate in the close guard.
2. Send original bytes to `POST /api/audio/stages`. The server assigns a UUID, writes the file atomically, and records its byte length, MIME type and SHA-256.
3. Send the prepared WAV to `PUT /api/audio/stages/:id/analysis`. Validate it, verify the original checksum, and atomically record the completed asset as retained before acknowledging it. WAV original and analysis durations must agree within 1 ms.
4. Submit the sample and audio clip in one revision-checked profile mutation. New audio references must resolve to retained, checksum-verified bytes. The clip stores both file identities. Existing legacy clips remain readable; new references to absent legacy files are rejected.
5. Clear the draft only after the save queue reports durable server acknowledgment. The stable sample ID and persisted mutation ledger prevent duplicate samples after a lost response. Recovery reuses a retained derivative when its original checksum matches the draft, rather than requiring another decoder run to produce bit-identical output.

The audio metadata file records staged/retained state. A crash before retained acknowledgment leaves an incomplete stage; a crash after acknowledgment leaves recoverable bytes for the profile queue. There is no cross-filesystem transaction between the renderer draft store and server assets, so interruption can leave extra retained files. It must not produce a newly acknowledged profile reference to absent audio.

## Playback, deletion and retention

`GET /api/audio/:id` returns the verified original, `/analysis` returns the verified analysis WAV, and `/metadata` returns the file identities. Sample cards expose playback and original download. Re-transcription uses the analysis WAV for new clips. Playback failures are visible.

Deleting a sample removes its profile reference. Undo restores the same sample, clip, segment and dictionary-link IDs. Physical deletion through the old delete endpoint is refused. Legacy uploads remain compatible and are serialized and immutable.

Incomplete stages older than 24 hours are cleaned up on the next staging request. Retained assets are deliberately excluded: browser drafts, offline profiles and undo history cannot yet be enumerated globally. Consequently, discarded/abandoned completed uploads and deleted samples may consume disk indefinitely. Reference-aware archive garbage collection and complete portable profile/audio archives remain later work; an original-file download does not constitute a full project backup. Existing audio-less profile JSON exports remain metadata exports.

## Verification

Server tests exercise atomic sample/clip mutation, idempotent retry through a new store instance, missing/changed asset rejection, incomplete-stage expiry, retained-file survival through delete/undo, duration mismatch, malformed/oversized input, and binary desktop draft recovery.

Browser acceptance exercises failed audio upload and failed profile mutation, draft reload, linked segments, retry without duplication, playback, byte-identical original download, delete/undo and backend restart. A real generated WebM/Opus clip and the recorder component with Chromium's synthetic microphone exercise compressed media decoding. Model-response fixtures verify explicit analysis and failure handling; those fixtures are not inference benchmarks. Unsupported, truncated and oversized selections leave a valid prior draft intact.

The packaged acceptance script additionally exercises the desktop close handshake, relaunch on a new origin, recovery of an original audio draft and notes, real bundled phone inference, saving the resulting sample, playback and original checksum verification. The [retained Windows result](verification/w06-windows-audio.json) passed these checks, including 48 phone segments from the prepared fixture and the missing-model negative check.

These checks do not certify power-loss behavior on every filesystem, all microphone hardware or all valid WebM encoders. Browser storage quotas and disabled media permissions remain environmental failure modes with visible errors.
