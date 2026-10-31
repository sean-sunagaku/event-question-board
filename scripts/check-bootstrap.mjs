import { access, readFile } from "node:fs/promises";

const required = [
  "README.md",
  "AGENTS.md",
  "LICENSE",
  "docs/spec.md",
  "docs/cloud-task.md",
  "docs/progress.md",
];
await Promise.all(
  required.map((path) => access(new URL(`../${path}`, import.meta.url))),
);
const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
if (
  pkg.private !== true ||
  !pkg.workspaces?.includes("apps/*") ||
  !pkg.workspaces?.includes("packages/*")
) {
  throw new Error(
    "The repository must define private npm workspaces for apps and shared packages.",
  );
}
console.log(
  "Bootstrap documents and workspace configuration are present. Run npm test for application behavior.",
);
