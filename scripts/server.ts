import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { readFileSync } from 'node:fs';
import type { Env } from '@eqb/core';
export interface ServeOptions {
  host?: string;
  publicOrigin?: string;
  trustedProxyIPs?: string[];
  tls?: {certFile:string;keyFile:string};
}
export async function serve(handler:(r:Request,e:Env)=>Promise<Response>,env:Env,port:number,options:ServeOptions={}) {
  const listener: import('node:http').RequestListener = async(req,res)=>{
    try {
      const external=options.publicOrigin ? new URL(options.publicOrigin):null;
      if(external) {
        const secure='encrypted' in req.socket && req.socket.encrypted;
        const trusted=options.trustedProxyIPs?.includes(req.socket.remoteAddress || '');
        if(req.headers.host!==external.host || (!secure && !(trusted && req.headers['x-forwarded-proto']==='https'))) {
          res.writeHead(400);res.end('Invalid origin or transport');return;
        }
      }
      if(!req.url?.startsWith('/') || req.url.startsWith('//')){res.writeHead(400);res.end();return;}
      const parts:Buffer[]=[];let size=0;
      for await(const part of req){size+=part.length;if(size>8192){res.writeHead(413);res.end();return;}parts.push(part);}
      const headers=new Headers();
      for(const [k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
      // The standalone server never trusts edge identity, even behind a trusted proxy.
      for(const k of [...headers.keys()])if(k.startsWith('oai-authenticated-') || k.startsWith('x-eqb-user') || k==='x-forwarded-host')headers.delete(k);
      const request=new Request((external?.origin || `http://127.0.0.1:${port}`)+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method!)?undefined:Buffer.concat(parts)});
      const response=await handler(request,env);
      res.statusCode=response.status;
      for(const [k,v]of response.headers)if(k!=='set-cookie')res.setHeader(k,v);
      if(response.headers.getSetCookie().length)res.setHeader('set-cookie',response.headers.getSetCookie());
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {res.writeHead(500);res.end('Internal error');}
  };
  const server=options.tls ? createSecureServer({cert:readFileSync(options.tls.certFile),key:readFileSync(options.tls.keyFile)},listener):createServer(listener);
  server.requestTimeout=15000;server.headersTimeout=10000;
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,options.host || '127.0.0.1',()=>{server.off('error',reject);resolve();});});
  return server;
}
