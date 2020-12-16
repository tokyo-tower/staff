import * as cinerinoapi from '@cinerino/sdk';
import * as tttsapi from '@motionpicture/ttts-api-nodejs-client';
import * as moment from 'moment-timezone';

export function chevreReservation2ttts(
    params: tttsapi.factory.reservation.event.IReservation
): tttsapi.factory.reservation.event.IReservation {
    const ticketType = params.reservedTicket.ticketType;
    const underName = params.underName;

    let paymentMethod: cinerinoapi.factory.paymentMethodType | undefined;
    if (underName !== undefined && Array.isArray(underName.identifier)) {
        const paymentMethodProperty = underName.identifier.find((p) => p.name === 'paymentMethod');
        if (paymentMethodProperty !== undefined) {
            paymentMethod = <cinerinoapi.factory.paymentMethodType>paymentMethodProperty.value;
        }
    }

    let paymentNo: string | undefined = underName?.identifier?.find((p) => p.name === 'paymentNo')?.value;
    if (typeof paymentNo !== 'string') {
        paymentNo = params.reservationNumber;
    }

    (<any>params).qr_str = params.id;
    (<any>params).payment_no = paymentNo;
    (<any>params).performance = params.reservationFor.id;
    (<any>params).performance_day = moment(params.reservationFor.startDate)
        .tz('Asia/Tokyo')
        .format('YYYYMMDD');
    (<any>params).performance_end_date = moment(params.reservationFor.endDate)
        .toDate();
    (<any>params).performance_end_time = moment(params.reservationFor.endDate)
        .tz('Asia/Tokyo')
        .format('HHmm');
    (<any>params).performance_start_date = moment(params.reservationFor.startDate)
        .toDate();
    (<any>params).performance_start_time = moment(params.reservationFor.startDate)
        .tz('Asia/Tokyo')
        .format('HHmm');
    (<any>params).charge = (ticketType.priceSpecification !== undefined) ? ticketType.priceSpecification.price : 0;
    (<any>params).payment_method = (paymentMethod !== undefined) ? paymentMethod : <any>'';
    (<any>params).seat_code = (params.reservedTicket.ticketedSeat !== undefined) ? params.reservedTicket.ticketedSeat.seatNumber : '';
    (<any>params).ticket_type = ticketType.id;
    (<any>params).ticket_type_charge = (ticketType.priceSpecification !== undefined) ? ticketType.priceSpecification.price : 0;
    (<any>params).ticket_type_name = <any>ticketType.name;
    (<any>params).purchaser_email = (underName !== undefined && underName.email !== undefined) ? underName.email : '';
    (<any>params).purchaser_first_name = (underName !== undefined && underName.givenName !== undefined) ? underName.givenName : '';
    (<any>params).purchaser_last_name = (underName !== undefined && underName.familyName !== undefined) ? underName.familyName : '';
    (<any>params).purchaser_tel = (underName !== undefined && underName.telephone !== undefined) ? underName.telephone : '';
    (<any>params).purchaser_name = (underName !== undefined && underName.name !== undefined) ? underName.name : '';

    return params;
}
