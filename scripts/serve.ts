import { SQLite } from "./sqlite.ts";
import { serve } from "./server.ts";
import { fetchAPI } from "../apps/api/src/index.ts";
import { frontend } from "@eqb/core/frontend";
import { client } from "./client.mjs";
if (process.env.NODE_ENV === "production") throw new Error("Use the built production entrypoint: npm start -- api|admin|participant");
const app = process.argv[2];
if (!["api", "admin", "participant"].includes(app))
  throw new Error("api/admin/participantを指定");
if (process.env.AUTH_MODE === "sites")
  throw new Error(
    "Sites認証はSitesエッジ経由のみ対応。自己ホスト本番はOIDC設定とnpm startを使ってください。",
  );
const port = Number(
  process.env.PORT || { api: 3002, admin: 3001, participant: 3000 }[app]!,
);
await serve(
  app === "api"
    ? fetchAPI
    : frontend(app as "admin" | "participant", await client()),
  {
    ...process.env,
    DB: new SQLite(process.env.DB_PATH || "work/board.sqlite"),
  },
  port,
);
console.log(`http://127.0.0.1:${port}`);
