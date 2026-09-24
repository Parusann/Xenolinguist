# Number grammar inference

W19 replaces the workbench's token-overlap base suggestions with executable number expressions. It receives grounded integer/form mappings and proposes a bounded family of arithmetic grammars. Prediction produces a surface and an atom/addition/multiplication tree; it never copies an unseen numeral from a hidden dictionary or calls a model. The separate AI advice button remains advisory.

## Inputs and persistence

Mappings in `number_system.mappings` are the observed evidence. Optional `validation_values` selects mappings withheld from grammar construction. This additive profile-v2 field is runtime validated and survives ordinary saves, reload and `.xeno` archive restoration; older profiles omit it. A checked value with no current mapping supplies no observation. The existing manually selected `base` remains a user assertion controlling positional display only; inference neither reads nor changes it.

The engine accepts at most 64 fit and 64 validation observations, integer values 0–4095, and nonempty forms up to 128 characters. It rejects a value in both partitions, conflicting forms for one value, and unknown input fields. Repeated identical integer/form pairs count once. The same normalized surface labeling different integers returns an explicit ambiguity rather than additional support. This conservative contract excludes genuinely syncretic number forms until a richer ambiguity model exists.

Comparison uses NFC, collapsed whitespace and the profile's case-sensitivity setting. Case-insensitive inference generates normalized lowercase forms; original mapping strings remain stored unchanged. The engine compares whole forms, not token overlap. It does not infer meaning from English glosses.

## Declared family

Candidate bases are 2–20, 24, 30 and 36. A candidate needs an observed fit form for its base. Fit mappings at or below that base are stored atoms; missing primitive words remain unknown. Larger mappings never become exception atoms just to make a candidate fit.

For `n = qB + r`, candidates use either repeated addition of the base or a recursively composed coefficient multiplied by the base, followed by a remainder when nonzero. A coefficient of one is omitted by declaration. Each family tests high-first or low-first addition; multiplicative grammars also test coefficient-first or base-first multiplication. The tree records numeric operations independently of surface order. Repeated addition uses a left-associated chain, with the same addition order and linker at each join.

Empty, space and hyphen joins are initial hypotheses. Additional joins of at most 12 characters are extracted only when a fit form starts and ends with known atom/base forms. A single set of at most eight observed/declared joins supplies addition and multiplication hypotheses; their roles are tested separately. Validation cannot introduce a linker or atom. Candidates cover concatenative arithmetic forms, not arbitrary subtraction, fractions, signs, inflection, suppletion, place-value digits, special powers or context-dependent allomorphy. Manually recorded operator labels are preserved but are not assumed to be productive spoken linkers.

## Ranking and uncertainty

Each candidate records a row for every mapping: stored atom, correct productive form, contradiction, unknown atom or composition limit. At least two distinct productive fit values and surfaces are required before it becomes eligible. A perfect one-comparison match is insufficient, even if repeated many times.

The explicit lexicographic ranking is: more productive fit matches; fewer fit contradictions; more validation matches; fewer validation contradictions; then fewer serialized UTF-8 grammar bytes for display. Missing predictions stay visible and remain in displayed denominators, but are not treated as observed contradictions. Validation is used for selection, so its score is not a final blind-test accuracy. A large base that memorizes more mapped values receives no productive credit for those atoms. Bases with identical observed surfaces can consequently rank differently because they explain different numbers of forms productively; the alternative candidates and their atom/support counts remain inspectable.

Complexity orders the display, but does not break an evidence tie: every candidate with equal fit/validation counts remains a leader. Unobserved multiplication order or linker choices are therefore retained instead of becoming certain through a size preference. Predictions require every leading candidate to produce the same normalized form. Disagreement, missing atoms and composition limits remain explicit. This consensus is conditional on the ranking and declared family, not proof that lower-ranked or unenumerated grammars are false.

The UI uses **exploratory**, **ambiguous**, **insufficient**, **invalid**, **limit**, or **validated**. Validated means a single candidate matches every supplied validation mapping and has no fit contradictions. It does not mean externally confirmed truth or calibrated probability. Independent provenance is not established by assigning a checkbox; repeated edits and questions make an interactive session exploratory.

## Predictions and next observations

Enter a numeral to inspect the productive form and arithmetic tree. A recorded form is displayed separately as stored evidence, including when it contradicts productive generation. Inference never saves predicted forms into the mappings.

The question selector scans unmapped integers 1–512 in ascending order and returns the first value on which all leading candidates can predict but disagree. This is a deterministic disagreement query, not an information-gain optimum. If none is found, the bounded search reports that limitation instead of claiming equivalent grammars. An explicitly supplied answer is stored as a validation mapping; the user must rerun inference. A new answer requiring a previously unseen atom/linker must be deliberately moved into fit before it can change the candidate family. First-class source links and later elicitation integration remain W20/W22 work.

## Resource and verification boundaries

The engine caps enumeration at 8,192 grammars and retained eligible candidates at 256. Exceeding either bound rejects the run rather than using a silently truncated comparison. Generation caps recursive calls at depth 16, expression nodes at 128, output at 512 characters, and repeated-base chains at 16 terms. The renderer worker has a 15-second deadline and cancellation; navigation terminates it. Changing mappings, validation assignment or case policy marks results stale and hides their predictions until rerun. No model is a hidden fallback.

`evaluation/configs/numbers.json` declares lexically disjoint development and evaluation partitions. Each contains 84 synthetic systems: seven bases × two arithmetic families × two ordering variants × three joins. An independent renderer supplies fit observations, selection validation and three further target values. The prediction engine receives only fit and validation mappings, never the generating specification or final targets. Four paired conditions test regular composition, one-comparison support, withheld irregular targets and duplicate labels. Exact memorization receives fit plus validation but cannot answer new target integers. These are narrow synthetic diagnostics, not 84 independent natural languages or a natural-language accuracy estimate.

```sh
npm run evaluate:numbers -- development
npm run evaluate:numbers -- evaluation
npm run evaluate:numbers -- verify PATH_TO_RESULTS
```

Runs refuse overwrite, retain source/config/lock snapshots and complete candidates, inputs, target-side truths, predictions, trees and failures. Replay checks hashes, planned cells, independently regenerated outcomes and summaries. Use the recorded Git revision for historical reproduction. W15 and W18 algorithms, configurations and published result archives remain unchanged.

See [implementation progress](implementation-progress.md) and [testing](testing.md) for the measured revision, browser checks and independent installed-app acceptance.
