# ひろば — Event Question Board

質問を公開し、みんなで投票し、進行役が回答済み・強調を操作する日本語OSSです。
参加者・管理画面・共通APIの3サービスを1つのモノレポで管理します。
実測結果と公開状況は [docs/progress.md](docs/progress.md)、仕様は [docs/spec.md](docs/spec.md)。
サンプルは架空のイベント専用です。個人情報や実際の参加者の回答を持ち込まないでください。

## ローカル起動

Node.js 22.13以上（CIは24）、npm。Sitesアカウント・ID・秘密情報は不要です。

```sh
npm ci
npm run build
npm run typecheck
npm run db:init
npm run db:seed
npm run dev
```

- 参加者: http://127.0.0.1:3000
- Admin: http://127.0.0.1:3001
- API: http://127.0.0.1:3002

ローカル専用の参加者A/B/管理者ボタンで切替できます。Adminへ最初に入るときは参加者画面で「管理者」を選んでから開きます。
これはループバックの開発モード限定です。本番bundleはSites認証とproductionを強制し、偽認証を有効にできません。
開発用キーは起動時に暗号学的乱数で生成し、メモリ内だけで共有します。
個別起動は各workspaceの `npm run start`。独立プロセス間のキー・API_ORIGIN等は `.env.example` を参照し、環境変数として渡します。
標準のNodeサーバーはループバックにbindし、Sitesの認証ヘッダーを破棄します。セルフホスト本番公開時は信頼する認証アダプターの追加が必要です。

```sh
npm test             # 3サービス実HTTP、実SQLite、同時実行、認可、再起動、506件一覧
npm run test:e2e     # 同じHTTP統合テストを明示実行
# npm run dev 起動中に実行。Chromiumを事前に用意
CHROMIUM_PATH=/usr/bin/chromium node tests/browser.mjs
npm run build --workspace @eqb/participant
npm run build --workspace @eqb/admin
npm run build --workspace @eqb/api
```

テストは自動生成した一時DBを削除し、本番の認証情報を要求しません。
`npm run build` はクライアントの生成コードを無視対象のwork/に生成します。typecheck前に一度実行してください。
起動に失敗したらDB初期化とseed、ポート3000〜3002の重複、API_ORIGINを確認します。
画面の通信エラーは再試行ボタンで復帰できます。POST失敗時は入力を残します。

## 構成

`apps/participant`、`apps/admin`、`apps/api` は独立したbuild/start/manifestを持ちます。
`packages/contracts` がAPI契約・検証、`packages/core` が署名認証・BFF、`packages/ui` が日本語UIです。
APIのみが永続DBを所有し、全質問は未認証でも公開、書込みは認証必須。
投票はDBの複合主キーで1人1票。3秒間隔で管理結果を自動反映し、回答済みでも公開を維持します。
一覧は全件を返し、500件で切り捨てません。非常に大規模なイベント向けのページ分割は今後の拡張です。
認可・CSRF・署名方式と実測の範囲は [docs/architecture.md](docs/architecture.md)。

## Sitesへの配布

GitHubが正本です。標準Sitesプラグインのヘルパーは外部ツールとして使用し、このOSSには同梱しません。
既存IDは `apps/*/.openai/hosting.json` に保存し、再登録しません。

1. 既存Siteはget_siteとsource credentialを取得し、公式source helperでソースを開く。返されたcheckoutを再利用する。初回だけ、各Site用のリポジトリ外の空ディレクトリで公式 `project-setup.mjs` を実行。
2. 変更を `codex/` ブランチでcommitし、GitHubへpush。
3. 各appに `npm run package:sites -- api /absolute/prepared-starter` 等を実行。共有コードからbundleと元commitのoss/を生成。
4. 公式 `install-dependencies.mjs`、APIの `npm run db:generate` を実行。SQLとメタデータは `apps/api/drizzle` の正本と一致することを確認。
5. 公式 `site-workflow.mjs` へcredentialをstdinで渡し、`build-site.mjs` をcommandsに指定してソースpushとarchive生成。
6. 返却されたSites source SHAとarchiveでnative save-version、保存済みversionをdeploy。GitHub SHAはprovenance.jsonで照合。
7. 公開実HTTPとブラウザで検証し、progress.mdに実URL・version・両方のSHAを記録。

APIとparticipantはpublic、Adminは本人限定です。Sites間でID・Cookieを共有しません。
APIへPARTICIPANT_KEYとADMIN_KEYを別々のsecretで設定。参加者には前者、Adminには後者だけを渡します。
両BFFにAPI_ORIGIN、自身のPUBLIC_ORIGIN、AUTH_MODE=sitesを設定します。
Adminの `/identity` に本人がログインして得たSite固有subjectを、APIのADMIN_SUBJECTSへ登録して再deploy。
空設定は管理操作を拒否します。メール・role・他SiteのIDは管理者登録に使いません。
イベントseedは初回のAdmin画面で「架空のイベントを準備する」を押して明示実行します。BFFが署名付き `POST /setup/demo` へ中継し、APIで登録済み管理者を検証します。
閲覧要求でテーブル作成やseedを実行しません。D1 schema migrationはSites公開時の標準処理に任せます。

## DBのバックアップ・復元

ローカル停止中に `work/board.sqlite` を退避するか、Nodeの `node:sqlite` のbackup APIを使用してください。
WAL稼働中のDBファイルだけのコピーは避けます。復元は停止状態でバックアップをDB_PATHへ配置し、`db:init`でmigrationを確認します。
本番D1はCloudflareの管理権限を持つ運用者が `wrangler d1 export <database> --remote --output backup.sql` を使います。
復元は新しいD1にSQLをimportし、整合性と票数を確認してからbindingを切替えます。
このタスクではバックアップを実際に復元する本番操作は未検証です。Sitesがその管理権限を提供しない場合は運用サポートが必要です。

MITライセンス。仕様・受け入れ条件は [docs/spec.md](docs/spec.md)、エージェント指示は [AGENTS.md](AGENTS.md)。
