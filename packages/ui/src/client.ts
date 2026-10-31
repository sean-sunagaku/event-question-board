import type { Question } from "@eqb/contracts";
const $ = (id: string) => document.getElementById(id)!;
const admin = document.title.startsWith("管理");
let questions: Question[] = [],
  loading = false;
const pending = new Set<string>();
async function api(path: string, init?: RequestInit) {
  const res = await fetch("/bff" + path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "通信に失敗しました。");
  return data;
}
function render() {
  const list = $("questions");
  list.replaceChildren();
  $("total").textContent = `(${questions.length})`;
  if (!questions.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "まだ質問はありません。最初の問いを届けてみませんか。";
    list.append(p);
  }
  for (const q of questions) {
    const card = document.createElement("article");
    card.className = "card" + (q.highlighted ? " highlight" : "");
    const vote = document.createElement("button");
    vote.className = "vote";
    vote.setAttribute("aria-pressed", String(!!q.voted));
    vote.setAttribute(
      "aria-label",
      q.voted ? "投票を取り消す" : "この質問に投票する",
    );
    vote.disabled = pending.has(q.id) || admin;
    const arrow = document.createElement("span");
    arrow.textContent = q.voted ? "✓" : "↑";
    const number = document.createElement("strong");
    number.textContent = String(q.votes);
    vote.append(arrow, number);
    vote.onclick = () => act(q, "vote");
    const content = document.createElement("div");
    content.className = "content";
    for (const [flag, label, cls] of [
      [q.highlighted, "注目の質問", "badge gold"],
      [q.answered, "回答済み", "badge"],
    ] as const)
      if (flag) {
        const badge = document.createElement("span");
        badge.className = cls;
        badge.textContent = label;
        content.append(badge);
      }
    const body = document.createElement("p");
    body.className = "question";
    body.textContent = q.body;
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = new Date(q.created_at).toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    content.append(body, meta);
    if (admin) {
      const actions = document.createElement("div");
      actions.className = "actions";
      for (const field of ["answered", "highlighted"] as const) {
        const b = document.createElement("button");
        b.textContent =
          field === "answered"
            ? q.answered
              ? "未回答に戻す"
              : "回答済みにする"
            : q.highlighted
              ? "強調を解除"
              : "強調する";
        b.disabled = pending.has(q.id);
        b.onclick = () => act(q, field);
        actions.append(b);
      }
      content.append(actions);
    }
    card.append(vote, content);
    list.append(card);
  }
}
async function refresh() {
  if (loading) return;
  loading = true;
  try {
    const data = await api(
      "/questions?sort=" + ($("sort") as HTMLSelectElement).value,
    );
    const changed =
      JSON.stringify(data.questions) !== JSON.stringify(questions);
    questions = data.questions;
    if (changed || !$("questions").children.length) render();
    $("status").textContent = "自動更新中 · 3秒ごと";
    $("status").classList.remove("error");
    $("retry").hidden = true;
  } catch (e) {
    $("status").textContent =
      (e as Error).message + " 保存済みの表示を維持しています。";
    $("status").classList.add("error");
    $("retry").hidden = false;
    if (admin && (e as Error).message.includes("イベントが見つかりません"))
      $("start-demo").hidden = false;
  } finally {
    loading = false;
  }
}
async function act(q: Question, action: "vote" | "answered" | "highlighted") {
  if (pending.has(q.id)) return;
  pending.add(q.id);
  render();
  try {
    await api(
      "/questions/" + q.id + "/" + (action === "vote" ? "vote" : "status"),
      {
        method: action === "vote" ? (q.voted ? "DELETE" : "PUT") : "PATCH",
        body:
          action === "vote"
            ? undefined
            : JSON.stringify({ [action]: !q[action] }),
      },
    );
    await refresh();
  } catch (e) {
    $("status").textContent = (e as Error).message;
    $("status").classList.add("error");
  } finally {
    pending.delete(q.id);
    render();
  }
}
$("sort").addEventListener("change", refresh);
$("retry").onclick = refresh;
const form = $("compose") as HTMLFormElement | null;
if (form) {
  const input = $("body") as HTMLTextAreaElement;
  input.oninput = () => {
    $("count").textContent = String([...input.value].length);
  };
  let sending = false;
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (sending) return;
    const value = input.value.trim();
    if (!value || [...value].length > 500) {
      $("form-status").textContent = "質問は1〜500文字で入力してください。";
      return;
    }
    sending = true;
    const button = form.querySelector("button")!;
    button.disabled = true;
    $("form-status").textContent = "投稿しています…";
    try {
      await api("/questions", {
        method: "POST",
        body: JSON.stringify({ body: value }),
      });
      input.value = "";
      $("count").textContent = "0";
      $("form-status").textContent = "投稿しました。ありがとうございます。";
      await refresh();
    } catch (e) {
      $("form-status").textContent = (e as Error).message;
    } finally {
      sending = false;
      button.disabled = false;
    }
  };
}
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-login]"))
  b.onclick = async () => {
    await fetch("/local-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user: b.dataset.login }),
    });
    location.reload();
  };
void refresh();
setInterval(refresh, 3000);

const startDemo = $("start-demo") as HTMLButtonElement | null;
if (startDemo)
  startDemo.onclick = async () => {
    startDemo.disabled = true;
    try {
      await api("/setup", { method: "POST", body: "{}" });
      startDemo.hidden = true;
      await refresh();
    } catch (e) {
      $("status").textContent = (e as Error).message;
    } finally {
      startDemo.disabled = false;
    }
  };
