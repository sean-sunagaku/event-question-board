# Event Question Board — Codex向け作業指示

やりとり、UI、運用資料は日本語。公開OSSの1つのモノレポを、Codex Cloudで実装・テスト・公開まで進める。

## 最初に読む

`README.md`、`docs/spec.md`、`docs/cloud-task.md`、`docs/progress.md`。
進捗や次の作業を更新し、完了条件ごとの実測結果を残す。

## 構成の約束

- `apps/participant`、`apps/admin`、`apps/api` は3つの独立デプロイ単位。APIだけが永続DBを所有する。
- 共有コードは `packages/` のworkspace packageから参照。Sites版だけの別実装を作らない。
- ホスティング差分は設定・薄いアダプターに限定し、同じソースとテストを使う。
- SitesのID・ホスティング用の秘密情報を持たないcloneでもローカル起動とテストが通るようにする。
- 認証・管理者権限・入力検証をUIの非表示だけで代用しない。APIで強制する。

## 実装と検証

- まず仕様の範囲で動く縦の一連の操作を実装し、観測した失敗を修正する。
- テストには権限拒否、投票の重複と同時実行、永続化、3サービスの実HTTP連携を含める。
- ブラウザで参加者とAdminの実際の操作を確認し、PC・スマートフォンの幅で画面を目視する。
- 接続不能や必要な権限がない場合は、その事実と残作業を正確に記録する。成功を推測しない。
- 秘密情報、認証Cookie、トークン、参加者の個人情報をソース・ログ・回答へ書かない。
- デモ用の偽認証・固定管理者・サンプルデータが本番で有効にならないようにする。

## Sites

利用可能なSitesスキルを読み、標準のstarter・manifest・ソース同期・保存済みversion・deploy手順を使う。
各アプリの `.openai/hosting.json` に保存済みのproject_idがあれば必ず再利用する。
新規Siteの作成結果は即時保存し、同じ用途で重複作成しない。
Sitesのソースリポジトリは配布先として扱い、公開GitHubモノレポを正本にする。
共有packagesも含む、再現可能な配布用ディレクトリを生成する。共有ソースを手作業で複製しない。
Sitesのソース書込み資格情報はセッション内で扱い、ファイルや公開Git履歴に保存しない。

## Gitと完了

実装は `codex/` ブランチで進め、必要なチェックと自己レビュー後に公開リポジトリへpushする。
ユーザーは実装・公開まで依頼済み。通常の修正・公開に改めて会話の確認を要求しない。
利用可能なGitHub接続でPR作成・マージ・公開まで進める。権限不足は正確に報告する。
受け入れ条件を満たした状態のcommit、Cloud環境・タスクURL、3つのSitesのversionとURL、検証結果を記録する。
目標を作成できる環境では、ユーザーが依頼したこの全体目標を作成し、公開の検証まで完了にしない。

## 自己ホスト本番OIDC

`docs/self-hosting.md` と追加受け入れ条件を読む。Node専用OIDCコードはWorkerの依存グラフへ入れない。
署名検証を明示有効化し、state/nonce/PKCE・issuer/audience/期限をライブラリで検証する。利用者をメールやroleで認可しない。
サービス固有Cookie・セッションDB・opaqueランダム値を分離し、APIのissuer+subject allowlistを強制する。NodeはSitesヘッダーを常に破棄する。
`npm run build && npm run typecheck && npm test && npm run test:oidc` を実行し、Sitesの既存回帰も維持する。
OIDC検証は本物の検証用Provider・3本番プロセス・実SQLite・信頼済みTLSで行う。getUserモックやTLS検証無効の結果を本番対応の証拠にしない。
テストのProvider・固定アカウント・一時CA/秘密鍵を本番配布へ入れない。既存Sites公開証拠は上書きせず、OIDCの証拠は別名で保存する。
