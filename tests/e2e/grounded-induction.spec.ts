import { derive } from '../../engine/src/translation/derive';
import { test,expect,preparePage,openProfile } from './fixtures';
import { groundedDataset } from '../../evaluation/src/induction/corpus';
const at='2026-09-22T00:00:00.000Z';
test.beforeEach(async({page})=>{await preparePage(page)});
test('W18 learns a new plural, reviews the proposal and preserves accepted evidence through reload and archive',async({page,server})=>{
 const data=groundedDataset(100),observations=[data.input.fit[0],data.input.fit[1],data.input.fit[7],data.input.fit[8],data.input.validation[0]];
 const profile=await(await page.request.post(`${server.url}/api/profiles`,{data:{name:'Grounded plurals',dictionary:data.input.dictionary,samples:observations.map((o,i)=>({id:'sample-'+i,alien_text:o.surface,english_translation:null,source:'Grounded fixture',phonetic_notes:'',decoded:false,audio_id:null,ipa:null,created_at:at}))}})).json();
 let modelCalls=0;page.on('request',r=>{if(r.url().includes('/api/ai/'))modelCalls++});
 await openProfile(page,server.url,profile.name);await page.locator('[data-tour="grammar"]').click();
 const panel=page.getByRole('region',{name:'Grounded rule learning'});await panel.getByText('Assign a known meaning',{exact:true}).click();
 for(let i=0;i<5;i++){
  await panel.getByLabel('Grounded sample',{exact:true}).selectOption('sample-'+i);
  await panel.getByLabel('Observation use',{exact:true}).selectOption(i===4?'validation':'fit');
  await panel.getByLabel('Subject or noun',{exact:true}).selectOption('noun'+(i===4?2:Math.floor(i/2)));
  await panel.getByLabel('Grounded plural',{exact:true}).setChecked(i===1||i===3||i===4);
  await panel.getByRole('button',{name:'Add grounded observation',exact:true}).click();
 }
 await panel.getByRole('button',{name:'Infer grounded rules',exact:true}).click();
 const result=panel.getByTestId('induction-result');await expect(result).toContainText('Validation: 1/1 correct; no-rule baseline 0/1.');
 expect((await(await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json()).grammar_rules).toHaveLength(0);
 await panel.getByRole('button',{name:'Dismiss proposals',exact:true}).click();
 await page.locator('[data-tour="translation"]').click();await page.locator('[data-tour="grammar"]').click();
 await expect(panel.getByRole('button',{name:/Remove grounding/})).toHaveCount(5);
 await panel.getByRole('button',{name:'Infer grounded rules',exact:true}).click();await expect(result).toContainText('proposed');await panel.getByRole('button',{name:'Accept proposed rules',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath('grounded-proposal.png')});
 await panel.getByRole('button',{name:'Accept proposed rules',exact:true}).click();
 await expect.poll(async()=>(await(await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json()).grammar_rules.length).toBe(1);
 const saved=await(await page.request.get(`${server.url}/api/profiles/${profile.id}`)).json();expect(saved.grammar_rules[0].evidence.join(' ')).toContain('grounded-induction-1');
 await openProfile(page,server.url,profile.name);await page.locator('[data-tour="translation"]').click();
 await page.getByPlaceholder('Enter unknown language text to translate…').fill(observations[4].surface);
 const symbolic=page.getByRole('region',{name:'Symbolic translation',exact:true});await symbolic.getByRole('button',{name:'Analyze symbolically'}).click();await expect(symbolic).toContainText('the birds');
 const exported=await page.request.get(`${server.url}/api/archives/export/${profile.id}?revision=${saved.revision}&sandbox=false`);expect(exported.ok()).toBe(true);
 const inspected=await page.request.post(`${server.url}/api/archives/inspect`,{data:await exported.body(),headers:{'Content-Type':'application/octet-stream'}});expect(inspected.ok()).toBe(true);
 const token=(await inspected.json()).token;const restored=await page.request.post(`${server.url}/api/archives/${token}/restore`,{data:{mode:'new'}});expect(restored.status()).toBe(201);const restoredProfile=(await restored.json()).profile;expect(restoredProfile.grammar_rules[0].evidence).toEqual(saved.grammar_rules[0].evidence);expect(restoredProfile.grammar_rules[0].executable).toEqual(saved.grammar_rules[0].executable);
 expect(derive(observations[4].surface,restoredProfile).status).toBe('resolved');
 await page.locator('[data-tour="grammar"]').click();await panel.getByRole('button',{name:'Infer grounded rules',exact:true}).click();await expect(result).toContainText('proposed');
 await panel.getByRole('button',{name:'Remove grounding 1',exact:true}).click();await expect(panel.getByRole('button',{name:'Accept proposed rules',exact:true})).toBeDisabled();await expect(result).toContainText('Run induction again');
 expect(modelCalls).toBe(0);
});
