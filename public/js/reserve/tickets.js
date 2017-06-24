$(function() {
    var LOCALE = document.documentElement.getAttribute('lang');

    // 購入上限数
    var MAX_Q = document.getElementById('input_maxq').value;

    // 合計金額の更新
    var dom_tickets_tr = document.querySelectorAll('.table-tickets tbody tr');
    var dom_tfoot = document.querySelector('tfoot');
    var dom_price = document.querySelector('.price');
    var dom_btnnext = document.querySelector('.btn-next');
    var $alertTicketOvermax = $('.alert-ticket-overmax');
    var $alertsTicket = $('.alert-ticket');
    var reloadTotalCharge = function() {
        dom_tfoot.classList.add('hidden');
        $alertsTicket.hide();
        var total = 0;
        var count = 0;
        [].forEach.call(dom_tickets_tr, function(tr) {
            var q = parseInt(tr.querySelector('select').value, 10);
            total += parseInt(tr.getAttribute('data-ticket-charge'), 10) * q;
            count += q;
        });
        if (isNaN(total) || !count || count > MAX_Q) {
            if (count > MAX_Q) {
                $alertTicketOvermax.show();
            }
            return dom_btnnext.classList.add('btn-disabled');
        }

        // 数字をコンマ区切りに
        var text = total.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1,') + ((LOCALE === 'ja') ? '円' : 'yen');
        dom_price.innerText = text;
        dom_tfoot.classList.remove('hidden');
        dom_btnnext.classList.remove('btn-disabled');
        return false;
    };
    // 合計金額初期表示
    reloadTotalCharge();

    // 券種変更イベント
    $(document).on('change', 'select', function() {
        reloadTotalCharge();
    });


    // 次へ
    var submitted = false;
    $(document).on('click', '.btn-next', function() {
        if (submitted) {
            alert('already submitted.');
            return false;
        }
        submitted = true;
        $('form input[name="choices"]').val('');
        // 座席コードリストを取得
        var choices = [];
        $('.table-tickets tbody tr').each(function() {
            var ticketCount = $('option:selected', this).val();
            if (ticketCount > 0) {
                choices.push({
                    ticket_type: $(this).attr('data-ticket-code'),
                    ticket_count: ticketCount,
                    watcher_name: $('input', this).val()
                });
            }
        });
        if (choices.length > 0) {
            $('form input[name="choices"]').val(JSON.stringify(choices));
        }
        return $('form').submit();
    });
});
