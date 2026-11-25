export enum OrderStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  COOKING = 'cooking',
  PICKUP = 'pickup',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum DemoRole {
  CONSUMER = 'consumer',
  OWNER = 'owner',
  PARTNER = 'partner',
}

export enum ConsumerStep {
  HOME = 'home',
  BROWSE = 'browse',
  AI_CHAT = 'ai_chat',
  RECOMMEND = 'recommend',
  CONFIRM = 'confirm',
  STATUS = 'status',
  WISHLIST = 'wishlist',
  MY = 'my',
  B2B_MEAL = 'b2b_meal',
  ERRAND = 'errand',
}

export enum DispatchMode {
  NEIGHBOR_WALK = 'neighbor_walk',
  AGENCY_RIDER = 'agency_rider',
}

export enum ErrandStatus {
  OPEN = 'open',
  MATCHED = 'matched',
  RECEIPT_CHECKED = 'receipt_checked',
  COMPLETED = 'completed',
}

export type DeliveryMethod = 'auto_bundle' | 'single_express' | 'partner_direct';

export interface DeliveryFeeTier {
  minSubtotal: number;
  deliveryFee: number;
}

export interface StorePromotion {
  id: string;
  storeId: string;
  title: string;
  description: string;
  badgeText?: string;
  isActive: boolean;
  createdAt: string;
}

export interface StoreCoupon {
  id: string;
  storeId: string;
  code: string;
  label: string;
  discountType: 'fixed' | 'percent';
  discountValue: number;
  maxDiscountAmount?: number;
  minSubtotal?: number;
  isActive: boolean;
  createdAt: string;
}

export interface Store {
  id: string;
  name: string;
  category: string;
  categoryGroup?: string;
  region?: string;
  isOpen: boolean;
  deliveryFee: number;
  deliveryFeeTiers?: DeliveryFeeTier[];
  rating?: number;
  reviewCount?: number;
  basePrepMinutes: number;
  extraPrepMinutes: number;
  areaLabel: string;
  image: string;
  singlePriceRevoked?: boolean;
}

export interface MenuOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface MenuItem {
  id: string;
  storeId: string;
  name: string;
  description: string;
  servingSpec: string;
  tags: string[];
  pricePerPerson: number;
  options: MenuOption[];
  stock: number;
  isSoldOut: boolean;
  storePrice: number | null;
  comparisonDate: string | null;
  estimatedMinutes: number;
  image: string;
  aiReason?: string;
  closingDiscountPercent?: number;
  isSideMenu?: boolean;
}

export interface Review {
  id: string;
  menuId: string;
  orderId?: string;
  author: string;
  date: string;
  rating: number;
  prosTags: string[];
  consTags: string[];
  isComplaint: boolean;
  content: string;
  photos?: EvidencePhoto[];
}

export interface ReviewReply {
  text: string;
  updatedAt: string;
  flaggedForReview?: boolean;
  flagReason?: string;
}

export interface PriceReport {
  id: string;
  menuId: string;
  menuName: string;
  storeName: string;
  appPrice: number;
  storePrice: number;
  reportedAt: string;
  note: string;
}

export interface AiMediationVerdict {
  claimType: 'spill' | 'missing' | 'misdelivery' | 'quality';
  faultParty: 'courier' | 'owner' | 'platform_buffer' | 'escalated';
  faultLabel: string;
  confidencePercent: number;
  processedSeconds: number;
  summary: string;
  customerAction: string;
  ownerAction: string;
  courierAction: string;
}

export interface EvidencePhoto {
  name: string;
  dataUrl: string;
}

export interface EvidenceRecord {
  ownerSealingChecked: boolean;
  courierConditionChecked: boolean;
  customerMemoNote: string;
  escrowStatus: string;
  recordedAt: string;
  evidencePhotos?: EvidencePhoto[];
  aiVerdict?: AiMediationVerdict;
}

export type PaymentMethod =
  | 'kakaopay'
  | 'tosspay'
  | 'naverpay'
  | 'card_oneclick'
  | 'openbanking'
  | 'alle_pay'
  | 'local_currency'
  | 'b2b_meal_point'
  | 'corporate_card'
  | 'personal_card'
  | 'bank_transfer';

export type B2BDocumentType =
  | 'transaction_statement'
  | 'tax_invoice'
  | 'expense_receipt';

export interface B2BDocumentInfo {
  companyName: string;
  businessNumber: string;
  representativeOrDept?: string;
  contactEmail: string;
  requestedDocs: B2BDocumentType[];
  issuedAt: string;
  statementNumber: string;
}

export interface CartLineItem {
  menuId: string;
  quantity: number;
  selectedOptionIds: string[];
}

export interface CartState {
  storeId: string;
  items: CartLineItem[];
}

export interface OrderLineItem {
  menuId: string;
  menuName: string;
  unitPrice: number;
  originalUnitPrice?: number;
  quantity: number;
  selectedOptionIds: string[];
  selectedOptionNames: string[];
  optionsSubtotal: number;
  lineSubtotal: number;
}

export type DeliveryProgressStage =
  | 'PREPARING'
  | 'ASSIGNED'
  | 'DEPARTED'
  | 'FIVE_MIN_LEFT'
  | 'ARRIVED';

