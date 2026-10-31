import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
export async function client() {
  const result = await build({
    entryPoints: ["packages/ui/src/client.ts"],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2022",
  });
  await mkdir("work", { recursive: true });
  await writeFile(
    "work/client-source.ts",
    "export default " + JSON.stringify(result.outputFiles[0].text) + ";\n",
  );
  return result.outputFiles[0].text;
}
