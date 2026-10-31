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

- fresh clone相当の確認、自己レビュー、GitHub push・PR・CI確認・merge。
- 同一GitHub commitの3配布物を標準source helperで同期し、version保存・deploy。
- 本人のAdmin Site固有subjectを明示設定（未設定は拒否）、本番secret設定。
- 公開実HTTPとブラウザで全操作・認可・永続化・再deployを確認し、実URL/version/commit/PRを記録。

## GitHubと独立確認

実装commit: `7725a1ac605298fbab12ad86489e9ad86534c14a`。PR: https://github.com/sean-sunagaku/event-question-board/pull/1 。
初回3配布物はすべて同commitの共通ソースから生成。各Sites source SHAはAPI `b3b943752a3cea758ddabcd83eafece2b3ef7e29`、participant `7dc2d11caed42f2156fffe03be7734fd259f0859`、admin `f5a88d5f291daf4330c79843bcbd59863881ae5a`。
Macの独立確認（設定元タスク報告、Node v26.12.1）: npm ci/build/typecheck/test成功、監査脆弱性0。
Cloudでgit archiveから作ったfresh clone相当でもnpm ci/build/typecheck/test/DB初期化・seed成功。
push CI 41150446371はpass、PR CI 41150501646はfail。ログインボタン直後のページ再読込競合を修正し、ローカル再検証成功。新commitのCI待ち。単なるtimeout延長はしていない。
本人が正規SitesログインでAdmin /identityを確認。取得したsubjectはSitesのsecret環境変数のみへ登録し、API v1を環境revision 2で再deploy成功。subjectは公開ソースに記載しない。

自己レビューでnonce重複とDB障害を区別するよう修正。新規DBからAdmin画面の明示イベント準備と権限拒否を追加検証。
