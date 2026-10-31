// Real standards-based Authorization Code Provider. Test accounts exist only here.
import Provider from "oidc-provider";
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { generateKeyPair, exportJWK, SignJWT, decodeJwt } from "jose";
export async function testProvider(dir) {
  const issuer = "https://localhost:14443";
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const jwk = await exportJWK(privateKey);
  Object.assign(jwk, { kid: "qa", use: "sig", alg: "RS256" });
  let fault = "";
  let pkceRejected = 0;
  let tokenRequests = 0;
  const provider = new Provider(issuer, {
    clients: ["participant", "admin"].map((app, i) => ({
      client_id: app,
      client_secret: "test-client-secret-" + app,
      redirect_uris: [`https://localhost:${14444 + i}/auth/callback`],
      response_types: ["code"],
      grant_types: ["authorization_code"],
      token_endpoint_auth_method: app === "admin" ? "client_secret_basic" : "client_secret_post",
      id_token_signed_response_alg: "RS256",
    })),
    jwks: { keys: [jwk] },
    cookies: { keys: ["test-only-provider-signing-key"] },
    features: { devInteractions: { enabled: false } },
    pkce: { required: () => true },
    interactions: {
      url: (_ctx, interaction) => "/interaction/" + interaction.uid,
    },
    claims: { openid: ["sub"] },
    findAccount: (_ctx, id) => ({
      accountId: id,
      async claims() {
        return { sub: id };
      },
    }),
  });
  provider.on("grant.error", (_ctx, e) => {
    if (String(e.error_description).includes("PKCE")) pkceRejected++;
  });
  const callback = provider.callback();
  const server = createServer(
    {
      cert: readFileSync(dir + "/server.pem"),
      key: readFileSync(dir + "/server.key"),
    },
    async (req, res) => {
      try {
        const url = new URL(req.url, issuer);
        if (url.pathname.startsWith("/interaction/")) {
          const details = await provider.interactionDetails(req, res);
          if (details.prompt.name === "login") {
            if (req.method === "GET") {
              res.setHeader("content-type", "text/html; charset=utf-8");
              res.end(
                '<html lang="ja"><title>検証用OIDC Provider</title><form method="post"><label>架空ユーザー<select name="user"><option value="alice">Alice</option><option value="moderator">Moderator</option></select></label><button>OIDCでログイン</button></form></html>',
              );
              return;
            }
            let body = "";
            for await (const c of req) body += c;
            const user = new URLSearchParams(body).get("user");
            if (!["alice", "moderator"].includes(user)) {
              res.writeHead(400);
              res.end();
              return;
            }
            return await provider.interactionFinished(
              req,
              res,
              { login: { accountId: user } },
              { mergeWithLastSubmission: false },
            );
          }
          if (details.prompt.name === "consent") {
            let grant = details.grantId
              ? await provider.Grant.find(details.grantId)
              : new provider.Grant({
                  accountId: details.session.accountId,
                  clientId: details.params.client_id,
                });
            grant.addOIDCScope("openid");
            const grantId = await grant.save();
            return await provider.interactionFinished(
              req,
              res,
              { consent: { grantId } },
              { mergeWithLastSubmission: true },
            );
          }
        }
        if (url.pathname === "/token") {
          tokenRequests++;
          // Corrupt actual Provider token responses only for rejection tests; normal flow uses Provider untouched.
          const original = res.end.bind(res);
          if (fault && fault !== "pkce")
            res.end = function (chunk, ...args) {
              let body;
              try {
                body = JSON.parse(
                  Buffer.isBuffer(chunk) ? chunk.toString() : chunk,
                );
              } catch {
                return original(chunk, ...args);
              }
              if (!body.id_token) return original(chunk, ...args);
              const claims = decodeJwt(body.id_token);
              const mode = fault;
              (async () => {
                let key = privateKey;
                if (mode === "signature")
                  key = (await generateKeyPair("RS256")).privateKey;
                if (mode === "issuer")
                  claims.iss = "https://different-issuer.invalid";
                if (mode === "audience") claims.aud = "another-client";
                if (mode === "expired")
                  claims.exp = Math.floor(Date.now() / 1000) - 3600;
                if (mode === "nonce") claims.nonce = "incorrect-nonce";
                body.id_token = await new SignJWT(claims)
                  .setProtectedHeader({ alg: "RS256", kid: "qa" })
                  .sign(key);
                res.removeHeader("content-length");
                original(JSON.stringify(body));
              })().catch(() => {
                res.statusCode = 500;
                original();
              });
              return res;
            };
        }
        callback(req, res);
      } catch {
        res.writeHead(500);
        res.end("Provider test failure");
      }
    },
  );
  await new Promise((resolve) => server.listen(14443, "127.0.0.1", resolve));
  return {
    server,
    setFault(v) {
      fault = v;
    },
    get tokenRequests() {
      return tokenRequests;
    },
    get pkceRejected() {
      return pkceRejected;
    },
  };
}
