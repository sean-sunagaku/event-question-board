import { build } from "esbuild";
import { client } from "./client.mjs";
await client();
for (const app of process.argv[2]
  ? [process.argv[2]]
  : ["participant", "admin", "api"])
  await build({
    entryPoints: [`apps/${app}/src/index.ts`],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile: `apps/${app}/dist/server/index.js`,
  });

// Production Node entrypoints contain shared code and prebuilt client JS.
// The Node-only OIDC dependency remains external; Worker bundles never import it.
if (!process.argv[2]) {
  for (const entry of ["start", "db"]) await build({
    entryPoints: [`scripts/${entry}.ts`], bundle: true, format: "esm",
    platform: "node", target: "node22", external: ["openid-client"],
    outfile: `dist/node/${entry}.mjs`,
  });
}
