import { loadConfig } from './config.js';
import { ingestReferences } from './references.js';

loadConfig().then(ingestReferences).then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error instanceof Error ? error.message : 'Reference ingestion failed'); process.exitCode = 1; });
