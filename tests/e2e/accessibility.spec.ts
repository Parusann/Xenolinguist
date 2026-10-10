import AxeBuilder from '@axe-core/playwright';
import { test,expect,preparePage,openProfile,attachJson } from './fixtures';
test('W24 audits core workbench names, contrast and keyboard access',async({page,server})=>{
  test.setTimeout(90000);await preparePage(page);
  const created=await page.request.post(`${server.url}/api/profiles/demo`),profile=await created.json();
  const results=[];
  for(const size of [{width:1280,height:800},{width:1440,height:900},{width:640,height:400}]) {
    await page.setViewportSize(size);await openProfile(page,server.url,profile.name);
    for(const phase of ['samples','vocabulary','translation']) {
      await page.locator(`[data-tour="${phase}"]`).click();
      const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
      results.push({size,phase,violations:result.violations,incomplete:result.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});
    }
  }
  await attachJson('workbench-accessibility.json',results);
  if(!process.env.XENO_A11Y_BASELINE)expect(results.flatMap(r=>r.violations)).toEqual([]);
});
