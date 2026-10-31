import * as oidc from 'openid-client';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { sameOrigin, type Env } from '@eqb/core';
import { failure, HttpError } from '@eqb/contracts';

type Handler = (request: Request, env: Env) => Promise<Response>;

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const random = () => randomBytes(32).toString('base64url');
const cookie = (name: string, value: string, age: number) =>
  `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
function cookieValue(request: Request, name: string) {
  const values = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(name + '='));
  if (values.length !== 1) return null;
  const v = values[0].slice(name.length + 1);
  return /^[a-zA-Z0-9_-]{43}$/.test(v) ? v : null;
}
function httpsOrigin(value: string | undefined) {
  if (!value) throw new Error('PUBLIC_ORIGIN is required');
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.origin !== value || u.username || u.password)
    throw new Error('PUBLIC_ORIGIN must be an exact HTTPS origin');
  return value;
}
export function validateIdentityAllowlist(value: string | undefined) {
  if (!value) throw new Error('OIDC_ADMIN_IDENTITIES is required on API');
  const entries: unknown = JSON.parse(value);
  if (!Array.isArray(entries) || entries.length === 0 || entries.some(e =>
    !e || typeof e.issuer !== 'string' || typeof e.subject !== 'string' || !e.subject ||
    new URL(e.issuer).protocol !== 'https:' || Object.keys(e).some(k => !['issuer','subject'].includes(k))))
    throw new Error('OIDC_ADMIN_IDENTITIES must be issuer/subject pairs');
}

/** Node-only adapter. No tokens, cookie values, or protocol errors are logged. */
export async function createOIDCAdapter(handler: Handler, env: Env & Record<string, unknown>, app: 'participant' | 'admin') {
  const sessionCookie = `__Host-eqb_${app}_session`;
  const loginCookie = `__Host-eqb_${app}_login`;
  const origin = httpsOrigin(env.PUBLIC_ORIGIN);
  const issuer = new URL(String(env.OIDC_ISSUER || ''));
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.hash || issuer.search)
    throw new Error('OIDC_ISSUER must use HTTPS');
  const id = String(env.OIDC_CLIENT_ID || '');
  const secret = String(env.OIDC_CLIENT_SECRET || '');
  const path = String(env.SESSION_DB_PATH || '');
  const ttl = Number(env.SESSION_TTL_SECONDS || 3600);
  if (!id || !secret || !path || !Number.isSafeInteger(ttl) || ttl < 60 || ttl > 86400)
    throw new Error('OIDC client, secret, session DB, and valid TTL are required');
  const config = await oidc.discovery(issuer, id, {client_secret: secret, id_token_signed_response_alg: 'RS256'}, oidc.ClientSecretPost(secret), {execute:[oidc.enableNonRepudiationChecks]});
  for (const field of ['authorization_endpoint','token_endpoint','jwks_uri'] as const) {
    const endpoint = new URL(String(config.serverMetadata()[field] || ''));
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password)
      throw new Error('OIDC endpoints must use HTTPS');
  }
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec('CREATE TABLE IF NOT EXISTS auth_service (name TEXT PRIMARY KEY)');
  const service = db.prepare('SELECT name FROM auth_service').get() as {name:string}|undefined;
  if(service && service.name !== app){db.close();throw new Error('Session DB cannot be shared between services');}
  db.prepare('INSERT OR IGNORE INTO auth_service VALUES (?)').run(app);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  // Session schema is independent of API/domain migrations. Initialization is explicit at startup.
  db.exec(`CREATE TABLE IF NOT EXISTS auth_schema (version INTEGER PRIMARY KEY);
    INSERT OR IGNORE INTO auth_schema VALUES (1);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, principal TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS logins (hash TEXT PRIMARY KEY, state TEXT NOT NULL, nonce TEXT NOT NULL, verifier TEXT NOT NULL, expires INTEGER NOT NULL);`);
  const redirect = (to: string, headers?: HeadersInit) => new Response(null, {status:303,headers:{location:to,'cache-control':'no-store',...headers}});
  const handle: Handler = async (request, runtime) => {
    try {
      const url = new URL(request.url);
      if (url.origin !== origin) throw new HttpError(400,'接続先が無効です。');
      const sid = cookieValue(request, sessionCookie);
      const session = sid ? db.prepare('SELECT principal,expires FROM sessions WHERE hash=?').get(hash(sid)) as {principal:string;expires:number}|undefined : undefined;
      const principal = session && session.expires > Date.now() ? session.principal : null;
      db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
      db.prepare('DELETE FROM logins WHERE expires<=?').run(Date.now());
      if (url.pathname === '/auth/login') {
        if (request.method !== 'GET') throw new HttpError(405,'対応していない操作です。');
        if (request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403,'この画面から操作してください。');
        const tx = random(), state = oidc.randomState(), nonce = oidc.randomNonce(), verifier = oidc.randomPKCECodeVerifier();
        const previous = cookieValue(request,loginCookie);
        if(previous)db.prepare('DELETE FROM logins WHERE hash=?').run(hash(previous));
        db.prepare('INSERT INTO logins VALUES (?,?,?,?,?)').run(hash(tx),state,nonce,verifier,Date.now()+300000);
        const to = oidc.buildAuthorizationUrl(config,{redirect_uri:origin+'/auth/callback',scope:'openid',response_type:'code',state,nonce,code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256'});
        return redirect(to.href,{'set-cookie':cookie(loginCookie,tx,300)});
      }
      if(url.pathname === '/auth/callback') {
        if(request.method !== 'GET')throw new HttpError(405,'対応していない操作です。');
        const tx=cookieValue(request,loginCookie);
        const login=tx ? db.prepare('DELETE FROM logins WHERE hash=? AND expires>? RETURNING *').get(hash(tx),Date.now()) as {state:string;nonce:string;verifier:string}|undefined : undefined;
        if(!login)throw new HttpError(401,'ログインをやり直してください。');
        try {
          const tokens=await oidc.authorizationCodeGrant(config,url,{expectedState:login.state,expectedNonce:login.nonce,pkceCodeVerifier:login.verifier,idTokenExpected:true});
          const claims=tokens.claims()!;
          if(claims.iss !== config.serverMetadata().issuer || typeof claims.sub !== 'string' || !claims.sub || typeof claims.exp !== 'number')throw new Error('Invalid identity');
          const who=JSON.stringify([claims.iss,claims.sub]);
          if(who.length>1024)throw new Error('Identity too long');
          if(sid)db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(sid));
          const token=random();
          const expires=Math.min(Date.now()+ttl*1000,claims.exp*1000);
          if(expires<=Date.now())throw new Error('Expired identity');
          db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token),who,expires);
          const response=redirect('/');
          response.headers.append('set-cookie',cookie(sessionCookie,token,Math.floor((expires-Date.now())/1000)));
          response.headers.append('set-cookie',cookie(loginCookie,'',0));
          return response;
        } catch { return new Response('ログインを確認できませんでした。もう一度ログインしてください。',{status:401,headers:{'cache-control':'no-store','set-cookie':cookie(loginCookie,'',0)}}); }
      }
      if(url.pathname === '/auth/logout') {
        if(request.method!=='POST')throw new HttpError(405,'対応していない操作です。');
        sameOrigin(request,runtime);
        if(sid)db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(sid));
        const tx=cookieValue(request,loginCookie);if(tx)db.prepare('DELETE FROM logins WHERE hash=?').run(hash(tx));
        const response=redirect('/');response.headers.append('set-cookie',cookie(sessionCookie,'',0));response.headers.append('set-cookie',cookie(loginCookie,'',0));return response;
      }
      if(app==='admin' && url.pathname==='/' && !principal)return redirect('/auth/login');
      const response=await handler(request,{...runtime,AUTH_PRINCIPAL:principal});
      response.headers.set('cache-control','no-store');
      return response;
    } catch(e) {return failure(e);}
  };
  return {handle,close:()=>db.close()};
}
