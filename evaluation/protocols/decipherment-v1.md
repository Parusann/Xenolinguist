# Bounded decipherment protocol v1

Protocol identity: xeno-decipherment-1
Status: M1 contract; dataset generation and model comparisons are subsequent milestones.

## Question and scope

Can a learner recover a bounded linguistic transformation from declared evidence, predict unseen forms, and recognize when that evidence does not determine an answer?

This protocol is separate from xeno-generator-1 and its supplied-grammar-prior translation results. It does not establish unrestricted historical decipherment, natural-language family recovery or translation without semantic anchors.

## Tasks and information

| Task | Visible observations | Challenge | Prediction representation |
| --- | --- | --- | --- |
| Segmentation | Joined surfaces with demonstrated segments | A new joined surface | Ordered segments that concatenate exactly to the input |
| Lexical | Form/meaning anchors, possibly none; declared form and meaning inventories | A form | One meaning ID |
| Correspondence | Aligned source/target symbol sequences | A source sequence | A target sequence |
| Morphology | Lemma, feature set and inflected form | A lemma and requested feature set | One complete inflected form |

Segmentation is structural discovery with demonstrated boundaries, not grounded meaning recovery. Correspondence receives a known paired relative; it is not a discovery of that relationship. Morphology receives feature labels; the initial task is productive form prediction, not unsupervised discovery of all grammatical categories.

Each generator must document the finite hypothesis class or construction assumptions under which an answer is identifiable. Ground truth is conditional on that class. Infinite possible languages are not eliminated by finite examples. A generated hidden answer alone never proves that the evidence singles it out.

The hypothesis classes supplied equally to every learner are:

- Segmentation: use only complete segments appearing in demonstrated segment arrays; enumerate concatenations that reconstruct the query.
- Lexical: a bijection between the explicitly supplied form and meaning inventories consistent with all anchors. Queries outside the form inventory are insufficient.
- Correspondence: identity, or one symbol replacement applied everywhere, initially or finally. Replacement symbols come from observed source/target sequences. At least one paired observation is required; input symbols absent from observed source sequences are insufficient.
- Morphology: for each feature set, one fixed prefix and suffix, each at most two Unicode code points; preserve the complete lemma between them. Retain every affix pair consistent with that feature set's observations. No observation for the requested feature set is insufficient.

These classes are intentionally narrow. Contradictory observations yield no supported hypothesis and are reported as insufficient, not forced to match a generating answer. The exact sampled mechanisms and variation belong to a versioned corpus manifest. Do not tell a learner which generating rule was selected.

## Three truth states

- **Identified:** one answer remains under the declared class and supplied observations.
- **Ambiguous:** a finite enumerated set of at least two answers remains. Correctly stating ambiguity or returning the complete permitted set is successful. Selecting the hidden generator's answer as uniquely established is a false claim.
- **Insufficient:** relevant evidence is missing or the task cannot enumerate the remaining possibilities within its declared bound. Correct insufficient-evidence abstention is successful. No particular generated string receives credit.

Returned alternative sets contain at most 16 distinct predictions. Larger unresolved spaces use insufficient status; never truncate an answer set and call it complete. Budget exhaustion is recorded separately and is not epistemic success.

## Evidence boundary

The learner receives only the strict typed episode: task, opaque episode and record IDs, observations, challenges, an applicable meaning inventory, and tool/output/time budgets. The projection excludes truth, generator identity, lineage, split labels, seeds, filesystem paths and answer-bearing hashes.

Truth and provenance stay with the scorer. Do not expose scorer records through tools, filesystem access, retrieval or prompts. Strict schemas reject extra fields; projections are independent copies. Task strings can still contain untrusted material; they never grant permission to change tool scope.

This is an execution/data-flow boundary, not protection against the machine's owner reading local files. A new untrusted model subprocess would need a separately constrained execution environment.

## Response and scoring

One response contains a protocol identity and at most one prediction for each challenge. A prediction is a single answer with confidence and cited observation IDs, a finite alternative set with citations, or an abstention with a reason. Single lexical/morphology outputs must contain one element; segment outputs must reconstruct their input. Strings use NFC and otherwise exact comparison; no fuzzy semantic judge silently substitutes a correct result.

Duplicate or foreign challenge IDs invalidate the response. Malformed outputs, missing predictions, timeouts and runtime errors remain in the scheduled denominator. Confidence must be numeric in [0,1]. Fabricated evidence IDs invalidate success. Existing citation IDs establish only reference validity, never linguistic support.

Report separately by task, truth state and mechanism:

1. Exact identified-answer accuracy over all scheduled identified challenges.
2. Answer coverage and accuracy conditional on answering.
3. Correct handling of ambiguous/insufficient challenges.
4. False claims per scheduled challenge and per assertion. Invalid transport/schema outcomes are failures, not automatically false linguistic claims.
5. Brier score on single answers to identified challenges, always alongside coverage. This is not calibration for abstentions or ambiguous truth.
6. Invalid/missing/timeout/error counts, wall time, peak memory when measured, tokens and tool calls.

Do not collapse successful abstentions and correct translations into an unexplained accuracy percentage. Use independent language lineages as the statistical unit for later confidence intervals; related examples are not independent evidence.

## Splits and model comparisons

Maintain train, development and final roles. Keep a generated lineage in one split, hold out selected mechanisms/combinations and reference families where applicable, and include independently authored tasks. Hash complete manifests and detect duplicate learner problems across splits. Arbitrary random example splitting is insufficient.

Use development data for algorithm decisions and numerical launch thresholds. Freeze those before the reserved comparison. Final tasks must not enter training, retrieval indexes or the atlas. Repeated experimentation on final tasks converts them to development data and requires a new reserved split.

Compare lookup/alignment controls, the current applicable symbolic components, an unmodified base model, and the same model with declared tools. Later compare a specialist with the exact same evidence/tools/budgets. Tool-free and tool-assisted tracks are distinct. Record unsupported existing-engine tasks explicitly rather than fabricating an adapter result.

Start with zero-cost local runs. Log every scheduled attempt and model digest. No external model API or rented GPU is enabled by this protocol.

## Gates for the next milestones

M2 must demonstrate deterministic generation, scorer/learner separation, conditional identifiability, split isolation and independent controls. M3 must produce actual baseline failures and resource measurements before choosing a training objective. Numerical model-release thresholds are not fixed by M1; they will be preregistered after development measurements and before final evaluation.
