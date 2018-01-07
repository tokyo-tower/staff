$(function() {
    var isSubmitting = false;

    var isAgreed = function() {
        if (window.ttts.mode !== 'customer') {
            return true;
        }
        return document.getElementById('checkbox_agreed').checked;
    };

    // 合計金額の更新
    var isValidTicketsSelected = false;
    var dom_tickets_tr = document.querySelectorAll('.table-tickets tbody tr');
    var dom_tfoot = document.querySelector('tfoot');
    var dom_price = document.getElementById('echo_total');
    var dom_btnnext = document.querySelector('.btn-next');
    var $alertTicketOvermax = $('.alert-ticket-overmax');
    var $alertsTicket = $('.alert-ticket');
    var reloadTotalCharge = function() {
        dom_tfoot.classList.add('hidden');
        $alertsTicket.hide();
        var total = 0;
        var count = 0;
        [].forEach.call(dom_tickets_tr, function(tr) {
            if (tr.querySelector('select') != null) {
                var q = parseInt(tr.querySelector('select').value, 10);
                total += parseInt(tr.getAttribute('data-ticket-charge'), 10) * q;
                count += q;
            }
        });
        if (isNaN(total) || !count || count > window.ttts.reservation_maxq) {
            if (count > window.ttts.reservation_maxq) {
                $alertTicketOvermax.show();
            }
            isValidTicketsSelected = false;
            return dom_btnnext.classList.add('btn-disabled');
        }
        isValidTicketsSelected = true;

        // 数字をコンマ区切り(言語によってはドットまたはスペース区切り)に
        var text = total.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1' + window.ttts.str_thousandsSeparator);
        dom_price.innerText = text;
        dom_tfoot.classList.remove('hidden');
        if (isAgreed()) {
            dom_btnnext.classList.remove('btn-disabled');
        }
        return false;
    };
    // 合計金額初期表示
    reloadTotalCharge();

    // 券種変更イベント
    $(document).on('change', 'select', function() {
        reloadTotalCharge();
    });

    // 規約同意
    $('#checkbox_agreed').on('change', function() {
        if (isSubmitting) { return false; }
        this.parentNode.className = (this.checked) ? 'agreed' : '';
        if (this.checked && isValidTicketsSelected) {
            document.getElementById('btn_next').classList.remove('btn-disabled');
        } else {
            document.getElementById('btn_next').classList.add('btn-disabled');
        }
    });

    // 次へ
    $(document).on('click', '.btn-next', function(e) {
        // 予約メモ欄を一つに変更
        var watcherName = $('input[name="watcherName"]').val();
        if (watcherName == '') {
            alert('予約メモは必ず入力してください');
            return false;
        }
        // 予約メモ欄を無視して買おうとしている券があったらアラート
        // if (Array.prototype.some.call(document.querySelectorAll('input[name="watcherName"]'), function(input_watcherName) {
        //     var qselect = document.getElementById('select_ticketq_' + input_watcherName.getAttribute('data-ticket-code'));
        //     return ((parseInt(qselect.value, 10) > 0) && !input_watcherName.value);
        // })) {
        //     alert('購入するチケットの予約メモは必ず入力してください');
        //     return false;
        // }
        if (!isAgreed() || isSubmitting) {
            return false;
        }
        $('form input[name="choices"]').val('');
        // 座席コードリストを取得
        var choices = [];
        $('.table-tickets tbody tr').each(function() {
            var ticketCount = $('option:selected', this).val();
            if (ticketCount > 0) {
                choices.push({
                    ticket_type: $(this).attr('data-ticket-code'),
                    ticket_count: ticketCount,
                    //watcher_name: $('input', this).val()
                    watcher_name: watcherName
                });
            }
        });
        if (choices.length > 0) {
            $('form input[name="choices"]').val(JSON.stringify(choices));
        }
        isSubmitting = true;
        e.currentTarget.querySelector('span').innerText = window.ttts.commonlocales.Sending;
        e.currentTarget.classList.add('btn-disabled');
        return $('form').submit();
    });
});
