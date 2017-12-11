/* global moment */
'use strict';
$(function() {
    // サーマル印刷の挙動 ('pc' = Windows, 'mobile' = 専用ブラウザ)
    var mode_thermalprint = 'pc';

    // _idごとにまとめた予約ドキュメントリスト
    var reservationsById = {};

    /*
      サーマル印刷
    */
    if (mode_thermalprint !== 'pc') {
        var can_thermalprint = false;
        window.starThermalPrint.init({
            publisher: document.querySelector('input[name=username]').value,
            timeout: 10000
        }).then(function() {
            can_thermalprint = true;
            $('body').removeClass('no-thermal');
        }).catch(function(errMsg) {
            $('.wrapper-searchform').prepend('<p id="msg_bluetooth">サーマルプリンタと接続できませんでした (' + errMsg + ')</p>');
        });
    } else {
        $('body').removeClass('no-thermal');
    }
    // サーマル印刷実行ボタン
    $(document).on('click', '.btn-thermalprint', function(e) {
        var id = e.currentTarget.getAttribute('data-targetid');
        if (mode_thermalprint !== 'pc') {
            if (!can_thermalprint) {
                return alert('サーマルプリンタと接続できていません。ペアリング状態を確認してください。');
            }
            if (!reservationsById[id]) {
                return alert('印刷の準備に失敗しました。ページを再読込して再度試してください。');
            }
            return window.starThermalPrint.printReservation(reservationsById[id]).catch(function(errmsg) {
                alert(errmsg);
            });
        }
        window.open('/reserve/print_pcthermal?ids=' + JSON.stringify([id]));
    });

    // 日付選択カレンダー (再読込時のために日付はsessionStorageにキープしておく)
    window.flatpickr.localize(window.flatpickr.l10ns.ja);
    var input_day = document.getElementById('input_onlinedate1');
    var $modal_calender = $('.modal-calender');
    var calendar = new window.flatpickr(input_day, {
        appendTo: $('#calendercontainer').on('click', function(e) { e.stopPropagation(); })[0], // モーダル内コンテナに挿入しつつカレンダークリックでモーダルが閉じるのを防止
        defaultDate: 'today',
        disableMobile: true, // 端末自前の日付選択UIを使わない
        locale: 'ja',
        // minDate: moment().add(-3, 'months').toDate(),
        // maxDate: moment().add(3, 'months').toDate(),
        onOpen: function() {
            $modal_calender.fadeIn(200);
        },
        onClose: function() {
            $modal_calender.hide();
        }
    });
    // モーダルを閉じたら中のカレンダーも閉じる
    $modal_calender.click(function() { calendar.close(); });

    // purchaser_groupをキーにした「予約方法」辞書
    var purchaseRoute = {
        '01': '一般ネット予約',
        '04': '窓口代理予約',
        '06': 'POS'
    };

    var conditions = {
        limit: $('.search-form input[name="limit"]').val(),
        page: '1'
    };

    function showReservations(suspensions) {
        var html = '';

        suspensions.forEach(function(suspension) {
            // var startDatetime = suspension.performance_day.substr(0, 4)
            //     + '/' + suspension.performance_day.substr(4, 2)
            //     + '/' + suspension.performance_day.substr(6)
            //     + ' ' + suspension.performance_start_time.substr(0, 2) + ':' + suspension.performance_start_time.substr(2);
            html += ''
                + '<tr performance_id="' + suspension.performance_id + '"'
                + '>'
            // html += ''
            //     + '<tr data-seat-code="' + suspension.seat_code + '"'
            //     + ' data-reservation-id="' + suspension._id + '"'
            //     + ' data-payment-no="' + suspension.payment_no + '"'
            //     + ' data-performance-start-datetime="' + startDatetime + '"'
            //     + ' data-watcher-name="' + suspension.watcher_name + '"'
            //     + ' data-ticketname="' + suspension.ticket_type_name.ja + '"'
            //     + ' data-purchase-route="' + purchaseRoute[suspension.purchaser_group] + '"'
            //     + '>'
            //    + '<th class="td-checkbox">';

            // if (suspension.payment_no && !suspension.performance_canceled) {
            //     html += ''
            //         + '<input type="checkbox" value="">';
            // }
            html += ''
                //+ '</th>'
                + '<td class="td-amemo">' + suspension.performance_day + '</td>'
                + '<td class="td-ticket">' + suspension.tour_number + '</td>'
                + '<td class="td-route">' + suspension.ev_service_status_name + '</td>'
                + '<td class="td-number">' + suspension.online_sales_update_at + '</td>'
                + '<td class="td-name">' + suspension.online_sales_update_user + '</td>' 
                + '<td class="td-checkin">' + suspension.canceled + '</td>'
                + '<td class="td-checkin">' + suspension.arrived + '</td>'
                + '<td class="td-checkin">' + suspension.refund_status_name + '</td>'
                + '<td class="td-checkin">' + suspension.refunded + '</td>';
            
            // 処理実行リンク
            html += '<td class="td-actions">'
            switch (suspension.refund_status) {
                case '1': // 指示済
                    html +=  '<p class="btn"><span>処理完了</span></p>'
                    break;
                case '2': // 返金済
                    html +=  '<p class="btn"><span>処理中</span></p>'
                    break;
                default: // 未指示
                    html +=  '<p class="btn  btn-refund_process"><span>処理実行</span></p>'
                    break;
            }
            html += '</td>'  + '</tr>';
        });
        $('#reservations').html(html);
    }

    /**
     * ページャーを表示する
     * @param {number} count 全件数
     */
    function showPager(count) {
        var html = '';
        var page = parseInt(conditions.page, 10);
        var limit = parseInt(conditions.limit, 10);

        if (page > 1) {
            html += ''
                + '<span><a href="javascript:void(0)" class="change-page" data-page="' + (page - 1) + '">&lt;</a></span>'
                + '<span><a href="javascript:void(0)" class="change-page" data-page="1">最初</a></span>';
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
            html += ''
                + '<span><a href="javascript:void(0)" class="change-page" data-page="' + pages + '">最後</a></span>'
                + '<span><a href="javascript:void(0)" class="change-page" data-page="' + (page + 1) + '">&gt;</a></span>';
        }

        $('.navigation').html(html);
    }
    function setConditions() {
        // 検索フォームの値を全て条件に追加
        var formDatas = $('.search-form').serializeArray();
        formDatas.forEach(function(formData) {
            conditions[formData.name] = formData.value;
        });
    }
    function showConditions() {
        var formDatas = $('.search-form').serializeArray();
        formDatas.forEach(function(formData) {
            var name = formData.name;
            if (conditions.hasOwnProperty(name)) {
                $('input[name="' + name + '"], select[name="' + name + '"]', $('.search-form')).val(conditions[name]);
            } else {
                $('input[name="' + name + '"], select[name="' + name + '"]', $('.search-form')).val('');
            }
        });
    }

    function search() {
        conditions.input_onlinedate1 = conditions.input_onlinedate1.replace(/\-/g, '');
        conditions.input_onlinedate2 = conditions.input_onlinedate2.replace(/\-/g, '');
        conditions.input_performancedate1 = conditions.input_performancedate1.replace(/\-/g, '');
        conditions.input_performancedate2 = conditions.input_performancedate2.replace(/\-/g, '');
        conditions.searched_at = Date.now(); // ブラウザキャッシュ対策
        $('.error-message').hide();
        $.ajax({
            dataType: 'json',
            url: $('.search-form').attr('action'),
            type: 'GET',
            data: conditions,
            beforeSend: function() {
                $('.loading').modal();
                $('.wrapper-reservations input[type="checkbox"]').prop('checked', false);
            }
        }).done(function(data) {
            // エラーメッセージ表示
            if (data.errors) {
                for (var error in data.errors) {
                    if (error) {
                        $('[name="error_' + error + '"]').text(data.errors[error].msg);
                    }
                }
                $('.error-message').show();
            }
            // データ表示
            if (data.success) {
                // data.results.forEach(function(reservation) {
                //     reservationsById[reservation._id] = reservation;
                // });
                showReservations(data.results);
                showPager(parseInt(data.count, 10));
                showConditions();
                $('.total-count').text(data.count + '件');
            }
        }).fail(function(jqxhr, textStatus, error) {
            console.log(error);
        }).always(function() {
            $('.loading').modal('hide');
        });
    }

    // 返金処理実行
    $(document).on('click', '.btn-refund_process', function(e) {
        var performanceId = $(e.currentTarget).closest('tr').attr('performance_id');
        alert(performanceId);
        $.ajax({
            dataType: 'json',
            url: '/staff/suspension/list/refund/process',
            type: 'POST',
            data: {
                performanceId: performanceId
            },
            beforeSend: function() {
                //$('#modal_detail').modal('hide');
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
            } else {
                alert('返金処理の実行でエラーが発生しました');
            }
        }).fail(function(jqxhr, textStatus, error) {
            alert(error);
        }).always(function() {
        });
    });
        
    
    function cancel(reservationsIds4cancel) {
        if (!confirm('指定した予約のキャンセル処理を実行してよろしいですか？\n\n'
            + reservationsIds4cancel.map(function(id) {
                return reservationsById[id].payment_no + ' ' + reservationsById[id].seat_code + ' ' + reservationsById[id].ticket_type_name.ja;
            }).join('\n'))
        || !confirm('キャンセルをした予約は復元できませんが本当に実行しますか？')) {
            return false;
        }
        $.ajax({
            dataType: 'json',
            url: $('input[name="urlCancel"]').val(),
            type: 'POST',
            data: {
                reservationIds: JSON.stringify(reservationsIds4cancel)
            },
            beforeSend: function() {
                $('#modal_detail').modal('hide');
            }
        }).done(function(data) {
            if (data.success) {
                var tempHTML = '';
                reservationsIds4cancel.forEach(function(_id) {
                    tempHTML += '<h3><span>購入番号:</span>' + reservationsById[_id].payment_no + '<span>座席 / 券種:</span>' + reservationsById[_id].seat_code + '/' + reservationsById[_id].ticket_type_name.ja + '</h3>';
                });
                document.getElementById('echo_canceledreservations').innerHTML = tempHTML;
                $('#modal_cancelcompleted').modal();
                // 再検索して表示を更新
                search();
            } else {
                alert('キャンセル処理の実行でエラーが発生しました');
            }
        }).fail(function(jqxhr, textStatus, error) {
            alert(error);
        }).always(function() {
        });
    }

    // 検索
    $(document).on('click', '.search-form .btn', function() {
        conditions.page = '1';
        // 画面から検索条件セット
        setConditions();
        search();
    });

    // ページ変更
    $(document).on('click', '.change-page', function() {
        conditions.page = $(this).attr('data-page');
        search();
    });

    // A4印刷
    $(document).on('click', '.btn-print', function(e) {
        var id = e.currentTarget.getAttribute('data-targetid');
        window.open('/reserve/print?ids=' + JSON.stringify([id]));
    });

    // 予約詳細モーダル呼び出し
    $(document).on('click', '.call-modal', function() {
        var modal_detail = document.getElementById('modal_detail');
        var reservationNode = this.parentNode.parentNode;
        var reservation_id = reservationNode.getAttribute('data-reservation-id');
        document.getElementById('echo_detailmodal__payment_no').innerHTML = reservationNode.getAttribute('data-payment-no');
        document.getElementById('echo_detailmodal__date').innerHTML = reservationNode.getAttribute('data-performance-start-datetime');
        document.getElementById('echo_detailmodal__info').innerHTML = reservationNode.getAttribute('data-seat-code') + ' / ' + reservationNode.getAttribute('data-ticketname') + ' / ' + reservationNode.getAttribute('data-watcher-name');
        document.getElementById('echo_detailmodal__purchaseinfo').innerHTML = reservationNode.getAttribute('data-purchase-route');
        modal_detail.querySelector('.btn-print').setAttribute('data-targetid', reservation_id);
        modal_detail.querySelector('.btn-thermalprint').setAttribute('data-targetid', reservation_id);
        modal_detail.querySelector('.btn-cancelrsrv').onclick = function() { cancel([reservation_id]); };
        $(modal_detail).modal();
    });

    // 配布先更新
    $(document).on('click', '.update-watcher-name', function() {
        var reservationId = $(this).parent().parent().parent().attr('data-reservation-id');
        var watcherName = $('input', $(this).parent().parent()).val();

        $.ajax({
            dataType: 'json',
            url: $('input[name="urlUpdateWatcherName"]').val(),
            type: 'POST',
            data: {
                reservationId: reservationId,
                watcherName: watcherName
            },
            beforeSend: function() {
            }
        }).done(function(data) {
            if (data.success) {
                // 再検索
                search();
            } else {
                alert('Failed Updating.');
            }
        }).fail(function(jqxhr, textStatus, error) {
            console.log(error);
        }).always(function() {
        });
    });

    // まとめて操作
    $(document).on('click', '.action-to-reservations', function() {
        var ids = $('.td-checkbox input[type="checkbox"]:checked').map(function() {
            return this.parentNode.parentNode.getAttribute('data-reservation-id');
        }).get();
        if (!ids.length) {
            return alert('対象にする予約が選択されていません');
        }

        var action = document.getElementById('select_action').value;
        if (action === 'cancel') {
            cancel(ids);
        } else if (action === 'print') {
            window.open('/reserve/print?ids=' + JSON.stringify(ids));
        } else if (action === 'thermalprint') {
            if (mode_thermalprint !== 'pc') {
                if (!can_thermalprint) {
                    return alert('サーマルプリンタが利用できません');
                }
                window.starThermalPrint.printReservationArray(ids.map(function(id) { return reservationsById[id]; }));
            } else {
                window.open('/reserve/print_pcthermal?ids=' + JSON.stringify(ids));
            }
        } else {
            alert('操作を選択してください');
        }
    });

    // 全てチェックする
    $(document).on('click', '.check-all', function() {
        $('.td-checkbox input[type="checkbox"]').prop('checked', true);
    });

    // エラー表示クリア
    $('.error-message').hide();
    // 画面から検索条件セット
    setConditions();
    // 予約リスト表示
    search();
});
