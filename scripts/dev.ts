if (process.env.NODE_ENV === "production") throw new Error("Development login is disabled in production");
import { randomBytes } from "node:crypto";
import { client } from "./client.mjs";
import { frontend } from "@eqb/core/frontend";
import { fetchAPI } from "../apps/api/src/index.ts";
import { SQLite } from "./sqlite.ts";
import { serve } from "./server.ts";
const js = await client(),
  db = new SQLite(process.env.DB_PATH || "work/board.sqlite");
const participantKey = randomBytes(32).toString("hex"),
  adminKey = randomBytes(32).toString("hex");
const base = {
  DB: db,
  AUTH_MODE: "local",
  NODE_ENV: "development",
  ADMIN_SUBJECTS: "moderator",
  API_ORIGIN: "http://127.0.0.1:3002",
};
const servers = await Promise.all([
  serve(
    fetchAPI,
    { ...base, PARTICIPANT_KEY: participantKey, ADMIN_KEY: adminKey },
    3002,
  ),
  serve(
    frontend("participant", js),
    {
      ...base,
      PARTICIPANT_KEY: participantKey,
      PUBLIC_ORIGIN: "http://127.0.0.1:3000",
    },
    3000,
  ),
  serve(
    frontend("admin", js),
    { ...base, ADMIN_KEY: adminKey, PUBLIC_ORIGIN: "http://127.0.0.1:3001" },
    3001,
  ),
]);
console.log(
  "参加者 http://127.0.0.1:3000 / 管理 http://127.0.0.1:3001 / API http://127.0.0.1:3002",
);
console.log(
  "管理画面は初回401。参加者画面のローカル用「管理者」でログイン後に開いてください。",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const s of servers) s.close();
    db.raw.close();
    process.exit();
  });
