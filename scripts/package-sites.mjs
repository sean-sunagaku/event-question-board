// Official starter/helper lives outside the OSS checkout. This script only adds our application.
import {execFileSync} from 'node:child_process';import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {build} from 'esbuild';import {client} from './client.mjs';
const app=process.argv[2],target=process.argv[3];if(!['api','admin','participant'].includes(app)||!target)throw new Error('Usage: npm run package:sites -- api|admin|participant /absolute/prepared-starter');
if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim())throw new Error('Commit tracked source changes first.');
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();const dest=resolve(target);if(!existsSync(dest+'/vite.config.ts'))throw new Error('Run official project-setup.mjs in an empty target first.');
await client();await build({entryPoints:[`apps/${app}/src/index.ts`],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:dest+'/app-worker.mjs'});
writeFileSync(dest+'/worker/index.ts',`import app from '../app-worker.mjs';\nexport default {fetch(request: Request, env: Record<string,unknown>) {return app.fetch(request,{...env,AUTH_MODE:'sites',NODE_ENV:'production'});}};\n`);
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);for(const path of files){mkdirSync(resolve(dest,'oss',path,'..'),{recursive:true});writeFileSync(resolve(dest,'oss',path),execFileSync('git',['show',sha+':'+path]));}
writeFileSync(dest+'/provenance.json',JSON.stringify({repository:'https://github.com/sean-sunagaku/event-question-board',commit:sha,app},null,2)+'\n');
const manifestPath=`apps/${app}/.openai/hosting.json`;cpSync(manifestPath,dest+'/.openai/hosting.json');
if(app==='api'){cpSync('apps/api/db/schema.ts',dest+'/db/schema.ts');cpSync('apps/api/drizzle',dest+'/drizzle',{recursive:true});}
console.log(JSON.stringify({app,github_commit:sha,destination:dest}));
