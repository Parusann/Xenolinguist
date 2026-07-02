/** Confidence bucket for a 0-100 value, matching the design's thresholds. */
export type ConfBucket = 'confirmed' | 'probable' | 'unknown'
export const confBucket = (v: number): ConfBucket => (v >= 76 ? 'confirmed' : v >= 41 ? 'probable' : 'unknown')
