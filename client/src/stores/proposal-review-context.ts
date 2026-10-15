import { createContext, useContext } from 'react'

export interface ResearchReviewRequest { id: string; query: string }
export const ProposalReviewContext = createContext<(query: string) => void>(() => { throw Error('Proposal review is unavailable outside the workbench') })
export const useProposalReview = () => useContext(ProposalReviewContext)
