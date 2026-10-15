import os from 'node:os';
export const measurementHost = () => ({platform:process.platform,node:process.version,cpu:os.cpus()[0]?.model,memoryBytes:os.totalmem(),browser:'Chromium via locked Playwright',scope:'Single host, synthetic profile; no CPU throttling or disk cache flush.'});
export function largeProfile(count:number) {
  const created_at='2026-10-10T00:00:00.000Z';
  return {name:`Performance ${count}`, dictionary:Array.from({length:count},(_,i)=>({id:`word-${i}`,alien_word:`tal${i}`,english_meaning:`meaning ${i}`,part_of_speech:'noun',confidence:null,context:'Synthetic performance fixture',examples:[],notes:'',created_at})),
    samples:Array.from({length:count},(_,i)=>({id:`sample-${i}`,alien_text:`tal${i}`,english_translation:null,source:'Synthetic performance fixture',phonetic_notes:'',decoded:false,audio_id:null,ipa:null,created_at}))};
}
