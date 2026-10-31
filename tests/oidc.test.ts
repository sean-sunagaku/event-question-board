import { test } from "node:test";
import assert from "node:assert/strict";
import {
  spawn,
  spawnSync,
  type ChildProcess,
  execFileSync,
} from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { request as httpsRequest } from "node:https";
import { chromium } from "@playwright/test";
import { signedHeaders } from "@eqb/core";
import { testProvider } from "./oidc-provider.mjs";
const dir = process.env.OIDC_TEST_DIR;
// Only the trusted-TLS test runner can launch this suite.
if (
  !dir ||
  !process.env.NODE_EXTRA_CA_CERTS ||
  process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
)
  throw new Error("Use npm run test:oidc with TLS verification enabled");
const entry = process.env.OIDC_PRODUCTION_ENTRY!;
const base = "https://localhost:";
const origins = {
  api: base + "14446",
  participant: base + "14444",
  admin: base + "14445",
};
const pk = "test-participant-".padEnd(64, "p"),
  ak = "test-admin-".padEnd(64, "a");
const results: Record<string, unknown> = {
  scope: "production-oidc-real-provider-https",
  tlsVerification: true,
  browserFallback:
    "Browser plugin runtime tools unavailable; task explicitly requests reproducible browser integration",
  provider: "oidc-provider",
  checks: [],
};
const checks = results.checks as string[];
const append = checks.push.bind(checks);
checks.push = (...items: string[]) => {
  for (const item of items) console.log("OIDC QA:", item);
  return append(...items);
};
const processes: ChildProcess[] = [];
function productionEnv(app: "api" | "participant" | "admin") {
  return {
    ...process.env,
    NODE_ENV: "production",
    AUTH_MODE: "oidc",
    PUBLIC_ORIGIN: origins[app],
    PORT: new URL(origins[app]).port,
    API_ORIGIN: origins.api,
    DB_PATH: dir + "/board.sqlite",
    SESSION_DB_PATH: dir + "/" + app + ".sqlite",
    TLS_CERT_FILE: dir + "/server.pem",
    TLS_KEY_FILE: dir + "/server.key",
    PARTICIPANT_KEY: app === "admin" ? undefined : pk,
    ADMIN_KEY: app === "participant" ? undefined : ak,
    OIDC_ISSUER: base + "14443",
    OIDC_TOKEN_AUTH_METHOD: app === "admin" ? "client_secret_basic" : "client_secret_post",
    OIDC_CLIENT_ID: app,
    OIDC_CLIENT_SECRET: "test-client-secret-" + app,
    OIDC_ADMIN_IDENTITIES: JSON.stringify([
      { issuer: base + "14443", subject: "moderator" },
    ]),
    SESSION_TTL_SECONDS: "3600",
  };
}
async function start(app: "api" | "participant" | "admin") {
  const env = productionEnv(app);
  const child = spawn(process.execPath, [entry, app], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  processes.push(child);
  let output = "";
  child.stdout!.on("data", (c) => (output += c));
  child.stderr!.on("data", (c) => (output += c));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          Error("Production service startup timeout: " + app + " " + output),
        ),
      15000,
    );
    const t = setInterval(() => {
      if (output.includes(app + " ready")) {
        clearInterval(t);
        clearTimeout(timer);
        resolve();
      } else if (child.exitCode !== null) {
        clearInterval(t);
        clearTimeout(timer);
        reject(Error("Production startup failed: " + app + " " + output));
      }
    }, 50);
  });
  return child;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
  });
}
function signed(
  path: string,
  method: string,
  caller: "participant" | "admin",
  sub: string,
  body?: unknown,
) {
  return (async () => {
    const raw = body === undefined ? "" : JSON.stringify(body);
    const req = new Request(origins.api + path, {
      method,
      body: body === undefined ? undefined : raw,
      headers: { "content-type": "application/json" },
    });
    for (const [k, v] of Object.entries(
      await signedHeaders(caller, sub, req, raw, caller === "admin" ? ak : pk),
    ))
      req.headers.set(k, v);
    return fetch(req);
  })();
}

