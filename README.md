<img src="https://motionpicture.jp/images/common/logo_01.svg" alt="motionpicture" title="motionpicture" align="right" height="56" width="98"/>

# 東京タワー予約システムスタッフアプリケーション

[![CircleCI](https://circleci.com/gh/motionpicture/ttts-staff.svg?style=svg&circle-token=8f31624e75361d1fdf42392282297e393bc6c74d)](https://circleci.com/gh/motionpicture/ttts-staff)


## Table of contents

* [Usage](#usage)
* [Jsdoc](#jsdoc)
* [License](#license)

## Usage

### Environment variables

| Name                              | Required | Value        | Purpose                               |
| --------------------------------- | -------- | ------------ | ------------------------------------- |
| `DEBUG`                           | false    | ttts-staff:* | Debug                                 |
| `NPM_TOKEN`                       | true     |              | NPM auth token                        |
| `NODE_ENV`                        | true     |              | 環境名(development,test,productionなど) |
| `SENDGRID_API_KEY`                | true     |              | GMOリンク決済からの戻り先エンドポイント             |
| `API_ENDPOINT`                    | true     |              | APIエンドポイント                            |
| `API_CLIENT_ID`                   | true     |              | APIクライアントID                           |
| `API_CLIENT_SECRET`               | true     |              | APIクライアントシークレット                       |
| `API_AUTHORIZE_SERVER_DOMAIN`     | true     |              | API認可サーバードメイン                       |
| `API_RESOURECE_SERVER_IDENTIFIER` | true     |              | APIリソースサーバー識別子                     |
| `REDIS_HOST`                      | true     |              | redis host                            |
| `REDIS_PORT`                      | true     |              | redis port                            |
| `REDIS_KEY`                       | true     |              | redis key                             |
| `MONGOLAB_URI`                    | true     |              | mongodb接続URI                        |
| `RESERVATIONS_PRINT_URL`          | true     |              | 予約印刷URL                           |
| `TTTS_TOKEN_SECRET`               | true     |              | トークン検証シークレット                        |

## Jsdoc

`npm run doc` emits jsdoc to ./doc.

## License

UNLICENSED
