export type Caller = 'participant' | 'admin';
export interface Question { id: string; event_id: string; body: string; created_at: number; answered: number; highlighted: number; votes: number; voted: number }
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function textInput(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, '質問本文を入力してください。');
  const body = value.trim().normalize('NFC');
  if (!body || [...body].length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body)) throw new HttpError(400, '質問は1〜500文字で入力してください。');
  return body;
}
export async function readJSON(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'JSON形式で送信してください。');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 8192) throw new HttpError(413, '送信内容が大きすぎます。');
  let data: unknown; try { data = JSON.parse(raw); } catch { throw new HttpError(400, 'JSON形式が正しくありません。'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, '入力形式が正しくありません。');
  return data as Record<string, unknown>;
}
export function json(data: unknown, status = 200): Response { return Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }); }
export function failure(error: unknown): Response { return error instanceof HttpError ? json({error: error.message}, error.status) : json({error:'処理できませんでした。時間をおいて再度お試しください。'}, 500); }
