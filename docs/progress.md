# 進捗と公開結果

最終更新: 2026-10-31 JST。前回の3サービス公開ゴールはPR #2で完了。追加の自己ホストOIDCはPR #3で実装・Cloud/CI検証に合格し、同じ実装から既存3 Sitesをversion 3へ更新済み。追加ゴールの最終結果は末尾を参照。

## 前回公開版の履歴（version 2）

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

## 前回ゴールのGitHub反映履歴

最終証拠・受け入れ条件は [PR #2](https://github.com/sean-sunagaku/event-question-board/pull/2) でmainへ反映する。最終head commit・merge commit・CIの確定結果は同PRと [checks](https://github.com/sean-sunagaku/event-question-board/pull/2/checks) を参照。配布commit 1107a7a以降の差分は公開検証証拠・受け入れ条件・運用資料のみで、apps/・packages/・scripts/・依存定義・DB schemaは変更していない。そのため公開version 2と最終mainのアプリソースは同一で、記録追加による再公開は不要。

## 前回ゴールの検証範囲

受け入れ条件に関する追加実装・再公開は不要。PR #2のCI成功・mergeをもって全体目標の完了とする。
本番スクリーンショットと操作者原結果はCloudでハッシュ確認・目視してGitへ保存。本番バックアップの復元訓練は今回の受け入れ条件外で未検証。手順と権限の注意はREADMEに記載。

## 追加目標: 自己ホスト本番OIDC（実装・CI・Sites v3回帰合格）

本人の追加依頼を `codex/self-host-oidc` で実装。専用goal登録ツールは提供されていないため、この節とspecの追加条件で追跡する。実装/検証タスクは同じ [仕上げCloud](https://chatgpt.com/local/01a18f68-6cc3-76e0-93de-3863b5d5c086)。前回のSites v2証拠を保持する。

- Node専用OIDCアダプターと同じUI/BFF/APIを使用。Authorization Code/S256 PKCE、state/nonce、署名・issuer/audience/expをopenid-clientで検証。署名検証も明示有効化。
- Cookie名とSQLiteセッションDBはサービス別。複数Set-Cookieを個別応答。DBをapp＋issuer＋client ID＋public originへ束縛し、異設定の再利用を起動時に拒否。同一設定のsession/transactionは再起動後も保持。
- APIはissuer/subject完全一致とAdmin callerで認可。OIDCの投票者キーはSitesと交差しない名前空間。旧Sitesの票キー・D1 migrationは維持。
- ログアウトでsessionを失効し、Adminも明示ログインリンクだけの完了画面へ遷移。Provider SSOが残っていても自動再ログインしない。IdP全体のログアウトとは区別。
- 設定不備・Node本番のlocal/Sitesモード・偽Sitesヘッダー・CSRF・Host/proto/proxyの偽造を拒否。startupの設定値やcallback情報をログへ出さない。
- Node配布物は共通コードとUIをbundle。openid-client/oauth4webapi/joseだけを置いた隔離runtimeで実際に3プロセスを起動し、開発依存を要しないことを確認。

Cloudで `npm run build`、`typecheck`、既存HTTP/SQLiteとSites/HTTP proxy回帰、`test:oidc` が合格。
[OIDC結果](evidence/oidc-results.json): 本物の検証Providerと3本番プロセス・実SQLiteを信頼済みTLSのHTTPSで接続。ログイン→準備→投稿/投票/解除→Admin操作→3秒自動反映→ログアウトを検証。偽署名・異issuer/audience・期限切れ・state/nonce/PKCE不正・一般ユーザー管理・消費済callback・期限切れ/ログアウト後Cookie・旧sessionの再送を拒否。有効期限内sessionの再送がbearerとして有効なことも明記している。
TLS無効化フラグは使わず、テストCAを信頼しないNode接続が拒否されることも確認。検証用CAはNSSへ一時追加し、終了時に登録と秘密鍵を削除する。

[OIDC参加者PC](evidence/oidc-participant-1280.png)・[OIDC参加者390](evidence/oidc-participant-390.png)・[OIDC Admin PC](evidence/oidc-admin-1280.png)・[OIDC Admin390](evidence/oidc-admin-390.png)。Cloudで4枚を目視し、可読性・操作部・架空表記・状態バッジを確認。390pxでは投票/解除とAdmin強調の解除/再設定・自動反映も実行。横はみ出し/pageerrorなし。

Mac独立確認は親タスク報告。Node v26.12.1で705633aのnpm ci/build/typecheck/test成功、さらに838472bのbuild/typecheck/npm test成功。Cloudの最終OIDC HTTPS統合検証とは区別する。通常npm testへtransportを加えた最終実装commitはe506efe。
実IdPのアカウント・実ドメイン・本番secretは未提供で、その実IdPでのログイン成功は未検証。標準フローを使う再現可能な統合検証は完了。外部アカウント作成・課金・追加ホスト許可は不要。

設定・本番起動・DB移行・scope変更時の全再ログイン・backup復元時のsession破棄・systemd/Nginx・ログ保護は [自己ホスト手順](self-hosting.md)。

### 最終実装・CI・Sites version 3

最終実装commit: `e506efe06d7a6c0cc2898c7f70727297b56f2159`。
[push CI 41156198140](https://github.com/sean-sunagaku/event-question-board/actions/runs/41156198140)・[PR CI 41156201802](https://github.com/sean-sunagaku/event-question-board/actions/runs/41156201802)ともにsuccess。OIDC HTTPS・transport・既存ブラウザのすべてを含む。

| app | 現在version | Sites source SHA | deployment |
| --- | --- | --- | --- |
| api | 3 | 5bc040aba75fb1343d2b11a31635d97569524503 | appgdep_6ae54707942081919a2afd771077142e |
| participant | 3 | 303968fdb900efd361592760df040f8a717bcc11 | appgdep_6ae54727db208191912b425d46a8200b |
| admin | 3 | 5602efac5908b0e30865f95d6c7b654bd8adc0c6 | appgdep_6ae54749bac881918e9c0a8a0a4f33eb |

実URL・Site IDは上のversion 2表と同一。既存sourceを標準helperで開き、同一commitから配布→build-site→source push/archive→version保存→deployを実行し、3件ともsucceeded。
[完全なversion/deployment/archive記録](evidence/oidc-sites-release.json)と[配布79ファイル全件照合](evidence/oidc-sites-source-correspondence.json)。
API/participantはpublic、Adminはowner本人のみ。秘密値のローテーション・env更新は行わず、env revisionはAPI=3、participant=2、admin=2のまま。本人subjectも維持した。

[公開HTTP回帰](evidence/oidc-sites-http.json): API health・participant/BFF=200、未認証Admin=401。未署名/偽造role/偽造Sites identityによる管理=401、participantの準備操作=403、本番local-login=404、偽造edge identityによる投稿=401。
API更新後、既存2質問の本文・票数・回答済み・強調・時刻がすべて更新前と一致し、participant BFFからも確認した。
[version 3本人Chrome回帰](evidence/oidc-sites-browser.json)は親タスクの正規ログイン実測報告。既存架空質問2件と状態を保持。既存質問で投票1→2→解除1、回答済み/強調のfalse→trueと両badgeの自動反映、元のfalse/falseへの復帰も自動反映を確認。実寸1280px/390pxの両画面で横はみ出しなし。今回のSites v3回帰は質問を増やさず、投稿操作はOIDC本番統合と旧Sites v2証拠と区別する。
親側は新versionのJPEG4枚と操作者JSONをローカルへ保存済み（このCloudへは未添付）。Cloud側でも回帰完了後に公開APIとBFFを独立取得し、全2質問の全フィールドが公開前snapshotと一致することを再確認した。旧v2画像をv3の画像として扱わない。
Macではe506efeのnpm testがHTTP/SQLite・Sites・transportの3 suiteすべてpass。build/typecheckは同一runtimeコードの838472bでpass。

最終記録は [PR #3](https://github.com/sean-sunagaku/event-question-board/pull/3) でmainへ反映。最新head/CI/merge commitは同PRの [checks](https://github.com/sean-sunagaku/event-question-board/pull/3/checks) とmerge情報で追跡できる。配布commit e506efe以降の変更は検証証拠とdocsだけで、アプリ/依存/SQL/本番起動/テスト/CI設定に差分はない。
追加目標は最終CI成功・PR #3 mergeをもって完了。実IdPアカウントでの接続と外部ドメインへの自己ホスト実配備は未提供・未実施で、検証Providerを使った本番モード適合と明確に区別する。必須の追加実装やSites再公開は不要。
