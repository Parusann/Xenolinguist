# Validated research proposals

W21 is in progress. Typed model output, profile-scoped retrieval, bounded tools, citation checks and deterministic counterexamples now feed a durable workbench review. Explicit acceptance applies a tested change with model provenance and a recorded user reason. The comparative evaluation and integration of remaining task-specific AI entry points remain open. Existing conversation and automatic suggestions still use their W10 free-text workflow.

## Request and response boundary

`POST /api/ai/research/proposal` requires the normal authenticated local session. Supply `profile_id`, `expectedRevision`, `model`, `query`, and `validation_sample_ids`. The last field selects at most 12 existing workspace samples with explicit user-supplied English targets. An empty selection is allowed and produces an inconclusive linguistic check. The server loads the profile when the queued job starts and rejects a missing project, wrong revision or invalid sample selection before inference.

The response contains one `proposal`, server-computed `validation`, server-assigned `state: proposed`, `provenance` and a job identifier. This endpoint does not write a profile, add an observation, accept a claim or persist the response. A caller must retain the returned record if it is needed after the request. Disconnecting cancels the task through the existing language-generation lane. A workspace edit during generation does not alter the private snapshot; any future application must recheck its revision and inputs.

The strict model schema permits a lexical entry or sense replacement, an executable grammar rule, or a request for another observation. Each has a profile/revision scope, cited observation spans, explanation and alternatives. Models cannot supply acceptance, confidence, validation or provenance fields. A lexical replacement is previewed as a complete single-sense entry; its proposed change is explicit rather than silently retaining competing old senses. Requested observations remain questions with alternative predictions.

## Retrieval and tools

An ephemeral inverted index uses NFC-normalized Unicode letter/number tokens across lexical entries, grammar descriptions and evidence, captures, annotations and notebook samples. It stays within one profile snapshot. Relevant word/rule matches retrieve linked hypotheses, with slots reserved for their contradictory observations before supporting evidence. Withdrawn observations and derived captures whose parent interpretation changed are excluded. IDs, annotation versions, evidence relations and sample targets remain visible. Empty matches do not fall back to arbitrary allegedly relevant records.

Context is bounded to 12 observations, 16 words, eight rules, eight hypotheses and eight samples, then reduced by dropping whole records until the serialized context fits 12,000 UTF-16 code units. Observation text is explicitly marked when truncated. These are deterministic retrieval limits, not a claim of complete evidence recall or measured superiority over embeddings.

The capability list contains only:

- `search-observations`: return bounded exact-token matches from this snapshot.
- `inspect-span`: return an exact observation span of at most 512 UTF-16 code units.
- `propose-lexeme` and `propose-rule`: preview the typed candidate and run the selected checks.
- `test-hypothesis`: validate references and run the same deterministic checks.

Tools cannot invoke a shell, access another profile, write files or mutate knowledge. Sample text and tool results are presented as untrusted data. This capability boundary remains in force if a model follows an injected instruction. A final `finish` action is validated separately and is not a tool invocation.

## Checks and counterexamples

The server verifies every citation against a retained capture in this profile: current annotation ID, availability, exact offsets and quoted text. Duplicate spans, fabricated IDs, cross-profile targets and stale interpretations fail validation. This proves reference integrity, not that the quoted evidence semantically supports the claim. A model's declared supports/contradicts relation remains a proposal.

Candidates run on a private dictionary/grammar copy through the W17 engine. Tests compare the original and candidate outputs against the selected user targets. The model cannot supply its own expected answers. Results distinguish:

| Status | Meaning |
| --- | --- |
| `invalid` | The structure, scope, references, test selection or typed rule is invalid. |
| `falsified` | A resolved prediction differs from a supplied target, or a previously matching case becomes different or unresolved. |
| `inconclusive` | There are no selected cases, or at least one remains unresolved without a demonstrated regression. |
| `compatible` | Every selected case has a unique rendered result matching its supplied target. |
| `request` | The candidate asks for another observation; no linguistic test is claimed. |

A regression test proposes that `pa-` marks future tense in `ka pa-mok`. The engine returns `I will speak` against the supplied target `I did speak`, preserving the counterexample. A scripted tool loop then revises the rule to past tense. Compatibility is restricted to the selected workspace checks. It is not a calibrated probability, a proof of a universal rule, or held-out accuracy.

## Generation and provenance

Generation uses Ollama's [structured-output format](https://docs.ollama.com/capabilities/structured-outputs) with runtime Zod validation after decoding. The provider schema omits Unicode-property regular expressions unsupported by the observed Ollama grammar compiler; the authoritative server parser retains those constraints. Structural bounds, enums and ASCII identifier patterns remain in the provider schema. Failure does not downgrade to accepting free text.

A task allows four tool actions, at most six generation calls including one structural repair, and one shared 180-second deadline. Each call has a 16,384-token context, a 1,024-token output ceiling and a 48,000-code-unit input guard. The total declared output ceiling is 6,144 tokens, not a measured token count. Temperature is 0.2, seed 42, separate thinking output is disabled, and input is not silently truncated. Every call revalidates local model eligibility and the initially selected model digest. Invalid references or failed predictions are returned as such; only malformed structure gets the automatic repair attempt.

