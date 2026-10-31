import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { serve } from "../scripts/server.ts";
import { frontend } from "@eqb/core/frontend";
import type { Env } from "@eqb/core";
test("HTTP backend: exact trusted proxy IP/proto/host, spoofed Sites identity always stripped", async () => {
  const env = { AUTH_MODE: "sites", NODE_ENV: "production" } as Env;
  const origin = "https://admin.example.test";
  const trusted = await serve(frontend("admin", ""), env, 0, {
    publicOrigin: origin,
    trustedProxyIPs: ["127.0.0.1"],
  });
  const untrusted = await serve(frontend("admin", ""), env, 0, {
    publicOrigin: origin,
    trustedProxyIPs: ["192.0.2.1"],
  });
  const port = (s: typeof trusted) => (s.address() as { port: number }).port;
  const call = (p: number, path: string, headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { hostname: "127.0.0.1", port: p, path, headers },
        (r) => {
          r.resume();
          resolve(r.statusCode!);
        },
      );
      req.on("error", reject);
      req.end();
    });
  try {
    const headers = {
      host: "admin.example.test",
      "x-forwarded-proto": "https",
    };
    assert.equal(await call(port(trusted), "/health", headers), 200);
    assert.equal(
      await call(port(trusted), "/health", { host: "admin.example.test" }),
      400,
    );
    assert.equal(
      await call(port(trusted), "/health", {
        ...headers,
        "x-forwarded-proto": "https,http",
      }),
      400,
    );
    assert.equal(
      await call(port(trusted), "/health", {
        ...headers,
        host: "evil.invalid",
        "x-forwarded-host": "admin.example.test",
      }),
      400,
    );
    assert.equal(await call(port(untrusted), "/health", headers), 400);
    assert.equal(
      await call(port(trusted), "/identity", {
        ...headers,
        "oai-authenticated-user-id": "fictional-admin",
        "oai-authenticated-user-email": "fictional@example.invalid",
      }),
      401,
    );
  } finally {
    await Promise.all(
      [trusted, untrusted].map(
        (s) => new Promise<void>((r) => s.close(() => r())),
      ),
    );
  }
});
