/* global moment */
$(function () {
    /* トップデッキゲートの通過時間を枠の終了時刻＋何分後までにするか */
    var EXTENDMIN_TOPDECK_AUTH = 5;

    /* チェックインに入れる情報 */
    var checkPointGroup = document.getElementById('input_pointgroup').value;
    var checkUserName = document.getElementById('input_username').value;
    if (!checkPointGroup || !checkUserName) {
        alert('ログインしたIDに紐付いたチェックポイント情報が読み取れませんでした。ログイン情報を確認してください。');
        return window.location.replace('/checkin/logout');
    }

    /* 通過判定分岐用 */
    // var is_DAITEN_AUTH = (checkPointGroup === 'DAITEN_AUTH');
    var is_TOPDECK_AUTH = (checkPointGroup === 'TOPDECK_AUTH'); // ＝トップデッキゲート

    /* 取得済み予約キャッシュ */
    var reservationsById = {};
    var reservationIdsByQrStr = {};

    /* チェックインAPI送信キュー */
    var enteringReservationsByQrStr = {};
    var enteringReservationQrStrArray = [];

    /* キャンセルAPI送信キュー */
    var cancelingCheckinReservationsByQrStr = {};
    var cancelingCheckinReservationQrStrArray = [];

    /* 表示中の予約 */
    var currentReservation = {};

    /* チェックイン時効果音 */
    var audioYes = new Audio('/audio/yes01.mp3');
    audioYes.load();
    // チェックインNG時汎用
    var audioNo = new Audio('/audio/no01.mp3');
    audioNo.load();
    // 多重チェックイン時用
    var audioNo_reentry = new Audio('/audio/no_reentry.mp3');
    audioNo_reentry.load();
    // ※iOSの制約のため非同期イベントでAudioを再生するには一度ユーザーイベントからAudioを再生しておく必要がある (一度でも再生すれば以降は自由に再生できる)
    // 運用マニュアルに「ログイン後に一回時計をタップして音声を初期化する」を追加？
    $('.timecontainer').one('click', function () {
        audioYes.volume = 0.0;
        audioYes.play();
        audioNo.volume = 0.0;
        audioNo.play();
        audioNo_reentry.volume = 0.0;
        audioNo_reentry.play();
    });

    var $body = $(document.body);

    // API通信状況表示用DOM
    var $apistatus_checkin = $('#apistatus_checkin');
    var $apistatus_delete = $('#apistatus_delete');

    // チェックイン取り消しボタンDOM
    var btn_delete = document.getElementById('btn_delete');

    /**
     * チェックイン結果を描画する
     * @function renderResult
     * @param {Object} reservation
     * @returns {void}
     */
    var $qrdetail = $('#qrdetail');
    var $checkinlogtablebody = $('#checkinlogtable').find('tbody');
    var renderResult = function (reservation) {
        // 状態初期化
        $body.removeClass('is-ng-currentcheckin');
        audioNo.pause();
        audioNo.currentTime = 0.0;
        audioNo.volume = 1.0;
        audioNo_reentry.pause();
        audioNo_reentry.currentTime = 0.0;
        audioNo_reentry.volume = 1.0;
        audioYes.pause();
        audioYes.currentTime = 0.0;
        audioYes.volume = 1.0;
        // 「本日」を表示するための比較用文字列
        var ddmm_today = moment().format('MM/DD');
        // チケットの入塔日文字列
        var ddmm_ticket = moment(reservation.reservationFor.startDate).format('MM/DD');
        ddmm_ticket = (ddmm_today === ddmm_ticket) ? '本日' : ddmm_ticket;
        // ユーザーグループごとのカウントを入れるオブジェクト
        var countByCheckinGroup = {};

        // チェックイン履歴HTML配列 (多重チェックインの行のみNG=赤色にする。過去チェックインの時刻は判定しない)
        var checkinLogHtmlArray = reservation.checkins.map(function (checkin) {
            if (!checkin || !checkin.when) { return true; }
            // チェックイン実行日
            var ddmm = moment(checkin.when).format('MM/DD');
            ddmm = (ddmm_today === ddmm) ? '本日' : ddmm;
            // NGフラグ
            var is_ng = false;
            // グループごとのチェックインをカウント
            if (isNaN(countByCheckinGroup[checkin.where])) {
                countByCheckinGroup[checkin.where] = 1;
                // グループカウント済み ＝ 多重チェックイン ＝ NG
            } else {
                is_ng = true;
                countByCheckinGroup[checkin.where]++;
            }
            return (
                '<tr class="' + ((is_ng) ? 'tr-ng' : '') + '">' +
                '<td class="td-day">' + ddmm + '</td>' +
                '<td class="td-time">' + moment(checkin.when).format('HH:mm') + '</td>' +
                '<td class="td-where"><span>' + checkin.how + '</span></td>' +
                '<td class="td-count">' + countByCheckinGroup[checkin.where] + '</td>' +
                '</tr>'
            );
        });
        // チェックインログを降順で表示
        $checkinlogtablebody.html(checkinLogHtmlArray.reverse().join('')).show();

        // 今実行されたチェックイン(checkinsの最新)
        var currentCheckin = reservation.checkins[reservation.checkins.length - 1];

        // 判定されたエラー
        var errmsg = [];
        var errflg_reentry = false; // 多重チェックイン

        // 予約パフォーマンスの時間枠
        var moment_start = moment(reservation.reservationFor.startDate);
        var moment_end = moment(reservation.reservationFor.endDate);
        // トップデッキゲートでは予約時間枠の EXTENDMIN_TOPDECK_AUTH 分後までなら通過OKとする
        if (is_TOPDECK_AUTH) {
            moment_end.add(EXTENDMIN_TOPDECK_AUTH, 'm');
        }

        // checkinのwhen(タイムスタンプ)がパフォーマンスの時間枠外だったらNG
        if (!moment(currentCheckin.when).isBetween(moment_start, moment_end)) {
            errmsg.push('入塔時間外');
        }
        // 同一グループでのチェックインが重複してたらNG
        if (countByCheckinGroup[currentCheckin.where] > 1) {
            errmsg.push('多重チェックイン');
            errflg_reentry = true;
        }

        if (errmsg.length) {
            $body.addClass('is-ng-currentcheckin'); // チェックイン履歴の一番上が赤くなる
            if (errflg_reentry) { // 多重チェックイン発生時は専用NG音を優先
                audioNo_reentry.play();
            } else {
                audioNo.play();
            }
        } else {
            audioYes.play();
        }
        // 券種名で色分け
        var ticketName = reservation.reservedTicket.ticketType.name;
        var ticketClassName = 'qrdetail-ticket';
        if (/大人/.test(ticketName)) {
            ticketClassName += ' ticket-adult';
        }
        if (/小・中学生/.test(ticketName)) {
            ticketClassName += ' ticket-child';
        }
        if (/幼児/.test(ticketName)) {
            ticketClassName += ' ticket-infant';
        }
        if (/セット/.test(ticketName)) {
            ticketClassName += ' ticket-set';
        }
        if (/車椅子/.test(ticketName)) {
            ticketClassName += ' ticket-wheelchair';
        }
        // 今実行されたチェックインの予約情報を表示 (エラーだった場合はエラー原因も出す)
        $qrdetail.html(
            '<div class="qrdetail-date">' +
            '<p class="inner">' +
            '<span class="day">' + ddmm_ticket + '</span>' +
            '<span class="time">' + moment(reservation.reservationFor.startDate).format('HH:mm') + '～' + moment(reservation.reservationFor.endDate).format('HH:mm') + '</span>' +
            '<span class="msg">' + errmsg.join('<br>') + '</span>' +
            '</p>' +
            '</div>' +
            '<div class="' + ticketClassName + '"><p class="inner">' + ticketName + '<br>' + reservation.reservedTicket.ticketedSeat.seatNumber + '</div>'
        );
    };


    /**
     * QRコードから予約オブジェクトを返す。キャッシュに無かったらAPIから取得を試みる。
     * @function getReservationByQrStr
     * @param {string} qrStr
     * @returns {Deferred}
     */
    var getReservationByQrStr = function (qrStr) {
        var $dfd = $.Deferred();
        if (!qrStr) {
            $dfd.reject('QRコードが読み取れません' + qrStr);
            // 入場処理中だったらそれを返す
        } else if (enteringReservationsByQrStr[qrStr]) {
            $dfd.resolve(enteringReservationsByQrStr[qrStr]);
            // キャッシュから返す
        } else if (reservationIdsByQrStr[qrStr]) {
            $dfd.resolve(reservationsById[reservationIdsByQrStr[qrStr]]);
            // どこにも無いのでAPIに聞く
        } else {
            $.ajax({
                url: '/checkin/reservation/' + qrStr,
                timeout: 15000
            }).done(function (data) {
                $dfd.resolve(data);
            }).fail(function (jqxhr, textStatus, error) {
                if (jqxhr.status === 404) {
                    $dfd.reject('存在しない予約データです。予約管理より確認してください。');
                } else {
                    console.log(jqxhr, textStatus, error);
                    $dfd.reject('通信エラー発生', textStatus);
                }
            });
        }
        return $dfd.promise();
    };


    /**
     * チェックインをAPIに報告する(enteringReservationQrStrArrayの先頭から消化していく)
     * @function syncCheckinWithApi
     * @returns {void}
     */
    var busy_syncCheckinWithApi = false;
    var timeout_syncCheckinWithApi = null;
    var syncCheckinWithApi = function () {
        if (busy_syncCheckinWithApi) { return false; }
        busy_syncCheckinWithApi = true;
        var targetQr = enteringReservationQrStrArray[0];
        var enteringReservation = enteringReservationsByQrStr[targetQr];
        // キューに無いので再帰
        if (!targetQr || !enteringReservation || !enteringReservation.checkins) {
            clearTimeout(timeout_syncCheckinWithApi);
            timeout_syncCheckinWithApi = setTimeout(function () {
                busy_syncCheckinWithApi = false;
                syncCheckinWithApi();
            }, 2000);
            return false;
        }
        $.ajax({
            dataType: 'json',
            url: '/checkin/reservation/' + targetQr,
            type: 'POST',
            cache: false,
            timeout: 15000,
            data: enteringReservation.checkins[enteringReservation.checkins.length - 1]
        }).done(function () {
            // とりあえずこの予約QRの順番は一旦終了
            enteringReservationQrStrArray.splice(enteringReservationQrStrArray.indexOf(targetQr), 1);
            // 成功したのでそのままキューから削除
            delete enteringReservationsByQrStr[targetQr];
        }).fail(function (jqxhr, textStatus, error) {
            if (jqxhr.status === 404) {
                console.log('QRコードに該当する予約が存在しない = ' + targetQr);
            } else {
                console.log(jqxhr, textStatus, error);
                $apistatus_checkin.html('[' + moment().format('HH:mm:ss') + '] チェックインAPI通信エラー発生中');
                // エラーメッセージ表示
                // alert(jqxhr.responseJSON.errors[0].detail);
            }
            // 予約の状態の問題かもしれない失敗が起きたのでとりあえず後回しにする
            enteringReservationQrStrArray.splice(enteringReservationQrStrArray.indexOf(targetQr), 1);
            enteringReservationQrStrArray.push(targetQr);
        }).always(function () {
            $apistatus_checkin.html('チェックイン通信中: ' + enteringReservationQrStrArray.length + '件');
            clearTimeout(timeout_syncCheckinWithApi);
            timeout_syncCheckinWithApi = setTimeout(function () {
                busy_syncCheckinWithApi = false;
                syncCheckinWithApi();
            }, 2000);
        });
    };


    /**
     * QRコードをチェックする
     * @function check
     * @param {strnig} qrStr
     * @returns {void}
     */
    var busy_check = false;
    var check = function (qrStr) {
        if (enteringReservationsByQrStr[qrStr]) {
            return alert('[連続操作エラー] 先ほど実行したチェックインの内部処理がまだ完了していません');
        }
        busy_check = true;
        getReservationByQrStr(qrStr).done(function (reservation) {
            // var unixTimestamp = (new Date()).toISOString();
            reservation.checkins.push({
                when: (new Date()).toISOString(),
                where: checkPointGroup,
                why: '',
                how: checkUserName
            });
            renderResult(reservation);
            // getReservationsに予約を上書きされて↑のcheckinが消されないようにキューにはコピーを入れる
            enteringReservationsByQrStr[reservation.id] = $.extend(true, {}, reservation);
            enteringReservationQrStrArray.push(reservation.id);
            // 取り消しに使うためにコピーする
            currentReservation = $.extend(true, {}, reservation);
            btn_delete.style.display = 'table';
        }).fail(function (errMsg) {
            audioNo.play(); // QRコードが異常 || 通信エラー
            alert(errMsg);
            $qrdetail.html('次のQRを読み取ってください');
        }).always(function () {
            $apistatus_checkin.html('チェックイン通信中: ' + enteringReservationQrStrArray.length + '件');
            busy_check = false;
        });
    };


    /**
     * 表示中予約の最新チェックインの取り消しを実行する(処理キューに入ってないか確認の上で取り消しキューに入れる)
     * @function deleteNewestCheckin
     * @returns {void}
     */
    var deleteNewestCheckin = function () {
        var targetQr = currentReservation.id;
        if (!targetQr) { return false; }
        if (cancelingCheckinReservationsByQrStr[targetQr]) {
            return alert('[連続操作エラー] 先ほど実行した取り消しの内部処理がまだ完了していません');
        }
        var targetCheckin = currentReservation.checkins[currentReservation.checkins.length - 1];
        // 対象のチェックイン履歴(一番上)を青くして強調する
        var $targetCheckinRow = $checkinlogtablebody.find('tr:first').css('background-color', 'blue');
        // CSS反映のためrelayoutさせる
        setTimeout(function () {
            if (!targetCheckin || !confirm('以下のチェックインを取り消してよろしいですか？\n' + moment(targetCheckin.when).format('MM/DD HH:mm') + ' ' + targetCheckin.how)) {
                $targetCheckinRow.css('background-color', '');
                return false;
            }
            // API送信前でまだこの画面上にしか存在しないチェックインだった場合その場で消す
            if (enteringReservationsByQrStr[targetQr]) {
                delete enteringReservationsByQrStr[targetQr];
                enteringReservationQrStrArray.splice(enteringReservationQrStrArray.indexOf(targetQr), 1);
            } else {
                cancelingCheckinReservationQrStrArray.push(targetQr);
                cancelingCheckinReservationsByQrStr[targetQr] = $.extend(true, {}, currentReservation);
            }
            // 画面上では取り消したことにする
            currentReservation.checkins.pop();
            $targetCheckinRow.remove();
            $body.removeClass('is-ng-currentcheckin');

            // 取り消すチェックインが無くなったので取り消しボタンを隠す
            if (!currentReservation.checkins.length) {
                btn_delete.style.display = 'none';
                $qrdetail.html('QRコードを読み取ってください');
            } else {
                $qrdetail.find('.qrdetail-date').remove();
            }

            $apistatus_delete.html('チェックイン取り消し通信中: ' + cancelingCheckinReservationQrStrArray.length + '件');
        }, 0);
    };


    /**
     * 対象予約の最新チェックインの取り消しをAPIに要求する(cancelingCheckinReservationQrStrArrayの先頭から消化していく)
     * @function syncDeleteCheckinWithApi
     * @returns {void}
     */
    var busy_syncDeleteCheckinWithApi = false;
    var timeout_syncDeleteCheckinWithApi = null;
    var syncDeleteCheckinWithApi = function () {
        if (busy_syncDeleteCheckinWithApi) { return false; }
        busy_syncDeleteCheckinWithApi = true;
        var targetQr = cancelingCheckinReservationQrStrArray[0];
        var cancelingCheckinReservation = cancelingCheckinReservationsByQrStr[targetQr];
        // キューに無いので再帰
        if (!targetQr || !cancelingCheckinReservation || !cancelingCheckinReservation.checkins) {
            clearTimeout(timeout_syncDeleteCheckinWithApi);
            timeout_syncDeleteCheckinWithApi = setTimeout(function () {
                busy_syncDeleteCheckinWithApi = false;
                syncDeleteCheckinWithApi();
            }, 2000);
            return false;
        }
        var targetCheckin = cancelingCheckinReservation.checkins[cancelingCheckinReservation.checkins.length - 1];
        $.ajax({
            dataType: 'json',
            url: '/checkin/reservation/' + targetQr,
            type: 'DELETE',
            cache: false,
            timeout: 15000,
            data: {
                when: targetCheckin.when
            }
        }).done(function () {
            // とりあえずこの予約QRの順番は一旦終了
            cancelingCheckinReservationQrStrArray.splice(cancelingCheckinReservationQrStrArray.indexOf(targetQr), 1);
            // 成功したのでそのままキューから削除
            delete cancelingCheckinReservationsByQrStr[targetQr];
        }).fail(function (jqxhr, textStatus, error) {
            if (jqxhr.status === 404) {
                $apistatus_delete.html('[' + moment().format('HH:mm:ss') + '] チェックイン取り消しAPIエラー発生 = ' + targetQr);
            } else {
                console.log(jqxhr, textStatus, error);
                $apistatus_delete.html('[' + moment().format('HH:mm:ss') + '] チェックイン取り消しAPI通信エラー発生中');
                // エラーメッセージ表示
                // alert(jqxhr.responseJSON.errors[0].detail);
            }
            // 予約の状態の問題かもしれない失敗が起きたのでとりあえず後回しにする
            cancelingCheckinReservationQrStrArray.splice(cancelingCheckinReservationQrStrArray.indexOf(targetQr), 1);
            cancelingCheckinReservationQrStrArray.push(targetQr);
        }).always(function () {
            $apistatus_delete.html('チェックイン取り消し通信中: ' + cancelingCheckinReservationQrStrArray.length + '件');
            clearTimeout(timeout_syncDeleteCheckinWithApi);
            timeout_syncDeleteCheckinWithApi = setTimeout(function () {
                busy_syncDeleteCheckinWithApi = false;
                syncDeleteCheckinWithApi();
            }, 2000);
        });
    };


    /**
     * 予約情報取得
     * @function getReservations
     * @param {funstion} cb
     * @returns {void}
     */
    var getReservations = function (cb) {
        $.ajax({
            dataType: 'json',
            url: '/checkin/performance/reservations',
            type: 'POST',
            cache: false
            // ,data: { performanceId: '5965ee1ce53ebc2b4e698d3e' }
        }).done(function (data) {
            if (!data.error && data.reservationsById && data.reservationIdsByQrStr) {
                /** 現在パフォーマンスの予約リストを更新 */
                reservationsById = data.reservationsById;
                reservationIdsByQrStr = data.reservationIdsByQrStr;
            } else {
                console.log('No Data: /checkin/performance/reservations', data);
            }
        }).fail(function (jqxhr, textStatus, error) {
            console.log(jqxhr, textStatus, error);
        }).always(function () {
            if (typeof cb === 'function') { cb(); }
        });
    };


    /**
     * 予約情報を定期的に取得
     * @function loopGetReservations
     * @param {number} time
     * @returns {void}
     */
    var loopGetReservations = function (time) {
        setTimeout(function () {
            getReservations(function () {
                loopGetReservations(time);
            });
        }, time);
    };


    /* 時計 */
    document.getElementById('print_date').innerHTML = moment().format('YYYY/MM/DD');
    var dom_clock = document.getElementById('print_clock');
    dom_clock.innerHTML = moment().format('HH:mm');
    setInterval(function () {
        dom_clock.innerHTML = moment().format('HH:mm');
    }, 10000);

    // 予約情報取得
    getReservations(function () {
        // 予約情報同期 30秒ごと
        loopGetReservations(30000);
        syncCheckinWithApi();
        syncDeleteCheckinWithApi();
    });

    // チェックイン取り消しボタン
    btn_delete.onclick = deleteNewestCheckin;

    // 離脱警告 (AsWeb3でonbeforeunloadは不可なのでナビバー非表示にして移動はこのログアウト以外封じる)
    document.getElementById('btn_logout').onclick = function (e) {
        e.preventDefault();
        if ((enteringReservationQrStrArray.length || cancelingCheckinReservationQrStrArray.length)
            && !confirm('通信処理中のチェックインがありますが破棄して移動しますか？')) {
            return false;
        }
        location.replace('/checkin/logout');
    };

    // QR読み取りイベント (※1文字ずつkeypressされてくる)
    var tempQrStr = '';
    $(window).keypress(function (e) {
        // ※読んだのQRの check() が完了するまでは次のQRを読まない
        if (busy_check) {
            // alert('[連続操作エラー] 1つ前に読み取ったQRの判定が完了していません');
            tempQrStr = '';
            return false;
        }
        // 新しい入力値の場合
        if (tempQrStr.length === 0) {
            $qrdetail.html('データ照会中...');
            $checkinlogtablebody.hide(); // 前のQRのチェックイン履歴を非表示にする
        }
        // エンターで入力終了
        if (e.keyCode === 13) {
            // 予約をチェック
            check(tempQrStr);
            tempQrStr = '';
        } else {
            tempQrStr += String.fromCharCode(e.keyCode); // ※AsReaderのイベントにはcharCodeが無い
        }
    });


    // for debug
    $('#input_username').before('<div id="devout"></div>');
    $('.pointname').click(function () {
        document.getElementById('devout').innerHTML = '<hr><p>(↓チェックイン送信待ちQRリスト)</p>' + enteringReservationQrStrArray.join('<br>');
    });

    document.getElementById('apistatus_checkin').onclick = function () {
        clearTimeout(timeout_syncCheckinWithApi);
        syncCheckinWithApi();
    };

    document.getElementById('apistatus_delete').onclick = function () {
        clearTimeout(timeout_syncDeleteCheckinWithApi);
        syncDeleteCheckinWithApi();
    };
});