Successful responses retain the verified model digest, settings, prompt-template hash, input fingerprint, bounded retrieval payload and IDs, query, selected test IDs, typed tool calls/results, request/response hashes, structural validity, repair count and elapsed timings. Arbitrary invalid text and private thinking fields are not retained. The durable endpoint retains sanitized failed/cancelled outcomes; an interrupted pending record survives restart without automatically resuming generation.

## Durable review and application

Open the AI panel and select **Review research proposals**. Capture evidence in Field Log, enter a question, and select up to 12 existing samples with supplied targets. The review shows quoted evidence and interpretation IDs, before/after predictions, counterexamples, proposed changes, alternatives, limitations and expandable experiment provenance. Generation and decisions require a saved workspace.

`POST /api/ai/research/runs` accepts the same request as the preview endpoint. Before inference, it saves a source snapshot and pending record under the profile lock. Completion merges the result into the latest profile without overwriting intervening edits. `GET /api/ai/research/runs/:profileId` returns the profile and current review availability. The original `/research/proposal` endpoint remains read-only.

`POST /api/ai/research/runs/:profileId/:reviewId/decision` requires `expectedRevision`, `mutationId`, `action` (`accept` or `reject`) and a reason. Acceptance independently rechecks the input fingerprint and predictions. A lexical or grammar candidate must be compatible, and at least one selected resolved case must actually use its proposed entry or rule. Unrelated passing cases do not qualify. Falsified, invalid, inconclusive, changed-input and restored proposals cannot be applied. Renaming a project or adding review metadata alone does not invalidate its linguistic inputs.

Acceptance writes the executable change, a model-origin hypothesis, exact evidence links, user decision and idempotency receipt in one atomic profile commit. New/replaced words and rules remain unrated. Lexical replacement preserves user notes, context and examples while replacing executable senses. An observation request records a question only. Rejection changes no dictionary, grammar or research claim. Retrying the same decision cannot duplicate a hypothesis, including after the general mutation ledger expires.

Review metadata cannot be edited through ordinary profile patches. Each record retains exact source/result JSON and SHA-256 hashes. Archive inspection replays validation and typed tools against the original snapshot. Restoring remaps accepted hypothesis/target references while preserving embedded historical IDs and payloads; restored runs cannot apply to the new workspace. Hashes and replay check consistency, not cryptographic proof of model authorship.

Storage is bounded to 20 runs, 512,000 source characters and 256,000 result characters per run, and 2 MB of serialized review metadata per project. Source snapshots exclude nested proposal history, unrelated chat, metric snapshots and compiler/sandbox sessions. Unaccepted records can be explicitly deleted with a revision check; active and accepted records are retained. Previous exports and recovery snapshots may still contain deleted records. There is no silent pruning.

## Verification and remaining work

Twenty-one new unit and HTTP integration cases cover structural authority, exact citations, counterexamples, new/replacement senses, observation requests, ambiguity, profile isolation, annotation/withdrawal propagation, bounded retrieval, tool limits, repair limits, model pinning and cancellation followed by a successful request. HTTP checks compare persisted profile bytes before and after generation.

[Backend verification](verification/w21-proposal-backend.json) records successful Windows/Linux source CI and independent installer regression acceptance at `547edd8`: 371 unit tests, seven tooling tests, 37 workbench checks, eight public checks and 12/60/336 replayed experiment records per platform. Three native unit skips and four reviewed high native-chain audit entries remain. Installer acceptance covers the existing application flows; the separate HTTP and local-model checks below cover proposal generation.

A real local `gemma4:e4b` integration smoke uses the same synthetic tense example. The initial run exposed unsupported Unicode regexes in Ollama's schema grammar; the provider projection fixes that compatibility issue without relaxing server validation. The successful run returns a proposed, compatible rule using tool feedback. This one-case smoke is separate from the scripted falsification/revision test; it does not demonstrate model discovery of an unknown rule or comparative quality.

The [retained local-model response](verification/w21-proposal-local-model.json) comes from the authenticated bundled backend at revision `547edd8`. It completed in 19.836 seconds on this host with three generation calls, two tools and no structural repair. Stored profile bytes were unchanged. These timings include the observed runtime conditions and are not a latency guarantee. The record includes the synthetic starting profile, request, returned tool trace, exact model digest and backend bundle hash.

With locked dependencies installed, run the [deterministic replay](verification/w21-proposal-replay.mts) from the repository root:

```sh
npx tsx docs/verification/w21-proposal-replay.mts
```

This rebuilds retrieval and hashes, reruns each tool and the final proposal check, and verifies the separate future-tense counterexample. It does not call the model or claim to replay its generation or timing.

The review unit adds 14 persistence/application cases covering atomic write failure, competing decisions, stale evidence, lexical-note preservation, cancellation, interruption, bounded retention, corrupted records and historical archive restoration. Browser acceptance uses deterministic model responses to reject a falsified future-tense rule, accept the compatible past-tense candidate, restart the backend and reopen both decisions through an actual project export/import. These checks exercise engineering behavior, not model quality.

The next W21 work connects remaining relevant AI entry points and freezes a shared observation set to compare current prompting with the new pipeline on invalid-output rate, citation relevance, held-out predictions and runtime. W21's full exit condition remains open until that work passes.
