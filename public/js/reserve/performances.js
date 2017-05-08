String.prototype.splice = function (idx, str) { //※日時整形用(Stringのidx文字目にstrを差し込む)
    return (this.slice(0, idx) + str + this.slice(idx));
};

$(function () {
    var API_ENDPOINT = $('input[name="apiEndpoint"]').val();

    var locale = $('html').attr('lang');
    var performances = [];
    var conditions = {
        page: '1'
    };


    function showPerformances() {
        // 作品ごとに整形(APiのレスポンスは、上映日昇順)
        var filmIds = [];
        var performancesByFilm = {};
        performances.forEach(function (performance) {
            var filmId = performance.attributes.film;
            if (filmIds.indexOf(filmId) < 0) {
                filmIds.push(filmId);
                performancesByFilm[filmId] = [];
            }

            performancesByFilm[filmId].push(performance);
        });




        var NAMETABLE_STATUS = { // CSSクラス分けのため変換
            '◎': 'vacant',
            '○': 'capable',
            '△': 'crowded',
            '×': 'soldout',
            '?': 'unknown'
        };

        var html = '';

        filmIds.forEach(function (filmId) {
            var performancesOnFilm = performancesByFilm[filmId];
            var longTitleClassName = (performancesOnFilm[0].attributes.film_name.length > 63) ? 'performance-longtitle' : '';
            html +=
                '<div class="performance ' + longTitleClassName + ' accordion_mobile_toggle">' +
                '<div class="performance-image"><img src="/images/film/' + performancesOnFilm[0].attributes.film + '.jpg"></div>' +///images/temp_performance_thumb.jpg"></div>'+
                '<div class="performance-title"><h3><span>' + $('<div/>').text(performancesOnFilm[0].attributes.film_name).html() + '</span></h3></div>' +
                '<div class="performance-inner accordion_mobile_inner">' +
                '<div class="performance-info">' +
                '<div class="desc">' + performancesOnFilm[0].attributes.film_sections.join(',') + '</div>' +
                '<div class="genreslength">' +
                '<div class="genres">' +
                '</div>';

            if (performancesOnFilm[0].attributes.film_minutes) {
                html += ((locale === 'ja') ? '<span class="length">本編 ' + performancesOnFilm[0].attributes.film_minutes + '分</span>' : '<span class="length">Running time ' + performancesOnFilm[0].attributes.film_minutes + ' minutes</span>');
            }

            html +=
                '</div>' +
                '</div>' +
                '<div class="performance-schedule">'
                ;
            var scheduleClmCount = 0; //3列ごとにwrapperで括る
            performancesOnFilm.forEach(function (performance, index) {
                performance.attributes.day = performance.attributes.day.substr(4).splice(2, '/');//Ymdをm/dに
                performance.attributes.start_time = performance.attributes.start_time.splice(2, ':');//hiをh:iに

                if (scheduleClmCount === 0) {
                    html += '<div class="wrapper-scheduleitems">';
                }
                html +=
                    '<div class="scheduleitem scheduleitem-' + NAMETABLE_STATUS[performance.seat_status] + ' select-performance" data-performance-id="' + performance.id + '">' +
                    '<div class="text">' +
                    '<h3>' + performance.attributes.day + ' ' + performance.attributes.start_time + ' - </h3>' +
                    '<p>' + performance.attributes.theater_name + '<br class="visible-pc">' + performance.attributes.screen_name.replace(/ /g, '&nbsp;') + '</p>' +
                    '</div>' +
                    '<span class="status">' + performance.attributes.seat_status + '</span>' +
                    '</div>'
                    ;
                scheduleClmCount = scheduleClmCount + 1;
                if (scheduleClmCount === 3 || index === performancesOnFilm.length - 1) {
                    html += '</div>';
                    scheduleClmCount = 0;
                }
            });
            html +=
                '</div>' +
                '<p class="performance-copyrights">' + $('<div/>').text(performancesOnFilm[0].attributes.film_copyright.replace(/<br>/g, '')).html() + '</p>' +
                '</div>' +
                '</div>'
                ;
        });


        $('.performances').html(html);
    }




    function showConditions() {
        var formDatas = $('form').serializeArray();
        formDatas.forEach(function (formData, index) {
            var name = formData.name;
            if (conditions.hasOwnProperty(name)) {
                $('input[name="' + name + '"], select[name="' + name + '"]', $('form')).val(conditions[name]);
            } else {
                $('input[name="' + name + '"], select[name="' + name + '"]', $('form')).val('');
            }
        });
    }

    function search() {
        $.ajax({
            dataType: 'json',
            url: API_ENDPOINT + '/' + locale + '/performance/search',
            type: 'GET',
            data: conditions,
            beforeSend: function () {
                $('.loading').modal();
            }
        }).done(function (body) {
            performances = body.data;
            showPerformances();
            showConditions();
            $('.total-count').text(body.meta.number_of_films);
        }).fail(function (jqxhr, textStatus, error) {
        }).always(function (data) {
            $('.loading').modal('hide');
        });
    }






    // 検索
    $(document).on('click', '.search', function () {
        conditions.page = '1';

        // 検索フォームの値を全て条件に追加
        var formDatas = $('form').serializeArray();
        formDatas.forEach(function (formData, index) {
            conditions[formData.name] = formData.value;
        });

        search();
    });

    // セレクト変更イベント
    $(document).on('change', 'form select', function () {
        conditions.page = '1';

        // 検索フォームの値を全て条件に追加
        var formDatas = $('form').serializeArray();
        formDatas.forEach(function (formData, index) {
            conditions[formData.name] = formData.value;
        });

        search();
    });

    // パフォーマンス選択
    $(document).on('click', '.select-performance', function () {
        $('input[name="performanceId"]').val($(this).attr('data-performance-id'));
        $('form').submit();
    });


    // パフォーマンスリスト表示
    $('.search').click();
});