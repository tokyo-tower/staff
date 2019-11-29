# 東京タワー予約システムスタッフアプリケーション

[![CircleCI](https://circleci.com/gh/motionpicture/ttts-staff.svg?style=svg&circle-token=8f31624e75361d1fdf42392282297e393bc6c74d)](https://circleci.com/gh/motionpicture/ttts-staff)


## Table of contents

* [Usage](#usage)
* [License](#license)

## Usage

### Environment variables

| Name                              | Required | Value        | Purpose                                 |
| --------------------------------- | -------- | ------------ | --------------------------------------- |
| `DEBUG`                           | false    | ttts-staff:* | Debug                                   |
| `NODE_ENV`                        | true     |              | 環境名(development,test,productionなど) |
| `API_ENDPOINT`                    | true     |              | APIエンドポイント                       |
| `API_CLIENT_ID`                   | true     |              | APIクライアントID                       |
| `API_CLIENT_SECRET`               | true     |              | APIクライアントシークレット             |
| `API_CLIENT_ID_OLD`               | true     |              |                                         |
| `API_AUTHORIZE_SERVER_DOMAIN`     | true     |              | API認可サーバードメイン                 |
| `API_RESOURECE_SERVER_IDENTIFIER` | true     |              | APIリソースサーバー識別子               |
| `REDIS_HOST`                      | true     |              | redis host                              |
| `REDIS_PORT`                      | true     |              | redis port                              |
| `REDIS_KEY`                       | true     |              | redis key                               |
| `RESERVATIONS_PRINT_URL`          | true     |              | 予約印刷URL                             |
| `TTTS_TOKEN_SECRET`               | true     |              | トークン検証シークレット                |
| `POS_CLIENT_ID`                   | true     |              | POSアプリケーションクライアントID       |
| `FRONTEND_CLIENT_ID`              | true     |              | frontendアプリケーションクライアントID  |

## License

UNLICENSED
