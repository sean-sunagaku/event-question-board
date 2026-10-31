// Creates a temporary trusted CA; verification remains enabled in Node and Chromium.
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const dir = mkdtempSync(join(tmpdir(), "eqb-oidc-"));
const nss = join(homedir(), ".pki", "nssdb");
const nickname = "eqb-test-" + Date.now();
let added = false;
const run = (args) =>
  execFileSync("openssl", args, { cwd: dir, stdio: "ignore" });
try {
  run([
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    "ca.key",
    "-out",
    "ca.pem",
    "-subj",
    "/CN=EQB temporary test CA",
    "-days",
    "2",
    "-addext",
    "basicConstraints=critical,CA:TRUE",
    "-addext",
    "keyUsage=critical,keyCertSign,cRLSign",
  ]);
  run([
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    "server.key",
    "-out",
    "server.csr",
    "-subj",
    "/CN=localhost",
  ]);
  writeFileSync(
    join(dir, "server.ext"),
    "subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n",
  );
  run([
    "x509",
    "-req",
    "-in",
    "server.csr",
    "-CA",
    "ca.pem",
    "-CAkey",
    "ca.key",
    "-CAcreateserial",
    "-out",
    "server.pem",
    "-days",
    "2",
    "-extfile",
    "server.ext",
  ]);
  mkdirSync(nss, { recursive: true });
  const check = spawnSync("certutil", ["-L", "-d", "sql:" + nss], {
    stdio: "ignore",
  });
  if (check.status !== 0)
    execFileSync("certutil", ["-N", "--empty-password", "-d", "sql:" + nss], {
      stdio: "ignore",
    });
  execFileSync(
    "certutil",
    [
      "-A",
      "-d",
      "sql:" + nss,
      "-n",
      nickname,
      "-t",
      "CT,C,C",
      "-i",
      join(dir, "ca.pem"),
    ],
    { stdio: "ignore" },
  );
  added = true;
  const runtime = join(dir, "runtime");
  mkdirSync(join(runtime, "node_modules"), { recursive: true });
  cpSync("dist/node", join(runtime, "dist/node"), { recursive: true });
  for (const pkg of ["openid-client", "oauth4webapi", "jose"])
    cpSync(join("node_modules", pkg), join(runtime, "node_modules", pkg), {
      recursive: true,
    });
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", "tests/oidc.test.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_EXTRA_CA_CERTS: join(dir, "ca.pem"),
        OIDC_TEST_DIR: dir,
        OIDC_PRODUCTION_ENTRY: join(runtime, "dist/node/start.mjs"),
        NODE_ENV: "production",
      },
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  if (added)
    execFileSync("certutil", ["-D", "-d", "sql:" + nss, "-n", nickname], {
      stdio: "ignore",
    });
  rmSync(dir, { recursive: true, force: true });
}
