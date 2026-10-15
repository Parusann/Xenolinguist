# ADR 003: Models propose; validated review applies

Author: Parusan Natheeswaran

Status: implemented. A local completion model is an untrusted reasoning aid. It receives bounded retrieval and typed tools, and returns a candidate with references; it has no direct profile/filesystem authority.

Validate shape, scope, source offsets and executable consequences, retain the attempt, then require explicit review at the current profile revision. Cancellation owns the real execution lifetime. User ratings, model scores, evidence counts and measured accuracy remain separate quantities.

Tradeoff: validation reduces accidental application but cannot establish linguistic truth from citation geometry. The frozen W21 pipeline produced zero application-eligible reserved proposals, so a quality improvement is not claimed. Better grounding requires a new experiment, not relaxing the validator after seeing its failures. See [validator](../../server/src/services/proposal-validator.ts) and [results](../proposal-results.md).
