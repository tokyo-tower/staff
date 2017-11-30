/* global moment, flatpickr */
$(function() {
    'use strict';
    var LOCALE = document.documentElement.getAttribute('lang');
    var API_ENDPOINT = document.querySelector('input[name="apiEndpoint"]').value;
    var API_TOKEN = document.getElementById('input_apiToken').value;
    if (!API_ENDPOINT) { return alert('API_ENDPOINT undefined'); }

    // カレンダーを何日先まで表示するか
    var CALENDER_DAYRANGE = 364;

    // 空き状況表示切り替え閾値 (以下)
    var STATUS_THRESHOLD = {
        CROWDED: 19,
        LAST: 9
    };

    // 空席数からCSSクラス名を得る
    var getStatusNameByRemainsNum = function(num) {
        num = parseInt(num, 10);
        if (num > STATUS_THRESHOLD.CROWDED) {
            return 'capable'; // 「⚪」
        } else if (num > STATUS_THRESHOLD.LAST) {
            return 'crowded'; // 「△」
        } else if (num > 0) {
            return 'last'; // 「人間アイコン + 残数」
        }
        return 'soldout'; // 「×」
    };


    // 文字列整形用 (Stringのidx文字目にstrを差し込む)
    var spliceStr = function(targetStr, idx, str) {
        var ret = targetStr;
        try {
            ret = (targetStr.slice(0, idx) + str + targetStr.slice(idx));
        } catch (e) {
            console.log(e);
        }
        return ret || '';
    };


    // APIから得たパフォーマンス一覧を整形して表示
    var dom_performances = document.querySelector('.performances');
    var showPerformances = function(performanceArray) {
        // 1hごとにまとめる (start_timeの最初2文字を時間とする)
        var hourArray = [];
        var performancesByHour = {};
        var moment_now = moment();
        performanceArray.forEach(function(performance) {
            try {
                var hour = performance.attributes.start_time.slice(0, 2);
                // 現在時刻より前のperformanceは無視
                if (moment_now.isAfter(moment(performance.attributes.day + '' + performance.attributes.start_time, 'YYYYMMDDHHmm'))) {
                    return true;
                }
                if (!~hourArray.indexOf(hour)) {
                    hourArray.push(hour);
                    performancesByHour[hour] = [];
                }
                performancesByHour[hour].push({
                    id: performance.id,
                    start_time: performance.attributes.start_time,
                    end_time: performance.attributes.end_time,
                    seat_status: performance.attributes.seat_status
                });
            } catch (e) {
                console.log(e);
                return true;
            }
        });
        // 時間割を念のためソート
        hourArray.sort(function(a, b) {
            if (a < b) { return -1; }
            if (a > b) { return 1; }
            return 0;
        });

        var html = '';
        hourArray.forEach(function(hour) {
            // 時間割内のパフォーマンスを念のためソート
            performancesByHour[hour].sort(function(a, b) {
                if (a.start_time < b.start_time) { return -1; }
                if (a.start_time === b.start_time) { return 0; }
                return 1;
            });

            html += '<div class="performance">' +
                        '<div class="hour"><span>' + hour + ':00～</span></div>' +
                        '<div class="items">';
            performancesByHour[hour].forEach(function(performance) {
                html +=     '<div class="item item-' + getStatusNameByRemainsNum(performance.seat_status) + '" data-performance-id="' + performance.id + '">' +
                                '<p class="time">' + spliceStr(performance.start_time, 2, ':') + ' - ' + spliceStr(performance.end_time, 2, ':') + '</p>' +
                                '<div class="wrapper-status">' +
                                    '<p class="status">' + performance.seat_status + '</p>' +
                                '</div>' +
                            '</div>';
            });
            html +=     '</div>' +
                    '</div>';
        });
        dom_performances.innerHTML = html;
    };


    // 検索
    var $loading = $('.loading');
    var search = function(condition) {
        $.ajax({
            dataType: 'json',
            url: API_ENDPOINT + 'performances',
            type: 'GET',
            data: condition,
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + API_TOKEN);
                $loading.modal();
            }
        }).done(function(body) {
            if ($.isArray(body.data) && body.data.length > 0) {
                showPerformances(body.data);
            } else {
                dom_performances.innerHTML = '';
            }
        }).fail(function(jqxhr, textStatus, error) {
            console.log('API Error: /performance/search', error);
        }).always(function() {
            $loading.modal('hide');
        });
    };


    // 日付選択カレンダー (再読込時のために日付はsessionStorageにキープしておく)
    flatpickr.localize(window.flatpickr.l10ns[LOCALE]);
    var $modal_calender = $('.modal-calender');
    var calendar = new flatpickr(document.getElementById('input_performancedate'), {
        appendTo: $('#calendercontainer').on('click', function(e) { e.stopPropagation(); })[0], // モーダル内コンテナに挿入しつつカレンダークリックでモーダルが閉じるのを防止
        defaultDate: window.sessionStorage.getItem('performance_ymd') || 'today',
        disableMobile: true, // 端末自前の日付選択UIを使わない
        locale: LOCALE,
        minDate: 'today',
        maxDate: new Date().fp_incr(CALENDER_DAYRANGE),
        onOpen: function() {
            $modal_calender.fadeIn(200);
        },
        onClose: function() {
            $modal_calender.hide();
        },
        // カレンダーの日付が変更されたら検索を実行
        onValueUpdate: function(selectedDates, dateStr) {
            window.setSessionStorage('performance_ymd', dateStr);
            search({
                page: 1,
                day: dateStr.replace(/\-/g, '') // Y-m-dをYmdに整形
            });
        }
    });
    // モーダルを閉じたら中のカレンダーも閉じる
    $modal_calender.click(function() { calendar.close(); });


    // パフォーマンス決定
    $(document).on('click', '.item', function(e) {
        document.querySelector('input[name="performanceId"]').value = e.currentTarget.getAttribute('data-performance-id');
        //document.getElementById('form_performanceId').submit();
    });

    // オンライン販売・EV運行対応モーダル呼び出し
    $(document).on('click', '.call-modal', function() {
        var modal_detail = document.getElementById('modal_detail');
        modal_detail.querySelector('.btn-suspension').onclick = function() { suspend(); };
        $(modal_detail).modal();
    });
    
    function suspend(performanceIds) {
        // if (!confirm('指定した予約のキャンセル処理を実行してよろしいですか？\n\n'
        //     + reservationsIds4cancel.map(function(id) {
        //         return reservationsById[id].payment_no + ' ' + reservationsById[id].seat_code + ' ' + reservationsById[id].ticket_type_name.ja;
        //     }).join('\n'))
        // || !confirm('キャンセルをした予約は復元できませんが本当に実行しますか？')) {
        //     return false;
        // }

        // for test 固定でセット
        //var performanceIds = ['59f41042fca1c8737f4c45b5','59f41042fca1c8737f4c45a8'];
        //var performanceIds = ['59f4a9c5fca1c8737f6c16c8','59f4a9c4fca1c8737f6c1695'];
        var performanceIds = ['59fc92c3fca1c8737f068a98'];
        //---
        // '0': 解除 '1': 停止
        var executeType = '1';
        // オンライン販売状況
        var onlineStatus = $('input[name="online"]:checked').val();
        // 運行状況
        var evStatus = $('input[name="ev"]:checked').val();
        // 通知内容
        var notice = $('textarea[name="notice"]').val();
        $.ajax({
            dataType: 'json',
            url: $('input[name="urlSuspend"]').val(),
            type: 'POST',
            data: {
                executeType: executeType,
                performanceIds: JSON.stringify(performanceIds),
                onlineStatus: onlineStatus,
                evStatus: evStatus,
                notice: notice
            },
            beforeSend: function() {
                $('#modal_detail').modal('hide');
            }
        }).done(function(data) {
            if (data.success) {
                // var tempHTML = '';
                // reservationsIds4cancel.forEach(function(_id) {
                //     tempHTML += '<h3><span>購入番号:</span>' + reservationsById[_id].payment_no + '<span>座席 / 券種:</span>' + reservationsById[_id].seat_code + '/' + reservationsById[_id].ticket_type_name.ja + '</h3>';
                // });
                // document.getElementById('echo_canceledreservations').innerHTML = tempHTML;
                // $('#modal_cancelcompleted').modal();
                // // 再検索して表示を更新
                // search();
                alert('成功！');
            } else {
                // alert('キャンセル処理の実行でエラーが発生しました');
                alert('エラーが発生しました');
            }
        }).fail(function(jqxhr, textStatus, error) {
            alert(error);
        }).always(function() {
        });
    }

});
