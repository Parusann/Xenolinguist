import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { test, expect, preparePage, openProfile, attachJson } from './fixtures';
import { corpusCase, config } from '../../evaluation/src/elicitation/corpus';
import { queryKey } from '../../engine/src/elicitation/contracts';
import { derive } from '../../engine/src/translation/derive';

const recording = process.env.XENO_RECORD_DEMO === '1';
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', video: recording ? { mode: 'on', size: { width: 1440, height: 900 } } : 'off' });
test('W26 demonstrates a reserved plural question, withheld form and recovered derivation', async ({ page, server }) => {
  test.setTimeout(recording ? 240000 : 60000); await preparePage(page);
  const start = Date.now(), seed = 104729, data = corpusCase(seed, 'grammar', 'regular');
  expect([...config.developmentSeeds, ...config.evaluationSeeds, ...config.ciSeeds] as number[]).not.toContain(seed);
  if (data.visible.domain !== 'grammar') throw Error('Expected grammar corpus');
  const visible = data.visible, stamp = '2026-10-10T00:00:00.000Z';
  const rules = [visible.candidates[0].rules[0], visible.candidates[4].rules[0]].map((executable, i) => ({
    id: `plural-${i}`, rule: i ? 'Plural suffix hypothesis' : 'Plural prefix hypothesis', executable, confidence: null, evidence: [], created_at: stamp,
  }));
  const created = await page.request.post(`${server.url}/api/profiles`, { data: { name: 'Reserved language · 104729', dictionary: visible.dictionary, grammar_rules: rules } });
  expect(created.ok()).toBe(true); const profile = await created.json();
  let modelCalls = 0; page.on('request', request => { if (request.url().includes('/api/ai/')) modelCalls++; });
  const narration: { seconds: number; text: string }[] = [];
  const show = async (text: string) => {
    narration.push({ seconds: (Date.now() - start) / 1000, text });
    if (recording) {
      await page.evaluate(text => {
        let caption = document.getElementById('demo-narration');
        if (!caption) { caption = document.createElement('div'); caption.id = 'demo-narration'; document.body.append(caption); }
        caption.textContent = text;
        Object.assign(caption.style, { position: 'fixed', left: '20px', right: '20px', bottom: '10px', zIndex: '10000', background: '#06160f', color: '#eafff1', padding: '14px 20px', font: '18px system-ui', border: '1px solid #48bf84', pointerEvents: 'none' });
      }, text);
      await page.waitForTimeout(14000);
    }
  };
  await openProfile(page, server.url, profile.name);
  await show('Reserved synthetic language, seed 104729. Three word meanings are supplied. No model receives the answer key.');
  await page.getByRole('button', { name: 'Vocabulary', exact: true }).click();
  await show('These known stems are the starting information budget. The plural rule is still uncertain.');
  await page.getByRole('button', { name: 'Grammar', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Active grammar elicitation', exact: true });
  await panel.getByText('Configure alternatives and answerable meanings', { exact: true }).click();
  await panel.getByLabel('Alternative A: Plural prefix hypothesis', { exact: true }).check();
  await panel.getByLabel('Alternative B: Plural suffix hypothesis', { exact: true }).check();
  await show('Two supplied hypotheses disagree: does the plural marker precede or follow the stem? This is candidate testing, not unrestricted discovery.');
  await panel.getByLabel('Question noun or subject', { exact: true }).selectOption('star');
  await panel.getByRole('button', { name: 'Add question anchor', exact: true }).click();
  await panel.getByLabel('Can observe the stars', { exact: true }).check();
  await panel.getByText('Configure alternatives and answerable meanings', { exact: true }).click();
  await panel.getByRole('button', { name: 'Select and record grammar question', exact: true }).click();
  await expect(panel.getByLabel('Elicitation answer')).toBeEnabled();
  await show('The selector records a discriminating question and its predicted answer groups. Only the stars can be observed in this run.');
  const pending = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  const question = JSON.parse(pending.grammar_elicitation_history[0].report_json).selection;
  const observed = data.oracle.find(item => item.key === queryKey({ kind: 'meaning', meaning: question.meaning, cost: 1 }))!.form;
  await panel.getByLabel('Elicitation answer').fill(observed);
  await panel.getByLabel('Elicitation reason').fill('Independent reserved corpus observation; only this requested answer was exposed.');
  await show('One answer is revealed by the independent corpus oracle. The learner never receives the other answers or hidden rule choice.');
  await panel.getByRole('button', { name: 'Save observed answer', exact: true }).click();
  await expect(panel).toContainText('After the answer: 1 remaining alternatives (before 2)');
  await panel.screenshot({ path: test.info().outputPath('elicitation.png') });
  await show('The observation is retained, and two alternatives become one. The answer does not silently modify executable rules.');
  const prefixWins = seed % 8 < 4, losing = prefixWins ? 'Plural suffix hypothesis' : 'Plural prefix hypothesis';
  await page.getByRole('button').filter({ has: page.getByText(losing, { exact: true }) }).click();
  await page.getByLabel('Selected rule type', { exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Save execution', exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json()).grammar_rules.filter((r: { executable: unknown }) => r.executable).length).toBe(1);
  await show('A deliberate review disables the contradicted rule. Its notebook text and the original elicitation history remain available.');
  const held = data.oracle.find(item => {
    const meaning = visible.available.find(q => queryKey(q) === item.key);
    return meaning?.kind === 'meaning' && meaning.meaning.kind === 'nominal' && meaning.meaning.nominal.head.entryId === 'rock' && meaning.meaning.nominal.plural;
  })!;
  expect(observed).not.toBe(held.form);
  await page.getByRole('button', { name: 'Translation', exact: true }).click();
  await page.getByLabel('Translation source', { exact: true }).fill(held.form);
  await show('Now test the rocks: a plural form that was withheld from the question and observation. Lexical lookup alone cannot resolve it.');
  const symbolic = page.getByRole('region', { name: 'Symbolic translation', exact: true });
  await symbolic.getByRole('button', { name: 'Analyze symbolically', exact: true }).click();
  await expect(symbolic.getByTestId('symbolic-result')).toContainText('the rocks');
  await symbolic.getByText('Meaning tree', { exact: true }).click();
  await symbolic.screenshot({ path: test.info().outputPath('derivation.png') });
  await show('Symbolic parsing produces the rocks, with a meaning tree, source spans and the exact plural rule used. No language model generated this result.');
  const saved = await (await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();
  const result = derive(held.form, saved); expect(result.status).toBe('resolved');
  expect(saved.research.observations).toHaveLength(1);
  await page.reload(); await openProfile(page, server.url, profile.name);
  await page.getByRole('button', { name: 'Translation', exact: true }).click();
  await expect(page.getByLabel('Translation source', { exact: true })).toHaveValue(held.form);
  await symbolic.getByRole('button', { name: 'Analyze symbolically', exact: true }).click();
  await expect(symbolic.getByTestId('symbolic-result')).toContainText('the rocks');
  await show('Reloading restores the saved project and translation draft. Re-running the parser gives the same result.');
  await page.getByRole('button', { name: 'Grammar', exact: true }).click();
  await expect(panel).toContainText('Independent reserved corpus observation');
  await show('The retained question, answer and review explain the outcome. This narrow regular-plural success does not establish general language-decipherment accuracy.');
  expect(modelCalls).toBe(0);
  await attachJson('demo-manifest.json', { version: 'recruiter-demo-1', seed, corpusVersion: config.version, sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    corpusSha256: createHash('sha256').update(JSON.stringify(data)).digest('hex'), modelCalls, inputBudget: { knownDictionaryEntries: 3, suppliedPluralHypotheses: 2, observedAnswers: 1 },
    observed, heldOutForm: held.form, expected: 'the rocks', derivation: result, project: saved, narration,
    limits: ['Seed-disjoint vocabulary; reused structural family.', 'Oracle answers retained for audit, not supplied as learner context.', 'Captioned automation recording, no voiceover.'] });
  if (recording) await page.waitForTimeout(Math.max(0, 180000 - (Date.now() - start)));
});