test(
  "本番3サービス・検証用OIDC Provider・信頼済みTLS・ブラウザ・拒否と永続化",
  { timeout: 180000 },
  async () => {
    const provider = await testProvider(dir);
    let browser;
    try {
      execFileSync(process.execPath, [entry.replace(/start\.mjs$/, "db.mjs")], {
        env: { ...process.env, DB_PATH: dir + "/board.sqlite" },
        stdio: "ignore",
      });
      let api = await start("api"),
        participant = await start("participant"),
        admin = await start("admin");
      browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
        headless: true,
        args: ["--no-sandbox"],
      });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      async function login(
        target: typeof page,
        app: "participant" | "admin",
        user = "alice",
      ) {
        await target.goto(origins[app]);
        if (app === "participant")
          await target
            .getByRole("link", { name: "ログイン", exact: true })
            .click();
        try {
          await target.getByLabel("架空ユーザー").waitFor({ timeout: 5000 });
        } catch {
          throw new Error("Provider login form missing");
        }
        await target.getByLabel("架空ユーザー").selectOption(user);
        const callback = target.waitForResponse((r) =>
          r.url().startsWith(origins[app] + "/auth/callback"),
        );
        await Promise.all([
          target.waitForURL(origins[app] + "/"),
          target.getByRole("button", { name: "OIDCでログイン" }).click(),
        ]);
        assert.equal(
          (await (await callback).headersArray()).filter(
            (h) => h.name.toLowerCase() === "set-cookie",
          ).length,
          2,
          "callback emits two separate Set-Cookie headers",
        );
      }
      const adminContext = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      const adminPage = await adminContext.newPage();
      await login(adminPage, "admin", "moderator");
      await adminPage
        .getByRole("button", { name: "架空のイベントを準備する" })
        .click();
      await adminPage
        .getByText("自動更新中 · 3秒ごと", { exact: true })
        .waitFor();
      await login(page, "participant");
      assert.match(await page.title(), /みんなの質問/);
      assert.equal(await page.locator("[data-login]").count(), 0);
      await page
        .getByLabel("質問本文")
        .fill("【架空のOIDC検証】学びを続ける一歩は？");
      await page.getByRole("button", { name: "質問を投稿する" }).click();
      await page.getByText("投稿しました。ありがとうございます。").waitFor();
      const article = page
        .locator("article")
        .filter({ hasText: "【架空のOIDC検証】" });
      await article.getByRole("button", { name: "この質問に投票する" }).click();
      await article.getByRole("button", { name: "投票を取り消す" }).waitFor();
      assert.equal(await article.locator("strong").textContent(), "1");
      await article.getByRole("button", { name: "投票を取り消す" }).click();
      await article
        .getByRole("button", { name: "この質問に投票する" })
        .waitFor();
      assert.equal(await article.locator("strong").textContent(), "0");
      const aq = adminPage
        .locator("article")
        .filter({ hasText: "【架空のOIDC検証】" });
      await aq
        .getByRole("button", { name: "回答済みにする", exact: true })
        .click();
      await aq.getByRole("button", { name: "未回答に戻す" }).waitFor();
      await aq.getByRole("button", { name: "強調する", exact: true }).click();
      await article.getByText("回答済み", { exact: true }).waitFor();
      await article.getByText("注目の質問", { exact: true }).waitFor();
      checks.push(
        "verified TLS login/code exchange/ID token signature; explicit setup; post/vote/unvote/admin status/automatic update",
      );
      const cookies = await context.cookies(origins.participant);
      const session = cookies.find(
        (c) => c.name === "__Host-eqb_participant_session",
      )!;
      assert.ok(session.secure && session.httpOnly);
      assert.equal(session.sameSite, "Lax");
      assert.equal(session.path, "/");
      const cookieHeader = "__Host-eqb_participant_session=" + session.value;
      assert.equal(
        cookies.some((c) => c.name === "__Host-eqb_participant_login"),
        false,
      );
      assert.equal(
        (
          await fetch(origins.admin + "/identity", {
            headers: {
              cookie:
                cookieHeader + "; __Host-eqb_admin_session=" + session.value,
            },
          })
        ).status,
        401,
      );
      checks.push(
        "separate Set-Cookie headers and cleanup; participant cookie cannot authenticate Admin even renamed",
      );
      const noTrust = spawnSync(
        process.execPath,
        [
          "-e",
          "fetch('https://localhost:14443/.well-known/openid-configuration').then(()=>process.exit(1),()=>process.exit(0))",
        ],
        { env: { ...process.env, NODE_EXTRA_CA_CERTS: "" }, stdio: "ignore" },
      );
      assert.equal(noTrust.status, 0);
      checks.push(
        "untrusted test CA is rejected; TLS verification is enabled, not bypassed",
      );
      const listing = await (
        await fetch(origins.api + "/events/demo/questions")
      ).json();
      const id = listing.questions[0].id;
      const path = "/events/demo/questions/" + id;
      const body = JSON.stringify({ body: "【架空】セッション再送" });
      const postWithCookie = (cookie: string, origin = origins.participant) =>
        fetch(origins.participant + "/bff/questions", {
          method: "POST",
          headers: { cookie, origin, "content-type": "application/json" },
          body,
        });
      assert.equal((await postWithCookie(cookieHeader)).status, 201);
      checks.push(
        "session is a bounded bearer credential before logout, not falsely claimed replay-proof",
      );
      assert.equal(
        (await postWithCookie(cookieHeader, "https://evil.invalid")).status,
        403,
      );
      assert.equal(
        (
          await fetch(origins.participant + "/auth/logout", {
            method: "GET",
            headers: { cookie: cookieHeader },
          })
        ).status,
        405,
      );
      assert.equal(
        (
          await fetch(origins.participant + "/auth/logout", {
            method: "POST",
            headers: { cookie: cookieHeader, origin: "https://evil.invalid" },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(origins.participant + "/local-login", {
            method: "POST",
            headers: {
              origin: origins.participant,
              "content-type": "application/json",
            },
            body: '{"user":"moderator"}',
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await fetch(origins.participant + "/bff/questions", {
            method: "POST",
            headers: {
              origin: origins.participant,
              "content-type": "application/json",
              "oai-authenticated-user-id": "moderator",
              "x-user-id": "moderator",
              "x-admin": "true",
            },
            body,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await fetch(origins.api + path + "/status", {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
              "x-admin": "true",
              "x-role": "admin",
            },
            body: '{"answered":true}',
          })
        ).status,
        401,
      );
      for (const sub of [
        JSON.stringify([base + "14443", "alice"]),
        JSON.stringify(["https://other.invalid", "moderator"]),
      ])
        assert.equal(
          (
            await signed(path + "/status", "PATCH", "admin", sub, {
              answered: false,
            })
          ).status,
          403,
        );
      assert.equal(
        (
          await signed(
            path + "/status",
            "PATCH",
            "participant",
            JSON.stringify([base + "14443", "moderator"]),
            { answered: false },
          )
        ).status,
        403,
      );
      checks.push(
        "Secure/HttpOnly/host-only/SameSite cookie; CSRF; local login disabled; Sites headers stripped; forged role and strict issuer+subject authorization",
      );
      // Untrusted forwarding headers cannot replace the configured transport or host.
      assert.equal(
        await new Promise((resolve, reject) => {
          const req = httpsRequest(
            origins.participant + "/health",
            {
              servername: "localhost",
              headers: {
                host: "evil.invalid",
                "x-forwarded-host": new URL(origins.participant).host,
                "x-forwarded-proto": "https",
              },
            },
            (r) => {
              r.resume();
              resolve(r.statusCode);
            },
          );
          req.on("error", () => reject(Error("Host rejection probe failed")));
          req.end();
        }),
        400,
      );
      await stop(participant);
      participant = await start("participant");
      assert.equal((await postWithCookie(cookieHeader)).status, 201);
      await stop(api);
      api = await start("api");
      const restored = await (
        await fetch(origins.api + "/events/demo/questions")
      ).json();
      const q = restored.questions.find((x: { id: string }) => x.id === id);
      assert.equal(q.answered, 1);
      assert.equal(q.highlighted, 1);
      checks.push(
        "frontend session survives production process restart; API DB and flags survive separate process restart",
      );
      mkdirSync("docs/evidence", { recursive: true });
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await adminPage.setViewportSize({ width, height: 900 });
        if (width === 390) {
          await article
            .getByRole("button", { name: "この質問に投票する" })
            .click();
          await article
            .getByRole("button", { name: "投票を取り消す" })
            .waitFor();
          await article.getByRole("button", { name: "投票を取り消す" }).click();
          await article
            .getByRole("button", { name: "この質問に投票する" })
            .waitFor();
          await aq
            .getByRole("button", { name: "強調を解除", exact: true })
            .click();
          await article
            .getByText("注目の質問", { exact: true })
            .waitFor({ state: "hidden" });
          await aq
            .getByRole("button", { name: "強調する", exact: true })
            .click();
          await article.getByText("注目の質問", { exact: true }).waitFor();
        }
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert.ok(
          await adminPage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.screenshot({
          path: `docs/evidence/oidc-participant-${width}.png`,
          fullPage: true,
        });
        await adminPage.screenshot({
          path: `docs/evidence/oidc-admin-${width}.png`,
          fullPage: true,
        });
      }
      checks.push(
        "PC 1280/mobile 390 render without overflow; mobile vote/unvote and Admin toggle automatically reflected; screenshots; no local fixed-user controls",
      );
      await page
        .getByRole("button", { name: "ログアウト", exact: true })
        .click();
      await page.getByRole("link", { name: "ログイン", exact: true }).waitFor();
      assert.equal((await postWithCookie(cookieHeader)).status, 401);
      checks.push(
        "logout revokes server session; captured cookie replay rejected",
      );
      // Callback transactions are cookie-bound, single-use, and time-bounded. Provider issues actual codes.
      const failures = [
        "signature",
        "issuer",
        "audience",
        "expired",
        "nonce",
        "state",
        "pkce",
      ];
      for (const fault of failures) {
        provider.setFault(fault);
        const c = await browser.newContext();
        const p = await c.newPage();
        if (fault === "state" || fault === "pkce") {
          const started = await p.request.get(
            origins.participant + "/auth/login",
            { maxRedirects: 0 },
          );
          assert.equal(started.status(), 303);
          const authorization = new URL(started.headers().location);
          authorization.searchParams.set(
            fault === "state" ? "state" : "code_challenge",
            fault === "state" ? "incorrect" : "a".repeat(43),
          );
          await p.goto(authorization.href);
        } else await p.goto(origins.participant + "/auth/login");
        await p.getByLabel("架空ユーザー").selectOption("alice");
        const response = p.waitForResponse((r) =>
          r.url().startsWith(origins.participant + "/auth/callback"),
        );
        await p.getByRole("button", { name: "OIDCでログイン" }).click();
        assert.equal((await response).status(), 401, fault);
        assert.equal(
          (await c.cookies(origins.participant)).some(
            (x) => x.name === "__Host-eqb_participant_session",
          ),
          false,
        );
        await c.close();
        checks.push("reject " + fault);
      }
      provider.setFault("");
      const c = await browser.newContext();
      const p = await c.newPage();
      await p.goto(origins.participant + "/auth/login");
      const loginCookies = await c.cookies(origins.participant);
      const transaction = loginCookies.find(
        (x) => x.name === "__Host-eqb_participant_login",
      )!;
      // Restart between authorization request and callback: state/nonce/verifier persist in SQLite.
      await stop(participant);
      participant = await start("participant");
      await p.getByLabel("架空ユーザー").selectOption("alice");
      const cb = p.waitForResponse((r) =>
        r.url().startsWith(origins.participant + "/auth/callback"),
      );
      await p.getByRole("button", { name: "OIDCでログイン" }).click();
      const callback = await cb;
      assert.equal(callback.status(), 303);
      assert.equal(
        (
          await fetch(callback.url(), {
            headers: {
              cookie: "__Host-eqb_participant_login=" + transaction.value,
            },
            redirect: "manual",
          })
        ).status,
        401,
      );
      checks.push(
        "login transaction survives restart; consumed callback replay rejected",
      );
      const old = (await c.cookies(origins.participant)).find(
        (x) => x.name === "__Host-eqb_participant_session",
      )!;
      await p.goto(origins.participant + "/auth/login");
      await p.waitForURL(origins.participant + "/");
      const active = (await c.cookies(origins.participant)).find(
        (x) => x.name === "__Host-eqb_participant_session",
      )!;
      assert.notEqual(active.value, old.value);
      assert.equal(
        (await postWithCookie("__Host-eqb_participant_session=" + old.value))
          .status,
        401,
      );
      checks.push(
        "successful reauthentication rotates session and rejects previous cookie",
      );
      const db = new DatabaseSync(dir + "/participant.sqlite");
      db.prepare("UPDATE sessions SET expires=?").run(Date.now() - 1000);
      db.close();
      assert.equal(
        (await postWithCookie("__Host-eqb_participant_session=" + active.value))
          .status,
        401,
      );
      checks.push("expired server session rejected");
      await c.close();
      assert.deepEqual(errors, []);
      checks.push("no page errors");
      // General authenticated user reaches Admin only with a separate session, and still cannot mutate.
      const ordinary = await browser.newContext();
      const op = await ordinary.newPage();
      await login(op, "admin", "alice");
      const resp = await op.request.patch(
        origins.admin + "/bff/questions/" + id + "/status",
        { headers: { origin: origins.admin }, data: { answered: false } },
      );
      assert.equal(resp.status(), 403);
      checks.push(
        "real OIDC ordinary Admin-site login cannot mutate management API",
      );
      await ordinary.close();
      const adminSession = (await adminContext.cookies(origins.admin)).find(
        (c) => c.name === "__Host-eqb_admin_session",
      )!;
      await adminPage
        .getByRole("button", { name: "ログアウト", exact: true })
        .click();
      await adminPage.waitForURL(origins.admin + "/auth/logged-out");
      await adminPage
        .getByRole("heading", { name: "ログアウトしました" })
        .waitFor();
      await adminPage.reload();
      assert.equal(new URL(adminPage.url()).pathname, "/auth/logged-out");
      assert.equal(
        (
          await fetch(origins.admin + "/identity", {
            headers: {
              cookie: "__Host-eqb_admin_session=" + adminSession.value,
            },
          })
        ).status,
        401,
      );
      checks.push(
        "Admin logout stays logged out despite active Provider SSO; explicit login link and old cookie rejection",
      );
      // Configuration changes never silently rebind persistent session/transaction storage.
      for (const overrides of [
        { OIDC_ISSUER: "https://different.invalid" },
        { OIDC_CLIENT_ID: "different-client" },
        { PUBLIC_ORIGIN: "https://different.invalid" },
        { SESSION_DB_PATH: dir + "/admin.sqlite" },
      ]) {
        const failed = spawnSync(process.execPath, [entry, "participant"], {
          env: { ...productionEnv("participant"), ...overrides },
          encoding: "utf8",
          timeout: 15000,
        });
        assert.notEqual(failed.status, 0);
        assert.match(failed.stderr, /Session DB trust scope mismatch/);
      }
      for (const overrides of [
        { AUTH_MODE: "local" },
        { AUTH_MODE: "sites" },
        { AUTH_MODE: "" },
        { PARTICIPANT_KEY: "" },
        { PUBLIC_ORIGIN: "http://localhost:14444" },
        { OIDC_ISSUER: "http://localhost:14443" },
        { TLS_CERT_FILE: "", TLS_KEY_FILE: "", TRUSTED_PROXY_IPS: "" },
        { API_ORIGIN: "http://127.0.0.1:3002" },
      ]) {
        const failed = spawnSync(process.execPath, [entry, "participant"], {
          env: { ...productionEnv("participant"), ...overrides },
          encoding: "utf8",
          timeout: 15000,
        });
        assert.notEqual(failed.status, 0);
        assert.equal(failed.signal, null);
      }
      for (const value of [
        "",
        "[]",
        "{invalid-private-value",
        '[{"issuer":"https://localhost:14443","email":"not-an-identity"}]',
      ]) {
        const failed = spawnSync(process.execPath, [entry, "api"], {
          env: { ...productionEnv("api"), OIDC_ADMIN_IDENTITIES: value },
          encoding: "utf8",
          timeout: 15000,
        });
        assert.notEqual(failed.status, 0);
        assert.doesNotMatch(
          failed.stderr,
          /invalid-private-value|not-an-identity/,
        );
      }
      checks.push(
        "changed issuer/client/origin/app DB reuse rejected; missing config/local/Sites/HTTP issuer or API/transport fail closed",
      );
      // Domain identity namespace: equal subjects under distinct issuers and legacy Sites keys remain disjoint.
      const issuerA = JSON.stringify([base + "14443", "same-subject"]);
      const issuerB = JSON.stringify([
        "https://another.invalid",
        "same-subject",
      ]);
      const rawDB = new DatabaseSync(dir + "/board.sqlite");
      rawDB
        .prepare("INSERT INTO votes VALUES (?,?)")
        .run(id, "participant:" + issuerA);
      rawDB.close();
      assert.equal(
        (await signed(path + "/vote", "PUT", "participant", issuerA)).status,
        200,
      );
      assert.equal(
        (await signed(path + "/vote", "PUT", "participant", issuerB)).status,
        200,
      );
      const votes = await (
        await fetch(origins.api + "/events/demo/questions")
      ).json();
      assert.equal(
        votes.questions.find((q: { id: string }) => q.id === id).votes,
        3,
      );
      checks.push(
        "OIDC issuer namespaces and legacy Sites voter keys are disjoint",
      );
      results.runtimeDependenciesOnly = [
        "openid-client",
        "oauth4webapi",
        "jose",
      ];
      results.observedAt=new Date().toISOString();
    results.nodeVersion=process.version;
    results.clientAuthenticationMethods=['client_secret_basic','client_secret_post'];
    results.providerTokenRequests = provider.tokenRequests;
      results.allPassed = true;
      writeFileSync(
        "docs/evidence/oidc-results.json",
        JSON.stringify(results, null, 2) + "\n",
      );
    } finally {
      if (browser) await browser.close();
      for (const p of processes) await stop(p);
      await new Promise<void>((r) => provider.server.close(() => r()));
    }
  },
);
