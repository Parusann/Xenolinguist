import type { LanguageProfile } from 'shared/types'

export function getConfidenceCounts(profile: LanguageProfile) {
  const rated = profile.dictionary.filter(entry => entry.confidence !== null).length
  return { rated, unrated: profile.dictionary.length - rated, total: profile.dictionary.length }
}
