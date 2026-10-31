# 進捗と公開結果

最終更新: 2026-10-31 JST。実装・3サービス公開・公開検証の受け入れ条件は合格。最終記録はPR #2でmainへ反映し、CI/mergeの確定状態は下記のGitHub記録で追跡できる。

## 公開版

| app | 実URL | version | Sites source SHA |
| --- | --- | --- | --- |
| participant | https://event-question-board-participant.codex-book.chatgpt.site | 2 | 8f669cd260da1efb165f9f04371d5fbe7497def6 |
| admin | https://event-question-board-admin.codex-book.chatgpt.site | 2 | 1c238dde1ad9e099f98e6d8b782e1ffbe9516d15 |
| api | https://event-question-board-api.codex-book.chatgpt.site | 2 | c9127e6087f5f286df6a22421280149f2826811b |

3配布物のGitHub source commit: [`1107a7a2e9413905e6e71c595554ed1161650bc4`](https://github.com/sean-sunagaku/event-question-board/commit/1107a7a2e9413905e6e71c595554ed1161650bc4)。
[main CI 41151504664](https://github.com/sean-sunagaku/event-question-board/actions/runs/41151504664) successを確認してから生成した。
各provenance.jsonは同commitを指し、各配布物のoss/51ファイルが同commitと全件一致する。[照合証拠](evidence/source-correspondence.json)。

| app | 既存Site ID | 保存済みversion ID | 最終成功deployment ID |
| --- | --- | --- | --- |
| participant | appgprj_6ae535826d2081919b3acb891c6967d7 | appgprj_6ae535826d2081919b3acb891c6967d7~appgver_9e56eb5916988191b0d11396e85dfd64 | appgdep_6ae53c269b688191b2ecb186779758f0 |
| admin | appgprj_6ae53592d68c81918db6c5ab89104ba3 | appgprj_6ae53592d68c81918db6c5ab89104ba3~appgver_e4e5f07fe9ec819198773155bf10b854 | appgdep_6ae53c375d5c8191917289735a1eecd9 |
| api | appgprj_6ae535205f288191ab6e2a4710871590 | appgprj_6ae535205f288191ab6e2a4710871590~appgver_760249c2920481919ae4c7d5c285d849 | appgdep_6ae53ce01bb08191a38ec4f7aadc11d7 |

[version/source/deploymentとarchive hash](evidence/published-versions.json)。API・participantはpublic。Adminはcustomでowner本人のみ、追加editor・group・external visitorなし。
既存IDと公式starterをsource helperで復元し、ソース更新→build-site→push/archive→version保存→deployを実施。新Siteや別実装は作成していない。
公式helper 1.1.2は `/workspace/tools/openai-sites-1.1.2`、OSSには含めない。
署名QA用の既存キーは読出し不可だったため、依頼済み手順で新しい暗号学的乱数をメモリ内に生成し、3サービスの必要なキーだけsecret更新。ADMIN_SUBJECTS・origin設定は維持。公開env revisionはAPI=3、participant=2、admin=2。秘密値や本人subjectは記録しない。

## CloudとGitHub

- 公開OSS: https://github.com/sean-sunagaku/event-question-board （PUBLIC、MIT）。
- 主要実装・日本語UI・テストを実施した旧Cloudタスク: https://chatgpt.com/local/01a18f54-150b-71e6-bc2e-c64200a1b081
- Cloud環境セットアップ: https://chatgpt.com/local/01a18f4e-9130-71ce-836a-c4b8924da09f
- 仕上げ・本番公開検証タスク: https://chatgpt.com/local/01a18f68-6cc3-76e0-93de-3863b5d5c086
- 仕上げインスタンス: `ccarenv_b64_Y2NhcmVudl9jMmFkYmM0ZGY3NTA4MTkxYjY2NTUwYjM2NTQwM2ZiNA`。
- 3公開ホストを含むrestricted network policyがenforced/currentであることと実HTTPS疎通を確認。全インターネット許可はOFF、package-manager presetはON。追加ホスト不要。
- [実装PR #1](https://github.com/sean-sunagaku/event-question-board/pull/1)はmainへmerge済み。旧タスクはデプロイ停止済みで、仕上げタスクのみが公開を所有。
- 旧公開version 1は7725a1a由来。ログイン競合・nonceエラー処理・明示イベント準備を修正したb4d300a、引継ぎa248410を含むmain 1107a7aへ、3公開版をそろえた。

## ローカル・CIの実測

- Cloud Node v24.19.0。fresh clone相当からnpm ci、build、typecheck、DB初期化・明示seed、3サービスの起動が成功。
- 3サービス実HTTP・SQLite、別利用者の投稿/閲覧/投票、30同時投票で1票、解除、再起動後の保持。
- 未認証・一般利用者・偽造role/ヘッダー・参加者キー・偽署名・再利用・期限切れ・CSRF拒否、管理者未設定時の既定拒否。
- 空白・長さ・型・制御文字の入力検証、HTMLをtextContentで表示。506件全件取得、人気順/新着順。
- ローカルChromiumの1280px/390pxで投稿・投票・解除・Admin操作・3秒の自動反映、横はみ出し/pageerrorなし。[ローカル画面結果](evidence/browser-results.json)と同ディレクトリのPNG。
- Macの独立確認（設定元タスク報告、Node v26.12.1）でもnpm ci/build/typecheck/test成功、監査脆弱性0。
- この仕上げCloudでも同じmain commitでnpm ci/build/typecheck/test合格。公開CIはローカル偽認証を使い、本番secretを要求しない。

## 公開環境の実測

[公開HTTP証拠](evidence/live-http.json): API /health=200、participant /=200、未認証Admin /=401、未認証APIイベント準備=401、participant BFF経由のイベント準備=403。
未準備時の一覧404を確認した後、本人ChromeのAdmin画面から明示的に架空イベントを準備。一覧は200へ移行した。閲覧要求による自動seedはない。

[署名付きAPI結果](evidence/live-api.json): 投稿201、空白400、30同時投票がすべて200かつ合計1票、解除で0票、再投票で1票。未認証投稿/管理/偽造roleは401、参加者サービス資格情報と管理者でないsubjectは403。
[署名再利用検証](evidence/live-replay.json): 初回200、同一署名の再送401、assertion改ざん401。秘密stdinを使用し、署名・キー・本人subjectは保存していない。

[本番ブラウザ結果](evidence/live-browser.json)は、依頼元タスクがログイン済みChromeで実施した結果の転記。Cloudが直接ブラウザ操作したものではない。
本人Adminで準備→正規participantから架空と明示した質問を投稿→投票1→解除0→Adminで回答済み/強調→participantの手動再読込なしの両バッジ反映が成功。
実寸innerWidth=1280/390の両画面で横はみ出しなし。390pxでも投票/解除、回答済みと強調の解除/再設定、自動反映が成功。
本番証拠zipのSHA-256 `9b5ebc3f3ae278a8f3c05330430b147a63f81fc05dbd10e4fe10a75c661f36d5` をCloudで照合し、JPEG4枚と[操作者の原結果JSON](evidence/published-browser-results.json)を保存。Cloudでも4枚を目視し、日本語の可読性・架空表記・状態バッジ・モバイル操作部の収まりを確認。秘密値の表示なし。
[参加者1280](evidence/published-participant-1280.jpg)・[参加者390](evidence/published-participant-390.jpg)・[Admin1280](evidence/published-admin-1280.jpg)・[Admin390](evidence/published-admin-390.jpg)。既存PNGはローカル証拠、本番証拠はこのJPEGとJSON。

[永続化証拠](evidence/live-persistence.json): 3サービスを同version 2で再deployし、API QAの質問と1票を保持。本人の画面検証完了後に最終状態をsnapshotし、APIをもう一度再deploy。公開APIとparticipant BFFの両方で、架空の質問2件の全フィールドがsnapshotと一致した。
本人質問は回答済み=1・強調=1・票=0、API QA質問は票=1。テーブル/イベントを上書きしていない。

## GitHub最終反映

最終証拠・受け入れ条件は [PR #2](https://github.com/sean-sunagaku/event-question-board/pull/2) でmainへ反映する。最終head commit・merge commit・CIの確定結果は同PRと [checks](https://github.com/sean-sunagaku/event-question-board/pull/2/checks) を参照。配布commit 1107a7a以降の差分は公開検証証拠・受け入れ条件・運用資料のみで、apps/・packages/・scripts/・依存定義・DB schemaは変更していない。そのため公開version 2と最終mainのアプリソースは同一で、記録追加による再公開は不要。

## 残作業と検証範囲

受け入れ条件に関する追加実装・再公開は不要。PR #2のCI成功・mergeをもって全体目標の完了とする。
本番スクリーンショットと操作者原結果はCloudでハッシュ確認・目視してGitへ保存。本番バックアップの復元訓練は今回の受け入れ条件外で未検証。手順と権限の注意はREADMEに記載。
