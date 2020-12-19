(function () {
    /** 全予約リスト */
    var reservationsById;
    var reservationIdsByQrStr;
    /** 全予約IDリスト */
    var reservationIds;
    var qrStrs;

    $(function(){
        $('.btn-list').on('click', function(){
            getReservations();
        });

        // QR文字列より予約取得
        $('.btn-get').on('click', function(){
            sendQR("GET");
        });
        // QR文字列よりチェックイン情報作成
        $('.btn-post').on('click', function(){
            sendQR("POST");
        });
        // QR文字列よりチェックイン情報作成
        $('.btn-delete').on('click', function(){
            sendQR("DELETE");
        });

        /**
         * 予約情報取得
         * @function getReservations
         * @param {funstion} cb
         * @returns {void}
         */
        function getReservations(cb) {
            var id = $('input[name=performanceId]').val();
            $('#reservations').val('');
            $.ajax({
                dataType: 'json',
                url: '/checkin/performance/reservations',
                type: 'POST',
                cache : false,
                data: {
                    performanceId: id
                },
                beforeSend: function () {
                }
            }).done(function (data) {
                if (!data.error) {
                    $('#reservations').val(JSON.stringify(data));
                    /** 全予約リスト */
                    reservationsById = data.reservationsById;
                    reservationIdsByQrStr = data.reservationIdsByQrStr;
                    /** 全予約IDリスト */
                    reservationIds = Object.keys(reservationsById);
                    qrStrs = Object.keys(reservationIdsByQrStr);
                }
            }).fail(function (jqxhr, textStatus, error) {
                console.error(jqxhr, textStatus, error);
            }).always(function () {
                //updateResults();
                //if (cb !== undefined) cb();
            });
        }
        /**
         * QR文字列送信 予約取得/チェックイン/チェックイン取消
         * @function sendQR
         * @param {string} type
         * @returns {void}
         */
        function sendQR(type) {
            /* チェックインに入れる情報 */
            var checkPointGroup = document.getElementById('input_pointgroup').value;
            var checkUserName = document.getElementById('input_username').value;
            var unixTimestamp = (new Date()).getTime();
            var checkin = {
                _id: unixTimestamp,
                when: unixTimestamp,
                where: checkPointGroup,
                why: '',
                how: checkUserName
            };
            var qr = $('input[name=qr]').val();
            var when = $('input[name=when]').val();
            $('#result').val('');
            $.ajax({
                dataType: 'json',
                url: '/checkin/reservation/' + qr,
                type: type,
                cache : false,
                data: {
                    qr: qr,
                    when: when,
                    checkin: checkin
                },
                beforeSend: function () {
                }
            }).done(function (data) {
                $('#result').val(JSON.stringify(data));
            }).fail(function (jqxhr, textStatus, error) {
                console.error(jqxhr, textStatus, error);
            }).always(function () {
            });
        }

    });
})();
