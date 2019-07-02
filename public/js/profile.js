/* global Multipayment */
window.ttts.profileformsubmitting = false;
window.ttts.dom_input_tel = {};
window.ttts.dom_input_tel_otherregion = {};

/**
 * トークン取得後イベント
 * @function someCallbackFunction
 * @param {Object} response
 * @param {Object} response.tokenObject
 * @param {number} response.resultCode
 * @returns {void}
 */
function someCallbackFunction(response) {
    if (response.resultCode !== '000') {
        $('.btn-next').removeClass('btn-disabled').find('span').text(window.ttts.commonlocales.Next);
        window.ttts.profileformsubmitting = false;
        return alert(window.ttts.errmsgLocales.cardtoken);
    }
    // カード情報は念のため値を除去
    $('input[name=cardNumber]').val('');
    $('select[name=cardExpirationYear]').val('');
    $('select[name=cardExpirationMonth]').val('');
    $('input[name=securitycode]').val('');
    $('input[name=holdername]').val('');
    // 予め購入フォームに用意した token フィールドに、値を設定
    $('input[name=gmoTokenObject]').val(JSON.stringify(response.tokenObject));
    // 電話番号は数字だけ保存する
    window.ttts.dom_input_tel.value = (window.ttts.dom_input_tel.value || '').replace(/\-|\+/g, '');
    window.ttts.dom_input_tel_otherregion.value = (window.ttts.dom_input_tel_otherregion.value || '').replace(/\-|\+/g, '');
    // スクリプトからフォームを submit
    $('form').submit();
}

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
    };

    Multipayment.getToken(sendParam, someCallbackFunction);
}

$(function() {
    // 送信
    $('.btn-next').on('click', function() {
        if (window.ttts.profileformsubmitting) { return false; }
        var paymentMethod = $('input[name=paymentMethod]:checked').val();
        if (paymentMethod === '0') {
            setCountry();
            setExpiredate();
            setEmailConfirm();
            if (!validateCreditCardInputs()) {
                return document.querySelector('.has-error').scrollIntoView();
            }
            window.ttts.profileformsubmitting = true;
            $('.btn-next').addClass('btn-disabled').find('span').text(window.ttts.commonlocales.Sending);
            getToken();
        } else {
            // 電話番号は数字だけ保存する
            window.ttts.dom_input_tel.value = (window.ttts.dom_input_tel.value || '').replace(/\-|\+/g, '');
            window.ttts.dom_input_tel_otherregion.value = (window.ttts.dom_input_tel_otherregion.value || '').replace(/\-|\+/g, '');
            window.ttts.profileformsubmitting = true;
            $('.btn-next').addClass('btn-disabled').find('span').text(window.ttts.commonlocales.Sending);
            $('form').submit();
        }
    });
});

