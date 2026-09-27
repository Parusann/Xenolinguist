import { useState } from 'react'
import { useProposalReview } from '@/stores/proposal-review-context'

/** Offer an explicit research review after sample entry; saving never starts inference. */
export function useAutoSuggest() {
  const [sampleText, setSampleText] = useState('')
  const openResearch = useProposalReview()
  return {
    sampleText,
    suggestForSample: (text: string) => setSampleText(text.trim().slice(0, 1000)),
    dismiss: () => setSampleText(''),
    review: () => openResearch(`Investigate this sample using retained captured evidence: ${sampleText}. Propose a lexical sense, executable rule, or distinguishing observation; cite exact evidence.`),
  }
}
