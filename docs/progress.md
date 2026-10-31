# 進捗と公開結果

最終更新: 2026-10-31 JST。目標は未完了。

## 全体目標

公開GitHubの同一commitからparticipant・admin・apiの3つのSitesを公開し、実環境の投稿・投票・管理・権限拒否・更新反映・永続化を実測する。
専用goal登録ツールはこのチャットに提供されていないため、ここに目標を記録する。

## Cloud

接続済み環境: `ccarenv_b64_Y2NhcmVudl9kMTk3YWVhOGRjZDA4MTkxYTY0MzJjYmIzZTc3OTRlMg`。
Cloud上の `/workspace/event-question-board` で主要実装・日本語UI・テストを実施。
実装タスク: https://chatgpt.com/local/01a18f54-150b-71e6-bc2e-c64200a1b081
環境セットアップ: https://chatgpt.com/local/01a18f4e-9130-71ce-836a-c4b8924da09f
環境「Event Question Board」を公開し、この新規Cloudタスクを開始できたことを設定元タスクがWebで確認。
公式helper追加で09:28 JST、3公開ホストの許可追加で09:35 JSTに再公開したことも設定元が確認。
ただし実行中タスクはrevision 1のまま。3ホストはnetwork-policy.jsonに現れず、CONNECT 403が継続。
利用可能な環境ツールは状態と診断のみで、実行中インスタンスの更新操作はない。

## 実測済み

- Node v24.19.0、npm install、build、typecheck、DB初期化・明示seedが成功。
- 3サービスを独立した実HTTPポートで起動、SQLiteで保存。
- 投稿、別利用者の閲覧・投票、30要求の同時投票で1票、解除、サーバーとDBを再起動した後も保持。
- 管理者の回答済み・強調、参加者一覧への反映。
- 未認証・一般ユーザー・偽造role/ヘッダー・参加者キー・偽署名・署名再利用・期限切れ・CSRFの拒否、既定拒否。
- 入力の空白・長さ・型・制御文字検証。HTMLはtextContentで表示。
- 506件（回答済みを含む）の全件取得、人気順・新着順。LIMIT 500はない。
- Chromiumで1280px / 390pxの投稿・投票・解除・管理操作・3秒の自動反映を確認。横はみ出し・pageerrorなし。
- 画面証拠: [参加者PC](evidence/participant-1280.png)、[参加者モバイル](evidence/participant-390.png)、[Admin PC](evidence/admin-1280.png)、[Adminモバイル](evidence/admin-390.png)、[操作結果JSON](evidence/browser-results.json)。すべてローカル検証の証拠。

## Sites初回公開（native deploy成功、公開動作は検証中）

| app | ID | 実公開URL | version |
| --- | --- | --- | --- |
| participant | appgprj_6ae535826d2081919b3acb891c6967d7 | https://event-question-board-participant.codex-book.chatgpt.site | 1 |
| admin | appgprj_6ae53592d68c81918db6c5ab89104ba3 | https://event-question-board-admin.codex-book.chatgpt.site | 1 |
| api | appgprj_6ae535205f288191ab6e2a4710871590 | https://event-question-board-api.codex-book.chatgpt.site | 1 |

SitesとGitHubのnativeツールは有効。初期Cloudに公式ヘルパーがなかったが、ユーザー提供の公式1.1.2アーカイブをSHA256検証してリポジトリ外に展開した。
SHA256: `8a310d3eb51f0424d6b367ef3e99b2d39b9873eee8c79e3b2e3e12a14f9927ba`。
標準Vinext starterを各Siteに準備。APIで標準Drizzleのschema生成を実行。helpersや資格情報をOSSに取り込まない。

## 残作業

- 修正commitのCI確認・merge（fresh clone相当、自己レビュー、push、PR作成は完了）。
- 同一GitHub commitの3配布物を標準source helperで同期し、version保存・deploy。
- 本人subjectと本番secretは設定済み。新ソースの配布後に本番の明示seedと機能確認。
- 公開実HTTPとブラウザで全操作・認可・永続化・再deployを確認し、実URL/version/commit/PRを記録。

## GitHubと独立確認

実装commit: `7725a1ac605298fbab12ad86489e9ad86534c14a`。PR: https://github.com/sean-sunagaku/event-question-board/pull/1 。
初回3配布物はすべて同commitの共通ソースから生成。各Sites source SHAはAPI `b3b943752a3cea758ddabcd83eafece2b3ef7e29`、participant `7dc2d11caed42f2156fffe03be7734fd259f0859`、admin `f5a88d5f291daf4330c79843bcbd59863881ae5a`。
Macの独立確認（設定元タスク報告、Node v26.12.1）: npm ci/build/typecheck/test成功、監査脆弱性0。
Cloudでgit archiveから作ったfresh clone相当でもnpm ci/build/typecheck/test/DB初期化・seed成功。
push CI 41150446371はpass、PR CI 41150501646はfail。ログインボタン直後のページ再読込競合を修正し、ローカル再検証成功。修正commit b4d300aのPR CI成功（run 41151280328）。単なるtimeout延長はしていない。
本人が正規SitesログインでAdmin /identityを確認。取得したsubjectはSitesのsecret環境変数のみへ登録し、API v1を環境revision 2で再deploy成功。subjectは公開ソースに記載しない。

