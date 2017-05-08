/**
 * 初期状態で選択中だった座席と、
 * 画面上で選択中の座席については
 * 状態変化させてはいけないので、注意すること
 */
$(function(){
    var _limit = parseInt($('input[name="seatsLimit"]').val());
    var _screenSeatStatusesMap;
    /** 初期状態で選択中だった座席コード(仮予約中の座席) */
    var _initialActiveSeatCodes = JSON.parse($('.seatStatusesMap').attr('data-seat-codes'));
    /** 現在選択中の座席 */
    var _activeSeatCodes = JSON.parse($('.seatStatusesMap').attr('data-seat-codes'));
    /** 内部関係者フローかどうか */
    var isStaff = $('body').hasClass('page-staff');

    /** 座席イベントタイプ */
    var seatSelectEvantType = 'click';
    var ua = window.navigator.userAgent.toLowerCase();
    if (ua.indexOf('ipad') > -1) {
        seatSelectEvantType = 'touchend';
    }

    /**
     * 空席状況マップを表示する
     */
    function showSeatStatusesMap(initialize) {
        $.ajax({
            dataType: 'json',
            url: $('.seatStatusesMap').attr('data-url') + '?' + Date.now(),
            type: 'GET',
            data: {},
            beforeSend: function() {
            }
        }).done(function(data) {
            // 内部関係者の場合
            if (isStaff) {
                var propertiesBySeatCode = data.propertiesBySeatCode;

                $('.seat a').each(function(){
                    var seatCode = $(this).attr('data-seat-code');
                    var properties = propertiesBySeatCode[seatCode];

                    // DBに登録されていない座席
                    if (!properties) {
                        return;
                    }

                    // 仮予約中と現在選択中の座席を除いて状態を最新に更新する
                    if (_initialActiveSeatCodes.indexOf(seatCode) < 0 && _activeSeatCodes.indexOf(seatCode) < 0) {
                        $(this).removeClass('select-seat disabled entered');
                        if (properties.avalilable) {
                            $(this).addClass('select-seat');
                        } else if (properties.entered) {
                            $(this).addClass('entered');
                        } else {
                            $(this).addClass('disabled');
                        }
                    }

                    $(this).attr('data-baloon-content', properties.baloonContent);
                });
            } else {
                var unavailableSeatCodes = data;

                $('.seat a').each(function(){
                    var seatCode = $(this).attr('data-seat-code');
                    // 基本的にバルーンコンテンツは座席コード
                    $(this).attr('data-baloon-content', seatCode);

                    // 仮予約中と現在選択中の座席を除いて状態を最新に更新する
                    if (_initialActiveSeatCodes.indexOf(seatCode) < 0 && _activeSeatCodes.indexOf(seatCode) < 0) {
                        if (unavailableSeatCodes.indexOf(seatCode) >= 0) {
                            $(this).removeClass('select-seat');
                            $(this).addClass('disabled');
                        } else {
                            $(this).removeClass('disabled');
                            $(this).addClass('select-seat');
                        }
                    }
                });
            }
        }).fail(function(jqxhr, textStatus, error) {
        }).always(function() {
            if (initialize) {
                // 初期状態で選択中だった座席は仮予約中なので選択可能に
                _initialActiveSeatCodes.forEach(function(seatCode) {
                    $('.seat a[data-seat-code="' + seatCode + '"]').addClass('select-seat active');
                });

                _screenSeatStatusesMap = new ScreenSeatStatusesMap($('.screen'));
            }

            $('.seatStatusesMap').removeClass('hidden');

            if (isStaff) {
                // 60秒おきに状況とりにいく
                setTimeout(function(){
                    showSeatStatusesMap(false)
                }, 5000);
            } else {
                // 60秒おきに状況とりにいく
                setTimeout(function(){
                    showSeatStatusesMap(false)
                }, 60000);
            }
        });
    }

    /**
     * 座席クリックイベント
     */
    $(document).on(seatSelectEvantType, '.select-seat', function(){
        // スマホで拡大操作
        if (_screenSeatStatusesMap.isDeviceType('sp') && _screenSeatStatusesMap.state === ScreenSeatStatusesMap.STATE_DEFAULT) {
            return;
        }

        // 座席数上限チェック
        if (!$(this).hasClass('active')) {
            if ($('.select-seat.active').length > _limit - 1) {
                alert($('input[name="seatsLimitMessage"]').val());
                return;
            }
        }

        // カウンター機能は、外部関係者のみのための機能
        var count = parseInt($('.reservable-count').text());
        if ($(this).hasClass('active')) {
            $('.reservable-count').text(count + 1);
            _activeSeatCodes.splice(_activeSeatCodes.indexOf($(this).attr('data-seat-code')), 1) ;
        } else {
            $('.reservable-count').text(count - 1);
            _activeSeatCodes.push($(this).attr('data-seat-code'));
        }

        $(this).toggleClass('active');
    });

    /**
     * 次へクリックイベント
     */
    $(document).on('click', '.btn-next', function(){
        // 座席コードリストを取得
        var seatCodes = $('.select-seat.active').map(function(){return $(this).attr('data-seat-code')}).get();

        if (seatCodes.length < 1) {
            alert($('input[name="messageRequiredSeat"]').val());
        } else {
            // location.hrefにpostする
            var form = $('<form/>', {'method': 'post'});
            form.append($('<input/>', {
                'type': 'hidden',
                'name': 'seatCodes',
                'value': JSON.stringify(seatCodes)
            }));
            form.appendTo(document.body);
            form.submit();
        }
    });

    showSeatStatusesMap(true);
});
