import {SQLite} from './sqlite.ts';import {serve} from './server.ts';import {fetchAPI} from '../apps/api/src/index.ts';import {frontend} from '@eqb/core/frontend';import {client} from './client.mjs';
const app=process.argv[2];if(!['api','admin','participant'].includes(app))throw new Error('api/admin/participantを指定');
if(process.env.AUTH_MODE==='sites')throw new Error('Sites認証はSitesエッジ経由のみ対応。セルフホスト本番用の信頼できる認証アダプターを追加してください。');
const port=Number(process.env.PORT||({api:3002,admin:3001,participant:3000}[app]!));
await serve(app==='api'?fetchAPI:frontend(app as 'admin'|'participant',await client()),{...process.env,DB:new SQLite(process.env.DB_PATH||'work/board.sqlite')},port);console.log(`http://127.0.0.1:${port}`);