export interface DeliveryNotification {
  id: string;
  orderId: string;
  orderCode: string;
  storeName: string;
  stage: DeliveryProgressStage;
  title: string;
  body: string;
  riderLabel: string;
  dispatchMode: DispatchMode;
  createdAt: string;
  read: boolean;
}

export interface Order {
  id: string;
  orderCode: string;
  storeId: string;
  menuId: string;
  menuName: string;
  storeName: string;
  customerAlias: string;
  addressAlias: string;
  servings: number;
  selectedOptionIds: string[];
  selectedOptionNames: string[];
  items?: OrderLineItem[];
  menuSubtotal: number;
  optionsSubtotal: number;
  deliveryFee: number;
  deliveryMethod?: DeliveryMethod;
  sharedDeliveryApplied?: boolean;
  reservationSlot?: string | null;
  isB2B?: boolean;
  b2bServiceFee?: number;
  b2bDocumentInfo?: B2BDocumentInfo | null;
  paymentMethod?: PaymentMethod;
  paymentMethodLabel?: string;
  couponCode: string | null;
  couponDiscount: number;
  totalAmount: number;
  estimatedSavings?: number;
  status: OrderStatus;
  dispatchMode?: DispatchMode;
  deliveryStage?: DeliveryProgressStage;
  riderName?: string;
  remainingMinutes?: number;
  createdAt: string;
  updatedAt: string;
  stockDeducted: boolean;
  stockRestored: boolean;
  mockRefunded: boolean;
  cancelRequested: boolean;
  cancelRequestReason: string | null;
  cancelRequestedAt: string | null;
  evidenceRecord?: EvidenceRecord | null;
  ownerPackagingPhotos?: EvidencePhoto[];
  riderDeliveryPhotos?: EvidencePhoto[];
  customerNote: string;
}

export interface ErrandRequest {
  id: string;
  title: string;
  category: string;
  pickupAlias: string;
  dropoffAlias: string;
  estimatedItemCost: number;
  errandFee: number;
  escrowTotal: number;
  actualReceiptCost: number | null;
  refundDifference: number | null;
  receiptPhoto?: EvidencePhoto;
  partnerName?: string;
  status: ErrandStatus;
  createdAt: string;
}

export interface ParsedCondition {
  rawInput: string;
  servings: number;
  tags: string[];
  excludeTags?: string[];
  maxBudget: number | null;
  maxMinutes: number | null;
  unknownTokens: string[];
  needsConfirmation: boolean;
}

export interface UserPreferences {
  favoriteTags: string[];
  defaultServings: number;
  defaultMaxBudget: number;
  defaultMaxMinutes: number;
  memoNote: string;
}

export interface MockCoupon {
  id: string;
  code: string;
  label: string;
  discountAmount: number;
  requiresStamps?: number;
  minSubtotal?: number;
  paymentMethodOnly?: PaymentMethod;
  autoSelectEligible?: boolean;
  storeId?: string;
  isStoreCoupon?: boolean;
}

export interface RecommendationMatch {
  menu: MenuItem;
  store: Store;
  servings: number;
  menuSubtotal: number;
  deliveryFee: number;
  estimatedTotal: number;
  effectiveMinutes: number;
  matchedTags: string[];
  isSameStorePrice: boolean;
  isNearbyArea?: boolean;
  estimatedSavingsVsCompetitor?: number;
  aiReason?: string;
}

export interface StoreProfitComparison {
  savedCommissionAndAdFee: number;
  aiRegularIncrementalSales: number;
  aiRegularMatchedOrders: number;
}

export interface OwnerProfitComparison {
  periodLabel: string;
  competitorPlatformLabel: string;
  alleCommissionRateLabel: string;
  savedCommissionAndAdFee: number;
  savedBreakdown: {
    brokerageFeeSaved: number;
    adExposureFeeSaved: number;
  };
  aiRegularIncrementalSales: number;
  aiRegularMatchedOrders: number;
  repeatCustomerRatePercent: number;
  subsidyDependencyRatioPercent: number;
  byStore: Record<string, StoreProfitComparison>;
}

export interface ExcludedCandidate {
  menu: MenuItem;
  store: Store;
  reasons: string[];
}

export interface SavedLocation {
  id: string;
  label: string;
  areaName: string;
  detailAddress: string;
  tag: 'home' | 'work' | 'etc';
}

export type PartnerPlanTier = 'trial' | 'basic' | 'pro' | 'premium';

export type WeekdayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface ZeroClickRoutine {
  enabled: boolean;
  days: WeekdayId[];
  hour: number;
  minute: number;
  leadMinutes: number;
  title: string;
}

export interface AllePersistedState {
  stores: Store[];
  menus: MenuItem[];
  orders: Order[];
  errands: ErrandRequest[];
  stampCount: number;
  walletBalance: number;
  wishlistIds: string[];
  preferences: UserPreferences;
  zeroClickRoutine?: ZeroClickRoutine;
  ownerSaasSubscribed?: boolean;
  ownerSaasPlan?: PartnerPlanTier;
  lastConditionInput: string;
  reviews: Review[];
  reviewReplies: Record<string, ReviewReply>;
  priceReports: PriceReport[];
  savedLocations: SavedLocation[];
  selectedLocationId: string;
  storePromotions: StorePromotion[];
  storeCoupons: StoreCoupon[];
  easyMode?: boolean;
}
