import { it,expect } from 'vitest';
import { mkdtemp,writeFile,readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ProfileStore } from '../services/profile-store.js';
it('summary counts refresh on commits and external file replacement and preserve corruption visibility',async()=>{
  const previous=process.env.DATA_DIR,dir=await mkdtemp(path.join(os.tmpdir(),'xeno-summary-'));
  process.env.DATA_DIR=dir;
  try {
    const store=new ProfileStore(),p=await store.create({name:'Summary'});
    expect((await store.list())[0]).toMatchObject({words:0,observations:0});
    const sample={id:'sample',alien_text:'tal',english_translation:null,source:'test',phonetic_notes:'',decoded:false,audio_id:null,ipa:null,created_at:p.created_at};
    await store.update(p.id,{samples:[sample]},p.revision);
    expect((await store.list())[0]).toMatchObject({observations:1});
    const file=path.join(dir,'profiles',p.id+'.json'),saved=JSON.parse(await readFile(file,'utf8'));
    saved.name='Changed externally';await writeFile(file,JSON.stringify(saved));
    expect((await store.list())[0].name).toBe('Changed externally');
    await writeFile(file,'corrupt');await writeFile(file+'.prev','corrupt');
    expect((await store.list())[0].recovery_error).toBeTruthy();
  } finally {if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;}
});
