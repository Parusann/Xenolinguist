import type { Task } from './contracts.js';

/** Identical declared priors for symbolic, base-model and specialist comparisons. */
export const TASK_PRIORS: Record<Task, string> = {
  segmentation: 'Segments must be drawn only from complete segments in the demonstrations. Enumerate all concatenations that reconstruct the query. Preserve the exact NFC symbols. Multiple segmentations can be valid.',
  lexical: 'The declared form inventory and meaning inventory are in an unknown one-to-one correspondence. Keep all bijections consistent with the anchors. Inventory order carries no mapping information. A query outside the form inventory has insufficient evidence.',
  correspondence: 'The rule is identity or one symbol replacement, applied everywhere, only initially, or only finally. Replacement symbols are drawn from observed source and target sequences. Keep all rules consistent with every pair. Require at least one pair; unseen source symbols in the query mean insufficient evidence.',
  morphology: 'For each exact feature set the rule is prefix + complete lemma + suffix. Each affix has at most two Unicode code points. Keep all affix pairs consistent with observations for that feature set. A feature set without an observation has insufficient evidence.',
};
