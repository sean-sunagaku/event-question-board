/** Operator QA only. Secrets enter through hidden stdin; never write them or assertions to evidence. */
import assert from "node:assert/strict";
import { signedHeaders } from "@eqb/core";
import { writeFileSync, mkdirSync } from "node:fs";
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdout.write("Ready for live QA JSON on stdin (hidden).\n");
const input = await new Promise<string>((resolve) => {
  let data = "";
  process.stdin.on("data", (chunk) => {
    data += chunk.toString();
    if (data.includes("\n")) {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve(data.trim());
    }
  });
});
const cfg = JSON.parse(input) as {
  origin: string;
  participantKey: string;
  adminKey: string;
  adminSubject: string;
  phase?: string;
  questionId?: string;
};
if (!cfg.origin.startsWith("https://"))
  throw new Error("HTTPS origin required");
const results: { name: string; status: number; expected: number }[] = [];
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  caller?: "participant" | "admin",
  sub = "fictional-live-participant",
) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const req = new Request(cfg.origin + path, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : raw,
  });
  if (caller) {
    for (const [k, v] of Object.entries(
      await signedHeaders(
        caller,
        sub,
        req,
        raw,
        caller === "admin" ? cfg.adminKey : cfg.participantKey,
      ),
    ))
      req.headers.set(k, v);
  }
  return fetch(req, { signal: AbortSignal.timeout(20000) });
}
async function check(name: string, response: Response, expected: number) {
  results.push({ name, status: response.status, expected });
  assert.equal(response.status, expected, name);
  return response;
}
if (cfg.phase === "persist") {
  const response = await check(
    "再デプロイ後の公開一覧",
    await call("/events/demo/questions"),
    200,
  );
  const data = await response.json();
  const q = data.questions.find((q: { id: string }) => q.id === cfg.questionId);
  assert.ok(q);
  assert.equal(q.answered, 1);
  assert.equal(q.highlighted, 1);
  assert.equal(q.votes, 1);
  console.log(
    JSON.stringify({
      scope: "live-api-after-redeploy",
      questionId: cfg.questionId,
      results,
      persisted: true,
    }),
  );
} else {
  await check("health", await call("/health"), 200);
  await check(
    "明示的架空イベントseed",
    await call("/setup/demo", "POST", undefined, "admin", cfg.adminSubject),
    200,
  );
  await check("公開一覧", await call("/events/demo/questions"), 200);
  await check(
    "未認証投稿の拒否",
    await call("/events/demo/questions", "POST", { body: "架空の未認証質問" }),
    401,
  );
  await check(
    "入力検証",
    await call("/events/demo/questions", "POST", { body: " " }, "participant"),
    400,
  );
  const created = await check(
    "架空の質問投稿",
    await call(
      "/events/demo/questions",
      "POST",
      { body: "【架空の公開検証】チームの学びを続ける工夫は？" },
      "participant",
    ),
    201,
  );
  const { id } = await created.json();
  const path = "/events/demo/questions/" + id;
  for (const r of await Promise.all(
    Array.from({ length: 30 }, () =>
      call(
        path + "/vote",
        "PUT",
        undefined,
        "participant",
        "fictional-live-voter",
      ),
    ),
  ))
    await check("同時投票", r, 200);
  let list = await (await call("/events/demo/questions")).json();
  assert.equal(
    list.questions.find((q: { id: string }) => q.id === id).votes,
    1,
  );
  await check(
    "投票解除",
    await call(
      path + "/vote",
      "DELETE",
      undefined,
      "participant",
      "fictional-live-voter",
    ),
    200,
  );
  list = await (await call("/events/demo/questions")).json();
  assert.equal(
    list.questions.find((q: { id: string }) => q.id === id).votes,
    0,
  );
  await check(
    "投票の再設定",
    await call(
      path + "/vote",
      "PUT",
      undefined,
      "participant",
      "fictional-live-voter",
    ),
    200,
  );
  await check(
    "未認証管理の拒否",
    await call(path + "/status", "PATCH", { answered: true }),
    401,
  );
  const forged = new Request(cfg.origin + path + "/status", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-user-id": cfg.adminSubject,
      "x-admin": "true",
      "x-role": "admin",
    },
    body: '{"answered":true}',
  });
  await check("偽造role拒否", await fetch(forged), 401);
  await check(
    "参加者サービス資格情報拒否",
    await call(
      path + "/status",
      "PATCH",
      { answered: true },
      "participant",
      cfg.adminSubject,
    ),
    403,
  );
  await check(
    "一般利用者の管理拒否",
    await call(
      path + "/status",
      "PATCH",
      { answered: true },
      "admin",
      "fictional-not-an-admin",
    ),
    403,
  );
  await check(
    "許可管理者の回答済みと強調",
    await call(
      path + "/status",
      "PATCH",
      { answered: true, highlighted: true },
      "admin",
      cfg.adminSubject,
    ),
    200,
  );
  list = await (await call("/events/demo/questions")).json();
  const q = list.questions.find((q: { id: string }) => q.id === id);
  assert.equal(q.answered, 1);
  assert.equal(q.highlighted, 1);
  const evidence = {
    scope:
      "live-api-with-signed-service-assertions; browser sign-in separately verified",
    questionId: id,
    results,
    concurrentVotes: 30,
    uniqueVotes: 1,
  };
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync(
    "docs/evidence/live-api.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
}
