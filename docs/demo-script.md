# Three-minute reproducible demonstration

Author: Parusan Natheeswaran

The demonstration uses reserved synthetic seed **104729** from `elicitation-experiment-1`. It is disjoint from the existing development/evaluation/CI seed lists but reuses a regular plural family. Three known word meanings and two competing plural hypotheses are supplied. Only one requested answer is revealed. The plural of a different noun is withheld until the final translation.

The recording is a captioned automation run of the actual workbench, without voiceover. Captions are a recording overlay, not a product feature. The raw manifest retains source revision, corpus hash, information budget, observed answer, withheld form, project and symbolic result. It must not be called a blinded human study or unrestricted language discovery.

| Approximate time | On-screen action | Technical point |
| --- | --- | --- |
| 0:00–0:30 | Open the reserved project and known vocabulary | Declare the supplied information; no model sees the hidden key |
| 0:30–1:00 | Compare prefix/suffix hypotheses; select an answerable plural question | Predicted answer groups make disagreement explicit |
| 1:00–1:30 | Reveal one independent oracle answer and retain it | Two alternatives become one; source capture and decision remain inspectable |
| 1:30–2:00 | Disable the contradicted rule through explicit review | A question answer never silently rewrites executable grammar |
| 2:00–2:30 | Translate the withheld plural noun; inspect meaning and derivation | Composition resolves an unseen form that lexical lookup alone cannot resolve |
| 2:30–3:00 | Reload, repeat the result and revisit evidence | Saved state/drafts survive; explain the regular-family limitation |

Run the fast acceptance version:

```sh
npm ci
npm run build:desktop
npx playwright test tests/e2e/recruiter-demo.spec.ts
```

Record the paced version in PowerShell:

```powershell
$env:XENO_RECORD_DEMO='1'
npx playwright test tests/e2e/recruiter-demo.spec.ts --output=test-results/recruiter-demo
Remove-Item Env:XENO_RECORD_DEMO
```

The test uses isolated synthetic storage, captures video and screenshots, and asserts the answer, a single retained observation, reload recovery and zero model calls. The source is [the executable demo](../tests/e2e/recruiter-demo.spec.ts). The oracle stays in the evaluator process; only supplied vocabulary/candidates, the selected answer and the final test input enter the workbench. The final manifest includes withheld truth for audit after the run.

For an interview, follow the demo with the [model-proposal failure comparison](proposal-results.md) rather than implying symbolic success was produced by a model. The project's AI engineering evidence is the validated tool/review boundary and honest evaluation, including unsuccessful candidates.
