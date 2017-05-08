$(function () {
    var locale = $('html').attr('lang');
    var reservations4cancel = null; // キャンセルしようとしている予約リスト

    $('.confirm-cancel').on('click', function () {
        reservations4cancel = null;

        $.ajax({
            dataType: 'json',
            type: 'POST',
            url: $(this).attr('data-url'),
            data: {
                paymentNo: $('input[name="paymentNo"]').val(),
                last4DigitsOfTel: $('input[name="last4DigitsOfTel"]').val()
            },
            beforeSend: function () {
                $('.errmsg').text('');
                $('.cancel-reservation-confirm').modal('hide');
                $('.accountForm').hide();
                reservationIds4cancel = [];
            }
        }).done(function (data) {
            if (data.success) {
                reservations4cancel = data.reservations;

                var html = ''
                    + '<tr><th>購入番号<br>Transaction number</th><td>' + data.reservations[0].payment_no + '</td></tr>'
                    + '<tr><th>タイトル<br>Title</th><td>' + data.reservations[0].film_name.ja + '<br>' + data.reservations[0].film_name.en + '</td></tr>'
                    + '<tr><th>上映時間/場所<br>Date/Location</th><td>'
                    + data.reservations[0].performance_start_str.ja + '  ' + data.reservations[0].location_str.ja
                    + '<br>' + data.reservations[0].performance_start_str.en + '  ' + data.reservations[0].location_str.en
                    + '</td></tr>'
                    + '<tr><th>座席<br>Seat</th><td>';

                data.reservations.forEach(function (reservation, index) {
                    if (index > 0) html += ', ';
                    html += reservation.seat_code;
                });
                html += '<br>※キャンセルは購入番号単位となります。<br>*You can cancel the reservation with the transaction number.';
                html += '</td></tr>';

                html += '<tr><th>お支払い方法<br>Method of payment</th><td>';
                if (data.reservations[0].payment_method === "0") {
                    html += 'クレジット<br>credit'
                } else if (data.reservations[0].payment_method === "3") {
                    html += 'コンビニ<br>convenience'
                }
                html += '</td></tr>';

                html += '<tr><th>合計金額<br>Total</th><td>';
                var total = 0;
                data.reservations.forEach(function (reservation, index) {
                    total += parseInt(reservation.charge);
                });
                var totalStr = total.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1,');
                html += '\\' + totalStr;
                html += '</td></tr>';

                $('.table-reservation-confirm').html(html);
                $('.cancel-reservation-confirm').modal();
            } else {
                $('.errmsg').html(data.message);
            }
        }).fail(function (jqxhr, textStatus, error) {
            $('.errmsg').text('Unexpected Error.');
        }).always(function (data) {
        });
    });

    $('.execute-cancel').on('click', function () {
        // コンビニ決済の場合、EWフォームへリダイレクト
        if (reservations4cancel[0].payment_method === '3') {
            return location.href = "https://reg18.smp.ne.jp/regist/is?SMPFORM=lcld-nimgm-06e554249b87102fbffdf75273feefbf&ticket=" + reservations4cancel[0].payment_no;
        }

        $.ajax({
            dataType: 'json',
            type: 'POST',
            url: $(this).attr('data-url'),
            data: {
                paymentNo: $('input[name="paymentNo"]').val(),
                last4DigitsOfTel: $('input[name="last4DigitsOfTel"]').val()
            },
            beforeSend: function () {
                $('.cancel-reservation-confirm').modal('hide');
                $('.loading').modal();
            }
        }).done(function (data) {
            $('.loading').modal('hide');

            if (data.success) {
                $('input[name="paymentNo"]').val("");
                $('input[name="last4DigitsOfTel"]').val("");
                $('.cancel-reservation-complete').modal();
            } else {
                alert("キャンセルできませんでした。\nFailed in canceling." + data.message);

            }
        }).fail(function (jqxhr, textStatus, error) {
            alert("キャンセルできませんでした。\nFailed in canceling.");
        }).always(function (data) {
        });
    });

    $('.show-details-refund-procedure-ja').on('click', function () {
        $('.details-refund-procedure-ja').modal();
    });
    $('.show-details-refund-procedure-en').on('click', function () {
        $('.details-refund-procedure-en').modal();
    });
});