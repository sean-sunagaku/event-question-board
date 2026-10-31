import { DatabaseSync } from "node:sqlite";
import type { DB, Statement } from "@eqb/core";
export class SQLite implements DB {
  readonly raw: DatabaseSync;
  constructor(path: string) {
    this.raw = new DatabaseSync(path);
    this.raw.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
  }
  prepare(sql: string): Statement {
    const db = this.raw;
    let args: unknown[] = [];
    const statement: Statement = {
      bind(...values) {
        args = values;
        return statement;
      },
      async first<T>() {
        return (db.prepare(sql).get(...(args as never[])) ?? null) as T | null;
      },
      async all<T>() {
        return { results: db.prepare(sql).all(...(args as never[])) as T[] };
      },
      async run() {
        return db.prepare(sql).run(...(args as never[]));
      },
    };
    return statement;
  }
  async batch(statements: Statement[]) {
    this.raw.exec("BEGIN");
    try {
      const results = [];
      for (const s of statements) results.push(await s.run());
      this.raw.exec("COMMIT");
      return results;
    } catch (e) {
      this.raw.exec("ROLLBACK");
      throw e;
    }
  }
}
