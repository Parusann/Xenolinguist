import { getConfidenceLevel } from 'shared/constants'
import type { LanguageProfile } from 'shared/types'

export interface ConfidenceCounts {
  confirmed: number
  probable: number
  unknown: number
  total: number
}

/** Count dictionary entries per confidence bucket (matches Dashboard). */
export function getConfidenceCounts(profile: LanguageProfile): ConfidenceCounts {
  let confirmed = 0
  let probable = 0
  let unknown = 0
  for (const entry of profile.dictionary) {
    const level = getConfidenceLevel(entry.confidence)
    if (level === 'confirmed') confirmed++
    else if (level === 'probable') probable++
    else unknown++
  }
  return { confirmed, probable, unknown, total: profile.dictionary.length }
}

/**
 * Overall decoding progress 0–100. Weighted: dictionary 30, grammar 25,
 * numbers 15, samples 15, average-confidence 15. Single source of truth for
 * the status bar and the dashboard hero ring.
 */
export function getDecodingProgress(profile: LanguageProfile): number {
  const totalWords = profile.dictionary.length
  const avgConfidence =
    totalWords > 0 ? Math.round(profile.dictionary.reduce((sum, e) => sum + e.confidence, 0) / totalWords) : 0
  const grammarRules = profile.grammar_rules.length
  const totalSamples = profile.samples.length
  const numbersMapped = Object.keys(profile.number_system.mappings).length

  const dictionaryScore = Math.min(totalWords / 50, 1) * 30
  const grammarScore = Math.min(grammarRules / 5, 1) * 25
  const numbersScore = Math.min(numbersMapped / 10, 1) * 15
  const samplesScore = Math.min(totalSamples / 10, 1) * 15
  const confidenceScore = (avgConfidence / 100) * 15

  return Math.round(dictionaryScore + grammarScore + numbersScore + samplesScore + confidenceScore)
}

/**
 * Cumulative count of dated items across `points` evenly-spaced buckets — a real
 * "growth over time" series for sparklines (no fabricated data). Items without a
 * parseable date are ignored; returns flat [0, 0] when none exist.
 */
export function cumulativeTrend(dates: Array<string | undefined | null>, points = 24): number[] {
  const times = dates
    .map((d) => (d ? new Date(d).getTime() : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b)
  if (times.length === 0) return [0, 0]
  const min = times[0]
  const max = times[times.length - 1]
  const span = max - min || 1
  const series: number[] = []
  for (let i = 0; i < points; i++) {
    const t = min + (span * i) / (points - 1)
    let count = 0
    for (const x of times) if (x <= t) count++
    series.push(count)
  }
  return series
}
