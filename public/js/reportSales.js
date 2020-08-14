$(function () {
    // datepickerセット
    $('.datepicker').datepicker({
        language: 'ja'
    });

    // 売上レポート出力ボタンイベント
    $(document).on('click', '.form-salesReport .btn-download', function () {
        var form = $('.form-salesReport');
        // now:キャッシュ避け
        var now = (new Date()).getTime();
        var url = '/reports/getAggregateSales?' + form.serialize() + '&dummy=' + now;
        console.log('[donwload] salesReport', url);
        window.open(url);
    });
});
