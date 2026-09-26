import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, preparePage, openProfile, attachJson, root } from './fixtures';

test('W21 retains rejected and accepted model proposals through reload, restart and archive restore', async ({ page, server }) => {
  test.setTimeout(90000);
  let future = true;
  const upstream = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const input = raw ? JSON.parse(raw) : {};
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'fixture-model', digest: 'scripted-browser-fixture', size: 100 }] }));
    if (req.url === '/api/show') return res.end(JSON.stringify({ capabilities: ['completion'], model_info: { architecture: 'fixture' } }));
    if (req.url === '/api/chat') {
      const data = JSON.parse(input.messages[1].content);
      return res.end(JSON.stringify({ message: { content: JSON.stringify({ tool: 'finish', proposal: {
        scope: data.context.scope, label: future ? 'Future tense candidate' : 'Past tense candidate', explanation: 'Synthetic model output for browser acceptance.',
        alternatives: ['The marker could have another function.'], citations: [{ observation_id: 'capture', annotation_id: null, start: 0, end: 9, quote: 'ka pa-mok', relation: 'supports' }],
        content: { kind: 'grammar', rule_id: 'tense', rule: { kind: 'tense-affix', position: 'prefix', affix: 'pa-', tense: future ? 'future' : 'past' } },
      } }) }, done: true }) + '\n');
    }
    res.statusCode = 404; res.end();
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  try {
    server.ollamaUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`; await server.restart();
    await page.context().addCookies([{ name: 'xeno_dev_session', value: server.secret, url: server.url + '/api', httpOnly: true, sameSite: 'Strict' }]);
    await preparePage(page);
    const retained = JSON.parse(await readFile(path.join(root, 'docs/verification/w21-proposal-local-model.json'), 'utf8'));
    const created = await page.request.post(server.url + '/api/profiles', { data: { ...retained.profile, name: 'Proposal review acceptance' } });
    expect(created.ok()).toBeTruthy(); const profile = await created.json();
    const openReview = async () => {
      await openProfile(page, server.url, 'Proposal review acceptance');
      await page.getByRole('button', { name: /AI SHIFT\+A/ }).click();
      await page.getByRole('button', { name: 'Review research proposals', exact: true }).click();
    };
    await openReview();
    const panel = page.getByRole('region', { name: 'Research proposal review' });
    await panel.getByRole('textbox', { name: 'Research question' }).fill('Test whether pa marks future or past.');
    await panel.getByRole('checkbox', { name: 'Check sample ka pa-mok' }).check();
    await panel.getByRole('button', { name: 'Generate research proposal', exact: true }).click();
    await expect(panel.getByText('Validation: falsified', { exact: true })).toBeVisible();
    await expect(panel.getByText(/After: I will speak/)).toBeVisible();
    await panel.getByRole('textbox', { name: 'Proposal decision reason' }).fill('Future tense contradicts the supplied past target.');
    await expect(panel.getByRole('button', { name: 'Accept and apply proposal', exact: true })).toBeDisabled();
    await panel.screenshot({ path: test.info().outputPath('falsified-proposal.png') });
    await panel.getByRole('button', { name: 'Reject proposal', exact: true }).click();
    await expect(panel.getByText('Recorded reason: Future tense contradicts the supplied past target.')).toBeVisible();
    let saved = await (await page.request.get(server.url + '/api/profiles/' + profile.id)).json();
    expect(saved.research.hypotheses).toHaveLength(0); expect(saved.grammar_rules).toEqual(profile.grammar_rules);
    future = false;
    await panel.getByRole('button', { name: 'Generate research proposal', exact: true }).click();
    await expect(panel.getByText('Validation: compatible', { exact: true })).toBeVisible();
    await panel.getByRole('textbox', { name: 'Proposal decision reason' }).fill('Reviewed the capture and the executed past-tense check.');
    await expect(panel.getByRole('button', { name: 'Accept and apply proposal', exact: true })).toBeEnabled();
    await panel.getByRole('button', { name: 'Accept and apply proposal', exact: true }).click();
    await expect(panel.getByText('Recorded reason: Reviewed the capture and the executed past-tense check.')).toBeVisible();
    saved = await (await page.request.get(server.url + '/api/profiles/' + profile.id)).json();
    expect(saved.research.hypotheses[0].provenance).toBe('model'); expect(saved.research.events[0].status).toBe('accepted');
    expect(saved.proposal_reviews.map((r: { decision: { action: string } }) => r.decision.action)).toEqual(['reject', 'accept']);
    await page.reload(); await openReview();
    await expect(panel.getByText('Recorded reason: Reviewed the capture and the executed past-tense check.')).toBeVisible();
    await server.restart();
    await page.context().addCookies([{ name: 'xeno_dev_session', value: server.secret, url: server.url + '/api', httpOnly: true, sameSite: 'Strict' }]);
    await openReview();
    await expect(panel.getByText('Recorded reason: Reviewed the capture and the executed past-tense check.')).toBeVisible();
    await panel.screenshot({ path: test.info().outputPath('accepted-proposal.png') });
    await attachJson('review-profile.json', await (await page.request.get(server.url + '/api/profiles/' + profile.id)).json());
    await page.getByRole('button', { name: 'Close chat', exact: true }).click();
    await page.locator('[data-tour="dashboard"]').click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export .xeno archive', exact: true }).click();
    const archiveFile = test.info().outputPath('review-history.xeno'); await (await downloading).saveAs(archiveFile);
    await page.getByLabel('Import .xeno archive', { exact: true }).setInputFiles(archiveFile);
    const preview = page.getByRole('region', { name: 'Archive preview' });
    await preview.getByRole('button', { name: 'Restore project', exact: true }).click();
    await page.getByRole('button', { name: 'Open restored project', exact: true }).click();
    await page.getByRole('button', { name: /AI SHIFT\+A/ }).click();
    await page.getByRole('button', { name: 'Review research proposals', exact: true }).click();
    await expect(panel.getByText('Recorded reason: Reviewed the capture and the executed past-tense check.')).toBeVisible();
    const profiles = await (await page.request.get(server.url + '/api/profiles')).json();
    const restoredId = profiles.find((p: { id: string }) => p.id !== profile.id).id;
    const restored = await (await page.request.get(server.url + '/api/profiles/' + restoredId)).json();
    expect(restored.proposal_reviews[1].archived).toBe(true);
    expect(restored.proposal_reviews[1].source_json).toBe(saved.proposal_reviews[1].source_json);
    expect(restored.proposal_reviews[1].run_json).toBe(saved.proposal_reviews[1].run_json);
    expect(restored.proposal_reviews[1].decision.hypothesis_id).toBe(restored.research.hypotheses[0].id);
    await attachJson('restored-review-profile.json', restored);
  } finally { upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
});
