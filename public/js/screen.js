var ScreenSeatStatusesMap = (function () {
    function ScreenSeatStatusesMap(target) {
        this.resizeTimer = null;
        this.scrollTimer = null;
        this.target = target;
        this.init();
        this.setEvent();
    }
    ScreenSeatStatusesMap.prototype.init = function () {
        this.state = ScreenSeatStatusesMap.STATE_DEFAULT;
        this.pos = {
            x: 0,
            y: 0
        };
        this.zoom_btn = this.target.find('.zoom-btn');
    };
    ScreenSeatStatusesMap.prototype.getBgImage = function (target) {
        var image = new Image();
        image.src = target.css('backgroundImage').replace(/url\(['"]*(.*?)['"]*\)/g, '$1');
        return $(image);
    };
    ScreenSeatStatusesMap.prototype.setEvent = function () {
        var _this = this;
        this.getBgImage(this.target.find('.screen-inner')).on('load', function () {
            _this.loadHandler();
        });
        $(window).on('resize show.bs.modal', function () {
            if (_this.resizeTimer) {
                clearTimeout(_this.resizeTimer);
            }
            _this.resizeTimer = setTimeout(function () {
                _this.resizeHandler();
            }, 300);
        });
        $(window).on('scroll', function () {
            if (_this.scrollTimer) {
                clearTimeout(_this.scrollTimer);
            }
            _this.scrollTimer = setTimeout(function () {
                _this.scrollHandler();
            }, 200);
        });
        this.target.on('click', function (e) {
            if (_this.isDeviceType('sp')) {
                _this.screenClickHandler(e);
            }
        });
        this.zoom_btn.find('a').on('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            _this.resize();
        });
        this.target.on('touchstart', function (e) {
            if (_this.isDeviceType('sp')) {
                if (_this.isZoomState()) {
                    _this.screenTouchStartHandler(e);
                }
            }
        });
        this.target.on('touchmove', function (e) {
            if (_this.isDeviceType('sp')) {
                if (_this.isZoomState()) {
                    e.preventDefault();
                    _this.screenTouchMoveHandler(e);
                }
            }
        });
        this.target.on('touchend', function (e) {
            if (_this.isDeviceType('sp')) {
                if (_this.isZoomState()) {
                    _this.screenTouchEndHandler(e);
                }
            }
        });
        this.target.find('.seat').each(function (i, elm) {
            $(elm).find('a').on('mouseover', function () {
                if (_this.isDeviceType('pc')) {
                    _this.seatMouseoverHandler($(elm));
                }
            });
        });
        this.target.find('.seat').each(function (i, elm) {
            $(elm).find('a').on('mouseout', function () {
                if (_this.isDeviceType('pc')) {
                    _this.seatMouseoutHandler($(elm));
                }
            });
        });
    };
    ScreenSeatStatusesMap.prototype.seatMouseoutHandler = function (target) {
        var balloon = $('.balloon');
        balloon.removeClass('active');
    };
    ScreenSeatStatusesMap.prototype.seatMouseoverHandler = function (target) {
        var balloon = $('.balloon');
        var content = target.find('a').attr('data-baloon-content');
        content = content.replace('-', ' - '); // Edgeブラウザーでハイフンの前にスペースを入れないとフリーズするため
        balloon.addClass('active');
        balloon.html(content);
        var inner = this.target.find('.screen-inner');
        var margin = parseInt(inner.css('marginLeft'), 10);
        var top = target.position().top + target.height() + 10;
        var left = target.position().left + target.width() / 2 - balloon.outerWidth() / 2 + margin;
        balloon.css({
            top: top,
            left: left
        });
    };
    ScreenSeatStatusesMap.prototype.setPosition = function (x, y) {
        this.pos = {
            x: x,
            y: y
        };
    };
    ScreenSeatStatusesMap.prototype.isZoomState = function () {
        return (this.state === ScreenSeatStatusesMap.STATE_ZOOM);
    };
    ScreenSeatStatusesMap.prototype.loadHandler = function () {
        this.resize();
    };
    ScreenSeatStatusesMap.prototype.resizeHandler = function () {
        this.resize();
    };
    ScreenSeatStatusesMap.prototype.scrollHandler = function () {
        var scrollY = $(window).scrollTop();
        if (scrollY > this.screen_offsetTop_minus_windowHeight
            && scrollY < this.screen_offsetBottom_minus_windowHeight) {
            this.zoom_btn.css('position', 'fixed');
        }
        else {
            this.zoom_btn.css('position', 'absolute');
        }
    };
    ScreenSeatStatusesMap.prototype.screenClickHandler = function (event) {
        var inner = this.target.find('.screen-inner');
        var x = event.pageX - this.target.offset().left;
        var y = event.pageY - this.target.offset().top;
        if (!this.isZoomState()) {
            this.zoom(x, y);
            event.stopPropagation();
        }
    };
    ScreenSeatStatusesMap.prototype.screenTouchStartHandler = function (event) {
        var inner = this.target.find('.screen-inner');
        var pageX = event.originalEvent.touches[0].pageX;
        var pageY = event.originalEvent.touches[0].pageY;
        var x = pageX - this.target.offset().left;
        var y = pageY - this.target.offset().top;
        this.setPosition(x, y);
        inner.removeClass('transition');
    };
    ScreenSeatStatusesMap.prototype.screenTouchMoveHandler = function (event) {
        var inner = this.target.find('.screen-inner');
        var pageX = event.originalEvent.touches[0].pageX;
        var pageY = event.originalEvent.touches[0].pageY;
        var x = pageX - this.target.offset().left;
        var y = pageY - this.target.offset().top;
        var left = inner.position().left - (this.pos.x - x);
        var top = inner.position().top - (this.pos.y - y);
        inner.css({
            top: top,
            left: left
        });
        this.setPosition(x, y);
    };
    ScreenSeatStatusesMap.prototype.screenTouchEndHandler = function (event) {
    };
    ScreenSeatStatusesMap.prototype.zoom = function (x, y) {
        var parent = this.target.parent();
        var inner = this.target.find('.screen-inner');
        var ratio = parent.width() / (inner.width());
        if (parent.width() - inner.width() > 0) {
            ratio = 1;
        }
        var margin = parseInt(inner.css('marginRight'), 10);
        var zoom = 2.5;
        var top = (this.target.height() / 2) - (y * zoom);
        var left = (parent.width() / 2) - (x * zoom);
        inner.addClass('transition');
        inner.css({
            top: top,
            left: left,
            transform: 'scale(' + zoom * ratio + ')'
        });
        this.state = ScreenSeatStatusesMap.STATE_ZOOM;
        this.zoom_btn.addClass('active');
    };
    ScreenSeatStatusesMap.prototype.resize = function () {
        var _this = this;
        var parent = this.target.parent();
        var inner = this.target.find('.screen-inner');
        var ratio = parent.width() / (inner.width());
        if (parent.width() - inner.width() > 0) {
            ratio = 1;
        }
        if (ratio < 0) {
            return setTimeout(function () {
                _this.resize();
            }, 200);
        }
        if (1 >= ratio) {
            inner.css({
                top: 0,
                left: 0,
                transformOrigin: '0 0',
                transform: 'scale(' + ratio + ')'
            });
            this.target.height(inner.height() * ratio);
        }
        else {
            inner.css({
                top: 0,
                left: 0,
                transform: 'none'
            });
            this.target.height(inner.height());
        }
        if (this.isDeviceType('sp')) {
            var balloon = $('.balloon');
            balloon.removeClass('active');
        }
        this.screen_offsetTop_minus_windowHeight = this.target.offset().top - $(window).height();
        this.screen_offsetBottom_minus_windowHeight = this.target.height() + this.screen_offsetTop_minus_windowHeight;
        this.zoom_btn.removeClass('active');
        this.state = ScreenSeatStatusesMap.STATE_DEFAULT;
    };
    ScreenSeatStatusesMap.prototype.isDeviceType = function (type) {
        var target;
        if (type.toLowerCase() === 'pc') {
            target = $('.device-type-pc');
        }
        else if (type.toLowerCase() === 'sp') {
            target = $('.device-type-sp');
        }
        if (target.is(':visible')) {
            return true;
        }
        return false;
    };
    ScreenSeatStatusesMap.prototype.isTouchDevice = function () {
        if (window.ontouchstart === null) {
            return true;
        }
        return false;
    };
    ScreenSeatStatusesMap.STATE_DEFAULT = 0;
    ScreenSeatStatusesMap.STATE_ZOOM = 1;
    return ScreenSeatStatusesMap;
}());