自己レビューでnonce重複とDB障害を区別するよう修正。新規DBからAdmin画面の明示イベント準備と権限拒否を追加検証。

## 次のCloudタスクへの引継ぎ（2026-10-31 09:39 JST）

**この時点から旧タスクはデプロイを行わない。デプロイ所有権は更新済み環境の仕上げタスクへ引き継ぐ。**
旧タスクはGitHubのCI確認とPRマージ、記録の保全だけを続ける。並行デプロイしない。
CI競合修正・明示イベント準備・自己レビュー修正のcommitは `b4d300a96840f645a157c465688c2cbb6b0bdb35`、GitHubへpush済み。
この修正commitはまだSitesへ配布していない。3サービスとも公開version 1は旧ソース `7725a1a` のまま。

### 既存runtime設定

- API: 環境revision 2。`PARTICIPANT_KEY`、`ADMIN_KEY`、`ADMIN_SUBJECTS` をsecretで設定済み。allowlistは本人の正規Admin Site subjectのみ。
- participant: 環境revision 1。`PARTICIPANT_KEY`、`API_ORIGIN`、`PUBLIC_ORIGIN` を設定済み。アクセスはpublic。
- admin: 環境revision 1。`ADMIN_KEY`、`API_ORIGIN`、`PUBLIC_ORIGIN` を設定済み。native get_siteでcustom・owner本人のみ・groupなしを確認。
- Sites用アダプターが `AUTH_MODE=sites`、`NODE_ENV=production` を強制。ローカル偽認証は本番で有効にならない。
- 既存の本番環境変数を不用意に消さない。秘密値とsubjectはGitに記載しない。
- HMACキーは旧タスクのセッションメモリにしか保持していない。Sites secretとしては設定済み。直接署名QAでキーが必要になって取得不能なら、新タスクのメモリでキーを生成し、3サービスを整合した設定へ更新・再deployする。値をチャット・ファイル・Gitへ移さない。

### 保存済みversionと公開deployment

| app | 保存済みversion ID | 成功deployment ID |
| --- | --- | --- |
| participant | appgprj_6ae535826d2081919b3acb891c6967d7~appgver_62455cbbbfa481918ca84b450d01af61 | appgdep_6ae53728cbe481918e0bcbbb637b9ccc |
| admin | appgprj_6ae53592d68c81918db6c5ab89104ba3~appgver_2c7e5abf40b881918e07967c9945551b | appgdep_6ae5371343f081919627ab9619270a20 |
| api | appgprj_6ae535205f288191ab6e2a4710871590~appgver_4b320e98837c81919143fcd13ef52af1 | appgdep_6ae537cbb5e08191beabc0d795d0ed3a |

APIのnative DB overviewでbinding `DB` と `events`・`questions`・`votes`・`request_nonces` の4表を確認した。マイグレーションは適用済み。
本番の明示demo seedは旧タスクでは未実施。修正commit配布後、本人のAdmin画面から「架空のイベントを準備する」を実行できる。
本番操作・権限拒否・同時投票・再deploy後永続化の合格はまだ付けない。

### 新タスクの次の操作

1. GitHubの最新main/PRとこの記録を読み、既存Site IDを再利用。公式helperは環境に追加された `/workspace/tools/openai-sites-1.1.2`、旧タスクで使ったものは `/workspace/work/openai-sites-1.1.2`。
2. 3ホストが新タスクのHTTP許可に含まれることと実HTTP疎通を確認。
3. CIが合格した同一GitHub commitから3配布物を生成。既存Sitesはsource credentialを取得し標準source helperで開き、ソース同期・build・version保存・deployする。provenanceとSHAを記録。
4. 本人のAdminで明示seed後、正規参加者の投稿・投票・解除、Adminの回答済み・強調と自動反映を実公開で確認。
5. 公開API直呼びの権限拒否、投票の一意性・同時実行、再deployしてもデータ保持、PC/スマートフォンの画面を確認。`scripts/live-check.ts` は秘密のstdinで署名付きAPI QAが可能。ブラウザの正規ログイン確認は別に必要。
6. この記録を最終版の実測で更新。初回version 1のnative成功だけを機能検証成功にしない。

修正commit `b4d300a` のPR CIは成功: https://github.com/sean-sunagaku/event-question-board/actions/runs/41151280328 。
ローカル再検証に加え、GitHub上でもbuild・typecheck・HTTPテスト・DB初期化・PC/モバイルのブラウザ操作が合格した。
API本番events表はnative readで0件と確認。明示seedは次タスクの作業として残っている。
