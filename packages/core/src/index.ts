import { HttpError, type Caller } from "@eqb/contracts";
export interface Statement {
  bind(...args: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface DB {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}
export interface Env {
  DB: DB;
  AUTH_MODE?: string;
  NODE_ENV?: string;
  PARTICIPANT_KEY?: string;
  ADMIN_KEY?: string;
  ADMIN_SUBJECTS?: string;
  API_ORIGIN?: string;
  PUBLIC_ORIGIN?: string;
  CALLER?: Caller;
  AUTH_PRINCIPAL?: string | null;
  OIDC_ADMIN_IDENTITIES?: string;
}
const encode = (value: string) => new TextEncoder().encode(value);
async function key(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
export interface Assertion {
  caller: Caller;
  sub: string;
  time: number;
  nonce: string;
  method: string;
  path: string;
  bodyHash: string;
}
export async function digest(body: string) {
  return hex(await crypto.subtle.digest("SHA-256", encode(body)));
}
export async function signedHeaders(
  caller: Caller,
  sub: string,
  request: Request,
  body: string,
  secret: string,
) {
  if (secret.length < 32)
    throw new HttpError(503, "サービス認証が未設定です。");
  const assertion: Assertion = {
    caller,
    sub,
    time: Date.now(),
    nonce: crypto.randomUUID(),
    method: request.method,
    path: new URL(request.url).pathname + new URL(request.url).search,
    bodyHash: await digest(body),
  };
  const payload = JSON.stringify(assertion);
  return {
    "x-eqb-assertion": payload,
    "x-eqb-signature": hex(
      await crypto.subtle.sign("HMAC", await key(secret), encode(payload)),
    ),
  };
}
export async function verify(
  request: Request,
  env: Env,
  body: string,
): Promise<Assertion> {
  const raw = request.headers.get("x-eqb-assertion"),
    signature = request.headers.get("x-eqb-signature");
  if (
    !raw ||
    raw.length > 4096 ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    throw new HttpError(401, "認証が必要です。");
  let a: Assertion;
  try {
    a = JSON.parse(raw);
  } catch {
    throw new HttpError(401, "認証情報が無効です。");
  }
  if (
    !["participant", "admin"].includes(a.caller) ||
    typeof a.sub !== "string" ||
    !a.sub ||
    a.sub.length > 1024 ||
    typeof a.nonce !== "string" ||
    !/^[a-f0-9-]{36}$/.test(a.nonce) ||
    !Number.isFinite(a.time) ||
    Math.abs(Date.now() - a.time) > 30_000 ||
    a.method !== request.method ||
    a.path !== new URL(request.url).pathname + new URL(request.url).search ||
    a.bodyHash !== (await digest(body))
  )
    throw new HttpError(401, "認証情報が無効です。");
  const secret = a.caller === "admin" ? env.ADMIN_KEY : env.PARTICIPANT_KEY;
  if (!secret || secret.length < 32)
    throw new HttpError(503, "サービス認証が未設定です。");
  const bytes = Uint8Array.from(signature.match(/../g)!, (x) =>
    parseInt(x, 16),
  );
  if (
    !(await crypto.subtle.verify("HMAC", await key(secret), bytes, encode(raw)))
  )
    throw new HttpError(401, "署名が無効です。");
  const consumed = await env.DB.prepare(
    "INSERT INTO request_nonces (nonce, expires_at) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING nonce",
  )
    .bind(a.nonce, Date.now() + 60_000)
    .first();
  if (!consumed) throw new HttpError(401, "使用済みの認証情報です。");
  await env.DB.prepare("DELETE FROM request_nonces WHERE expires_at < ?")
    .bind(Date.now())
    .run();
  return a;
}
export function requireAdmin(a: Assertion, env: Env) {
  if (env.AUTH_MODE === "oidc") {
    let allowed: { issuer: string; subject: string }[] = [];
    try {
      allowed = JSON.parse(env.OIDC_ADMIN_IDENTITIES || "[]");
    } catch {}
    if (
      a.caller !== "admin" ||
      !Array.isArray(allowed) ||
      !allowed.some(
        (e) =>
          typeof e?.issuer === "string" &&
          typeof e?.subject === "string" &&
          JSON.stringify([e.issuer, e.subject]) === a.sub,
      )
    )
      throw new HttpError(403, "管理者権限が必要です。");
    return;
  }
  const allowed = (env.ADMIN_SUBJECTS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (a.caller !== "admin" || !allowed.includes(a.sub))
    throw new HttpError(403, "管理者権限が必要です。");
}
export function visitor(request: Request, env: Env): string | null {
  if (env.AUTH_MODE === "local") {
    const host = new URL(request.url).hostname;
    if (
      env.NODE_ENV === "production" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(host)
    )
      throw new HttpError(503, "開発用認証は本番で利用できません。");
    const match = request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)eqb_local=(alice|bob|moderator)(?:;|$)/);
    return match?.[1] ?? null;
  }
  if (env.AUTH_MODE === "oidc") return env.AUTH_PRINCIPAL || null;
  if (env.AUTH_MODE !== "sites") return null;
  return request.headers.get("oai-authenticated-user-id");
}
export function sameOrigin(request: Request, env: Env) {
  const origin = request.headers.get("origin");
  const expected = env.PUBLIC_ORIGIN || new URL(request.url).origin;
  if (
    !origin ||
    origin !== expected ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(403, "この画面から操作してください。");
}
