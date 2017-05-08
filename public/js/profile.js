$(function () {
    $('.btn-next').on('click', function () {
        var paymentMethod = $('input[name=paymentMethod]:checked').val();
        if (paymentMethod === '0') {
            getToken();
        } else {
            $('form').submit();
        }
    });

    $('input[name=paymentMethod]').on('change', function () {
        var paymentMethod = $(this).val();
        if (paymentMethod === '0') {
            $('.credit').removeClass('hide');
        } else {
            $('.credit').addClass('hide');
        }
    });
});
/**
 * トークン取得
 * @function getToken
 * @returns {void}
 */
function getToken() {
    var cardno = $('input[name=cardNumber]').val();
    var expire = $('select[name=cardExpirationYear]').val() + $('select[name=cardExpirationMonth]').val();
    var securitycode = $('input[name=securitycode]').val();
    var holdername = $('input[name=holdername]').val();
    var sendParam = {
        cardno: cardno, // 加盟店様の購入フォームから取得したカード番号
        expire: expire, // 加盟店様の購入フォームから取得したカード有効期限
        securitycode: securitycode, // 加盟店様の購入フォームから取得したセキュリティコード
        holdername: holdername // 加盟店様の購入フォームから取得したカード名義人
    }
    
    Multipayment.getToken(sendParam, someCallbackFunction);
}
/**
 * トークン取得後イベント
 * @function someCallbackFunction
 * @param {Object} response
 * @param {Object} response.tokenObject
 * @param {number} response.resultCode
 * @returns {void}
 */
function someCallbackFunction(response) {
    //カード情報は念のため値を除去
    var date = new Date();
    $('input[name=cardNumber]').val('');
    $('select[name=cardExpirationYear]').val((String(date.getFullYear())));
    $('select[name=cardExpirationMonth]').val((date.getMonth() + 1 < 10) ? '0' + String(date.getMonth() + 1) : String(date.getMonth() + 1));
    $('input[name=securitycode]').val('');
    $('input[name=holdername]').val('');
    if (response.resultCode != 000) {
        alert('トークン取得エラー');
    } else {
        //予め購入フォームに用意した token フィールドに、値を設定
        $('input[name=gmoTokenObject]').val(JSON.stringify(response.tokenObject));
        //スクリプトからフォームを submit
        $('form').submit();
    }
}