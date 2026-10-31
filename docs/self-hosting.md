# 自己ホスト本番: OIDCと3サービス

同じAPI・BFF・UIをNodeで動かす。認証だけをNode専用の薄いアダプターへ置く。Sitesの標準認証とローカル開発ログインは残り、Node本番では `AUTH_MODE=oidc` 以外を起動時に拒否する。

## 対応方式と一次資料

2026-10-31に以下の一次資料と使用バージョンのAPIを確認した。

- [OpenID Connect Core: ID Token Validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)（[公式仕様ソース](https://github.com/openid/connect/blob/master/openid-connect-core-1_0.xml)も確認）。issuer完全一致、audience、署名、exp、nonceを検証する。
- [openid-client 6.8.8 OIDC例](https://github.com/panva/openid-client/blob/main/examples/oidc.ts)。Authorization Code Flow、S256 PKCE、expectedState/expectedNonce/idTokenExpectedを使用。
- [enableNonRepudiationChecks](https://github.com/panva/openid-client/blob/main/docs/functions/enableNonRepudiationChecks.md)。TLS経由のID Tokenでは既定で省略可能なJWS署名検証も明示的に有効化する。RS256とProviderのJWKSを使用。
- [oidc-provider 9.13.3 API](https://github.com/panva/node-oidc-provider/blob/main/docs/README.md)。これは統合テスト専用Provider。固定架空ユーザーとメモリ内Provider stateはテスト内だけに存在し、本番アプリへbundleしない。

IdPはDiscovery/JWKS・Authorization Code・RS256・S256 PKCE・`openid` scope・confidential clientを提供すること。token endpoint認証は `OIDC_TOKEN_AUTH_METHOD=client_secret_basic`（既定）または `client_secret_post`。IdPの同じメールでもissuer/subjectが違えば別人として扱う。

## ビルドと3サービス起動

Node.js 22.13以上（CIは24）、npm、SQLiteを使う。TLSはNodeで直接終端するか、同じホスト上の信頼するリバースプロキシで終端する。

```sh
npm ci
npm run build
npm run typecheck
npm test
# build後、実行専用環境では開発依存を削除可能
npm prune --omit=dev
```

`dist/node/start.mjs` にUIと共通コードをbundleする。Node本番はesbuild/tsx/oidc-providerを必要とせず、ランタイム依存はopenid-clientとその依存のみ。APIのSQL migrationファイルとpackage metadataも配置し、リポジトリrootを作業ディレクトリにする。

3つのenvファイルを別々に作成し、owner-onlyの読書き権限にする。`PARTICIPANT_KEY` と `ADMIN_KEY` は異なる32バイト以上の暗号学的乱数。APIに両方、participantには前者だけ、adminには後者だけを設定する。例の文字列を実運用のキーに使わない。

| 項目 | participant | admin | api |
| --- | --- | --- | --- |
| AUTH_MODE | oidc | oidc | oidc |
| PUBLIC_ORIGIN | https://questions.example.com | https://admin.example.com | https://api.example.com |
| PORT | 3000 | 3001 | 3002 |
| API_ORIGIN | https://api.example.com | https://api.example.com | 不要 |
| OIDC_ISSUER | https://identity.example.com/realms/events | 同じissuer | 不要 |
| OIDC_CLIENT_ID/SECRET | 参加者用client | Admin用の別client/secret | 不要 |
| SESSION_DB_PATH | /var/lib/event-question-board/participant/sessions.sqlite | /var/lib/event-question-board/admin/sessions.sqlite | 不要 |
| DB_PATH | 不要 | 不要 | /var/lib/event-question-board/api/board.sqlite |
| OIDC_ADMIN_IDENTITIES | 不要 | 不要 | issuer/subjectペアのJSON配列 |

APIのallowlistは例えば次の形式。ここにメールやroleを書かない。実際のsubjectはIdP管理画面か本人のログイン済みAdmin `/identity` で確認し、秘密の設定にのみ保存する。

```dotenv
OIDC_ADMIN_IDENTITIES=[{"issuer":"https://identity.example.com/realms/events","subject":"replace-with-exact-admin-subject"}]
```

IdPに参加者用clientのredirect URI `https://questions.example.com/auth/callback` とAdmin用clientの `https://admin.example.com/auth/callback` を完全一致で登録する。wildcard・HTTP redirectを使わない。IdPのpairwise subjectを使う場合はAdmin clientのsubjectをAPIに登録する。別clientのsubjectを同じと仮定しない。

状態保存先ディレクトリをサービスの実行ユーザーで作成する。API DBだけが質問・投票を所有する。frontendはドメインDBを開かない。セッションDBにはapp＋設定したissuer＋client ID＋public originのハッシュを保存し、別サービス・別の信頼設定での再利用をDiscovery前に拒否する。同一設定の再起動ではsessionとtransactionを保持する。

```sh
# API設定を使って明示的にmigration。既存DBにも同じコマンドを使う
node --env-file=/etc/event-question-board/api.env dist/node/db.mjs
# 3サービスは別プロセス。別のターミナルまたはsystemdを使う
node --env-file=/etc/event-question-board/api.env dist/node/start.mjs api
node --env-file=/etc/event-question-board/participant.env dist/node/start.mjs participant
node --env-file=/etc/event-question-board/admin.env dist/node/start.mjs admin
```

`.env` を作業ディレクトリに配置する場合は `npm start -- api` 等でも起動できる。サービス別に異なる環境を与える。systemdの例は [event-question-board@.service](../deploy/event-question-board@.service)。実行ユーザー/ファイル配置を用意し、`event-question-board@api`・`@participant`・`@admin` を起動する。ログはサービス名とreadyのみで、トークンやcallback URLを記録しない。

空DBはAdmin画面で「架空のイベントを準備する」を明示実行する。実イベント運用に置き換える前に架空デモで疎通を確認する。リクエスト処理でテーブル作成・自動seedはしない。

## TLS・リバースプロキシ・origin

`PUBLIC_ORIGIN` と `API_ORIGIN` は正確なHTTPS origin。callbackは固定の `/auth/callback` で、クライアント指定return URLを受けない。通常のOS信頼ストアを使い、プライベートCAの場合は `NODE_EXTRA_CA_CERTS` に正規CAファイルを指定する。TLS検証を無効化しない。

Node直接TLSの場合は `TLS_CERT_FILE` と `TLS_KEY_FILE` の両方を設定する。HTTPバックエンドの場合は `BIND_HOST=127.0.0.1` と `TRUSTED_PROXY_IPS=127.0.0.1` を指定し、信頼するproxyの送信元IPと `X-Forwarded-Proto: https` の両方を検証する。CIDR・wildcard・無条件trust proxyは対応しない。`X-Forwarded-Host` は無視し、Hostは固定PUBLIC_ORIGINと完全一致を要求する。外部からNodeのbackend portへ直接到達させない。

[Nginx例](../deploy/nginx.conf)は3つのTLS vhostから各loopback portへ転送する。証明書は3ドメインに有効なものを指定する。環境変数を設定後、次のように展開する。Nginx自身の `$host` を消さないため置換対象を限定する。

```sh
envsubst '${PARTICIPANT_DOMAIN} ${ADMIN_DOMAIN} ${API_DOMAIN} ${TLS_CERT} ${TLS_KEY}' < deploy/nginx.conf > /tmp/event-question-board.conf
sudo nginx -t -c /etc/nginx/nginx.conf
```

出力を既存Nginxのinclude先へ設置してから設定検証・reloadする。未知Host用のdefault serverは別途拒否する。アクセスログはcallback query（authorization code/state）を保存しない形式にし、`/auth/callback` はアクセスログを無効にするなど、認証情報をログへ残さない設定にする。

## セッション・ログアウト・CSRF

Cookieは `__Host-eqb_participant_session` / `__Host-eqb_admin_session`、transactionはサービス固有の `..._login`。いずれもSecure/HttpOnly/SameSite=Lax/Path=/、Domain属性なし。3サービスでCookie名・セッションDB・ランダム値を共有しない。Cookieは署名トークンではなく256bitのopaqueランダム値なので、共有するCookie署名鍵は存在しない。DBにはCookie値のSHA-256のみを保存する。state/nonce/PKCE verifierは5分の一回限りのサーバー側transactionへ保存し、callback検証前に原子的に消費する。成功時は新しいsessionを発行し、同じブラウザの旧sessionを失効する。

sessionは既定1時間、`SESSION_TTL_SECONDS` は60〜86400秒で設定可能。ただしID Tokenのexpを超えて延長しない。refresh tokenやID/access token自体は永続化しない。sessionは有効期限内に盗まれるとbearerとして再使用できるため、ログアウト前の再送が有効なことをテストで明示する。ログアウト後・期限後はDB照合で拒否する。各サービスのPOST `/auth/logout` はそのサービスだけをログアウトし、明示ログインリンクだけの `/auth/logged-out` 完了画面へ遷移する。Adminトップへ自動遷移しないため、ProviderのSSOが残っていても勝手に再ログインしない。IdPや他サービスのSSOセッションは終了しない。IdP全体のログアウトが必要ならIdP管理側の終了操作を使う。

書込みとログアウトは厳密なOrigin照合とcross-site拒否を使い、GETログアウトは405。SameSiteだけに依存しない。callbackはstate/nonce/PKCEとcookie-bound transactionで検証する。複数のSet-CookieはNodeの `getSetCookie()` で個別応答する。frontendからAPIへ渡すissuer/subjectはサーバーセッション由来だけをHMAC署名する。

APIのOIDC利用者キーは `oidc:<caller>:<JSON([issuer,subject])>`。既存Sitesは従来の `<caller>:<subject>` を維持し、保存済み票を失わない。OIDCの名前空間はSitesと交差せず、異なるissuerの同じsubjectも別人。APIのallowlistはAdmin callerとissuer/subjectの完全一致の両方を要求する。

## DB移行・再起動・バックアップ

APIは既存migration 0001をそのまま使い、OIDC追加によるドメイン表の破壊的変更はない。SitesのD1 migrationも変更しない。セッションは別SQLiteでstartup時にauth schema v1を作成する。セッションを保持する再起動ではDBファイルを消さず、同じSESSION_DB_PATHを使う。issuer/client ID/public origin/appの意図した変更時は全サービスを停止し、古いセッションDBを安全に退避して新しいSESSION_DB_PATHを指定する。旧sessions/loginsを新DBへコピーしない。ドメインDBはそのまま保持し、必要ならAPI allowlistを新issuer/subjectへ更新する。同一設定での単なる再起動は既存session/transactionを維持する。SIGTERM/SIGINTでHTTPを閉じてDBをcloseする。単一ホストのローカルディスクとSQLite WALを前提とし、共有NFSや複数ホストに同じSQLiteをマウントしない。

バックアップはサービスを停止してSQLite一式をコピーするか、SQLite online backupで整合したsnapshotを取る。API DBの既存手順はREADME参照。セッションDBはログイン能力を含むため暗号化・owner-onlyで保管する。古いセッションbackupを復元すると失効済みsessionが復活し得るため、復元時はsessions/loginsを消して全員に再ログインさせる。IdPのDBはこのOSSの責任範囲外。

## 再現可能な検証と制限

```sh
npm ci
npm run build
npm run typecheck
npm test
# Chromium、openssl、certutil（Debian/Ubuntuではlibnss3-tools）を用意
CHROMIUM_PATH=/usr/bin/chromium npm run test:oidc
```

テストは一時CAを生成し、NodeへCAファイルを渡し、ChromiumのNSS信頼ストアへ一時登録する。終了時にCA登録と一時秘密鍵を削除する。既存CAを置き換えず、ignoreHTTPSErrors・TLS無効化フラグは使わない。Providerと3本番プロセスをlocalhostのHTTPSで接続するので追加の外部ホストは不要。実IdPではそのDiscovery・authorization・token・JWKSの実ホストをネットワーク許可する。別ホストに分かれる場合は全宛先が必要。

これは検証Providerを用いた本番モード適合確認。利用者の実IdP・実ドメイン・本番secretは未提供で、その実環境でのログイン成功を主張しない。実IdPへのclient登録とTLS/DNS設定は運用者が実施する。既存Sites v2はそのまま稼働し、自己ホスト追加のために公開範囲や本番設定を変更しない。
