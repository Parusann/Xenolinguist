import { expect, it } from 'vitest';
import { independentControls } from './archive.js';
import { PROTOCOL } from './contracts.js';
import { prompt, runModel, type Transport } from './model.js';

const config = { name: 'fixture-local', digest: 'fixed', seed: 0, numCtx: 8192 };
const body = (action: unknown, tokens = 20) => ({ done: true, done_reason: 'stop', eval_count: tokens, prompt_eval_count: 100, message: { content: JSON.stringify(action) } });
const final = { kind: 'final', response: { protocol: PROTOCOL, predictions: [{ id: 'c0', kind: 'abstain', reason: 'ambiguity' }] } };
const check = { kind: 'check', hypothesis: { task: 'correspondence', from: 'p', to: 'f', position: 'all' } };

it('runs bounded visible-evidence checks and retains exact requests, outputs and token use', async () => {
  const e = (await independentControls()).find(e => e.learner.task === 'correspondence')!.learner;
  let calls = 0;
  const transport: Transport = async request => {
    expect(request.options.num_predict).toBe(e.budgets.maxOutputTokens - calls * 20);
    if (calls++) expect(JSON.parse(request.messages.at(-1)!.content).toolResult.compatible).toBe(true);
    return body(calls === 1 ? check : final);
  };
  const result = await runModel(e, true, config, transport);
  expect(result.outcome).toEqual({ status: 'complete', response: final.response });
  expect(result.trace.outputTokens).toBe(40); expect(result.trace.toolChecks).toHaveLength(1);
  expect(JSON.stringify(prompt(e, true))).not.toContain('provenance');
  expect(JSON.stringify(prompt(e, true))).not.toContain('acceptable');
});

it('retains malformed, missing-accounting, remote, truncated, timeout and over-budget outcomes', async () => {
  const e = (await independentControls()).find(e => e.learner.task === 'correspondence')!.learner;
  expect((await runModel(e, false, config, async () => body(check))).outcome).toEqual({ status: 'complete', response: null });
  for (const invalid of [ { ...body(final), eval_count: undefined }, { ...body(final), remote_host: 'external' }, { ...body(final), done_reason: 'length' } ])
    expect((await runModel(e, false, config, async () => invalid)).outcome.status).toBe('error');
  const invalidJson = { ...body(final), message: { content: 'not json' } };
  expect((await runModel(e, false, config, async () => invalidJson)).outcome).toEqual({ status: 'complete', response: null });
  const exhausted = await runModel({ ...e, budgets: { ...e.budgets, maxToolCalls: 1 } }, true, config, async () => body(check));
  expect(exhausted.outcome.status).toBe('error'); expect(exhausted.trace.toolChecks).toHaveLength(1); expect(exhausted.trace.calls).toHaveLength(2);
  const timeout = await runModel(e, false, config, async () => { throw new DOMException('timed out', 'TimeoutError'); });
  expect(timeout.outcome.status).toBe('timeout'); expect(timeout.trace.calls[0].error).toBe('timed out');
});
