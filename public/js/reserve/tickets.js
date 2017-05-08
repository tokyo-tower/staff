$(function(){
    var locale = $('html').attr('lang');

    // 券種変更イベント
    $(document).on('change', 'select', function(){
        reloadTotalCharge();
    });

    // 次へ
    $(document).on('click', '.btn-next', function(){
        // 座席コードリストを取得
        var choices = [];
        $('.table-tickets tbody tr').each(function(){
            choices.push({
                seat_code: $(this).attr('data-seat-code'),
                ticket_type: $('option:selected', this).val(),
                watcher_name: $('input', this).val()
            });
        });

        $('form input[name="choices"]').val(JSON.stringify(choices));
        $('form').submit();
    });

    /**
     * 合計金額を再表示する
     */
    function reloadTotalCharge() {
        $('tfoot').addClass('hidden');

        var total = 0;
        $('.table-tickets tbody tr').each(function(){
            total += parseInt($('option:selected', this).attr('data-charge'));
            total += parseInt($(this).attr('data-seat-extra-charge'));
        });

        if (total === 0) return;

        // 数字をコンマ区切りに
        var text = total.toString().replace(/(\d)(?=(\d{3})+$)/g , '$1,') + ((locale === 'ja') ? '円' : 'yen');
        $('.price').text(text);
        $('tfoot').removeClass('hidden');
    }

    reloadTotalCharge();
});