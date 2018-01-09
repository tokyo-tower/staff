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
    if (window.ttts.mode === 'customer') {
        // セッションに入ってた入力値
        var local_address = window.ttts.local.address || '';
        var local_tel = window.ttts.local.tel || '';

        // 国選択兼電話番号入力欄 ( https://github.com/jackocnr/intl-tel-input )
        var $input_tel = $('#id_tel');
        window.ttts.dom_input_tel = $input_tel[0];
        var $input_tel_otherregion = $('#input_tel_otherregion');
        window.ttts.dom_input_tel_otherregion = $input_tel_otherregion[0];

        var setCountry = function(val) {
            document.getElementById('input_country').value = (val || $input_tel.intlTelInput('getSelectedCountryData').iso2 || local_address || '').toUpperCase();
        };
        // Staffでは国選択不要なのでロードしない
        if ($.fn.intlTelInput) {
            // 言語別ごとで表示順位を上げる国を設定する
            var preferredCountries = window.ttts.preferred_countries || '';
            preferredCountries = (preferredCountries) ? JSON.parse(preferredCountries) : ['jp', 'tw', 'cn', 'kr', 'us', 'fr', 'de', 'it', 'es', 'vn', 'id', 'th', 'ru'];

            $input_tel.intlTelInput({
                utilsScript: '/js/lib/intl-tel-input/utils.js',
                preferredCountries: preferredCountries,
                customPlaceholder: function(selectedCountryPlaceholder) {
                    return selectedCountryPlaceholder.replace(/-/g, '');
                }
            }).done(function() {
                // セッションの値があったら適用する
                if (local_address && local_address !== 'XX') {
                    $input_tel.intlTelInput('setCountry', local_address.toLowerCase());
                }
                if (local_tel) {
                    if (local_address !== 'XX') {
                        $input_tel.intlTelInput('setNumber', local_tel);
                    }
                    $('#checkbox_otherregion').prop('checked', (local_address === 'XX')).trigger('change');
                }
            });

            // intl-TelInputのサポート外地域(チベットなど)をカバー
            $('#checkbox_otherregion').on('change', function(e) {
                // "Other Area"にチェックが入ったら使うinput[name=tel]を入れ替える
                if (e.target.checked) {
                    $input_tel[0].disabled = true;
                    $input_tel_otherregion[0].disabled = false;
                    $('#wrapper_tel_otherregion').fadeIn(200);
                    $input_tel.removeClass('input-required');
                    $input_tel_otherregion.addClass('input-required');
                    setCountry('XX'); // *The code XX is being used as an indicator for unknown states, other entities or organizations.
                } else {
                    $input_tel[0].disabled = false;
                    $input_tel_otherregion[0].disabled = true;
                    $('#wrapper_tel_otherregion').fadeOut(200);
                    $input_tel.addClass('input-required');
                    $input_tel_otherregion.removeClass('input-required');
                    setCountry();
                }
            });
        } else {
            alert('failed to load intl-tel-input');
        }


        // メールアドレスの確認欄2つを結合してhiddenのinputに保存
        var input_email = document.getElementById('id_email');
        var input_emailconfirmconcat = document.getElementById('input_emailconfirmconcat');
        var input_emailConfirm = document.getElementById('id_emailConfirm');
        var input_emailConfirmDomain = document.getElementById('id_emailConfirmDomain');
        var setEmailConfirm = function() {
            if (!input_email || !input_emailconfirmconcat) { return false; }
            var val = input_emailConfirm.value + '@' + input_emailConfirmDomain.value;
            if (input_email.value) {
                input_emailconfirmconcat.value = (input_email.value === val) ? val : '!';
            } else {
                input_emailconfirmconcat.value = '';
            }
        };

        // カード有効期限のYYYYとMMのセレクト要素の値を結合してhiddenのinputに保存
        var input_expire = document.getElementById('expire');
        var select_cardExpirationYear = document.getElementById('cardExpirationYear');
        var select_cardExpirationMonth = document.getElementById('cardExpirationMonth');
        var setExpiredate = function() {
            if (!input_expire || !select_cardExpirationYear || !select_cardExpirationMonth) { return false; }
            var val = select_cardExpirationYear.value + select_cardExpirationMonth.value;
            input_expire.value = (val.length === 'YYYYMM'.length) ? val : '';
        };


        /*
            バリデーション
        */
        // 置換用エラー文言
        // トークン取得前にバリデーション
        var validateCreditCardInputs = function() {
            var bool_valid = true;
            Array.prototype.forEach.call(document.getElementsByClassName('input-required'), function(elm) {
                var error = null;
                var parentSelector = elm.getAttribute('data-parentSelector') || '.tr-' + elm.name;
                var elm_parent = document.querySelector(parentSelector);
                var elm_errmsg = document.querySelector('.errmsg-' + elm.name);
                var filedname = elm.getAttribute('data-fieldname');
                var maxLength = elm.getAttribute('maxLength') || null;
                var regex = elm.getAttribute('data-pattern') || '';
                regex = (regex) ? new RegExp(regex) : '';
                // 電話番号についてはintlTelInputに投げる
                if (elm.id === 'id_tel') {
                    if (!$input_tel.intlTelInput('isValidNumber')) {
                        error = 'invalid';
                    }
                // 確認メールアドレスは一致してなかった場合値が '!' になっている
                } else if (elm.id === 'input_emailconfirmconcat') {
                    error = (elm.value === '!') ? 'EmailConfirmInvalid' : null;
                } else if (!elm.value) {
                    error = 'empty';
                } else if (maxLength && !elm.value.length > maxLength) {
                    error = 'maxLength';
                } else if (regex && !regex.test(elm.value)) {
                    error = 'invalid';
                }
                if (error) {
                    if (typeof window.navigator.vibrate === 'function') {
                        window.navigator.vibrate(200);
                    }
                    elm_parent.classList.add('has-error');
                    elm_errmsg.innerText = window.ttts.errmsgLocales[error].replace('{{fieldName}}', filedname).replace('{{max}}', maxLength);
                    bool_valid = false;
                } else {
                    elm_parent.classList.remove('has-error');
                    elm_errmsg.innerText = '';
                }
            });
            return bool_valid;
        };
    }


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

