import { createOIDCAdapter, validateIdentityAllowlist } from '@eqb/auth-node';
import { SQLite } from './sqlite.ts';
import { serve } from './server.ts';
import { fetchAPI } from '../apps/api/src/index.ts';
import { frontend } from '@eqb/core/frontend';
import type { Env, DB } from '@eqb/core';
import clientJS from '../work/client-source.ts';
const app=process.argv[2];
if(!['api','participant','admin'].includes(app))throw new Error('api/admin/participant required');
if(process.env.AUTH_MODE!=='oidc')throw new Error('Production Node requires AUTH_MODE=oidc; Sites headers and local login are not supported');
const env={...process.env,NODE_ENV:'production'} as Env & Record<string,unknown>;
if(!env.PUBLIC_ORIGIN || new URL(env.PUBLIC_ORIGIN).protocol!=='https:' || new URL(env.PUBLIC_ORIGIN).origin!==env.PUBLIC_ORIGIN)throw new Error('Exact HTTPS PUBLIC_ORIGIN required');
for(const name of (app==='api'?['PARTICIPANT_KEY','ADMIN_KEY']:[app==='admin'?'ADMIN_KEY':'PARTICIPANT_KEY']))if(String(env[name]||'').length<32)throw new Error('Service keys must be at least 32 characters');
if(app==='api' && env.ADMIN_KEY===env.PARTICIPANT_KEY)throw new Error('Service keys must be distinct');
const tlsCert=process.env.TLS_CERT_FILE,tlsKey=process.env.TLS_KEY_FILE;
if(Boolean(tlsCert)!==Boolean(tlsKey))throw new Error('Both TLS files are required');
const trustedProxyIPs=(process.env.TRUSTED_PROXY_IPS||'').split(',').filter(Boolean);
if(!tlsCert && !trustedProxyIPs.length)throw new Error('TLS or explicit trusted proxy IPs required');
let close=()=>{};
let handler;
if(app==='api') {
  validateIdentityAllowlist(env.OIDC_ADMIN_IDENTITIES);
  if(!process.env.DB_PATH)throw new Error('DB_PATH required');
  const db=new SQLite(process.env.DB_PATH);env.DB=db;close=()=>db.raw.close();
  // Never create domain tables in request handling/startup. Run db:init explicitly.
  db.raw.prepare('SELECT id FROM events LIMIT 1').get();
  handler=fetchAPI;
} else {
  const api=new URL(String(env.API_ORIGIN||''));
  if(api.protocol!=='https:' && !(api.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(api.hostname)))throw new Error('API_ORIGIN must use HTTPS or loopback HTTP');
  const noDomainDB:DB={prepare(){throw new Error('Only API owns domain DB');},async batch(){throw new Error('Only API owns domain DB');}};
  env.DB=noDomainDB;
  const auth=await createOIDCAdapter(frontend(app as 'participant'|'admin',clientJS),env,app as 'participant'|'admin');
  handler=auth.handle;close=auth.close;
}
const port=Number(process.env.PORT || {api:3002,admin:3001,participant:3000}[app]!);
const server=await serve(handler,env,port,{host:process.env.BIND_HOST || '127.0.0.1',publicOrigin:env.PUBLIC_ORIGIN,trustedProxyIPs,tls:tlsCert?{certFile:tlsCert,keyFile:tlsKey!}:undefined});
console.log(`${app} ready`);
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{server.close(()=>{close();});server.closeIdleConnections();});
