<template>
<div class="appcontent">
    <div class="header" v-once>
        <h1 class="pointname" @click="toggleShowingQueue"><span>{{ `${checkinAdminUser.familyName}${checkinAdminUser.givenName}` }}</span></h1>
        <a class="logout" id="btn_logout" href="#" @click="logout"></a>
    </div>

    <p class="timecontainer" @click.once="initAudio">
        <span class="date">{{ date_ymd }}</span>
        <span class="clock">{{ clock_hhmm }}</span>
    </p>

    <div class="instruction">
        <p v-if="is_processing">データ照会中...</p>
        <p v-else>次のQRコードを読み取ってください</p>
    </div>

    <div class="qrdetail" v-if="tempReservation && !is_processing">
        <div :class="['qrdetail-date', { 'qrdetail-date-ng': tempCheckin.is_ng }]">
            <p class="inner">
                <span class="day">{{ tempReservation.day }}</span>
                <span class="time">{{ tempReservation.time }}</span>
                <span v-for="(errmsg, i) in tempCheckin.checkinErrArray" :key="`errmsg${i}`" class="msg">{{ errmsg }}</span>
            </p>
        </div>
        <div :class="getClassNameByTicketName(tempReservation.ticket_type_name.ja)">
            <p class="inner">
                {{ tempReservation.ticket_type_name.ja }}<br>
                {{ tempReservation.seat_code }}<br>
                <span class="qrstr">({{ tempReservation.qr_str }})</span>
            </p>
        </div>
        <p class="btn btn-cancel" @click="cancelLastCheckin">
            <span>入場取消</span>
        </p>
    </div>

    <table class="table table-bordered checkinlogtable">
        <tbody v-if="!is_processing && tempReservation && tempReservation.checkinLogArray.length" :class="{ 'confirmingcancel': is_confirmingCancel }">
            <tr v-for="checkinLog in tempReservation.checkinLogArray" :key="checkinLog.when" :class="{ 'tr-ng': checkinLog.is_ng }">
                <td class="td-day">{{ checkinLog.day }}</td>
                <td class="td-time"> {{ checkinLog.time }}</td>
                <td class="td-where"><span>{{ checkinLog.where }}</span></td>
                <td class="td-count">{{ checkinLog.count }}</td>
            </tr>
        </tbody>
    </table>

    <div class="api-status">
        <hr>
        <p @click="restartSubmitCheckinTimeout">チェックイン通信中: <span class="count-unsent">{{ unsentQrStrArray.length }}</span> 件</p>
        <div v-if="is_showingQueue" v-html="unsentQrStrArray.join('<br>')"></div>
        <hr>
        <p @click="restartSubmitCancelTimeout">チェックイン取り消し通信中: <span class="count-canceling">{{ cancelingQrStrArray.length }}</span> 件</p>
        <div v-if="is_showingQueue" v-html="cancelingQrStrArray.join('<br>')"></div>
        <hr>
    </div>

    <div class="errorlog" v-html="logArray.join('<br>')"></div>
</div>
</template>

<script>
/*
  チェックイン用アプリ
  ・iOSのQRスキャナー(AsReader)と専用ブラウザ(AsWeb2)からwindow.keypressイベントでQR文字列を受け取って処理する
  ・QRコードから予約を参照(getReservationByQrStr)してチェックインを判定&追加(processScanResult)してAPIに報告する
  ・発生したチェックインは入場可否の判定結果に関係なくAPIに送信される(読み取り後の効果音と画面の表示以外に処理に差は出ない)
  ・読み取り直後で表示中の予約(tempReservation)のチェックインは取消ボタンで上から順に取り消すことができる(cancelLastCheckin)
  ・発生(or取り消し)したチェックインのAPIへの報告は都度行わずにキュー(unsentQrStrArray)に溜めておいてバックグラウンドで送信実行(submitCheckin, submitCancel)して消化していく
  ・QRコードから予約をすぐ参照できるように近い時間帯の予約をバックグラウンドで定期的にキャッシュする(updateReservationsCache, setUpdateReservationsCacheTimeout)
  ・チェックポイント名を触ると送信・取消中のQRの一覧をトグル表示できる(toggleShowingQueue)
  ・通信中ステータスに触れるとバックグラウンドのキュー消化プロセスをリスタートできる(restartSubmitCheckinTimeout, restartSubmitCancelTimeout)
  ・不穏な動きがあった時は画面上にログメッセージを表示する(addLog)
メモ
  ・元からGulpとTypeScriptが入っていたのでVueify + TypeScriptで組む気だったが色々設定が円滑にいかなかったのでBabelにしている
  ・何故かtypeof演算子を使うとコンパイル後に実行エラーになることがある
*/

