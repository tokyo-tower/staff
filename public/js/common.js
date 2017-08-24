/* global Url */
'use strict';

// プライベートブラウジング時のsessionStorage.setItemエラー回避用
window.setSessionStorage = function(key, value) {
    if (!window.sessionStorage) return;
    try {
        window.sessionStorage.setItem(key, value);
    } catch (err) {
        console.log(err);
    }
};

$(function() {
    var $window = $(window);
    var CSSBREAKPOINT_MOBILE = 480;
    // var CSSBREAKPOINT_TABLET = 800;
    var fn_checkPageWidthIsMobile = function() { return (window.innerWidth <= CSSBREAKPOINT_MOBILE); };
    // var fn_checkPageWidthIsNotPc = function () { return (window.innerWidth >= CSSBREAKPOINT_TABLET); };

    // 言語切替
    var select_locale = document.getElementById('select_locale');
    if (select_locale) {
        var domurl = new Url();
        var currentLocale = domurl.query.locale || window.sessionStorage.getItem('locale') || '';
        if (currentLocale && select_locale.querySelector('option[value=' + currentLocale + ']')) { select_locale.value = currentLocale; }
        select_locale.onchange = function() {
            domurl.query.locale = null;
            window.setSessionStorage('locale', this.value);
            location.replace('/language/update/' + this.value + '?cb=' + domurl.toString());
        };
    }

    /*
    汎用イベント
    */
    $(document)
        // スマホ用アコーディオン開閉
        .on('click', '.accordion_mobile_inner', function(e) {
            e.stopPropagation();
        })
        .on('click', '.accordion_mobile_toggle', function() {
            if (!~this.parentNode.className.indexOf('reservationstatus') && !fn_checkPageWidthIsMobile()) { return false; }
            if (~this.className.indexOf('performance')) {
                $(this).toggleClass('accordion_mobile_toggleIsOpen').find('.accordion_mobile_inner').stop(false, true).slideToggle(200);
            } else {
                $(this).toggleClass('accordion_mobile_toggleIsOpen').next('.accordion_mobile_inner').stop(false, true).slideToggle(200);
            }
        })
    ;

    // Window Resize
    var timer_risize = null;
    $window.on('resize', function() {
        clearTimeout(timer_risize);
        timer_risize = setTimeout(function() {
            if (!fn_checkPageWidthIsMobile()) {
                $('.accordion_mobile_toggleIsOpen').removeClass('accordion_mobile_toggleIsOpen');
                $('.accordion_mobile_inner').show();
            }
        }, 300);
    });
});
