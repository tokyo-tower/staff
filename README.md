# 元祖興行パッケージチケット予約ウェブアプリケーション

# Features

# Getting Started

## インフラ
基本的にnode.jsのウェブアプリケーションです。
ウェブサーバーとしては、AzureのWebAppsあるいはGCPのAppEngineを想定しており、両方で動くように開発していくことが望ましい。

## 言語
実態としては、linuxあるいはwindows上でnode.jsは動くわけですが、プログラミング言語としては、alternative javascriptのひとつであるTypeScriptを採用しています。

* TypeScript(https://www.typescriptlang.org/)

## 開発方法
npmでパッケージをインストールします。npmはnode.jsでスタンダードなパッケージ管理ツールです。パッケージ管理にとどまらず、開発やサーバー起動においても活躍します。

```shell
npm install
```
* npm(https://www.npmjs.com/)

typescriptをjavascriptにコンパイルします。wオプションでファイル変更監視できます。

```shell
npm run build -- -w
```

npmでローカルサーバーを立ち上げることができます。

```shell
npm start
```
(http://localhost:8080)にアクセスすると、ローカルでウェブアプリを確認できます。

ビルドファイルクリーン

```shell
npm run clean
```

scssビルド

```shell
npm run css
```

### Environment variables

| Name                              | Required | Value           | Purpose                               |
| --------------------------------- | -------- | --------------- | ------------------------------------- |
| `DEBUG`                           | false    | ttts-frontend:* | Debug                                 |
| `NPM_TOKEN`                       | true     |                 | NPM auth token                        |
| `NODE_ENV`                        | true     |                 | 環境名(development,test,productionなど) |
| `SENDGRID_API_KEY`                | true     |                 | GMOリンク決済からの戻り先エンドポイント             |
| `FRONTEND_GMO_RESULT_ENDPOINT`    | true     |                 | frontと連携するttts apiのエンドポイント          |
| `API_ENDPOINT`                    | true     |                 | frontと連携するttts apiのエンドポイント          |
| `API_CLIENT_ID`                   | true     |                 | APIクライアントID                           |
| `API_CLIENT_SECRET`               | true     |                 | APIクライアントシークレット                       |
| `API_AUTHORIZE_SERVER_DOMAIN`     | true     |                 | API認可サーバードメイン                       |
| `API_RESOURECE_SERVER_IDENTIFIER` | true     |                 | APIリソースサーバー識別子                     |
| `REDIS_HOST`                      | true     |                 | redis host                            |
| `REDIS_PORT`                      | true     |                 | redis port                            |
| `REDIS_KEY`                       | true     |                 | redis key                             |
| `MONGOLAB_URI`                    | true     |                 | mongodb接続URI                        |
| `GMO_ENDPOINT`                    | true     |                 | GMO apiのエンドポイント                       |
| `GMO_SHOP_ID`                     | true     |                 | GMO サイトID                             |
| `GMO_SHOP_ID`                     | true     |                 | GMO ショップID                            |
| `GMO_SHOP_PASS`                   | true     |                 | GMO ショップパスワード                         |
| `RESERVATIONS_PRINT_URL`          | true     |                 | 予約印刷URL                           |
| `TTTS_TOKEN_SECRET`               | true     |                 | TTTSトークンシークレット                        |

# tslint

コード品質チェックをtslintで行っています。lintパッケージとして以下を仕様。
* [tslint](https://github.com/palantir/tslint)
* [tslint-microsoft-contrib](https://github.com/Microsoft/tslint-microsoft-contrib)
`npm run check`でチェック実行。改修の際には、必ずチェックすること。

# test
mochaフレームワークでテスト実行。
* [mocha](https://www.npmjs.com/package/mocha)
`npm test`でテスト実行。だが、現状テストコードなし。テストコードを増やしていくことが望ましい。
