# 進捗と公開結果

最終更新: 2026-10-31 JST。目標は未完了。

## 全体目標

公開GitHubの同一commitからparticipant・admin・apiの3つのSitesを公開し、実環境の投稿・投票・管理・権限拒否・更新反映・永続化を実測する。
専用goal登録ツールはこのチャットに提供されていないため、ここに目標を記録する。

## Cloud

接続済み環境: `ccarenv_b64_Y2NhcmVudl9kMTk3YWVhOGRjZDA4MTkxYTY0MzJjYmIzZTc3OTRlMg`。
Cloud上の `/workspace/event-question-board` で主要実装・日本語UI・テストを実施。
タスクURLは実行コンテキストから取得できていないため未記録。推測URLは書かない。
環境が公開され別タスクを作成可能かは未検証。

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

## Sites登録（まだ公開ではない）

| app | ID | 実公開URL | version |
| --- | --- | --- | --- |
| participant | appgprj_6ae535826d2081919b3acb891c6967d7 | 未公開 | なし |
| admin | appgprj_6ae53592d68c81918db6c5ab89104ba3 | 未公開 | なし |
| api | appgprj_6ae535205f288191ab6e2a4710871590 | 未公開 | なし |

SitesとGitHubのnativeツールは有効。初期Cloudに公式ヘルパーがなかったが、ユーザー提供の公式1.1.2アーカイブをSHA256検証してリポジトリ外に展開した。
SHA256: `8a310d3eb51f0424d6b367ef3e99b2d39b9873eee8c79e3b2e3e12a14f9927ba`。
標準Vinext starterを各Siteに準備。APIで標準Drizzleのschema生成を実行。helpersや資格情報をOSSに取り込まない。

## 残作業

- fresh clone相当の確認、自己レビュー、GitHub push・PR・CI確認・merge。
- 同一GitHub commitの3配布物を標準source helperで同期し、version保存・deploy。
- 本人のAdmin Site固有subjectを明示設定（未設定は拒否）、本番secret設定。
- 公開実HTTPとブラウザで全操作・認可・永続化・再deployを確認し、実URL/version/commit/PRを記録。
