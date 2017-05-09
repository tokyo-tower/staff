/*!
* 当日入場券をスター精密社製サーマルプリンタで印刷(要専用ブラウザ)する用モジュール
* StarWebPRNT = http://www.star-m.jp/products/s_print/solutions/sdk/webprnt.html
*/
window.tiffThermalPrint = (function (d, StarWebPrintBuilder, StarWebPrintTrader) {

    'use strict';

    //印刷ボタンを連打させないための「印刷中...」モーダル
    d.body.insertAdjacentHTML('afterbegin', '<div id="modal_thermalprinting"><div><span>印刷中...</span></div></div>');
    var modal = d.getElementById('modal_thermalprinting');


    //印刷内容生成インスタンス
    var builder = new StarWebPrintBuilder();


    //制御用インスタンス
    var trader = new StarWebPrintTrader({
        url: 'http://localhost:8001/StarWebPRNT/SendMessage',//(全ての状況でこのURLで大丈夫なのか要確認)
        papertype: 'normal',
        blackmark_sensor: 'front_side'
    });
    //印刷命令失敗時処理(trader.urlへのajax:errorの意味であって印刷のエラーで着火するものではない)
    trader.onError = function (response) {
        var msg = 'プリンターとの通信に失敗しました\n\n';
        msg += 'ErrorStatus:' + response.status + '\n';
        msg += 'ResponseText:' + response.responseText;
        alert(msg);
        modal.style.display = 'none';
    };
    //命令送信完了時処理(trader.urlへのajax:successの意味でしかないので印刷のエラーハンドリングはこの中で行う)
    trader.onReceive = function (response) {
        var msg = '';
        try {
            if (trader.isOffLine({ traderStatus: response.traderStatus })) {
                alert('プリンターがオフラインです\n"isOffLine"');
            }
            if (trader.isNonRecoverableError({ traderStatus: response.traderStatus })) {
                alert('プリンターに復帰不可能エラーが発生しています\n"isNonRecoverableError"'); //(どういう状態と対処が考えられるか要確認)
            }
            if (response.traderCode === '1100') {
                alert('プリンターまたはご利用端末が通信不能な状態です\n"traderCode:1100"');
            }
            if (response.traderCode === '2001') {
                alert('プリンターがビジー状態です\n（他の端末機器がプリンター使用中：要再送）\n"traderCode:2001"');
            }
            if (trader.isHighTemperatureStop({ traderStatus: response.traderStatus })) {
                alert('印字ヘッドが高温のため停止しています\n"isHighTemperatureStop"');
            }
            if (trader.isAutoCutterError({ traderStatus: response.traderStatus })) {
                alert('用紙カッターに異常が起きています\n"isAutoCutterError"');
            }
            if (trader.isBlackMarkError({ traderStatus: response.traderStatus })) {
                alert('ブラックマークエラー\n"isBlackMarkError"'); //(意味と対処について要確認)
            }
            if (trader.isPaperEnd({ traderStatus: response.traderStatus })) {
                alert('用紙切れです\n"isPaperEnd"');
            }
            if (trader.isPaperNearEnd({ traderStatus: response.traderStatus })) {
                alert('用紙の残りが少なくなっています\n"isPaperNearEnd"');
            }
            if (!response.traderSuccess || response.traderCode !== '0') {
                msg = '印刷に失敗しました\n\n';
                msg += 'traderSuccess:' + response.traderSuccess + '\n';
                msg += 'TraderCode:' + response.traderCode + '\n';
                msg += 'TraderStatus:' + response.traderStatus + '\n';
                msg += 'Status:' + response.status + '\n';
            } else {
                msg = '印刷に成功しました';
            }
        } catch (e) {
            msg = e.message;
        }
        alert(msg);
        modal.style.display = 'none';
    };


    //印刷用TTTSロゴ画像(画像ファイルをCanvasで読んでContextをStarWebPrintBuilder.createBitImageElementで変換して得た印刷データ文字列)
    var tiff_logo = '<bitimage width="180" height="95">AAAAAAAAAAAAAAAAAAABAAAAAAAAAAC/u7u7u7u7u7u7oADvuAqgL4oPg6KuAH/////////////AAccYEBAPBAcBBQMA/////////////+ABj4jgHA4IB4COA4B/////////////4AEHAGAcBxADwQYBwP/////////////gAA8A4A4OIAPiDgHgf////////////+AABwHgDg9AAcQcAdD/////////////4AAPgeAOD+AA7D4A8H/////////////gAAcBwA8H8ABwHAHw/////////////+AADwHgDw/4APg+APB/////////////wAAHAcAPD3gAcBwB8P/////////////gAA+A4A4OfAB4HgDgf////////////+AABwDgHgc8AHAeAcD/////////////4AAPAOAODj4AeA4BwH/////////////gAAcAcBwPDwBwBwGA/////////////+AAD4A4OA4PgPgDg4B/////////////4AAVQARAFRVBVAFEAP/////////////gAAAAAgAAAAAAAAAAf////////////8AAAAAAAAAAAAAAAAD/////////////4AAAAAAAAAAAAAAAAH/////////////gAREVNHBEAURwAEAA/////////////+ABma4qbuxjrvjI4gB/////////////4AEdBEBEZHGETMjGAP/////////////gAZ+MaPz88IzM6OIAf////////////+ABFwR0WFxRBERxYgD/////////////4AGbjCBo/PiOyLniAH/////////////AAREEdExM0YRcmfdA/////////////+AAm4w+7MyIjPiJs8B/////////////4AAAAAAAAAAAAAAAAP/////////////gAAAAAAAAAAAAAAAAf////////////+AAAAAAAAAAAAAAAAD/////////////4ACqqAKgCoAAKAACgH/////////////gAf/8AcAHgAA+AAfA/////////////+AB//wD4A+AAD8AD+B/////////////wAH//AHAB4AAPwAfwP/////////////gAP/8A+APgAA/gD/gf////////////+AB8AAB4AeAAD/AP8D/////////////4AHwAAPgD4AAP+B/4H/////////////gAfAAAcAHgAA/8H/A/////////////+AA+AAD4A+AAD/4/+B/////////////4AHwAAHAB4AAPXn3wP/////////////gAfAAA+APgAA+//Pgf////////////8AB8AABwAeAADx/x8D/////////////4AD/+APgD4AAPj/j4H/////////////gAf/8AeAHgAA8H8fA/////////////+AB//gD4A+AAD4Pg+B/////////////4AH//AHAB4AAPAcHwP/////////////gAPqoA+APgAA+DgPgf////////////+AB8AABwAeAADwAB8D/////////////4AHwAAPgD4AAPgAD4H/////////////AAfAAAcAHgAA8AAfA/////////////+AA+AAD4A+AAD4AA+B/////////////4AHwAAHgB4AAPAAHwP/////////////gAfAAA+AP//A+AAPgVVX////////1VUAB8AABwAf/8DwAB8AAAP///////+AAAAD4AAPgD//4PgAD4AAAf///////4AAAAfAAAcAH//A8AAPAAAD////////gAAAAoAACoAqqoCoAAoAAAH///////+AAAAAAAAAAAAAAAAAAAAAA////////4AAAAAAAAAAAAAAAAAAAVUB////////gVUAAAAAAAAAAAAAAAAD/4P///////+B/4AD/v/D6P+ePviA+AH/Af///////4H/gAHUccdx3x8cccFwA/+D////////g/+AA44yzjm7jhjj4OAB/wH///////+B/4ABlBBEEREEHEFAQAP/g////////4H/gAH4PgfoGA4MwuDgAf8B////////gf8AAdA2AfAQBAWHcGED/4P///////+A/4ABsDLCuDgOD4fwY4AAAf///////4AAAAGAEEQQEAQHBDBBAAAD////////gAAAA+D6x7g4DgeOuOuAAAH///////+AAAABQFVF8FQVARVRVQAAA////////4AAAAAAAAAgAAAAAAAAAAAB////////gAAAAAAAAAAAAAAAAAAD/4P///////+A/4AAAAAAAAAAAAAAAAH/Af///////4H/AAdEEVAQEHQ0FBUXA/+D////////g/+AA+c5uD4+Pj4+PjsB/wH///////+B/4ABwRnQHBxcPB4fHwP/g////////4H/gAPiOPg8PD4+Pj4fAf8B////////gf+AA0cR0DRUdBQUFx8D/4P///////+D/4ACAgCgAAAiAAIiCAFVAf///////4FVAAAAAAAAAAAAAAAAAAAD////////gAAAAAAAAAAAAAAAAAAAAAH///////+AAAAAAQABAAAAAAABAAAAA////////4AAAACD4B+P4wA4OA/jAAAB////////gAAABcdwEcfAAHBwDHAAgAP///////+AgAADzjg47oIA+PgOcgF3Af///////4H3AAHEGBjHwAAQMARwA/+D////////g/+AAc44G+7zPjg4A+OB/wH///////+B/4ABzBgFwHEUEDABQQP/g////////4H/gADOOA4sOAA4OAhygf8B////////gf8AAcQQEERwABAwHHAD/4P///////+D/4AD7jo+7nMAODiMcwH/Af///////4H/gAfHcRfFwQB8fMXAAqqAqqqqqqqqgKqAAqKiIoKCAKiogoIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==</bitimage>';


    //打刻用ゼロパディング
    var zp = function (num) { return (num < 10) ? '0' + num : num; };


    //印刷命令組み立て(参考: http://www.star-m.jp/products/s_print/sdk_webprnt/manual/_StarWebPrintBuilder-js.htm )
    var genRequestByReservationObj = function (reservation) {
        //印刷命令
        var request = '';

        try {
            //印刷に必要な情報が欠けていないか確認する
            var missings = [
                '_id',
                'payment_no',
                'film_name',
                'theater_name',
                'screen_name',
                'performance_day',
                'performance_open_time',
                'performance_start_time',
                'seat_code',
                'ticket_type_name',
                'ticket_type_detail_str',
                'qr_str'
            ].filter(function (item) {
                return (!reservation[item]);
            });
            if (missings[0]) {
                throw ({ message: '[!] 予約番号' + reservation._id + 'の以下の情報が見つかりませんでした\n' + missings.join('\n') });
            }


            //印刷時刻 (Y/m/d H:i:s)
            var dateObj = new Date();
            var dateStr = dateObj.getFullYear() + '/' + zp(dateObj.getMonth() + 1) + '/' + zp(dateObj.getDate()) + ' ' + zp(dateObj.getHours()) + ':' + zp(dateObj.getMinutes()) + ':' + zp(dateObj.getSeconds());


            //中央揃え開始
            request += builder.createAlignmentElement({
                position: 'center'
            });

            request += builder.createTextElement({
                data: 'チケット兼領収書\n\n'
            });

            //ロゴ画像
            request += tiff_logo;

            request += builder.createTextElement({
                data: '\nこちらのQRコードを入場時リーダーにかざし、ご入場ください\n\n'
            });

            //予約IDからQRコードを生成して配置
            request += builder.createQrCodeElement({
                model: 'model2',
                level: 'level_m',
                cell: 8,
                data: reservation.qr_str
            });

            //中央揃え解除
            request += builder.createAlignmentElement({
                position: 'left'
            });

            //強調を解除して日本語作品名見出し
            request += builder.createTextElement({
                emphasis: false,
                data: '\n作品名-TITLE-\n'
            });
            //日本語タイトルを強調
            request += builder.createTextElement({
                emphasis: true,
                data: reservation.film_name.ja + '\n'
            });
            //強調を解除して英語タイトル
            request += builder.createTextElement({
                emphasis: false,
                data: reservation.film_name.en + '\n\n'
            });

            request += builder.createTextElement({
                data: '日時-DATE-\n'
            });
            //日付と上映時刻を強調
            request += builder.createTextElement({
                emphasis: true,
                data: reservation.performance_day.substr(0, 4) + '/' + reservation.performance_day.substr(4, 2) + '/' + reservation.performance_day.substr(6) + '\n' +
                'OPEN:' + reservation.performance_open_time.substr(0, 2) + ':' + reservation.performance_open_time.substr(2) + '\n' +
                'START:' + reservation.performance_start_time.substr(0, 2) + ':' + reservation.performance_start_time.substr(2) + '\n'
            });

            //文字サイズを戻して座席位置の見出し
            request += builder.createTextElement({
                width: 1,
                height: 1,
                data: '座席位置-SCREEN & SEAT-\n'
            });

            //中央揃え
            request += builder.createAlignmentElement({
                position: 'center'
            });
            //文字サイズ2でスクリーン名
            request += builder.createTextElement({
                width: 2,
                height: 2,
                data: reservation.screen_name.en + '\n'
            });
            //文字サイズ3で座席コード
            request += builder.createTextElement({
                width: 3,
                height: 3,
                data: reservation.seat_code + '\n'
            });
            //中央揃え解除
            request += builder.createAlignmentElement({
                position: 'left'
            });

            //文字サイズを戻して劇場名
            request += builder.createTextElement({
                width: 1,
                height: 1,
                data: '劇場-THEATER-\n'
            });
            //日本語劇場名を強調
            request += builder.createTextElement({
                emphasis: true,
                data: reservation.theater_name.ja + '\n'
            });
            //強調を解除して英語劇場名
            request += builder.createTextElement({
                emphasis: false,
                data: reservation.theater_name.en + '\n\n'
            });


            request += builder.createTextElement({
                data: '券種・金額-TICKET/PRICE-\n'
            });
            //日本語券種・金額を強調
            request += builder.createTextElement({
                emphasis: true,
                data: reservation.ticket_type_detail_str.ja + '\n'
            });
            //強調を解除して英語券種・金額
            request += builder.createTextElement({
                emphasis: false,
                data: reservation.ticket_type_detail_str.en + '\n\n'
            });


            request += builder.createTextElement({
                data: '\n購入番号-TRANSACTION NUMBER-\n'
            });
            //予約番号を強調
            request += builder.createTextElement({
                emphasis: true,
                data: reservation.payment_no + '\n\n'
            });


            //最後右端に印刷時刻を入れる
            request += builder.createAlignmentElement({
                position: 'right'
            });
            request += builder.createTextElement({
                data: dateStr
            });

            //紙を切断
            request += builder.createCutPaperElement({
                feed: true,
                type: 'partial' //(プリンタから落ちないように首の皮一枚残す)
            });

        } catch (e) {
            alert(e.message);
            request = null;
        }

        return request;
    };


    //予約単体印刷
    var printReservation = function (reservation) {
        modal.style.display = 'block';
        try {
            //予約情報を印刷データに変換
            var request = genRequestByReservationObj(reservation);
            if (!request) {
                throw ({ message: '[!] 購入番号' + reservation.payment_no + 'の印刷データ作成に失敗しました' });
            }

            //プリンターに送信
            trader.sendMessage({ request: request });
        }
        catch (e) {
            alert(e.message);
            modal.style.display = 'none';
        }
    };


    //予約一括印刷 (予約配列をforEachして1本の長いrequestを作って送信する)
    var printReservationArray = function (reservations) {
        modal.style.display = 'block';
        try {
            //予約情報の配列を印刷データに変換
            var request = '';
            reservations.forEach(function (reservation) {
                var temp = genRequestByReservationObj(reservation);
                if (!temp) {
                    alert('[!] 購入番号' + reservation.payment_no + 'の印刷は印刷データ作成エラーが起きたためスキップされました');
                } else {
                    request += temp;
                }
            });
            if (!request) {
                throw ({ message: '[!] 印刷に失敗しました' });
            }

            //プリンターに送信
            trader.sendMessage({ request: request });
        }
        catch (e) {
            alert(e.message);
            modal.style.display = 'none';
        }
    };


    return {
        builder: builder,
        trader: trader,
        printReservation: printReservation,
        printReservationArray: printReservationArray
    };

})(document, StarWebPrintBuilder, StarWebPrintTrader);