import * as axios from 'axios';

const moment = require('moment'); // ※importだと余計なlocaleが含まれる
require('moment/locale/ja');
const type = require('type-detect');

moment.locale('ja');

// トップデッキゲートのチェックイン可能時間を何分延長するか
const EXTENDMIN_TOPDECK_AUTH = 5;

// 何ms間隔でAPIにチェックインを送信するか
const INTERVALMS_SUBMITCHECKIN = 2000;

// 何ms間隔でAPIにチェックイン取り消しを命令するか
const INTERVALMS_SUBMITCANCEL = 3000;

// 何ms間隔で予約キャッシュを更新するか
const INTERVALMS_UPDATECACHES = 30000;

// チェックイン成功時効果音
const audioYes = new Audio('/audio/yes01.mp3');
audioYes.load();
// チェックインNG時汎用
const audioNo = new Audio('/audio/no01.mp3');
audioNo.load();
// 多重チェックイン時用
const audioNo_reentry = new Audio('/audio/no_reentry.mp3');
audioNo_reentry.load();

export default {
    data() {
        return {
            moment_now: moment(), // 現在時刻moment
            checkinAdminUser: window.checkinAdminUser, // チェックインユーザー情報
            tempQrStr: '', // 読み取り中のQR文字列
            tempSubmittingQrStr: '', // ajaxでチェックイン送信中のQR文字列
            tempCancelingQrStr: '', // 取消処理中のQR文字列
            logArray: [], // ログ
            tempReservation: null, // 表示中の予約
            reservationsCacheById: {}, // 事前取得した予約キャッシュ
            reservationCacheIdsByQrStr: {}, // ↑のキー:QRの辞書
            unsentCheckinsByQrStr: {}, // 未送信のチェックイン
            unsentQrStrArray: [], // ↑のキー
            cancelingCheckinsByQrStr: {}, // 未完了のキャンセル
            cancelingQrStrArray: [], // ↑のキー
            is_processing: false, // 処理中フラグ
            is_confirmingCancel: false, // 確認フラグ(CSS用)
            is_showingErrorlog: false, // エラーログ表示フラグ
            is_showingQueue: false, // 送信キューの中身表示フラグ
            timeout_submitCheckin: null, // チェックイン送信のsetTimeoutインスタンス
            timeout_submitCancel: null, // キャンセル送信のsetTimeoutインスタンス
            timeout_updateReservationsCache: null, // キャッシュ更新のsetTimeoutインスタンス
            timeout_clearErrorlog: null, // エラーログをほとぼりが冷めたら消去するsetTimeoutインスタンス
            interval_updateMoment: null, // moment_now更新用のsetIntervalインスタンス
        };
    },
    computed: {
        date_ymd() {
            return this.moment_now.format('YYYY/MM/DD');
        },
        clock_hhmm() {
            return this.moment_now.format('HH:mm');
        },
        tempCheckin() {
            if (!this.tempReservation) {
                return null;
            }
            return this.tempReservation.checkinLogArray[0];
        },
    },
    methods: {
        // UI表示調整用setTimeout
        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },
        // 直近のログを10件まで保持
        addLog(errmsg) {
            this.logArray.unshift(errmsg);
            if (this.logArray.length > 10) {
                this.logArray.pop();
            }
            // 動きがないまま30秒過ぎたら消去
            clearTimeout(this.timeout_clearErrorlog);
            this.timeout_clearErrorlog = setTimeout(() => {
                this.logArray = [];
            }, 30000);
        },
        // ログアウト警告処理
        logout() {
            if ((this.unsentQrStrArray.length || this.cancelingQrStrArray.length)
                && !window.confirm('通信処理中のチェックインがありますが破棄して移動しますか？')) {
                return false;
            }
            return window.location.replace('/checkin/logout');
        },
        // 効果音の初期化
        initAudio() {
            audioYes.volume = 0.0;
            audioYes.play();
            audioNo.volume = 0.0;
            audioNo.play();
            audioNo_reentry.volume = 0.0;
            audioNo_reentry.play();
        },
        // 効果音の状態リセット
        resetAudioState() {
            audioNo.pause();
            audioNo.currentTime = 0.0;
            audioNo.volume = 1.0;
            audioNo_reentry.pause();
            audioNo_reentry.currentTime = 0.0;
            audioNo_reentry.volume = 1.0;
            audioYes.pause();
            audioYes.currentTime = 0.0;
            audioYes.volume = 1.0;
        },
        // 送信待機中QRコードの表示toggle
        toggleShowingQueue() {
            this.is_showingQueue = !this.is_showingQueue;
        },
        // 券種名に対応したclassNameを返す
        getClassNameByTicketName(ticketName) {
            let ticketClassName = 'qrdetail-ticket';
            if (/大人/.test(ticketName)) {
                ticketClassName += ' ticket-adult';
            }
            if (/小・中学生/.test(ticketName)) {
                ticketClassName += ' ticket-child';
            }
            if (/幼児/.test(ticketName)) {
                ticketClassName += ' ticket-infant';
            }
            if (/セット/.test(ticketName)) {
                ticketClassName += ' ticket-set';
            }
            if (/車椅子/.test(ticketName)) {
                ticketClassName += ' ticket-wheelchair';
            }
            return ticketClassName;
        },
        // reservationオブジェクトを簡易検査する
        getErrStrByReservationValidater(reservation) {
            if (type(reservation) !== 'Object') {
                return '異常な予約データ (not object)';
            }
            const requiredItems = {
                seat_code: 'string',
                ticket_type_name: 'Object',
                checkins: 'Array',
                qr_str: 'string',
                performance_day: 'string',
                performance_start_time: 'string',
                performance_end_time: 'string',
            };
            const invalidKeyArray = Object.keys(requiredItems).filter((key) => {
                return (type(reservation[key]) !== requiredItems[key]);
            });
            if (invalidKeyArray.length) {
                return `異常な予約データ (invalid ${invalidKeyArray.join(', ')})`;
            }
            return '';
        },
        // 予約情報のキャッシュを更新
        updateReservationsCache() {
            return new Promise(async (resolve) => {
                try {
                    let errmsg = '';
                    const res = await axios.post('/checkin/performance/reservations', { timeout: 30000 }).catch((err) => {
                        errmsg = err.message;
                    });
                    if (!res.data.reservationsById || !res.data.reservationIdsByQrStr) {
                        errmsg = 'invalid response';
                    }
                    if (errmsg) {
                        this.addLog(`[${moment().format('HH:mm:ss')}][updateReservationsCache] ${errmsg}`);
                        return resolve();
                    }
                    this.reservationsCacheById = res.data.reservationsById;
                    this.reservationCacheIdsByQrStr = res.data.reservationIdsByQrStr;
                    return resolve();
                } catch (e) {
                    this.addLog(`[${moment().format('HH:mm:ss')}][catched][updateReservationsCache] ${e.message}`);
                    return resolve();
                }
            });
        },
        // QRコードから予約オブジェクトを返す。キャッシュに無かったらAPIから取得を試みる。
        getReservationByQrStr(qrStr) {
            return new Promise(async (resolve) => {
                try {
                    if (!qrStr) {
                        return resolve(`QRコードが読み取れていません${qrStr}`);
                    }

                    // キャッシュにあったら返す (オブジェクトを検査したうえで)
                    const reservationsCache = this.reservationsCacheById[this.reservationCacheIdsByQrStr[qrStr]];
                    if (reservationsCache && !this.getErrStrByReservationValidater(reservationsCache)) {
                        return resolve(reservationsCache);
                    }
                    // どこにも無いのでAPIに聞く
                    // this.addLog(`[${moment().format('HH:mm:ss')}][getReservationByQrStr][${qrStr}] 予約の存在をAPIに問い合わせ`);
                    let errmsg = '';
                    const res = await axios.get(`/checkin/reservation/${qrStr}`, { timeout: 15000 }).catch((err) => {
                        errmsg = `${/404/.test(err.message) ? '存在しない予約データです。予約管理より確認してください。' : err.message}\n`;
                    });
                    if (!errmsg) {
                        // 予約オブジェクト検査
                        errmsg = this.getErrStrByReservationValidater(res.data);
                    }
                    if (errmsg) {
                        this.addLog(`[${moment().format('HH:mm:ss')}][getReservationByQrStr][${qrStr}] ${errmsg}`);
                        return resolve(errmsg);
                    }
                    // this.addLog(`[${moment().format('HH:mm:ss')}][getReservationByQrStr][${qrStr}] 予約の存在確認に成功`);
                    return resolve(res.data);
                } catch (e) {
                    this.addLog(`[${moment().format('HH:mm:ss')}][catched][getReservationByQrStr][${qrStr}] ${e.message}`);
                    return resolve('未知のエラー');
                }
            });
        },
        // チェックインをAPIに報告する (unsentQrStrArray の先頭から消化していく)
        submitCheckin() {
            return new Promise(async (resolve) => {
                let targetQr = '';
                try {
                    // キューが空なので終了
                    if (!this.unsentQrStrArray.length) {
                        return resolve();
                    }
                    targetQr = this.unsentQrStrArray[0];
                    const targetCheckin = this.unsentCheckinsByQrStr[targetQr];
                    // APIに送信
                    let errmsg = '';
                    this.tempSubmittingQrStr = targetQr;

                    return axios.post(`/checkin/reservation/${targetQr}`, targetCheckin, { timeout: 15000 }).then(() => {
                        // 無事完了したので削除
                        delete this.unsentCheckinsByQrStr[targetQr];
                    }).catch((err) => {
                        // エラー起きたので最後尾に追加 (この時点では配列内で重複)
                        this.unsentQrStrArray.push(targetQr);
                        errmsg = `${/404/.test(err.message) ? 'QRコードに該当する予約が存在しません' : err.message}\n`;
                        this.addLog(`[${moment().format('HH:mm:ss')}][submitCheckin][${targetQr}] ${errmsg}`);
                        return resolve();
                    }).then(() => {
                        // キューから削除
                        this.unsentQrStrArray.splice(this.unsentQrStrArray.indexOf(targetQr), 1);
                        this.tempSubmittingQrStr = '';
                        return resolve();
                    });
                } catch (e) {
                    this.addLog(`[${moment().format('HH:mm:ss')}][catched][submitCheckin][${targetQr}] ${e.message}`);
                    return resolve();
                }
            });
        },
        // チェックインの取消をAPIに命令する (cancelingQrStrArray の先頭から消化していく)
        submitCancel() {
            return new Promise(async (resolve) => {
                let targetQr = '';
                try {
                    // キューが空なので終了
                    if (!this.cancelingQrStrArray.length) {
                        return resolve();
                    }
                    targetQr = this.cancelingQrStrArray[0];
                    const targetCheckin = this.cancelingCheckinsByQrStr[targetQr];
                    // APIに送信
                    let errmsg = '';
                    return axios.delete(`/checkin/reservation/${targetQr}`, {
                        // 取り消すチェックインの when を送信
                        data: { when: targetCheckin.when },
                    }, { timeout: 15000 }).then(() => {
                        // 無事完了したので削除
                        delete this.cancelingCheckinsByQrStr[targetQr];
                    }).catch((err) => {
                        // エラー起きたので最後尾に追加 (この時点では配列内で重複)
                        this.cancelingQrStrArray.push(targetQr);
                        errmsg = (err.response && err.response.status === 404) ? 'QRコードに該当する予約が存在しません' : `通信エラー ${err.message}`;
                        // console.log(errmsg, err);
                        this.addLog(`[${moment().format('HH:mm:ss')}][submitCancel][${targetQr}] ${errmsg}`);
                        return resolve();
                    }).then(() => {
                        // キューから削除
                        this.cancelingQrStrArray.splice(this.cancelingQrStrArray.indexOf(targetQr), 1);
                        this.tempCancelingQrStr = '';
                        return resolve();
                    });
                } catch (e) {
                    this.addLog(`[${moment().format('HH:mm:ss')}][catched][submitCancel][${targetQr}] ${e.message}`);
                    return resolve();
                }
            });
        },
        // 表示中の予約の最新チェックインの取り消しを実行する(処理キューに入ってないか確認の上で取り消しキューに入れる)
        async cancelLastCheckin() {
            let targetQr = '';
            try {
                if (!this.tempReservation || !this.tempReservation.checkins.length) {
                    return false;
                }
                targetQr = this.tempReservation.qr_str;
                if (this.cancelingQrStrArray.indexOf(targetQr) !== -1) {
                    return alert('[連続操作エラー] 先ほど実行した取り消しの内部処理がまだ完了していません');
                }
                // 最新のチェックインを捕捉
                const targetCheckin = this.tempReservation.checkins[this.tempReservation.checkins.length - 1];
                // 対象のチェックイン履歴(一番上)を青くして強調する
                this.is_confirmingCancel = true;
                await this.sleep(100); // 画面のrepaintを待つ
                if (!window.confirm(`以下のチェックインを取り消してよろしいですか？\n${moment(targetCheckin.when).format('MM/DD HH:mm')} ${targetCheckin.how}`)) {
                    this.is_confirmingCancel = false;
                    return false;
                }
                // API送信前でまだこの画面上にしか存在しないチェックインだった場合はその場で消す
                if (this.unsentQrStrArray.indexOf(targetQr) !== -1 && this.tempSubmittingQrStr !== targetQr) {
                    delete this.unsentCheckinsByQrStr[targetQr];
                    this.unsentQrStrArray.splice(this.unsentQrStrArray.indexOf(targetQr), 1);
                // キャンセル送信のキューに入れる
                } else {
                    this.tempCancelingQrStr = targetQr;
                    this.cancelingQrStrArray.push(targetQr);
                    this.cancelingCheckinsByQrStr[targetQr] = JSON.parse(JSON.stringify(targetCheckin));
                }
                // 表示中の履歴から削除
                this.tempReservation.checkins.pop();
                this.tempReservation.checkinLogArray.shift();
                // チェックインが残ってなかったら tempReservation を釈放
                if (!this.tempReservation.checkins.length) {
                    this.tempReservation = null;
                }
                this.is_confirmingCancel = false;
            } catch (e) {
                this.addLog(`[${moment().format('HH:mm:ss')}][catched][cancelLastCheckin][${targetQr}] ${e.message}`);
            }
            return false;
        },
        // 得た reservation を表示用に整形しつつ送信キューに入れる
        processScanResult(reservation, code) {
            // チェックインを作成 (checkinsがArrayなのはgetReservationByQrStrで確認済)
            reservation.checkins.push({
                when: (new Date()).toISOString(),
                where: this.checkinAdminUser.group.name,
                why: '',
                how: this.checkinAdminUser.username,
                code: code
            });

            // 効果音の再生状態を初期化しておく
            this.resetAudioState();

            // 処理中のreservationが取得キャッシュに上書きされないように転写
            const tempReservation = JSON.parse(JSON.stringify(reservation));
            const tempCheckin = tempReservation.checkins[tempReservation.checkins.length - 1];

            // checkinsを読み取ってチェックイン履歴表示用の配列を作る
            const date_today = this.moment_now.format('MM/DD');
            const moment_start = moment(reservation.performance_day + reservation.performance_start_time, 'YYYYMMDDHHmm');
            const moment_end_default = moment(reservation.performance_day + reservation.performance_end_time, 'YYYYMMDDHHmm');
            const moment_end_gate = moment(moment_end_default).add(EXTENDMIN_TOPDECK_AUTH, 'm');
            const countByCheckinGroup = {};
            const checkinLogArray = tempReservation.checkins.map((checkin) => {
                if (!checkin || !checkin.when) { return true; }
                // 判定で発生したNGメッセージ
                const checkinErrArray = [];

                // 多重チェックインフラグ
                let errflg_reentry = false;

                // トップデッキゲートでは予約時間枠の EXTENDMIN_TOPDECK_AUTH 分後まで通過OKとする
                const moment_end = (checkin.where === 'TOPDECK_AUTH') ? moment_end_gate : moment_end_default;
                // checkinのwhen(タイムスタンプ)がパフォーマンスの時間枠外だったらNG
                if (!moment(tempCheckin.when).isBetween(moment_start, moment_end)) {
                    checkinErrArray.push('入塔時間外');
                }

                // グループごとのチェックインをカウント
                if (type(countByCheckinGroup[checkin.where]) === 'undefined') {
                    countByCheckinGroup[checkin.where] = 1;
                // グループカウント済み ＝ 多重チェックイン ＝ NG
                } else {
                    checkinErrArray.push('多重チェックイン');
                    errflg_reentry = true;
                    countByCheckinGroup[checkin.where]++;
                }

                // チェックイン実行日
                const date = moment(checkin.when).format('MM/DD');
                return {
                    is_ng: !!checkinErrArray.length,
                    day: (date_today === date) ? '本日' : date,
                    time: moment(checkin.when).format('HH:mm'),
                    where: checkin.how,
                    count: countByCheckinGroup[checkin.where],
                    errflg_reentry,
                    checkinErrArray,
                };
            }).reverse();
            const tempCheckinLog = checkinLogArray[0];

            // 今発生したチェックインに対する効果音を再生
            if (tempCheckinLog.is_ng) {
                if (tempCheckinLog.errflg_reentry) { // 多重チェックイン発生時は専用NG音を優先再生
                    audioNo_reentry.play();
                } else {
                    audioNo.play();
                }
                this.addLog(`[${moment().format('HH:mm:ss')}][${tempCheckinLog.checkinErrArray.join('|')}][${reservation.qr_str}]`);
            } else {
                audioYes.play();
            }

            // 画面表示用の項目を生やす
            tempReservation.checkinLogArray = checkinLogArray;
            tempReservation.day = tempCheckinLog.day;

            // 入場可能時間の表示を判断
            const moment_end = (this.checkinAdminUser.group.name === 'TOPDECK_AUTH') ? moment_end_default : moment_end_gate;
            tempReservation.time = `${moment_start.format('HH:mm')}～${moment_end.format('HH:mm')}`;

            // 送信キューにcheckinオブジェクトを追加
            this.unsentCheckinsByQrStr[reservation.qr_str] = JSON.parse(JSON.stringify(tempCheckin));
            this.unsentQrStrArray.push(reservation.qr_str);

            // DOM更新
            this.tempReservation = tempReservation;
        },
        // スキャンしたQRコードから予約が取れたらチェックインを作成して processScanResult する
        checkQr(qrStr) {
            return new Promise(async (resolve) => {
                try {
                    if (this.unsentCheckinsByQrStr[qrStr]) {
                        const errmsg = '[連続操作エラー] このQRに先ほど実行したチェックインの内部処理がまだ完了していません';
                        alert(errmsg);
                        this.addLog(`[${moment().format('HH:mm:ss')}]${errmsg}`);
                        return resolve();
                    }

                    // QR文字列から予約IDを抽出する
                    const splittedQRStr = String(qrStr).split('@');
                    const reservationId = splittedQRStr[0];
                    const code = splittedQRStr[1];

                    const result = await this.getReservationByQrStr(reservationId);
                    if (type(result) === 'string') {
                        audioNo.play(); // QRコードが異常 || 通信エラー
                        alert(result);
                        return resolve();
                    }
                    this.processScanResult(result, code);
                } catch (e) {
                    this.addLog(`[${moment().format('HH:mm:ss')}][catched][checkQr][${qrStr}] ${e.message}`);
                }
                return resolve();
            });
        },
        // QR読み取り (keypressイベントで実行)
        scanQr(e) {
            // ※実行中の checkQr() が完了するまでは次のQRを読まない
            if (this.is_processing) {
                return this.addLog(`[${moment().format('HH:mm:ss')}][scanQr.is_processing] 1つ前に読み取ったQR = ${this.tempQrStr} の判定が完了していません`);
            }
            // Enter入力でスキャン文字列確定
            if (e.keyCode === 13) {
                this.is_processing = true;
                this.tempReservation = null;
                // this.tempQrStr = 'TTT285925417645218-0@afeccb73-386b-435a-9b95-e45ebb2699ef';
                return this.checkQr(this.tempQrStr).then(() => {
                    this.is_processing = false;
                    this.tempQrStr = '';
                });
            }
            this.tempQrStr += String.fromCharCode(e.keyCode); // ※AsReaderのイベントにはcharCodeが無い
            return true;
        },
        // INTERVALMS_SUBMITCHECKIN の間隔で submitCheckin() を繰り返す
        setSubmitCheckinTimeout() {
            this.timeout_submitCheckin = setTimeout(async () => {
                await this.submitCheckin();
                this.setSubmitCheckinTimeout();
            }, INTERVALMS_SUBMITCHECKIN);
        },
        // timeout_submitCheckin をセットし直す
        restartSubmitCheckinTimeout() {
            clearTimeout(this.timeout_submitCheckin);
            this.setSubmitCheckinTimeout();
            this.addLog(`[${moment().format('HH:mm:ss')}][restartSubmitCheckinTimeout]`);
        },
        // INTERVALMS_SUBMITCANCEL の間隔で submitCancel() を繰り返す
        setSubmitCancelTimeout() {
            this.timeout_submitCancel = setTimeout(async () => {
                await this.submitCancel();
                this.setSubmitCancelTimeout();
            }, INTERVALMS_SUBMITCANCEL);
        },
        // timeout_submitCancel をセットし直す
        restartSubmitCancelTimeout() {
            clearTimeout(this.timeout_submitCancel);
            this.setSubmitCancelTimeout();
            this.addLog(`[${moment().format('HH:mm:ss')}][restartSubmitCancelTimeout]`);
        },
        // INTERVALMS_UPDATECACHES の間隔で updateReservationsCache() を繰り返す
        setUpdateReservationsCacheTimeout() {
            this.timeout_updateReservationsCache = setTimeout(async () => {
                await this.updateReservationsCache();
                this.setUpdateReservationsCacheTimeout();
            }, INTERVALMS_UPDATECACHES);
        },
        // 初期化
        init() {
            window.addEventListener('keypress', this.scanQr, false);
            this.updateReservationsCache();
            this.setSubmitCheckinTimeout();
            this.setSubmitCancelTimeout();
            this.setUpdateReservationsCacheTimeout();
            this.interval_updateMoment = setInterval(() => {
                this.moment_now = moment();
            }, 1000);
        },
    },
    created() {
        if (!window.checkinAdminUser || !window.checkinAdminUser.username || !window.checkinAdminUser.group.name) {
            alert('ログインしたIDに紐付いたチェックポイント情報が読み取れませんでした。ログイン情報を確認してください。');
            return window.location.replace('/checkin/logout');
        }
        window.checkinApp = this;
        return this.init();
    },
    // 閉じる前にイベントリスナとタイマーを破棄
    beforeDestroy() {
        window.removeEventListener('keypress', this.scanQr);
        clearTimeout(this.timeout_submitCheckin);
        clearTimeout(this.timeout_submitCancel);
        clearTimeout(this.timeout_updateReservationsCache);
        clearInterval(this.interval_updateMoment);
    },
};
</script>
