# Deterministic language compiler (W14)

Validated compiler practice runs without Ollama. Open a sandbox project and choose **Start validated practice**. Twenty-nine paired utterance/English observations introduce the atoms used in five withheld challenges. Submit controlled English translations or explicitly reveal an answer. Attempts and reveals persist on the server; a reveal never receives unaided credit. Creative LLM mode remains separate and keeps its previous recovery and accepted-form behavior.

After any reveal, subsequent attempts anywhere in that session count as assisted, since challenges can share components. The displayed first-attempt unaided numerator excludes retries, revealed targets and attempts following any reveal. The denominator is all attempted challenges, with reveals shown separately; this is practice bookkeeping rather than a benchmark score.

“Validated” describes compiler consistency within a bounded synthetic domain. It is not evidence of model accuracy, natural-language coverage or recruiter-facing benchmark performance. W15 will compare learners using the frozen data and report their actual results.

## Executable language specification

`engine/src/types.ts` defines entities, agent/patient roles, actions and meaning trees. `evaluation/src/generator/` implements:

- Frozen `xeno-generator-1` Mulberry32 PRNG, uint32 seeds and Fisher–Yates permutations. All string sorting is code-unit sorting; generation has no locale, clock, network or model dependency.
- A CVCV inventory assembled from 8 consonants and 5 vowels. All required nouns, verbs, attributes, digits and particles receive collision-checked words. Vocabulary is generated in a fixed order.
- SVO, SOV and VSO order; adjectives before or after nouns; explicit noun-phrase boundaries; plural, past/future, negation and conjunction particles. Feature flags reject meanings that require a disabled feature instead of silently losing information.
- Base-4/8/10/12 sampled number systems. Arithmetic supports every integer 0–999 in any configured base 2–12. Prefix `add(multiply(high, radix), low)` gives an unambiguous additive/multiplicative interpretation. Leading zero encodings and invalid remainders are rejected by the surface parser.
- Four noun concepts (bird, robot, fox, child), three transitive verbs (see, follow, help), two attributes (red, small), counts 1–99, three tenses, negation and ordered conjunctions of at most two clauses. Attributes are normalized; duplicate attributes, extra fields, invalid counts and unsupported meanings fail validation.

The same normalized meaning compiles to an utterance, controlled English and private truth. Every clean compilation parses its utterance back into a tree and compares semantic keys. Dataset assembly independently rejects contradictory surface collisions, repeated observation/target meanings and target tokens absent from observations. Controlled English uses explicit counts and auxiliaries (for example, “1 bird does see 1 robot”) to avoid hidden tense or plurality decisions.

`noun-homophone` is a named experimental ambiguity setting for specification construction. The clean compiler and inverse parser explicitly reject it. Set-valued ambiguous scoring is not implemented and no ambiguous language enters validated practice or the locked splits.

## Learner and scorer boundary

`learnerView` uses an explicit allowlist. Observations expose only their selected utterance, English and grounded scene. Challenges expose only a session-local opaque position and utterance. Seeds, complete lexicons, private grammar, target scenes, dataset hashes and unseen accepted answers are omitted. Observation and challenge order are seeded permutations, and target meanings vary between language seeds: challenge positions cannot serve as a fixed answer lookup across languages.

The server chooses a random seed for interactive practice. `GET /api/compiler/:profileId` returns the learner projection plus submitted feedback. `POST` accepts strict start/attempt/reveal/close commands, expected profile revisions and request IDs; caller-supplied seeds or scoring fields fail validation. Revealing exposes only that challenge's controlled English. Generic profile create/update/mutation paths cannot bind a private session pointer or submit grading history.

This separates learner inputs from scorer material in normal execution. It is not an anti-cheat boundary against the computer's owner: source code, files and explicitly inclusive backup exports are accessible to that owner. Evaluation adapters must receive only learner files, without the runner's manifest, scorer directory, filesystem or archive capability. A local HTTP credential is not a separate untrusted-learner role.

## Reproducible datasets

`xeno-dataset-1` defines three frozen 30-language splits. Development and locked evaluation each balance SVO/SOV and use disjoint seed namespaces. The structural split uses a third namespace with VSO, absent from both earlier splits. Each language has 29 observations and 5 withheld compositions. All challenge tokens appear in observations; targets combine observed atoms in new counts, roles, attributes, tense/negation and conjunctions.

The manifest hashes complete dataset content, then each split, then the split manifest using SHA-256 over compact `JSON.stringify` serialization. Serialized key insertion order is fixed by construction; hashes are content identities, not signatures. Scorer records retain the specification, observations and private target truth. The committed `evaluation/fixtures/generator-gold.json` pins seed 42, five PRNG outputs, all 90 per-language digests and manifest digests. The golden file is a compatibility contract, not a snapshot to update automatically when a test fails. Published generator or corpus changes require a new version and deliberate compatibility handling for saved sessions.

Run `npm run dataset:export` from the repository root to write the frozen corpus below `test-results/compiler-<manifest-prefix>/`. Each split has separate `learner/` and `scorer/` directories; filenames given to learners contain no seeds. Keep the manifest with the evaluation runner. Run `npm test -w server` to check golden compatibility and compiler invariants. No learner scores have been computed in W14; the evaluation split is reserved for W15 reporting and must not drive algorithm selection.

## Persistence and archives

A profile contains only a server-owned `compiler_session_id` pointer. Private records live in `DATA_DIR/compiler-sessions/<uuid>.json` and store the generator version, seed, dataset digest and bounded event history. On reload, the server regenerates and verifies the dataset, then validates progress against the regenerated challenges. Unknown versions, changed digests, impossible events or missing records fail visibly; no replacement key is invented.

Each command writes a fresh immutable snapshot before atomically publishing its pointer in a revision-checked profile transaction. The existing mutation ledger deduplicates request retries. A failed profile publication leaves the prior session usable. Snapshots and safe orphans are conservatively retained; automatic garbage collection and broad power-loss certification remain future work. At most 1,000 events of bounded size may be stored in a session.

Desktop answer drafts use stable user-data storage and survive application relaunch. Browser drafts use origin-local IndexedDB: refreshing the same address retains them, while another host/port restores the last submitted server answer. Drafts are excluded from archives. There is no automatic vocabulary/grammar reward from compiler scoring; practice correctness is kept separate from asserted workspace evidence.

An explicitly inclusive `.xeno` export adds `compiler-session.json` and uses archive version 2. Import verifies the version, content hash and session reconstruction, stages a fresh private identity, then publishes the profile last. Replacement backups retain the original compiler session. Version-1 archives remain supported; excluding sandbox state omits both the pointer and the private record. JSON export omits the private pointer and cannot move validated practice.

## Verification and remaining scope

Tests cover 3,060 generated observation/target round trips over 90 languages, independent arithmetic evaluation of 11,000 base/value pairs, collision/version rejection, strict semantic normalization, token coverage, disjoint splits, projection leakage, authenticated routes, retry conflicts, failed publication, archive identity remapping and replacement backup recovery. Source CI exercises the frozen corpus on Windows and Linux. The installed-app harness additionally checks actual packaged generation, grading, private-field exclusion, desktop draft/session relaunch recovery and inclusive archive restore.

Coverage is deliberately finite. Free word order, case systems, polysemy, infixes, tone, natural-language paraphrase grading, learner baselines, calibration, performance comparisons and scientific score claims remain future work. The known Unicode translation defect in the separate workbench remains assigned to W16.
