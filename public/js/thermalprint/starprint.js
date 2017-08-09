/*  global Promise, moment, StarWebPrintBuilder, StarWebPrintTrader */
/*!
*  スター精密社製サーマルプリンタで入場券を印刷する用モジュール (操作にはPromiseを返す。重大な処理エラーのみその場でalertを出す)
*  StarWebPRNT = http://www.star-m.jp/products/s_print/solutions/sdk/webprnt.html
*/
window.starThermalPrint = (function(d, moment, StarWebPrintBuilder, StarWebPrintTrader) {
    'use strict';

    // 印刷ボタンを連打させないための「印刷中...」モーダル
    d.body.insertAdjacentHTML('afterbegin', '<div id="modal_thermalprinting"><div><span>印刷中...</span></div></div>');

    var modal = d.getElementById('modal_thermalprinting');

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

    // 発行署名
    var publisher = '';

    // 印刷用ロゴ画像(画像ファイルをCanvasで読んでContextをStarWebPrintBuilder.createBitImageElementで変換して得た印刷データ文字列)
    var ttts_logo = '<bitimage width="240" height="76">AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKqqqqoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEREREQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKqqqqoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFFQUVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKqqqqoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEREREQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKqoqqoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFVUVVQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAKqqKqoAACgAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAABEQAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAKgAAAAoKAAAACoAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAQEAAAABAAAAAAAAAAAAAAAAAAAAAAqAAAAKgAAAAqKAAAACoAAAAAAAAAAAAAAAAAAAAAQAAAAEAAAABAAAAAAAQAAAAEAAAAAAAAAAAAAAAAqAAAAKgAAAAoKAAAAAgAAAAqAAAAAAAAAAAAAAABEAAAAAAAAAAQEAAAAAAAAAAVAAAAAAAAAACgAAAAqAAAAAAAAAAqKAAAAAAAAAAqAAAAAAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAEAAAAAAAAAACoAAAAAAAAAAAAAAAoqAAAAAAAAAAKAAAAAAAAAAFQAAAAAAAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAKoAAAAAAAAAAAAAAAqKAAAAAAAAAAAAAAAKgAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAABAAAAACgAAAAAAAAAAAKoAAoqAAKqAAAAAAAAAAAKoAAAAAAAAAAAAAAAUAVUAAQEAAVVAAAAAAAAAAAFQAAAAAAAAAAAAKoCqCqqgAqKACqqgKoAAAAAAAAKgAAAAAAAAAAAAFABUFFRABAAABFRQFAAAAAAAAAAAAAAAAAAAAAAqioCoKqqoAoiAKqqoCoCoCAAAAAAAAAAAAAAAAEAVFUBUFVVQAAAAFVFUFQFQFQAAAAAAAAAAAAAAAqAqCqCoKoKoAqqAKoKqKoKoKoAqAAAAAAAAAABABUBUBUFQVABUBAAAVQBUBQVQFQBVAAAAAAAAAAqqAqCqCqCoqgCoAoqAqgAqCoqoKoKqoAAAAAAAABVVAVBUBVFQVABUAAAAVAAVBQVQFQVVUAAAAAAAICqqgqCoAqKgqgCqAqqAqgAqCoqoKgqqqAAAAAAAQFRUQFBQAFBAVABUBAAAVAAUBAQUVBRAVAAAAAAKoKqqoqioAKqgqACoAqqAqgAqCoooqCqAqgAAAAAVUVQVQVFQAVVAVABUABAAVQBVBRUUVBUAFAAVAAKqqqgKoqqoAKqgqgKoAqqAKoCqCqoqqCqgKgCqoAVVQVABQVFUAFVAVQFQBAAAFUFUBVQVUFVUFQFVUCqqgqgCoKiqAKqAKqqoAqqAKqqqCqgqqCqqqoKqoFVUAVABUVBVAFVAFVVQAREAFVVQBVAVUFVVVQVVUCqqAqACoKgqgCqAKqqgAqqACqqoAqgqoCoqqgqqoBRUAFAAUFAUQBQABFRABAQABFRABFAUQBQAVARAACiqAqgCoKgKoCqAAqqAAKiAAKqAAqgKoCoAKgqAAABVAVAFUFQFUBUAABAAAAAAABAAABAVQBUAABUAAAAqgKoqoKgCqCoAAAAAAAAAAAAAAAAKgCqioCqAAAAVAFVVQFQAABUAAAAAAAAAAAAAAAAAAAVVVBUAAAAqgKqqgKgAACoAAAAAAAAAAAAAAAAAAAqqqCqAAAAVAFVVAAAAAFQAAAAAAAAAAAAAAAAAAAFVUBUAAAAqgCqqAAAAAKoAAAAAAAAAAAAAAAAAAAKqoCoKAAAUQARUAAAAAAAAAAAAAAAAAAAAAAAAAAAEAFQAAAAKoACoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKoqgAAFQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAAAAKoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoqgAAFQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKgAAAAAoAAAKAAAAKiIACAAAAIAAAAgAAAAAKAAAAAAAAAAQAAABAABARAQAAAAAAAAAAAQAAAAAAAAAAAAAAAAAqKAIigiggiqCCAiKCoooqKiAAAAAAAAAAAAAAAAQEBARERBAAABAABEREREQEEAAAAAAAAAAAAAAAAAgiAgKIKAAgCIiCCIgIIiIiIoAAAAAAAAAAAAAAAAQAUABEBRAAAAEAEEBAAABBAQAAAAAAAAAAAAAAAAgiKgIqoqAgCIoCCCgoIiIiIoAAAAAAAAAAAAAAAARAQAREQBAAQAQAAERERABAAEAAAAAAAAAAAAAAAAgiKAKCioAKiIICiogCoiIqIiAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA</bitimage>';

    // 印刷命令組み立て
    var genRequestByReservationObj = function(reservation) {
        // 印刷命令
        var request = '';

        try {
            // 印刷に必要な情報が欠けていないか確認
            var missings = [
                'payment_no',
                'payment_seat_index',
                'performance_day',
                'performance_start_time',
                'performance_end_time',
                'seat_code',
                'ticket_type_name',
                'ticket_type_charge'
            ].filter(function(item) {
                return (typeof reservation[item] === 'undefined');
            });
            if (missings[0]) {
                throw new Error('[!] 購入番号' + reservation.payment_no + 'の以下の情報が見つかりませんでした\n' + missings.join('\n'));
            }

            // 念のため書式を初期化
            request += builder.createTextElement({
                codepage: 'utf8',
                international: 'japan',
                width: 1,
                height: 1,
                emphasis: false,
                undelline: false,
                data: ''
            });

            // 中央揃え開始
            request += builder.createAlignmentElement({
                position: 'center'
            });

            // ロゴ画像
            request += ttts_logo;

            // 一行目
            request += builder.createTextElement({
                data: 'チケット兼領収書\n\n'
            });

            // 案内文言
            request += builder.createTextElement({
                data: 'こちらのQRコードを入場時リーダーにかざし、ご入場ください\n\n'
            });

            // QRコードを生成して配置
            request += builder.createQrCodeElement({
                model: 'model2',
                level: 'level_m',
                cell: 8,
                data: reservation.performance_day + '-' + reservation.payment_no + '-' + reservation.payment_seat_index
            });

            // 中央揃え解除
            request += builder.createAlignmentElement({
                position: 'left'
            });

            // 強調解除して購入番号見出し
            request += builder.createTextElement({
                emphasis: false,
                data: '\n購入番号-PAYMENT NUMBER-\n'
            });

            // 予約番号を強調で
            request += builder.createTextElement({
                emphasis: true,
                data: reservation.payment_no + '\n'
            });

            // 日時見出し
            request += builder.createTextElement({
                data: '\nご来塔ご予約日時-DATE-\n\n'
            });

            // 中央揃え開始
            request += builder.createAlignmentElement({
                position: 'center'
            });

            // 日付と時刻を強調で
            request += builder.createTextElement({
                emphasis: true,
                width: 2,
                height: 2,
                data:
                    moment(reservation.performance_day, 'YYYYMMDD').format('YYYY/MM/DD') + '\n' +
                    moment(reservation.performance_start_time, 'HHmm').format('HH:mm') + '-' + moment(reservation.performance_end_time, 'HHmm').format('HH:mm')
            });

            // 強調を解除して案内
            request += builder.createTextElement({
                emphasis: false,
                width: 1,
                height: 1,
                data:
                    '\n\n※混雑する場合がございますので、15分前にお越し下さい。\n' +
                    'please come 15 min before\nto avoid the crowds.\n\n'
            });

            // 中央揃え解除
            request += builder.createAlignmentElement({
                position: 'left'
            });

            // 券種金額見出し
            request += builder.createTextElement({
                data: '券種・金額-TICKET-\n'
            });

            // 券種と金額を強調で
            request += builder.createTextElement({
                emphasis: true,
                data:
                    reservation.ticket_type_name.ja + '\n' +
                    reservation.ticket_type_name.en + '\n' +
                    '￥' + reservation.ticket_type_charge + ' (' + reservation.seat_code + ')\n\n'
            });

            // 最後右端に発行者と印刷時刻を入れる
            request += builder.createAlignmentElement({
                position: 'right'
            });

            // 強調解除して端末名見出し
            request += builder.createTextElement({
                width: 1,
                height: 1,
                emphasis: false,
                data: '発行者: ' + publisher + '\n'
            });

            request += builder.createTextElement({
                emphasis: false,
                data: moment().format('YYYY/MM/DD HH:mm:ss') + '\n'
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
            // 印刷中モーダル表示
            modal.style.display = 'block';
            try {
                // 念のためクリア
                trader.onReceive = function() {};
                trader.onError = function() {};

                // 予約情報の配列を印刷データに変換
                var request = '';
                reservations.forEach(function(reservation) {
                    var temp = genRequestByReservationObj(reservation);
                    if (!temp) {
                        alert('[!] 購入番号' + reservation.payment_no + 'の印刷は印刷データ作成エラーが起きたためスキップされました');
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
                    modal.style.display = 'none';
                };

                // 印刷命令失敗処理 (ajax:errorの意味であって印刷のエラーで着火するものではない)
                trader.onError = function(response) {
                    var errorMsg = 'プリンターとの通信に失敗しました [' + trader.url + '] ErrorStatus:' + response.status + ' ResponseText:' + response.responseText;
                    console.log('StarWebPRNT: ' + errorMsg);
                    reject(errorMsg);
                    modal.style.display = 'none';
                };

                // プリンターに送信
                console.log('StarWebPRNT: 印刷命令を送信 [' + trader.url + ']');
                // console.log('trader.sendMessage()', request);
                trader.sendMessage({ request: request });
            } catch (e) {
                reject(e.message);
                modal.style.display = 'none';
            }
        });
    };

    // 予約単体印刷
    var printReservation = function(reservation) { return printReservationArray([reservation]); };


    // 初期化
    var init = function(args) {
        return new Promise(function(resolve, reject) {
            if (!args.publisher || typeof args.publisher !== 'string') {
                reject('発行署名が指定されていません');
            }
            console.log('StarWebPRNT: StarWebPrintTrader初期化中...', args);

            var printer_endpoint = '//localhost:8001/StarWebPRNT/SendMessage';

            trader = new StarWebPrintTrader({
                url: printer_endpoint,
                papertype: 'normal',
                blackmark_sensor: 'front_side'
            });
            // プリンター通信タイムアウトms (sendMessageしてからonReceiveイベント発生(プリンタが印刷を終えた時)までの時間)
            var timeout = parseInt(args.timeout, 10);
            trader.timeout = isNaN(timeout) ? 10000 : timeout;
            publisher = args.publisher;

            /*
              空の命令を送ってみて通信エラーが起きないか確認する
            */
            trader.onReceive = function() {
                // 初期化完了とする
                bool_initialized = true;
                console.log('StarWebPRNT: StarWebPrintTrader初期化OK', trader);

                resolve();
            };
            trader.onError = function() {
                reject('Bluetoothのペアリング状況を確認してください\n\n');
            };
            trader.sendMessage(
                {
                    request: '' // 何も起きない
                }
            );
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
})(window.document, window.moment, window.StarWebPrintBuilder, window.StarWebPrintTrader);
