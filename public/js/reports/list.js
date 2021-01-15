/* global moment */
'use strict';
$(function () {
    // 日付選択カレンダー (再読込時のために日付はsessionStorageにキープしておく)
    window.flatpickr.localize(window.flatpickr.l10ns.ja);

    var $modal_calender = $('.modal-calender');
    var calendar = new window.flatpickr('.datepicker', {
        allowInput: true,
        appendTo: $('#calendercontainer').on('click', function (e) { e.stopPropagation(); })[0], // モーダル内コンテナに挿入しつつカレンダークリックでモーダルが閉じるのを防止
        // defaultDate: 'today',
        disableMobile: true, // 端末自前の日付選択UIを使わない
        locale: 'ja',
        dateFormat: "Y/m/d",
        // minDate: moment().add(-3, 'months').toDate(),
        // maxDate: moment().add(3, 'months').toDate(),
        onOpen: function () {
            $modal_calender.fadeIn(200);
        },
        onClose: function () {
            $modal_calender.hide();
        }
    });
    // モーダルを閉じたら中のカレンダーも閉じる
    $modal_calender.click(function () { calendar.close(); });

    moment.locale('ja');
    var $modal_loading = $('.loading');

    // 検索条件
    var conditions = {
        limit: document.getElementById('input_limit').value,
        page: '1'
    };

    // APIから得た検索結果
    var reports = [];
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

    var $select_refund_status = $('#select_refund_status');
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
     * reports をページに描画する
     */
    var dom_reservations = document.getElementById('reservations');
    var dom_suspensiontotal = document.getElementById('echo_suspensiontotal');
    var renderReports = function (totalCount) {
        var html = '';
        reports.forEach(function (report) {
            suspensionsByPid[report.performance_id] = report;

            var seatNumber = '';
            if (report.reservation.reservedTicket.ticketedSeat !== undefined && report.reservation.reservedTicket.ticketedSeat !== null) {
                seatNumber = report.reservation.reservedTicket.ticketedSeat.seatNumber;
            }

            html += '<tr>' +
                '<td class="td-performance_day">' + report.category + '</td>' +
                '<td class="td-tour_number">' + report.confirmationNumber + '</td>' +
                '<td class="td-online_sales_update_at">' + moment(report.orderDate).tz('Asia/Tokyo').format('YYYY-MM-DD HH:mm:ss') + '</td>' +
                '<td class="td-ev_service_status_name">' + report.price + '</td>' +
                '<td class="td-caceled">' + report.reservation.reservationFor.id + '</td>' +
                '<td class="td-arrived">' + moment(report.reservation.reservationFor.startDate).tz('Asia/Tokyo').format('YYYY-MM-DD HH:mm:ss') + '</td>' +
                '<td class="td-refund_status_name">' + report.reservation.reservedTicket.ticketType.name.ja + '</td>' +
                '<td class="td-refunded">' + report.reservation.reservedTicket.ticketType.priceSpecification.price + '</td>' +
                '<td class="td-actions">' + seatNumber + '</td>' +
                '</tr>';
        });
        dom_reservations.innerHTML = html;

        dom_suspensiontotal.innerText = totalCount + '件';

        showPager(totalCount);
    };

    /**
     * 販売停止一覧APIに conditions をGETして reports を更新する
     */
    var search = function () {
        // var params = $('form').serialize();
        var formDatas = $('form').serializeArray();
        formDatas.forEach(function (formData) {
            conditions[formData.name] = formData.value;
        });
        var totalCount = 0;

        $.ajax({
            url: '/reports/search',
            type: 'GET',
            data: conditions,
            beforeSend: function () {
                $modal_loading.modal();
            }
        }).done(function (data, textStatus, xhr) {
            reports = data || [];
            totalCount = xhr.getResponseHeader('X-Total-Count');
        }).fail(function (jqxhr, textStatus, error) {
            reports = [];
            console.log(error);
            alert(error.message);
        }).always(function () {
            $modal_loading.modal('hide');
            renderReports(totalCount);
        });
    };

    // 検索ボタン
    document.getElementById('btn_execsearch').onclick = function () {
        conditions.page = '1';
        search();
    };

    // 検索条件リセットボタン
    document.getElementById('btn_clearconditions').onclick = function () {
        $input_performancedate.data('daterangepicker').setStartDate(moments_default.input_performancedate1);
        $input_performancedate.data('daterangepicker').setEndDate(moments_default.input_performancedate2);
        $input_onlinedate.data('daterangepicker').setStartDate(moments_default.input_onlinedate1);
        $input_onlinedate.data('daterangepicker').setEndDate(moments_default.input_onlinedate2);
        $select_refund_status.val('').prop('selected', true);
        conditions.page = '1';
        search();
    };

    // ページ変更
    $(document).on('click', '.change-page', function () {
        conditions.page = this.getAttribute('data-page');
        search();
    });

    search();
});
