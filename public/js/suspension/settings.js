/* global moment, flatpickr */
window.ttts.currentLocale = 'ja';

$(function() {
    'use strict';
    if (!window.ttts.API_ENDPOINT) { return alert('API_ENDPOINT undefined'); }
    if (!window.ttts.API_TOKEN.VALUE) { return alert('API_TOKEN undefined'); }


    // statusからCSSクラス名を得る
    var getClassNameByStatus = function(performance) {
        var className = '';
        if (performance.ev_service_status === 'Slowdown') {
            className += 'item-ev-slow ';
        } else if (performance.ev_service_status === 'Suspended') {
            className += 'item-ev-stopped ';
        }
        if (performance.online_sales_status === 'Suspended') {
            className += 'item-supenpeded ';
        }
        className += 'item-hour-' + performance.hour;
        return className;
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


    // var sales_suspended = [];

    // APIから得たパフォーマンス一覧を整形して表示
    var dom_performances = document.querySelector('.performances');
    var showPerformances = function(performanceArray) {
        // 1hごとにまとめる (start_timeの最初2文字を時間とする)
        var hourArray = [];
        var performancesByHour = {};
        var performancesById = {};
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
                    hour: hour,
                    start_time: performance.attributes.start_time,
                    end_time: performance.attributes.end_time,
                    seat_status: performance.attributes.seat_status,
                    ev_service_status: performance.attributes.ev_service_status,
                    online_sales_status: performance.attributes.online_sales_status,
                    tour_number: performance.attributes.tour_number
                });
                performancesById[performance.id] = performance;
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

        // sales_suspended.forEach(function(suspension) {
        //     suspension.performance_ids.forEach(function(pId) {
        //         performancesById[pId].suspension_annnouce_locales = suspension.annnouce_locales;
        //     });
        // });

        var html = '';
        hourArray.forEach(function(hour) {
            // 時間割内のパフォーマンスを念のためソート
            performancesByHour[hour].sort(function(a, b) {
                if (a.start_time < b.start_time) { return -1; }
                if (a.start_time === b.start_time) { return 0; }
                return 1;
            });

            html += '<div class="performance">' +
                '<div class="hour"><label><span>' + hour + ':00～</span><input class="checkbox-hourtoggle" type="checkbox" data-hour="' + hour + '"> 時間帯選択</label></div>' +
                '<div class="items">';
            performancesByHour[hour].forEach(function(performance) {
                var suspensionStatusStr = '';
                // var separatorStr = '';
                // if (performance.online_sales_status === 'Suspended') {
                //    suspensionStatusStr += '販売中止';
                // }
                // separatorStr += (suspensionStatusStr) ? ' / ' : '';
                if (performance.ev_service_status === 'Slowdown') {
                    suspensionStatusStr += '販売休止中';
                } else if (performance.ev_service_status === 'Suspended') {
                    suspensionStatusStr += '販売中止中';
                }
                html += '<div class="item ' + getClassNameByStatus(performance) + '" data-performance-id="' + performance.id + '">' +
                    '<p class="time">' + spliceStr(performance.start_time, 2, ':') + ' - ' + spliceStr(performance.end_time, 2, ':') + '</p>' +
                    '<div class="wrapper-status">' +
                    '<div class="supensionstatus">' +
                    '<p class="status">' + performance.seat_status + '</p>' +
                    '<p>' + suspensionStatusStr + '</p>' +
                    '</div>' +
                    '</div>' +
                    '</div>';
            });
            html += '</div>' +
                '</div>';
        });
        dom_performances.innerHTML = html;
    };


    // 検索
    var ymd = '';
    var $loading = $('.loading');
    var search = function(condition) {
        $.ajax({
            dataType: 'json',
            url: window.ttts.API_ENDPOINT + '/performances',
            type: 'GET',
            data: condition,
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + window.ttts.API_TOKEN.VALUE);
                $loading.modal();
            }
        }).done(function(body) {
            if ($.isArray(body.data) && body.data.length > 0) {
                // sales_suspended = body.meta.sales_suspended;
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
    flatpickr.localize(window.flatpickr.l10ns[window.ttts.currentLocale]);
    var $modal_calender = $('.modal-calender');
    var calendar = new flatpickr(document.getElementById('input_performancedate'), {
        appendTo: $('#calendercontainer').on('click', function(e) { e.stopPropagation(); })[0], // モーダル内コンテナに挿入しつつカレンダークリックでモーダルが閉じるのを防止
        defaultDate: window.sessionStorage.getItem('performance_ymd') || 'today',
        disableMobile: true, // 端末自前の日付選択UIを使わない
        locale: window.ttts.currentLocale,
        minDate: 'today',
        maxDate: new Date().fp_incr(364),
        onOpen: function() {
            $modal_calender.fadeIn(200);
        },
        onClose: function() {
            $modal_calender.hide();
        },
        // カレンダーの日付が変更されたら検索を実行
        onValueUpdate: function(selectedDates, dateStr) {
            window.ttts.setSessionStorage('performance_ymd', dateStr);
            ymd = dateStr.replace(/\-/g, ''); // Y-m-dをYmdに整形
            search({
                page: 1,
                day: ymd
            });
        }
    });
    // モーダルを閉じたら中のカレンダーも閉じる
    $modal_calender.click(function() { calendar.close(); });


    // Hour単位のパフォーマンスtoggle
    $(document).on('change', '.checkbox-hourtoggle', function(e) {
        var hour = e.currentTarget.getAttribute('data-hour');
        if (e.currentTarget.checked) {
            $('.item-hour-' + hour).addClass('item-selected');
        } else {
            $('.item-hour-' + hour).removeClass('item-selected');
        }
    });

    // パフォーマンス決定
    $(document).on('click', '.item', function(e) {
        e.currentTarget.classList.toggle('item-selected');
        // document.querySelector('input[name="performanceId"]').value = e.currentTarget.getAttribute('data-performance-id');
        // document.getElementById('form_performanceId').submit();
    });

    // オンライン販売・EV運行対応モーダル呼び出し
    var targetPerformanceIdArray = [];
    var bool_forResume = false;
    var $modal_suspension = $('#modal_suspension');
    var textarea_announcemail = document.getElementById('textarea_announcemail');
    var valideteSelection = function() {
        targetPerformanceIdArray = [];
        var selectedItems = document.getElementsByClassName('item-selected');
        if (!selectedItems.length) {
            return alert('操作対象の枠を選択してください');
        }
        var valid = true;
        Array.prototype.forEach.call(selectedItems, function(dom_item) {
            if (bool_forResume) {
                // 停止済み以外を再開しようとしていたら弾く
                if (dom_item.className.indexOf('item-supenpeded') === -1) {
                    valid = false;
                    return false;
                }
                // 停止済みを停止しようとしていたら弾く
            } else if (dom_item.className.indexOf('item-supenpeded') !== -1) {
                valid = false;
                return false;
            }
            targetPerformanceIdArray.push(dom_item.getAttribute('data-performance-id'));
        });
        if (!valid) {
            alert((bool_forResume ? '販売再開ボタンは販売停止済みの' : '販売停止ボタンは販売中の') + '枠だけを選択して押してください。');
        }
        return valid;
    };

    // 販売停止ボタン
    document.getElementById('btn_callmodal_suspend').onclick = function() {
        bool_forResume = false;
        if (!valideteSelection()) { return false; }
        document.getElementById('radio_ev_slow').checked = true;
        $modal_suspension.removeClass('mode-resume mode-evstop').addClass('mode-suspend').modal();
    };

    // 販売再開ボタン
    document.getElementById('btn_callmodal_resume').onclick = function() {
        textarea_announcemail.value = '';
        bool_forResume = true;
        if (!valideteSelection()) { return false; }
        document.getElementById('radio_ev_restart').checked = true;
        $modal_suspension.removeClass('mode-suspend mode-evstop').addClass('mode-resume').modal();
    };

    $('.radio-ev').change(function(e) {
        if (e.target.id === 'radio_ev_stop') {
            $modal_suspension.addClass('mode-evstop');
        } else {
            $modal_suspension.removeClass('mode-evstop');
        }
    });

    var busy_suspend = false;
    document.getElementById('btn_exec').onclick = function() {
        if (busy_suspend || !confirm('よろしいですか？')) { return false; }
        // 'Normal': 解除 'Suspended': 停止
        var onlineStatus = (bool_forResume) ? 'Normal' : 'Suspended';
        // 運行状況
        var evStatus = $('input[name="ev"]:checked').val();
        var notice = '';
        if (!bool_forResume && evStatus === 'Suspended') {
            notice = textarea_announcemail.value;
            if (!notice) {
                return alert('お客様への通知内容を入力してください');
            }
        }
        busy_suspend = true;
        $.ajax({
            dataType: 'json',
            url: window.ttts.API_SUSPENSION_ENDPOINT,
            type: 'POST',
            data: {
                performanceIds: targetPerformanceIdArray,
                onlineStatus: onlineStatus,
                evStatus: evStatus,
                notice: notice
            },
            beforeSend: function() {
                $modal_suspension.modal('hide');
            }
        }).done(function() {
            alert('販売を' + ((onlineStatus === 'Suspended') ? '停止' : '再開') + 'しました');
        }).fail(function(jqxhr, textStatus, error) {
            if (jqxhr.status === 500) {
                alert('サーバエラーが発生しました');
            } else {
                alert('通信エラーが発生しました\n\n' + JSON.stringify(error));
            }
        }).always(function() {
            busy_suspend = false;
            search({
                page: 1,
                day: ymd
            });
        });
    };
});
