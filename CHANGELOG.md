# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## Unreleased

### Added

### Changed

- 販売停止ステータスのイベントに対する一般予約数の表示を、ステータス変更時点での数を反映するように調整。

### Deprecated

### Removed

### Fixed

### Security

## v4.2.3 - 2018-03-22

### Added

- 決済方法に手売りを追加。

### Fixed

- オンライン販売中止時のスタッフ向けメール内容を調整。

## v4.2.2 - 2018-03-14

### Changed

- POSの決済方法を「---」表示に変更。

### Fixed

- 予約検索で予約方法で一般を選択した際にPOSでの購入を除外する対応。

## v4.2.1 - 2018-03-05
### Added
- 販売停止一覧表示にページャーを追加。

## v4.2.0 - 2018-02-19
### Added
- 団体印刷(印字領域72mm) を追加

### Changed
- 枠の終了日時まで予約可能なように変更。

## v4.1.0 - 2018-02-14
### Changed
- 予約検索にてPOSでの注文を判別できるように対応。

### Fixed
- 予約のテキスト検索に関して、アルファベットの大文字小文字を区別しないように調整。
- staffログイン時のエラーメッセージを修正
- staff販売中止の通知の文言修正
- 販売停止一覧表示の文言修正

## v4.0.2 - 2018-02-02
### Changed
- iisのクエリ文字列の長さ制限を調整。

## v4.0.1 - 2018-01-21
### Changed
- ci設定を追加。

## v4.0.0 - 2018-01-20
### Changed
- ttts-domain@12.0.0でリリース。

## v3.0.2 - 2017-12-13
### Changed
- APIの認証情報をCognitoから取得するように変更。

## v3.0.1 - 2017-12-13
### Removed
- 不要なコードを削除。

## v3.0.0 - 2017-12-13
### Changed
- ttts-domain@12.0.0で再実装。
