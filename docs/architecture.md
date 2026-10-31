# 構成と認可

## 採用構成

participant / admin は同一originのBFFを持つ。ブラウザは別SiteのAPIへ直接書き込まない。
APIだけがDBを所有する。ローカル・自己ホスト本番はNode SQLite、Sites本番はD1。SQL・マイグレーション・ドメイン処理は共通。
各Siteの異なるIDを結合しない。投票者は `participant:<参加者SiteのID>`。
Adminは `admin:<Admin SiteのID>` の呼出しであり、APIがcallerとADMIN_SUBJECTSの両方を検証する。

Sites標準認証のedge付与ヘッダーをサーバー内だけで読む。セルフホストNodeサーバーはこのヘッダーを破棄する。
Sitesアダプターは AUTH_MODE=sites / NODE_ENV=production を強制する。
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

## 自己ホストOIDCの追加

Node用の `@eqb/auth-node` だけがopenid-clientとセッションSQLiteに依存する。Workerのimport graphには含めない。Nodeの本番入口は設定済みOIDCのみを許可し、検証済みsession principalをリクエスト単位の内部Envへ渡す。HTTPからのSites identityヘッダーは常に破棄する。画面・BFF・署名方式・API・SQLは共通。

OIDC principalはJSONのissuer/subjectペア。APIはAUTH_MODE=oidcの場合にOIDC_ADMIN_IDENTITIESの厳密なペアとAdmin callerを要求し、既存ADMIN_SUBJECTSを代用しない。投票者の保存キーは `oidc:participant:<JSONペア>` で、旧Sitesキー `participant:<subject>` と交差しない。異issuerの同subjectも別利用者となる。

サービス固有CookieとセッションDBを使い、DBをapp/issuer/client ID/public originへ束縛する。Opaqueな256bitランダムsessionをDB照合し、state/nonce/PKCE transactionは5分・一回限り。再ログイン時はsessionを更新し、ログアウトと期限切れは旧Cookieを拒否する。有効期限内のsession盗難によるbearer再送まで防ぐ方式ではない。署名付きAPI assertionの一回性とは区別する。

TLS/origin/proxy境界、複数Set-Cookie、AdminのSSO再ログインを誘発しないログアウト完了画面、DB/設定変更時の再認証方針は [自己ホスト手順](self-hosting.md)。実Provider・本番プロセス・実SQLite・信頼済みHTTPSの証拠は [OIDC結果](evidence/oidc-results.json)。
