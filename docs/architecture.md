# 構成と認可

## 採用構成

participant / admin は同一originのBFFを持つ。ブラウザは別SiteのAPIへ直接書き込まない。
APIだけがDBを所有する。ローカルはNode SQLite、本番はD1。SQL・マイグレーション・ドメイン処理は共通。
各Siteの異なるIDを結合しない。投票者は `participant:<参加者SiteのID>`。
Adminは `admin:<Admin SiteのID>` の呼出しであり、APIがcallerとADMIN_SUBJECTSの両方を検証する。

Sites標準認証のedge付与ヘッダーをサーバー内だけで読む。セルフホストNodeサーバーはこのヘッダーを破棄する。
本番アダプターは AUTH_MODE=sites / NODE_ENV=production を強制する。
参加者BFFにはPARTICIPANT_KEYのみ、Admin BFFにはADMIN_KEYのみを配布し、ブラウザには出さない。
APIではキーを分離して検証する。参加者キーでadmin callerを署名しても拒否される。

署名はHMAC-SHA256。caller、subject、HTTP method、pathとquery、body SHA256、時刻、UUID nonceを覆う。
有効期間30秒、nonceはDB一意制約で一度しか使えない。期限切れnonceは後続の認証時に削除する。
Origin必須、同一origin検証、JSONのみ、SameSiteのローカルCookie、外部向けCORS許可なし。
CORSは認可の代わりではなく、APIへ直接送った管理要求も同じ認可を適用する。

管理者設定は空が既定拒否。本人限定Admin Siteへログインして `/identity` で得たそのSiteのsubjectを、
APIのSites環境変数ADMIN_SUBJECTSへ明示登録する。他SiteのID・メール・roleは代用しない。
`POST /setup/demo` は登録済み管理者の署名を要求する明示seed操作で、リクエスト時の自動seedはしない。

## 実測と限界

実装前にSitesドキュメントのID分離・サービス資格情報のidentityなしという契約を確認した。
Sitesの実HTTP疎通を実装前に検証するという順序は、starter未提供のため実施できなかった。
採用方式は実装後にローカル実HTTPで検証済み。公開環境の実測はprogress.mdに別記する。
ローカルで未認証、偽造role、一般ユーザー、参加者キー、偽署名、再利用、期限切れ、CSRFを拒否。
DB一意制約により同時30要求でも1票、DELETEは冪等。再起動後にデータ維持を確認。

## ソースと配布

GitHubのモノレポを正本とする。`package:sites` はcommit済みソースからbundleとoss/の追跡可能なソースを生成し、
外部の標準Vinext starterへ配置する。`provenance.json` に元のGitHub SHAを保存する。
Sites source remoteのSHAは配布先のcommitであり、GitHubのSHAと混同しない。
標準starterとSitesヘルパーをGitHubへ取り込まない。サイトごとに標準sites() Vite連携を維持する。
