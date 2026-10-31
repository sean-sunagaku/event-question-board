import { createServer } from "node:http";
import type { Env } from "@eqb/core";
export async function serve(
  handler: (r: Request, e: Env) => Promise<Response>,
  env: Env,
  port: number,
) {
  const server = createServer(async (req, res) => {
    try {
      const parts: Buffer[] = [];
      let size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > 8192) {
          res.writeHead(413);
          res.end();
          return;
        }
        parts.push(part);
      }
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers))
        if (v) headers.set(k, Array.isArray(v) ? v.join(",") : v);
      // Only the hosted edge can establish Sites identity. The standalone server strips it.
      for (const k of [
        "oai-authenticated-user-id",
        "oai-authenticated-user-email",
      ])
        headers.delete(k);
      const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method!)
          ? undefined
          : Buffer.concat(parts),
      });
      const response = await handler(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end("Internal error");
    }
  });
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  return server;
}
