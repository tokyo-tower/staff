'use strict';

/**
 * QRコード生成
 * @function createQRCode
 * @param {string} url QRコードURL
 * @param {any} options オプション
 * @param {number} options.width 幅
 * @param {number} options.height 高さ
 * @param {string} options.alt alt
 * @param {string} options.ext 形式
 * @returns {HTMLImageElement} QR画像
 */
function createQRCode(url, options) {
    options = options || {};
    var width = (options.width !== undefined) ? options.width : 100;
    var height = (options.height !== undefined) ? options.height : 100;
    var alt = (options.alt !== undefined) ? options.alt : '';
    var ext = (options.ext !== undefined) ? options.ext : 'png';
    // QR
    var qr = new VanillaQR({
        url: url,
        width: width,
        height: height,
        colorLight: '#FFF',
        colorDark: '#000',
        noBorder: true
    });
    var image = qr.toImage(ext);
    image.width = width;
    image.height = height;
    image.alt = alt;
    return image;
}

$(function() {
    $('.codeimg-barcode').each(function(index, element) {
        var target = $(element);
        var url = target.attr('data-qrcode');
        var code = createQRCode(url, {
            alt: 'QRコード'
        });
        target.append(code);
    });
});
