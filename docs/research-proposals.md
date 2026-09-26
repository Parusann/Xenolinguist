# Validated research proposals

W21 is in progress. The first implementation unit provides a read-only proposal backend: typed model output, profile-scoped retrieval, bounded tools, citation checks, deterministic counterexamples and returned experiment provenance. Durable proposal review, acceptance through revisioned mutations, workbench integration and the comparative evaluation remain to be implemented. Existing chat and automatic suggestions still use their W10 free-text workflow.

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

Successful responses retain the verified model digest, settings, prompt-template hash, input fingerprint, bounded retrieval payload and IDs, query, selected test IDs, typed tool calls/results, request/response hashes, structural validity, repair count and elapsed timings. Arbitrary invalid text and private thinking fields are not retained. Failed or cancelled calls currently use the existing job error path; durable failed-run records are part of the remaining W21 work.

## Verification and remaining work

Twenty-one new unit and HTTP integration cases cover structural authority, exact citations, counterexamples, new/replacement senses, observation requests, ambiguity, profile isolation, annotation/withdrawal propagation, bounded retrieval, tool limits, repair limits, model pinning and cancellation followed by a successful request. HTTP checks compare persisted profile bytes before and after generation.

A real local `gemma4:e4b` integration smoke uses the same synthetic tense example. The initial run exposed unsupported Unicode regexes in Ollama's schema grammar; the provider projection fixes that compatibility issue without relaxing server validation. The successful run returns a proposed, compatible rule using tool feedback. This one-case smoke is separate from the scripted falsification/revision test; it does not demonstrate model discovery of an unknown rule or comparative quality.

The next W21 unit must persist complete review records and decisions, revalidate and apply explicitly accepted changes through revisioned mutations, provide the evidence/test/change preview in the workbench, and connect relevant AI entry points. Cancellation/restart/conflict and archive behavior need acceptance coverage. Finally, freeze a shared observation set and compare current prompting with the new pipeline on invalid-output rate, citation relevance, held-out predictions and runtime. W21's full exit condition remains open until that work passes.
