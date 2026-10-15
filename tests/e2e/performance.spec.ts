import { test,expect,preparePage,openProfile,attachJson } from './fixtures';
import { largeProfile,measurementHost } from '../performance/large-profile';
import { performance } from 'node:perf_hooks';
test('W24 records production large-profile interactions',async({page,server})=>{
  test.skip(!process.env.XENO_PERFORMANCE,'Explicit measurement run; normal CI uses functional gates.');
  test.setTimeout(240000); await preparePage(page); const results=[];
  for(const count of [100,1000,10000]) {
    const data=largeProfile(count), created=await page.request.post(`${server.url}/api/profiles`,{data});expect(created.ok()).toBe(true);
    const profile=await created.json();let start=performance.now();await openProfile(page,server.url,profile.name);
    await expect(page.locator('textarea[placeholder^="Enter unknown language text"]')).toBeVisible();
    const loadMs=performance.now()-start;
    const timings:Record<string,number[]>={typing:[],search:[],translation:[]};
    const measure=async(selector:string,value:string)=>{
      await page.evaluate(selector=>{
        (window as unknown as {lastPaint:number|null}).lastPaint=null;
        document.addEventListener('input',event=>{
          if(!(event.target instanceof Element)||!event.target.matches(selector))return;
          const start=window.performance.now();
          requestAnimationFrame(()=>requestAnimationFrame(()=>{(window as unknown as {lastPaint:number}).lastPaint=window.performance.now()-start;}));
        },{once:true,capture:true});
      },selector);
      await page.locator(selector).fill(value);
      await page.waitForFunction(()=>(window as unknown as {lastPaint:number|null}).lastPaint!==null,{},{timeout:10000,polling:50});
      return await page.evaluate(()=>(window as unknown as {lastPaint:number}).lastPaint);
    };
    for(let i=0;i<5;i++)timings.typing.push(await measure('textarea[placeholder^="Enter unknown language text"]',`draft ${i}`));
    start=performance.now();await page.locator('[data-tour="vocabulary"]').click();await expect(page.getByPlaceholder('Search dictionary…')).toBeVisible();const vocabularyOpenMs=performance.now()-start;
    for(let i=0;i<5;i++)timings.search.push(await measure('input[placeholder="Search dictionary…"]',i%2?'tal9':'tal99'));
    await page.locator('[data-tour="translation"]').click();
    for(let i=0;i<5;i++)timings.translation.push(await measure('textarea[placeholder^="Enter unknown language text to translate"]',`tal${i}`));
    start=performance.now();const saved=await page.request.put(`${server.url}/api/profiles/${profile.id}`,{data:{revision:profile.revision,description:'Measured save'}});expect(saved.ok()).toBe(true);const saveMs=performance.now()-start;
    start=performance.now();await page.request.get(`${server.url}/api/profiles`);const listMs=performance.now()-start;
    results.push({count,profileBytes:Buffer.byteLength(JSON.stringify(profile)),loadMs,vocabularyOpenMs,saveMs,listMs,timings});
  }
  await attachJson('large-profile.json',{host:measurementHost(),results});
});
