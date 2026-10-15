import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { ProfileStore } from '../services/profile-store.js';
import { ProposalReviews } from '../services/proposal-reviews.js';
import { runResearchProposal } from '../services/research-proposal.js';
import { reviewHash, reviewRun, verifyProposalReviews } from '../services/proposal-review-integrity.js';
import { atomicWrite } from '../services/atomic-file.js';
import { JobManager } from '../services/job-manager.js';
import { ProjectArchives } from '../services/project-archive.js';
import { proposalFixture, at } from './proposal-fixture.js';
import { proposalRequestSchema, type ResearchProposal } from '../../../shared/schemas/proposals.js';

let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'xeno-proposal-reviews-')); process.env.DATA_DIR = root; });
afterEach(async () => {
  delete process.env.DATA_DIR;
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('xeno-proposal-reviews-')) throw new Error('Unsafe test cleanup');
  await fs.rm(root, { recursive: true, force: true });
});
const model = { name: 'fixture-model', digest: 'fixture-digest', size: 123, capabilities: ['completion'], location: 'local' as const, eligible: true, reason: 'Test fixture' };
function generator(content?: ResearchProposal['content']): typeof runResearchProposal {
  return async (p, raw, signal) => {
    const request = proposalRequestSchema.parse(raw), proposal = { ...proposalFixture().proposal, scope: { profile_id: p.id, revision: p.revision },
      content: content ?? { kind: 'grammar' as const, rule_id: 'tense', rule: { kind: 'tense-affix' as const, position: 'prefix' as const, affix: 'pa-', tense: 'past' as const } } };
    return runResearchProposal(p, request, signal, { chat: async () => JSON.stringify({ tool: 'finish', proposal }) }, async () => model);
  };
}
async function fixture(store = new ProfileStore(), content?: ResearchProposal['content']) {
  const original = proposalFixture();
  const p = await store.create({ ...original.p, ai_history: [{ id: 'private', role: 'user', content: 'Private unrelated conversation', timestamp: at, state: 'complete' }] });
  const reviews = new ProposalReviews(store, generator(content), new JobManager());
  const request = { ...original.request, profile_id: p.id, expectedRevision: p.revision };
  const result = await reviews.create(request, new AbortController().signal);
  return { store, reviews, p: result.profile, reviewId: result.reviewId, request };
}
const decision = (revision: number, action: 'accept' | 'reject' = 'accept', mutationId = 'review-decision') => ({ expectedRevision: revision, mutationId, action, reason: 'Reviewed cited evidence and the supplied-target checks.' });
it('retains independent bounded input snapshots and results without changing linguistic knowledge, and reopens them from disk', async () => {
  const { p, reviews } = await fixture();
  expect(p.revision).toBe(2); expect(p.research.hypotheses).toHaveLength(0);
  const record = p.proposal_reviews![0];
  expect(record.source_json).not.toContain('Private unrelated conversation'); expect(JSON.parse(record.source_json).proposal_reviews).toBeUndefined();
  expect(reviewRun(record)?.validation.status).toBe('compatible');
  expect((await new ProposalReviews().list(p.id)).profile.proposal_reviews).toEqual(p.proposal_reviews);
  expect((await reviews.list(p.id)).states[0]).toMatchObject({ status: 'completed', stale: false, canAccept: true });
});
it('atomically applies acceptance with model provenance and evidence links, and acknowledges duplicate decisions without a second mutation', async () => {
  const { p, reviews, reviewId, store } = await fixture();
  const input = decision(p.revision), accepted = await reviews.decide(p.id, reviewId, input);
  expect(accepted.revision).toBe(3); expect(accepted.research.hypotheses).toHaveLength(1);
  expect(accepted.research.hypotheses[0]).toMatchObject({ provenance: 'model', manual_belief: null, content: { kind: 'grammar', rule_id: 'tense' } });
  expect(accepted.research.events[0]).toMatchObject({ kind: 'hypothesis-status', status: 'accepted', reason: input.reason });
  expect(accepted.research.links[0]).toMatchObject({ observation_id: 'capture', span: { start: 3, end: 9 } });
  expect(accepted.proposal_reviews![0].decision?.applied_revision).toBe(3);
  expect((await new ProposalReviews(store).decide(p.id, reviewId, input)).revision).toBe(3);
  await expect(reviews.decide(p.id, reviewId, { ...input, reason: 'changed' })).rejects.toMatchObject({ code: 'MUTATION_ID_REUSED' });
});
it('blocks falsified and untested acceptance while retaining a rejection without changing dictionary, grammar or research', async () => {
  const { p, reviews, reviewId } = await fixture(new ProfileStore(), proposalFixture().proposal.content);
  await expect(reviews.decide(p.id, reviewId, decision(p.revision))).rejects.toMatchObject({ code: 'PROPOSAL_NOT_SUPPORTED' });
  const rejected = await reviews.decide(p.id, reviewId, decision(p.revision, 'reject'));
  expect(rejected.research).toEqual(p.research); expect(rejected.dictionary).toEqual(p.dictionary); expect(rejected.grammar_rules).toEqual(p.grammar_rules);
  expect(rejected.proposal_reviews![0].decision?.action).toBe('reject');
  const untested = await reviews.create({ ...proposalFixture().request, profile_id: p.id, expectedRevision: rejected.revision, validation_sample_ids: [] }, new AbortController().signal);
  await expect(reviews.decide(p.id, untested.reviewId, decision(untested.profile.revision, 'accept', 'second-decision'))).rejects.toMatchObject({ code: 'PROPOSAL_NOT_SUPPORTED' });
});
it('accepts an observation request as a question without fabricating a capture or executable assertion', async () => {
  const { p, reviews, reviewId } = await fixture(new ProfileStore(), { kind: 'observation-request', question: 'Ask about tomorrow', predictions: ['pa appears', 'pa is absent'] });
  const accepted = await reviews.decide(p.id, reviewId, decision(p.revision));
  expect(accepted.research).toEqual(p.research); expect(accepted.dictionary).toEqual(p.dictionary); expect(accepted.grammar_rules).toEqual(p.grammar_rules);
  expect(accepted.proposal_reviews![0].decision).toMatchObject({ action: 'accept', target_id: null, hypothesis_id: null });
});
it('uses revision checks for decisions and invalidates a proposal after evidence or test-target changes', async () => {
  const { p, reviews, reviewId, store } = await fixture();
  const renamed = (await store.update(p.id, { name: 'Unrelated edit' }, p.revision))!;
  await expect(reviews.decide(p.id, reviewId, decision(p.revision))).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  expect((await reviews.list(p.id)).states[0].stale).toBe(false);
  const changed = (await store.update(p.id, { samples: renamed.samples.map(s => ({ ...s, english_translation: 'different target' })) }, renamed.revision))!;
  expect((await reviews.list(p.id)).states[0]).toMatchObject({ stale: true, canAccept: false });
  await expect(reviews.decide(p.id, reviewId, decision(changed.revision))).rejects.toMatchObject({ code: 'PROPOSAL_STALE' });
});
it('retains review metadata through ordinary saves and refuses client mutation of its authority', async () => {
  const { p, store } = await fixture();
  const updated = (await store.update(p.id, { name: 'Changed', proposal_reviews: [] }, p.revision))!;
  expect(updated.proposal_reviews).toEqual(p.proposal_reviews);
  await expect(store.mutate(p.id, { expectedRevision: updated.revision, mutationId: 'forged', operations: [{ type: 'set-fields', fields: { proposal_reviews: [] } }] })).rejects.toThrow();
  const newProfile = await store.create({ ...p, name: 'New project' }); expect(newProfile.proposal_reviews).toBeUndefined();
});
it('serializes competing decisions and keeps the record authoritative after the general mutation ledger expires', async () => {
  const { p, reviews, reviewId, store } = await fixture();
  const inputs = [decision(p.revision), decision(p.revision, 'reject', 'other')];
  const results = await Promise.allSettled(inputs.map(i => reviews.decide(p.id, reviewId, i)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  const current = (await store.get(p.id))!;
  await store.commitProposalReview(p.id, current.revision, p => ({ ...p, recent_mutations: [] }));
  const retry = await reviews.decide(p.id, reviewId, inputs[results.findIndex(r => r.status === 'fulfilled')]);
  expect(retry.research.hypotheses).toHaveLength(1);
});
it('does not leave an accepted decision or knowledge change when the atomic profile write fails', async () => {
  let fail = false;
  const store = new ProfileStore(async (...args: Parameters<typeof atomicWrite>) => { if (fail && args[0].includes('profiles')) throw new Error('Injected disk failure'); await atomicWrite(...args); });
  const { p, reviews, reviewId } = await fixture(store), file = path.join(root, 'profiles', p.id + '.json'), before = await fs.readFile(file, 'utf8');
  fail = true; await expect(reviews.decide(p.id, reviewId, decision(p.revision))).rejects.toThrow('Injected disk failure');
  expect(await fs.readFile(file, 'utf8')).toBe(before);
  fail = false; expect((await reviews.decide(p.id, reviewId, decision(p.revision))).research.hypotheses).toHaveLength(1);
});
it('retains cancelled and failed generation records and identifies interrupted pending records after reopening', async () => {
  const store = new ProfileStore(), base = proposalFixture(), p = await store.create(base.p);
  const controller = new AbortController();
  let started!: () => void; const entered = new Promise<void>(r => { started = r; });
  const service = new ProposalReviews(store, async (_p, _request, signal) => { started(); await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); throw Error('unreachable'); }, new JobManager());
  const run = service.create({ ...base.request, profile_id: p.id }, controller.signal); await entered; controller.abort();
  await expect(run).rejects.toThrow();
  let saved = (await store.get(p.id))!; expect(saved.proposal_reviews![0].status).toBe('cancelled');
  const failing = new ProposalReviews(store, async () => { throw Error('private transport details'); }, new JobManager());
  await expect(failing.create({ ...base.request, profile_id: p.id, expectedRevision: saved.revision }, new AbortController().signal)).rejects.toThrow();
  saved = (await store.get(p.id))!; expect(saved.proposal_reviews![1]).toMatchObject({ status: 'failed', error: { code: 'PROPOSAL_FAILED', message: 'Proposal generation failed' } });
  await store.commitProposalReview(p.id, saved.revision, p => ({ ...p, proposal_reviews: [...p.proposal_reviews!, { ...p.proposal_reviews![0], id: 'restart-pending', status: 'running', error: null }] }));
  expect((await new ProposalReviews().list(p.id)).states.at(-1)?.status).toBe('interrupted');
});
it('round trips historical model payloads and accepted references while preventing imported approvals from applying again', async () => {
  const { p, reviews, reviewId } = await fixture();
  const accepted = await reviews.decide(p.id, reviewId, decision(p.revision));
  const pending = await reviews.create({ ...proposalFixture().request, profile_id: p.id, expectedRevision: accepted.revision }, new AbortController().signal);
  const archives = new ProjectArchives(), exported = await archives.export(p.id, pending.profile.revision, false);
  const bytes = await fs.readFile(exported.file); await exported.dispose();
  const preview = await archives.inspect(Readable.from([bytes])); const restored = (await archives.restore(preview.token, { mode: 'new' })).profile;
  const record = restored.proposal_reviews![0]; expect(record.archived).toBe(true);
  expect(record.source_json).toBe(accepted.proposal_reviews![0].source_json); expect(record.run_json).toBe(accepted.proposal_reviews![0].run_json);
  expect(record.decision?.hypothesis_id).toBe(restored.research.hypotheses[0].id);
  expect((await new ProposalReviews().list(restored.id)).states[0].canAccept).toBe(false);
  expect(preview.counts.proposals).toBe(3); // Two structured runs and the original conversation entry.
  await expect(new ProposalReviews().decide(restored.id, pending.reviewId, decision(restored.revision, 'accept', 'restored-decision'))).rejects.toMatchObject({ code: 'PROPOSAL_STALE' });
  verifyProposalReviews(restored);
});
it('applies a tested lexical replacement while preserving user notes and clearing asserted belief', async () => {
  const base = proposalFixture(), store = new ProfileStore();
  Object.assign(base.p.dictionary[1], { notes: 'Retain these field notes', context: 'Original context', examples: ['ka mok'], confidence: 0.8 });
  const original = await store.create(base.p);
  const reviews = new ProposalReviews(store, generator({ kind: 'lexical', entry_id: 'speak', form: 'mok', meaning: 'to speak', part_of_speech: 'verb', verb_frame: 'intransitive' }), new JobManager());
  const generated = await reviews.create({ ...base.request, profile_id: original.id }, new AbortController().signal);
  const accepted = await reviews.decide(original.id, generated.reviewId, decision(generated.profile.revision));
  expect(accepted.dictionary.find(w => w.id === 'speak')).toMatchObject({ notes: 'Retain these field notes', context: 'Original context', examples: ['ka mok'], confidence: null, user_asserted_confidence: null });
  expect(accepted.research.hypotheses[0]).toMatchObject({ provenance: 'model', content: { kind: 'lexical', entry_id: 'speak' } });
});
it('rejects corrupted sources, fabricated deterministic results, and decisions without their accepted hypothesis', async () => {
  const { p, reviews, reviewId } = await fixture();
  const copy = structuredClone(p); copy.proposal_reviews![0].source_json += ' ';
  expect(() => verifyProposalReviews(copy)).toThrow();
  const record = copy.proposal_reviews![0] = structuredClone(p.proposal_reviews![0]);
  const run = JSON.parse(record.run_json!); run.validation.status = 'falsified'; record.run_json = JSON.stringify(run); record.run_sha256 = reviewHash(record.run_json!);
  expect(() => verifyProposalReviews(copy)).toThrow();
  const accepted = await reviews.decide(p.id, reviewId, decision(p.revision)); accepted.research.hypotheses = [];
  expect(() => verifyProposalReviews(accepted)).toThrow();
});
it('requires a selected case to exercise the proposed entry instead of accepting unrelated compatible predictions', async () => {
  const { p, reviews, reviewId } = await fixture(new ProfileStore(), { kind: 'lexical', entry_id: null, form: 'unseen', meaning: 'moon', part_of_speech: 'noun', verb_frame: null });
  expect(reviewRun(p.proposal_reviews![0])?.validation.status).toBe('compatible');
  expect((await reviews.list(p.id)).states[0]).toMatchObject({ canAccept: false, acceptBlockReason: expect.stringContaining('No selected test exercises') });
  await expect(reviews.decide(p.id, reviewId, decision(p.revision))).rejects.toMatchObject({ code: 'PROPOSAL_NOT_EXERCISED' });
});
it('bounds history without pruning and supports explicit removal of unaccepted runs while retaining accepted audit records', async () => {
  const { p, reviews, reviewId, store, request } = await fixture();
  const filled = await store.commitProposalReview(p.id, p.revision, current => ({ ...current,
    proposal_reviews: Array.from({ length: 20 }, (_, i) => ({ ...current.proposal_reviews![0], id: i === 0 ? reviewId : `retained-${i}` })) }));
  await expect(reviews.create({ ...request, expectedRevision: filled.revision }, new AbortController().signal)).rejects.toMatchObject({ code: 'PROPOSAL_HISTORY_LIMIT' });
  const removed = await reviews.remove(p.id, 'retained-19', filled.revision); expect(removed.proposal_reviews).toHaveLength(19);
  expect((await reviews.remove(p.id, 'retained-19', filled.revision)).revision).toBe(removed.revision);
  const accepted = await reviews.decide(p.id, reviewId, decision(removed.revision));
  await expect(reviews.remove(p.id, reviewId, accepted.revision)).rejects.toMatchObject({ code: 'PROPOSAL_RETAINED' });
});
