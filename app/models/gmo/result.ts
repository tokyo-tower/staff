// tslint:disable:variable-name
/**
 * GMO決済結果モデル
 *
 * @export
 * @class GMOResultModel
 */
export default class GMOResultModel {
    /**
     * ショップID
     */
    public ShopID: string;
    /**
     * 処理区分
     */
    public JobCd: string;
    /**
     * 利用金額
     */
    public Amount: string;
    /**
     * 税送料
     */
    public Tax: string;
    /**
     * 通貨コード
     */
    public Currency: string;
    /**
     * 取引ID
     */
    public AccessID: string;
    /**
     * 取引パスワード
     */
    public AccessPass: string;
    /**
     * オーダーID
     */
    public OrderID: string;
    /**
     * 結果仕向先コード
     */
    public Forwarded: string;
    /**
     * 支払方法
     */
    public Method: string;
    /**
     * 分割回数
     */
    public PayTimes: string;
    /**
     * カード会社承認番号
     */
    public Approve: string;
    /**
     * トランザクションID
     */
    public TranID: string;
    /**
     * 処理日時
     */
    public TranDate: string;
    /**
     * 決済結果チェック文字列
     */
    public CheckString: string;
    /**
     * エラーコード
     */
    public ErrCode: string;
    /**
     * エラー詳細
     */
    public ErrInfo: string;
    /**
     * 加盟店自由項目１(リンク決済呼び出し時の設定値)
     */
    public ClientField1: string;
    /**
     * 加盟店自由項目２(リンク決済呼び出し時の設定値)
     */
    public ClientField2: string;
    /**
     * 加盟店自由項目３(リンク決済呼び出し時の設定値)
     */
    public ClientField3: string;
    /**
     * 未登録カード利用フラグ
     */
    public NewCardFlag: string;
    /**
     * 決済方法
     */
    public PayType: string;
    /**
     * 支払先コンビニ
     */
    public CvsCode: string;
    /**
     * 確認番号
     */
    public CvsConfNo: string;
    /**
     * コンビニ受付番号
     */
    public CvsReceiptNo: string;
    /**
     * 払込票URL
     */
    public CvsReceiptUrl: string;
    /**
     * 支払期限日時((yyyyMMddHHmmss 形式))
     */
    public PaymentTerm: string;
    // /** Edy 受付番号 */
    // public EdyReceiptNo: string;
    // /** Edy 注文番号 */
    // public EdyOrderNo: string;
    // /** Suica 注文番号 */
    // public SuicaReceiptNo: string;
    // /** Suica 受付番号 */
    // public SuicaOrderNo: string;
    // /**  */
    // public BkCode: string;
    // /**  */
    // public ConfNo: string;
    // /**  */
    // public CustID: string;
    // /**  */
    // public EncryptReceiptNo: string;
    // /**  */
    // public AuPayInfoNo: string;
    // /**  */
    // public AuPayMethod: string;
    // /**  */
    // public AuCancelAmount: string;
    // /**  */
    // public AuCancelTax: string;
    // /**  */
    // public DocomoSettlementCode: string;
    // /**  */
    // public DocomoCancelAmount: string;
    // /**  */
    // public DocomoCancelTax: string;
    // /**  */
    // public SbTrackingId: string;
    // /**  */
    // public SbCancelAmount: string;
    // /**  */
    // public SbCancelTax: string;
    // /**  */
    // public JibunReceiptNo: string;
    // /**  */
    // public PayDescription: string;
    // /**  */
    // public CardNo: string;
    // /**  */
    // public BeforeBalance: string;
    // /**  */
    // public AfterBalance: string;
    // /**  */
    // public CardActivateStatus: string;
    // /**  */
    // public CardTermStatus: string;
    // /**  */
    // public CardInvalidStatus: string;
    // /**  */
    // public CardWebInquiryStatus: string;
    // /**  */
    // public CardValidLimit: string;
    // /**  */
    // public CardTypeCode: string;
    // /**  */
    // public CarryInfo: string;
    // /**  */
    // public RequestNo: string;
    // /**  */
    // public AccountNo: string;
    // /**  */
    // public NetCashPayType: string;
    // /**  */
    // public RakutenIdItemId: string;
    // /**  */
    // public RakutenIdItemSubId: string;
    // /**  */
    // public RakutenIdItemName: string;
    // /**  */
    // public LinepayTranId: string;
    // /**  */
    // public LinepayPayMethod: string; // ???
    // /**  */
    // public RecruitItemName: string;
    // /**  */
    // public RcOrderId: string;
    // /**  */
    // public RcOrderTime: string;
    // /**  */
    // public RcUsePoint: string;
    // /**  */
    // public RcUseCoupon: string;
    // /**  */
    // public RcUseShopCoupon: string;
    // /**  */
    // public VaBankCode: string;
    // /**  */
    // public VaBankName: string;
    // /**  */
    // public VaBranchCode: string;
    // /**  */
    // public VaBranchName: string;
    // /**  */
    // public VaAccountType: string;
    // /**  */
    // public VaAccountNumber: string;
    // /**  */
    // public VaAvailableDate: string;
    // /**  */
    // public VaTradeCode: string;

    // tslint:disable-next-line:function-name
    public static parse(postParameters: any): GMOResultModel {
        const model = new GMOResultModel();
        Object.keys(postParameters).forEach((key) => {
            (<any>model)[key] = (<any>postParameters)[key];
        });

        return model;
    }
}
