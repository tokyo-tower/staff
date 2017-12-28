/* global moment */
'use strict';
$(function() {
    if (!window.ttts.API_SUSPENDED_ENDPOINT) {
        return alert('window.ttts.API_SUSPENDED_ENDPOINT undefined');
    }
    moment.locale('ja');
    var $modal_loading = $('.loading');

    // 検索条件
    var conditions = {
        limit: document.getElementById('input_limit').value,
        page: '1'
    };

    // APIから得た検索結果
    var suspensionArray = [];
    var suspensionsByPid = {};

    // 検索条件の日付デフォルト
    var moments_default = {
        input_performancedate1: moment().subtract(30, 'days'),
        input_performancedate2: moment().add(30, 'days'),
        input_onlinedate1: moment().subtract(30, 'days'),
        input_onlinedate2: moment()
    };

    // daterangepicker共通設定
    var daterangepickerSettings = {
        format: 'YYYY/MM/DD',
        showDropdowns: false,
        autoUpdateInput: true,
        ranges: {
            '直近7日': [moment().subtract(7, 'days'), moment()],
            '直近30日': [moment().subtract(29, 'days'), moment()],
            '今月': [moment().startOf('month'), moment().endOf('month')],
            '先月': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
        },
        opens: 'left',
        locale: {
            applyLabel: '選択',
            cancelLabel: '取消',
            fromLabel: '開始日',
            toLabel: '終了日',
            weekLabel: 'W',
            customRangeLabel: '日付指定',
            daysOfWeek: moment.weekdaysMin(),
            monthNames: moment.monthsShort(),
            firstDay: moment.localeData()._week.dow
        }
    };

    // 対象ツアー年月日初期化
    daterangepickerSettings.startDate = moments_default.input_performancedate1;
    daterangepickerSettings.endDate = moments_default.input_performancedate2;
    var $input_performancedate = $('#input_performancedate').daterangepicker(daterangepickerSettings);

    // 停止処理実行日初期化
    daterangepickerSettings.startDate = moments_default.input_onlinedate1;
    daterangepickerSettings.endDate = moments_default.input_onlinedate2;
    var $input_onlinedate = $('#input_onlinedate').daterangepicker(daterangepickerSettings);


    /**
     * ページャーを表示する
     * @param {number} count 全件数
     */
    function showPager(count) {
        var html = '';
        var page = parseInt(conditions.page, 10);
        var limit = parseInt(conditions.limit, 10);
        if (page > 1) {
            html += '' +
                '<span><a href="javascript:void(0)" class="change-page" data-page="' + (page - 1) + '">&lt;</a></span>' +
                '<span><a href="javascript:void(0)" class="change-page" data-page="1">最初</a></span>';
        }
        var pages = Math.ceil(count / parseInt(limit, 10));
        for (var i = 0; i < pages; i++) {
            var _page = i + 1;
            if (parseInt(page, 10) === i + 1) {
                html += '<span>' + _page + '</span>';
            } else if (page - 9 < _page && _page < page + 9) {
                html += '<span><a href="javascript:void(0)" class="change-page" data-page="' + _page + '">' + _page + '</a></span>';
            }
        }
        if (parseInt(page, 10) < pages) {
            html += '' +
                '<span><a href="javascript:void(0)" class="change-page" data-page="' + pages + '">最後</a></span>' +
                '<span><a href="javascript:void(0)" class="change-page" data-page="' + (page + 1) + '">&gt;</a></span>';
        }
        $('.navigation').html(html);
    }

    /**
     * suspensionArray をページに描画する
     */
    var dom_reservations = document.getElementById('reservations');
    var dom_suspensiontotal = document.getElementById('echo_suspensiontotal');
    var renderSupensionsData = function() {
        var html = '';
        suspensionArray.forEach(function(suspension) {
            suspensionsByPid[suspension.performance_id] = suspension;
            html += '<tr>' +
                '<td class="td-performance_day">' + suspension.performance_day + '</td>' +
                '<td class="td-tour_number">' + suspension.tour_number + '</td>' +
                '<td class="td-ev_service_status_name">' + suspension.ev_service_status_name + '</td>' +
                '<td class="td-online_sales_update_at">' + moment(suspension.online_sales_update_at).format('YYYY/MM/DD HH:mm:ss') + '</td>' +
                '<td class="td-caceled">' + suspension.canceled + '</td>' +
                '<td class="td-arrived">' + suspension.arrived + '</td>' +
                '<td class="td-refund_status_name">' + suspension.refund_status_name + '</td>' +
                '<td class="td-refunded">' + suspension.refunded + '</td>' +
                '<td class="td-actions">';
            // 未指示
            if (suspension.refund_status === window.ttts.RefundStatus.NotInstructed) {
                // 返金することがどれだけ早く確定していたとしても返金の実行はツアー終了予定時刻後にしかできない
                if (moment().isBefore(moment(suspension.end_date))) {
                    html += '<p><span>まだ返金できません</span></p>';
                } else {
                    html += '<p class="btn btn-refund_process" data-pid="' + suspension.performance_id + '"><span>処理実行</span></p>';
                }
            // 指示済
            } else if (suspension.refund_status === window.ttts.RefundStatus.Instructed) {
                html += '<p class="btn btn-disabled"><span>処理中</span></p>';
            // 完了済
            } else if (suspension.refund_status === window.ttts.RefundStatus.Compeleted) {
                html += '<p><span>処理完了</span></p>';
            } else {
                html += '<p><span>-</span></p>';
            }
            html += '</td></tr>';
        });
        dom_reservations.innerHTML = html;

        dom_suspensiontotal.innerText = suspensionArray.length + '件';

        showPager(parseInt(suspensionArray.length, 10));
    };

    /**
     * 販売停止一覧APIに conditions をPOSTして suspensionArray を更新する
     */
    var search = function() {
        var performancedate = $input_performancedate.data('daterangepicker');
        conditions.input_performancedate1 = performancedate.startDate.format('YYYYMMDD');
        conditions.input_performancedate2 = performancedate.endDate.format('YYYYMMDD');

        var onlinedate = $input_onlinedate.data('daterangepicker');
        conditions.input_onlinedate1 = onlinedate.startDate.format('YYYYMMDD');
        conditions.input_onlinedate2 = onlinedate.endDate.format('YYYYMMDD');

        conditions.refund_status = document.getElementById('select_refund_status').value || '';

        conditions.searched_at = Date.now(); // ブラウザキャッシュ対策
        $.ajax({
            url: window.ttts.API_SUSPENDED_ENDPOINT,
            type: 'GET',
            data: conditions,
            beforeSend: function() {
                $modal_loading.modal();
            }
        }).done(function(data) {
            suspensionArray = data || [];
        }).fail(function(jqxhr, textStatus, error) {
            suspensionArray = [];
            console.log(error);
            alert(error.message);
        }).always(function() {
            $modal_loading.modal('hide');
            renderSupensionsData();
        });
    };

    /**
     * 返金指示APIに対象ツアーの performanceId をPOSTする
     * @param {string} performanceId
     */
    var busy_refund = false;
    var refund = function(performanceId) {
        var targetSuspension = suspensionsByPid[performanceId];
        var infoText = 'ツアー年月日: ' + moment(targetSuspension.start_date).format('YYYY/MM/DD HH:mm') + '～' + moment(targetSuspension.end_date).format('HH:mm') + '\nツアーNo: ' + targetSuspension.tour_number + '\n運転状況: ' + targetSuspension.ev_service_status_name;
        if (busy_refund
        || !confirm('このツアーへの返金処理を実行してよろしいですか？\n\n' + infoText)
        || !confirm('この処理は取り消せませんが本当に返金を実行しますか？\n\n' + infoText)) {
            return false;
        }
        busy_refund = true;
        $modal_loading.modal();
        $.post(window.ttts.API_SUSPENDED_ENDPOINT + '/' + performanceId + '/tasks/returnOrders').done(function() {
            // ステータス表示更新
            targetSuspension.refund_status_name = '指示済';
            targetSuspension.refund_status = window.ttts.RefundStatus.Instructed;
            renderSupensionsData();
        }).fail(function(jqxhr, textStatus, error) {
            if (jqxhr.status === 500) {
                var response = $.parseJSON(jqxhr.responseText);
                console.error(jqxhr.res);
                alert('返金処理の実行でエラーが発生しました\n' + response.errors[0].message);
            } else {
                alert(error);
            }
        }).always(function() {
            $modal_loading.modal('hide');
            busy_refund = false;
        });
    };


    // 検索ボタン
    document.getElementById('btn_execsearch').onclick = function() {
        conditions.page = '1';
        search();
    };

    // 検索条件リセットボタン
    document.getElementById('btn_clearconditions').onclick = function() {
        $input_performancedate.data('daterangepicker').setStartDate(moments_default.input_performancedate1);
        $input_performancedate.data('daterangepicker').setEndDate(moments_default.input_performancedate2);
        $input_onlinedate.data('daterangepicker').setStartDate(moments_default.input_onlinedate1);
        $input_onlinedate.data('daterangepicker').setEndDate(moments_default.input_onlinedate2);
        conditions.page = '1';
        search();
    };

    // ページ変更
    $(document).on('click', '.change-page', function() {
        conditions.page = this.getAttribute('data-page');
        search();
    });

    // 返金処理実行ボタン
    $(document).on('click', '.btn-refund_process', function(e) {
        var performanceId = e.currentTarget.getAttribute('data-pid');
        refund(performanceId);
    });


    search();
});
