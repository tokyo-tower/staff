"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
//const NAME_MAX_LENGTH = 15;
exports.default = (req) => {
    // // lastName
    // req.checkBody('lastName', req.__('NoInput{{fieldName}}', { fieldName: req.__('LastName') })).notEmpty();
    // req.checkBody(
    //     'lastName',
    //   req.__('MaxLength{{fieldName}}{{max}}', { fieldName: req.__('LastName'), max: NAME_MAX_LENGTH.toString() })
    // ).isLength({
    //     max: NAME_MAX_LENGTH
    // });
    // req.checkBody(
    //     'lastName',
    //     req.__('Invalid{{fieldName}}', { fieldName: req.__('LastName') })
    // ).matches(/^[ァ-ロワヲンーa-zA-Z]*$/);
    // // firstName
    // req.checkBody('firstName', req.__('NoInput{{fieldName}}', { fieldName: req.__('FirstName') })).notEmpty();
    // req.checkBody(
    //     'firstName',
    //   req.__('MaxLength{{fieldName}}{{max}}', { fieldName: req.__('FirstName'), max: NAME_MAX_LENGTH.toString() })
    // ).isLength({
    //     max: NAME_MAX_LENGTH
    // });
    // req.checkBody(
    //     'firstName',
    //     req.__('Invalid{{fieldName}}', { fieldName: req.__('FirstName') })
    // ).matches(/^[ァ-ロワヲンーa-zA-Z]*$/);
    // // tel
    // req.checkBody('tel', req.__('NoInput{{fieldName}}', { fieldName: req.__('Tel') })).notEmpty();
    // req.checkBody('tel', req.__('Message.regexTel')).matches(/^[0-9]{7,13}$/);
    // // email
    // req.checkBody('email', req.__('NoInput{{fieldName}}', { fieldName: req.__('Email') })).notEmpty();
    // req.checkBody('email', req.__('Invalid{{fieldName}}', { fieldName: req.__('Email') })).isEmail();
    // req.checkBody(
    //     'email',
    //     req.__('Match{{fieldName}}', { fieldName: req.__('Email') })
    // ).equals(`${req.body.emailConfirm}@${req.body.emailConfirmDomain}`);
    // // emailConfirm
    // tslint:disable-next-line:max-line-length
    // req.checkBody('emailConfirm', req.__('NoInput{{fieldName}}', { fieldName: req.__('EmailConfirm') })).notEmpty();
    // // emailConfirmDomain
    // req.checkBody(
    //     'emailConfirmDomain',
    //     req.__('NoInput{{fieldName}}', { fieldName: req.__('EmailConfirmDomain') })
    // ).notEmpty();
    // address
    // req.checkBody('address', req.__('NoInput{{fieldName}}', { fieldName: req.__('Form.FieldName.address') })).notEmpty();
    // paymentMethod
    // req.checkBody(
    //     'paymentMethod',
    //     req.__('NoInput{{fieldName}}', { fieldName: req.__('Form.FieldName.paymentMethod') })
    // ).notEmpty();
    // age
    // req.checkBody('age', req.__('NoInput{{fieldName}}', { fieldName: req.__('Age') })).notEmpty();
    // gender
    // req.checkBody('gender', req.__('NoInput{{fieldName}}', { fieldName: req.__('Gender') })).notEmpty();
    // 決済手段
    req.checkBody('paymentMethod', req.__('NoInput{{fieldName}}', { fieldName: req.__('Form.FieldName.paymentMethod') })).notEmpty();
};
