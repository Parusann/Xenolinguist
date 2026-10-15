/** Confidence bucket for a 0-100 value, matching the design's thresholds. */
export type ConfBucket = 'confirmed' | 'probable' | 'unknown'
export const confBucket = (v: number | null): ConfBucket => (v != null && v >= 76 ? 'confirmed' : v != null && v >= 41 ? 'probable' : 'unknown')
