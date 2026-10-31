import { mkdirSync, readFileSync } from "node:fs";
import { SQLite } from "./sqlite.ts";
mkdirSync("work", { recursive: true });
const db = new SQLite(process.env.DB_PATH || "work/board.sqlite");
db.raw.exec("CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)");
if (!db.raw.prepare("SELECT name FROM migrations WHERE name=?").get("0001")) {
  db.raw.exec("BEGIN");
  try {
    db.raw.exec(
      readFileSync("apps/api/drizzle/0000_workable_betty_brant.sql", "utf8"),
    );
    db.raw.prepare("INSERT INTO migrations VALUES (?)").run("0001");
    db.raw.exec("COMMIT");
  } catch (e) {
    db.raw.exec("ROLLBACK");
    throw e;
  }
}
if (process.argv[2] === "seed") {
  db.raw
    .prepare("INSERT INTO events(id,name) VALUES (?,?) ON CONFLICT DO NOTHING")
    .run("demo", "架空のイベント：これからの学びの会");
  console.log("架空のdemoイベントを登録しました。質問の自動投入はしません。");
} else console.log("DBマイグレーションを確認しました。");
db.raw.close();
