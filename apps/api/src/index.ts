import {
  failure,
  HttpError,
  json,
  readJSON,
  textInput,
  type Question,
} from "@eqb/contracts";
import { verify, requireAdmin, type Env } from "@eqb/core";
// Preserve legacy Sites keys; OIDC keys have a disjoint outer namespace.
const identityKey = (auth: {caller:string;sub:string}, env:Env) =>
  env.AUTH_MODE === "oidc" ? `oidc:${auth.caller}:${auth.sub}` : auth.caller + ":" + auth.sub;
export async function fetchAPI(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, service: "api" });
    if (url.pathname === "/setup/demo" && request.method === "POST") {
      const raw = await request.text();
      const auth = await verify(request, env, raw);
      requireAdmin(auth, env);
      await env.DB.prepare(
        "INSERT INTO events (id,name) VALUES (?,?) ON CONFLICT DO NOTHING",
      )
        .bind("demo", "架空のイベント：これからの学びの会")
        .run();
      return json({ ok: true });
    }
    const match = url.pathname.match(
      /^\/events\/([a-z0-9-]{1,64})\/questions(?:\/([a-f0-9-]{36})(?:\/(vote|status))?)?$/,
    );
    if (!match) throw new HttpError(404, "見つかりません。");
    const [, event, id, action] = match;
    if (
      !(await env.DB.prepare("SELECT id FROM events WHERE id=?")
        .bind(event)
        .first())
    )
      throw new HttpError(404, "イベントが見つかりません。");
    const raw = await request.text();
    const auth =
      request.method === "GET" && !request.headers.has("x-eqb-assertion")
        ? null
        : await verify(request, env, raw);
    if (request.method === "GET" && !id) {
      const user = auth ? identityKey(auth, env) : "";
      const order =
        url.searchParams.get("sort") === "new"
          ? "q.created_at DESC, q.id DESC"
          : "votes DESC, q.created_at DESC, q.id DESC";
      const rows = await env.DB.prepare(
        `SELECT q.id,q.event_id,q.body,q.created_at,q.answered,q.highlighted,COUNT(v.user_id) AS votes,MAX(CASE WHEN v.user_id=? THEN 1 ELSE 0 END) AS voted FROM questions q LEFT JOIN votes v ON v.question_id=q.id WHERE q.event_id=? GROUP BY q.id ORDER BY ${order}`,
      )
        .bind(user, event)
        .all<Question>();
      return json({ questions: rows.results });
    }
    if (!auth) throw new HttpError(401, "ログインしてください。");
    if (request.method === "POST" && !id) {
      const data = await readJSON(
        new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: raw,
        }),
      );
      const body = textInput(data.body),
        qid = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO questions (id,event_id,body,author_id,created_at) VALUES (?,?,?,?,?)",
      )
        .bind(qid, event, body, identityKey(auth, env), Date.now())
        .run();
      return json({ id: qid }, 201);
    }
    if (
      !id ||
      !(await env.DB.prepare(
        "SELECT id FROM questions WHERE id=? AND event_id=?",
      )
        .bind(id, event)
        .first())
    )
      throw new HttpError(404, "質問が見つかりません。");
    if (action === "vote" && ["PUT", "DELETE"].includes(request.method)) {
      if (auth.caller !== "participant")
        throw new HttpError(403, "参加者画面から投票してください。");
      const sql =
        request.method === "PUT"
          ? "INSERT INTO votes (question_id,user_id) VALUES (?,?) ON CONFLICT DO NOTHING"
          : "DELETE FROM votes WHERE question_id=? AND user_id=?";
      await env.DB.prepare(sql)
        .bind(id, identityKey(auth, env))
        .run();
      return json({ ok: true });
    }
    if (action === "status" && request.method === "PATCH") {
      requireAdmin(auth, env);
      const data = await readJSON(
        new Request(request.url, {
          method: "PATCH",
          headers: request.headers,
          body: raw,
        }),
      );
      if (
        Object.keys(data).some(
          (k) => !["answered", "highlighted"].includes(k),
        ) ||
        Object.keys(data).length === 0 ||
        Object.values(data).some((v) => typeof v !== "boolean")
      )
        throw new HttpError(400, "回答済み・強調を真偽値で指定してください。");
      const fields = Object.keys(data);
      await env.DB.prepare(
        `UPDATE questions SET ${fields.map((k) => k + "=?").join(",")} WHERE id=? AND event_id=?`,
      )
        .bind(...fields.map((k) => Number(data[k])), id, event)
        .run();
      return json({ ok: true });
    }
    throw new HttpError(405, "対応していない操作です。");
  } catch (e) {
    return failure(e);
  }
}
export default { fetch: fetchAPI };
