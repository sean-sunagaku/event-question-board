import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SQLite } from "../scripts/sqlite.ts";
import { fetchAPI } from "../apps/api/src/index.ts";
import { frontend } from "@eqb/core/frontend";
import { signedHeaders, type Env } from "@eqb/core";
import { page } from "@eqb/ui";
test("Sites adapter regression: isolated standard identity, API default deny, no Node OIDC dependency in Workers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "eqb-sites-"));
  const db = new SQLite(dir + "/db.sqlite");
  try {
    db.raw.exec(
      readFileSync("apps/api/drizzle/0000_workable_betty_brant.sql", "utf8"),
    );
    const env: Env = {
      DB: db,
      AUTH_MODE: "sites",
      NODE_ENV: "production",
      ADMIN_SUBJECTS: "fictional-sites-admin",
      ADMIN_KEY: "a".repeat(64),
      PARTICIPANT_KEY: "p".repeat(64),
    };
    const req = new Request("https://api.example/setup/demo", {
      method: "POST",
    });
    for (const [k, v] of Object.entries(
      await signedHeaders(
        "admin",
        "fictional-sites-admin",
        req,
        "",
        env.ADMIN_KEY!,
      ),
    ))
      req.headers.set(k, v);
    assert.equal((await fetchAPI(req, env)).status, 200);
    assert.equal(
      (await frontend("admin", "")(new Request("https://admin.example/"), env))
        .status,
      401,
    );
    assert.equal(
      (
        await frontend("admin", "")(
          new Request("https://admin.example/", {
            headers: { "oai-authenticated-user-id": "fictional-sites-admin" },
          }),
          env,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await frontend("participant", "")(
          new Request("https://participant.example/local-login", {
            method: "POST",
            headers: {
              origin: "https://participant.example",
              "content-type": "application/json",
            },
            body: '{"user":"moderator"}',
          }),
          env,
        )
      ).status,
      404,
    );
    assert.match(page(false, false, false), /signin-with-chatgpt/);
    assert.doesNotMatch(page(false, true, false), /auth\/logout/);
    for (const app of ["participant", "admin", "api"]) {
      const bundle = readFileSync(`apps/${app}/dist/server/index.js`, "utf8");
      assert.doesNotMatch(
        bundle,
        /node:sqlite|openid-client|SESSION_DB_PATH|test-client-secret/,
      );
    }
  } finally {
    db.raw.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
