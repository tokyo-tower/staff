"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chevreReservation2ttts = void 0;
// import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
const moment = require("moment-timezone");
function chevreReservation2ttts(params) {
    var _a, _b;
    const ticketType = params.reservedTicket.ticketType;
    const underName = params.underName;
    let paymentMethod;
    if (underName !== undefined && Array.isArray(underName.identifier)) {
        const paymentMethodProperty = underName.identifier.find((p) => p.name === 'paymentMethod');
        if (paymentMethodProperty !== undefined) {
            paymentMethod = paymentMethodProperty.value;
        }
    }
    let paymentNo = (_b = (_a = underName === null || underName === void 0 ? void 0 : underName.identifier) === null || _a === void 0 ? void 0 : _a.find((p) => p.name === 'paymentNo')) === null || _b === void 0 ? void 0 : _b.value;
    if (typeof paymentNo !== 'string') {
        paymentNo = params.reservationNumber;
    }
    params.qr_str = params.id;
    params.payment_no = paymentNo;
    params.performance = params.reservationFor.id;
    params.performance_day = moment(params.reservationFor.startDate)
        .tz('Asia/Tokyo')
        .format('YYYYMMDD');
    params.performance_end_date = moment(params.reservationFor.endDate)
        .toDate();
    params.performance_end_time = moment(params.reservationFor.endDate)
        .tz('Asia/Tokyo')
        .format('HHmm');
    params.performance_start_date = moment(params.reservationFor.startDate)
        .toDate();
    params.performance_start_time = moment(params.reservationFor.startDate)
        .tz('Asia/Tokyo')
        .format('HHmm');
    params.charge = (ticketType.priceSpecification !== undefined) ? ticketType.priceSpecification.price : 0;
    params.payment_method = (paymentMethod !== undefined) ? paymentMethod : '';
    params.seat_code = (params.reservedTicket.ticketedSeat !== undefined) ? params.reservedTicket.ticketedSeat.seatNumber : '';
    params.ticket_type = ticketType.id;
    params.ticket_type_charge = (ticketType.priceSpecification !== undefined) ? ticketType.priceSpecification.price : 0;
    params.ticket_type_name = ticketType.name;
    params.purchaser_email = (underName !== undefined && underName.email !== undefined) ? underName.email : '';
    params.purchaser_first_name = (underName !== undefined && underName.givenName !== undefined) ? underName.givenName : '';
    params.purchaser_last_name = (underName !== undefined && underName.familyName !== undefined) ? underName.familyName : '';
    params.purchaser_tel = (underName !== undefined && underName.telephone !== undefined) ? underName.telephone : '';
    params.purchaser_name = (underName !== undefined && underName.name !== undefined) ? underName.name : '';
    return params;
}
exports.chevreReservation2ttts = chevreReservation2ttts;
