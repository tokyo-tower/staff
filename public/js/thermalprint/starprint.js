/*  global Promise, StarWebPrintBuilder, StarWebPrintTrader */
/*!
*  スター精密社製サーマルプリンタで入場券を印刷する用モジュール (操作にはPromiseを返す。重大な処理エラーのみその場でalertを出す)
*  StarWebPRNT = http://www.star-m.jp/products/s_print/solutions/sdk/webprnt.html
*/
window.starThermalPrint = (function(StarWebPrintBuilder, StarWebPrintTrader) {
    'use strict';

    var port = /https/.test(window.location.protocol) ? 443 : 80;

    // 発行署名
    var publisher = '';

    // 印刷内容生成インスタンス
    var builder = new StarWebPrintBuilder();

    // 制御用インスタンス
    var trader = null;

    // 初期化済みフラグ
    var bool_initialized = false;

    // プリンターが使える状態かのBooleanを返す (状態ステータスは拾えないのでほぼ無意味だがEPSON版との互換性のため残置)
    var isReady = function() { return (bool_initialized) ? true : false; };

    var getErrorMsgByReceivedResponse = function(response) {
        var msg = '';
        try {
            if (!response.traderSuccess || response.traderCode !== '0') {
                msg += '印刷に失敗しました\n\n';
                msg += 'traderSuccess:' + response.traderSuccess + '\n';
                msg += 'TraderCode:' + response.traderCode + '\n';
                msg += 'TraderStatus:' + response.traderStatus + '\n';
                msg += 'Status:' + response.status + '\n';
            }
            if (trader.isOffLine({ traderStatus: response.traderStatus })) {
                msg += 'プリンターがオフラインです("isOffLine")\n';
            }
            if (trader.isNonRecoverableError({ traderStatus: response.traderStatus })) {
                msg += 'プリンターに復帰不可能エラーが発生しています("isNonRecoverableError")\n';
            }
            if (response.traderCode === '1100') {
                msg += 'プリンターまたはご利用端末が通信不能な状態です("traderCode:1100")\n';
            }
            if (response.traderCode === '2001') {
                msg += 'プリンターがビジー状態です("traderCode:2001")\n';
            }
            if (trader.isHighTemperatureStop({ traderStatus: response.traderStatus })) {
                msg += '印字ヘッドが高温のため停止しています("isHighTemperatureStop")\n';
            }
            if (trader.isAutoCutterError({ traderStatus: response.traderStatus })) {
                msg += '用紙カッターに異常が起きています("isAutoCutterError")\n';
            }
            if (trader.isBlackMarkError({ traderStatus: response.traderStatus })) {
                msg += 'ブラックマークエラー("isBlackMarkError")\n';
            }
            if (trader.isPaperEnd({ traderStatus: response.traderStatus })) {
                msg += '用紙切れです("isPaperEnd")\n';
            }
        } catch (e) {
            msg = e.message;
        }
        return msg;
    };


    // 打刻用ゼロパディング
    var zp = function(num) { return (parseInt(num, 10) < 10) ? '0' + num : num; };


    // 印刷命令組み立て
    var genRequestByReservationObj = function(reservation) {
        // 印刷命令
        var request = '';

        try {
            // 印刷に必要な情報が欠けていないか確認
            var missings = [
                'reserve_no',
                'film_name_ja',
                'film_name_en',
                'theater_name',
                'screen_name',
                'performance_day',
                'performance_start_time',
                'seat_code',
                'ticket_name',
                'ticket_sale_price',
                'qr_str'
            ].filter(function(item) {
                return (!reservation[item]);
            });
            if (missings[0]) {
                throw new Error('[!] 予約番号' + reservation.reserve_no + 'の以下の情報が見つかりませんでした\n' + missings.join('\n'));
            }

            // 念のため書式を初期化
            request += builder.createTextElement({
                codepage: 'utf8',
                international: 'japan',
                width: 1,
                height: 1,
                emphasis: false,
                undelline: false,
                data: '\n' // １行目で改行しておかないと文字が見切れる (TSP743II)
            });

            // 中央揃え開始
            request += builder.createAlignmentElement({
                position: 'center'
            });

            // 一行目
            request += builder.createTextElement({
                data: 'チケット兼領収書\n\n'
            });

            // ロゴ画像
            // request += cs_logo;

            // 案内文言
            request += builder.createTextElement({
                data: '\nこちらのQRコードを入場時リーダーにかざし、ご入場ください\n\n'
            });

            // 予約IDからQRコードを生成して配置
            request += builder.createQrCodeElement({
                model: 'model2',
                level: 'level_m',
                cell: 8,
                data: reservation.qr_str
            });

            // 中央揃え解除
            request += builder.createAlignmentElement({
                position: 'left'
            });

            // // 作品名見出し
            // request += builder.createTextElement({
            //     data: '\n作品名-TITLE-\n'
            // });

            // // 日英作品名を強調で
            // request += builder.createTextElement({
            //     emphasis: true,
            //     data: reservation.film_name_ja + '\n' + reservation.film_name_en + '\n'
            // });

            // // 強調を解除して日時見出し
            // request += builder.createTextElement({
            //     emphasis: false,
            //     data: '鑑賞日時\n'
            // });

            // // 日付と上映時刻を強調で
            // request += builder.createTextElement({
            //     emphasis: true,
            //     data: reservation.performance_day + ' ' + reservation.performance_start_time + '\n'
            // });

            // // 強調を解除して座席位置の見出し
            // request += builder.createTextElement({
            //     emphasis: false,
            //     data: '座席位置-スクリーン\n'
            // });

            // // 中央揃え開始
            // request += builder.createAlignmentElement({
            //     position: 'center'
            // });

            // // 文字サイズ2でスクリーン名
            // request += builder.createTextElement({
            //     width: 2,
            //     height: 2,
            //     data: reservation.screen_name + '\n'
            // });

            // // 文字サイズ3で座席コード
            // request += builder.createTextElement({
            //     width: 3,
            //     height: 3,
            //     data: reservation.seat_code + '\n'
            // });

            // // 中央揃え解除
            // request += builder.createAlignmentElement({
            //     position: 'left'
            // });

            // // 文字サイズを戻して劇場名見出し
            // request += builder.createTextElement({
            //     width: 1,
            //     height: 1,
            //     data: '劇場\n'
            // });

            // // 劇場名を強調で
            // request += builder.createTextElement({
            //     emphasis: true,
            //     data: reservation.theater_name + '\n'
            // });

            // // 強調解除して券種金額見出し
            // request += builder.createTextElement({
            //     emphasis: false,
            //     data: '券種・金額\n'
            // });

            // // 券種と金額を強調で
            // request += builder.createTextElement({
            //     emphasis: true,
            //     data: reservation.ticket_name + ' ' + reservation.ticket_sale_price + '\n'
            // });

            // // 強調解除して購入番号見出し
            // request += builder.createTextElement({
            //     emphasis: false,
            //     data: '\n購入番号 '
            // });

            // // 予約番号を強調で
            // request += builder.createTextElement({
            //     emphasis: true,
            //     data: reservation.reserve_no + '\n'
            // });

            // 強調解除して端末名見出し
            request += builder.createTextElement({
                emphasis: false,
                data: '端末ID '
            });

            // 発行署名を強調で
            request += builder.createTextElement({
                emphasis: true,
                data: publisher + '\n\n'
            });

            // 最後右端に印刷時刻(Y/m/d H:i:s)を入れる
            request += builder.createAlignmentElement({
                position: 'right'
            });
            var dateObj = new Date();
            var dateStr = dateObj.getFullYear() + '/' + zp(dateObj.getMonth() + 1) + '/' + zp(dateObj.getDate()) + ' ' + zp(dateObj.getHours()) + ':' + zp(dateObj.getMinutes()) + ':' + zp(dateObj.getSeconds());
            request += builder.createTextElement({
                emphasis: false,
                data: dateStr
            });

            // 紙を切断
            request += builder.createCutPaperElement({
                feed: true,
                type: 'partial' // (プリンタから落ちないように首の皮一枚残す)
            });
        } catch (e) {
            alert(e.message);
            request = null;
        }

        return request;
    };


    // 予約印刷
    var printReservationArray = function(reservations) {
        return new Promise(function(resolve, reject) {
            if (!bool_initialized) {
                return reject('プリンターが初期化されていません ( window.starThermalPrint.init() してください )');
            }
            try {
                // 念のためクリア
                trader.onReceive = function() {};
                trader.onError = function() {};

                // 予約情報の配列を印刷データに変換
                var request = '';
                reservations.forEach(function(reservation) {
                    var temp = genRequestByReservationObj(reservation);
                    if (!temp) {
                        alert('[!] 予約番号' + reservation.reserve_no + 'の印刷は印刷データ作成エラーが起きたためスキップされました');
                    } else {
                        request += temp;
                    }
                });
                if (!request) {
                    throw new Error('[!] 印刷に失敗しました');
                }

                // 印刷命令送信後のコールバックイベントでresolve/reject
                trader.onReceive = function(response) {
                    var errorMsg = getErrorMsgByReceivedResponse(response);
                    if (errorMsg) {
                        console.log('StarWebPRNT: ' + errorMsg);
                        reject(errorMsg);
                    } else {
                        console.log('StarWebPRNT: 印刷成功');
                        resolve();
                    }
                };

                // 印刷命令失敗処理 (ajax:errorの意味であって印刷のエラーで着火するものではない)
                trader.onError = function(response) {
                    var errorMsg = 'プリンターとの通信に失敗しました [' + trader.url + '] ErrorStatus:' + response.status + ' ResponseText:' + response.responseText;
                    console.log('StarWebPRNT: ' + errorMsg);
                    reject(errorMsg);
                };

                // プリンターに送信
                console.log('StarWebPRNT: 印刷命令を送信 [' + trader.url + ']');
                // console.log('trader.sendMessage()', request);
                trader.sendMessage({ request: request });
            } catch (e) {
                reject(e.message);
            }
        });
    };

    // 予約単体印刷
    var printReservation = function(reservation) { return printReservationArray([reservation]); };


    // 初期化
    var init = function(args) {
        return new Promise(function(resolve, reject) {
            if (!args || (!args.bluetooth && (!args.ipAddress || typeof args.ipAddress !== 'string'))) {
                reject('プリンターのIPアドレスが正しく指定されていません');
            }
            if (!args.publisher || typeof args.publisher !== 'string') {
                reject('発行署名が正しく指定されていません');
            }
            args.ipAddress = (args.bluetooth) ? 'localhost' : args.ipAddress;
            args.port = (args.bluetooth) ? '80' : port;
            console.log('StarWebPRNT: StarWebPrintTrader初期化中...', args);

            var url_endpoint = '//' + args.ipAddress + ':' + port + '/StarWebPRNT/SendMessage';

            var testreq = new XMLHttpRequest();
            testreq.open('GET', url_endpoint, true);
            testreq.onreadystatechange = function() {
                if (testreq.readyState !== 4 || testreq.status !== 200) {
                    reject('Bluetooth接続状況を確認してください');
                }
                // ※設定が入ったtraderオブジェクトが作られるだけでここで非同期処理は起きない
                trader = new StarWebPrintTrader({
                    url: url_endpoint,
                    papertype: 'normal',
                    blackmark_sensor: 'front_side'
                });

                // プリンター通信タイムアウトms (sendMessageしてからonReceiveイベント発生(プリンタが印刷を終えた時)までの時間)
                var timeout = parseInt(args.timeout, 10);
                trader.timeout = isNaN(timeout) ? 10000 : timeout;

                publisher = args.publisher;

                // 初期化完了とする
                bool_initialized = true;
                console.log('StarWebPRNT: StarWebPrintTrader初期化OK', trader);

                resolve();
            };
            testreq.send();
        });
    };

    return {
        init: init,
        isReady: isReady,
        builder: builder,
        trader: trader,
        printReservation: printReservation,
        printReservationArray: printReservationArray
    };
})(StarWebPrintBuilder, StarWebPrintTrader);
