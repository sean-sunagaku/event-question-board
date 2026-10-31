import {build} from 'esbuild';
import {client} from './client.mjs';
await client();for(const app of (process.argv[2]?[process.argv[2]]:['participant','admin','api']))await build({entryPoints:[`apps/${app}/src/index.ts`],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:`apps/${app}/dist/server/index.js`});
