import {
  failure,
  HttpError,
  json,
  readJSON,
  type Caller,
} from "@eqb/contracts";
import { signedHeaders, visitor, sameOrigin, type Env } from "./index.ts";
import { page } from "@eqb/ui";
export function frontend(caller: Caller, clientJS: string) {
  return async (request: Request, env: Env): Promise<Response> => {
    try {
      const url = new URL(request.url),
        user = visitor(request, env);
      if (url.pathname === "/identity" && caller === "admin") {
        if (!user) throw new HttpError(401, "ログインしてください。");
        return json({
          subject: user,
          notice:
            env.AUTH_MODE === "oidc" ? "OIDCのissuer/subjectです。APIのOIDC_ADMIN_IDENTITIESへ設定してください。" : "このAdmin Site内のIDです。APIのADMIN_SUBJECTSへ設定してください。",
        });
      }
      if (url.pathname === "/health")
        return json({ ok: true, service: caller });
      if (url.pathname === "/client.js")
        return new Response(clientJS, {
          headers: {
            "content-type": "text/javascript; charset=utf-8",
            "x-content-type-options": "nosniff",
          },
        });
      if (url.pathname === "/local-login" && request.method === "POST") {
        sameOrigin(request, env);
        if (env.AUTH_MODE !== "local")
          throw new HttpError(404, "見つかりません。");
        const data = await readJSON(request);
        if (
          !["alice", "bob", "moderator", "logout"].includes(String(data.user))
        )
          throw new HttpError(400, "利用者が無効です。");
        return new Response("{}", {
          headers: {
            "content-type": "application/json",
            "set-cookie":
              data.user === "logout"
                ? "eqb_local=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
                : `eqb_local=${data.user}; HttpOnly; SameSite=Strict; Path=/`,
          },
        });
      }
      if (url.pathname === "/") {
        if (caller === "admin" && !user)
          return new Response("ログインが必要です。", { status: 401 });
        return new Response(
          page(caller === "admin", !!user, env.AUTH_MODE === "local", env.AUTH_MODE === "oidc"),
          {
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
              "content-security-policy":
                "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'self' https://chatgpt.com",
              "x-content-type-options": "nosniff",
              "referrer-policy": "same-origin",
            },
          },
        );
      }
      const setup = url.pathname === "/bff/setup";
      if (
        !setup &&
        !/^\/bff\/questions(?:\/[a-f0-9-]{36}\/(vote|status))?$/.test(
          url.pathname,
        )
      )
        throw new HttpError(404, "見つかりません。");
      if (setup && caller !== "admin")
        throw new HttpError(403, "管理者画面から操作してください。");
      if (setup && request.method !== "POST")
        throw new HttpError(405, "対応していない操作です。");
      if (!["GET", "POST", "PUT", "DELETE", "PATCH"].includes(request.method))
        throw new HttpError(405, "対応していない操作です。");
      if (request.method !== "GET") {
        sameOrigin(request, env);
        if (!user)
          throw new HttpError(401, "ログインしてから操作してください。");
      }
      if (caller === "participant" && url.pathname.endsWith("/status"))
        throw new HttpError(403, "管理者画面から操作してください。");
      if (
        caller === "admin" &&
        request.method !== "GET" &&
        !url.pathname.endsWith("/status") &&
        !setup
      )
        throw new HttpError(403, "参加者画面から操作してください。");
      const origin = env.API_ORIGIN;
      if (!origin) throw new HttpError(503, "API接続が未設定です。");
      const target = new URL(
        setup ? "/setup/demo" : "/events/demo" + url.pathname.slice(4),
        origin,
      );
      target.search = url.search;
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 8192)
        throw new HttpError(413, "送信内容が大きすぎます。");
      const upstream = new Request(target, {
        method: request.method,
        headers: { "content-type": "application/json" },
        body: ["GET", "HEAD"].includes(request.method) ? undefined : raw,
      });
      if (user) {
        const secret = caller === "admin" ? env.ADMIN_KEY : env.PARTICIPANT_KEY;
        if (!secret) throw new HttpError(503, "サービス認証が未設定です。");
        for (const [k, v] of Object.entries(
          await signedHeaders(caller, user, upstream, raw, secret),
        ))
          upstream.headers.set(k, v);
      }
      let response: Response;
      try {
        response = await fetch(upstream, { signal: AbortSignal.timeout(8000) });
      } catch {
        throw new HttpError(502, "APIに接続できません。");
      }
      return new Response(response.body, {
        status: response.status,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    } catch (e) {
      return failure(e);
    }
  };
}
