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
  AI_CHAT = 'ai_chat',
  RECOMMEND = 'recommend',
  CONFIRM = 'confirm',
  STATUS = 'status',
  WISHLIST = 'wishlist',
  MY = 'my',
  SUPERAPP = 'superapp',
}

export enum SuperAppTab {
  GROUP_BUY = 'group_buy',
  B2B = 'b2b',
  MARKET_BUNDLE = 'market_bundle',
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

export interface Store {
  id: string;
  name: string;
  category: string;
  categoryGroup?: string;
  isOpen: boolean;
  deliveryFee: number;
  minOrderAmount?: number;
  rating?: number;
  reviewCount?: number;
  basePrepMinutes: number;
  extraPrepMinutes: number;
  areaLabel: string;
  image: string;
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
}

export interface Review {
  id: string;
  menuId: string;
  author: string;
  date: string;
  rating: number;
  prosTags: string[];
  consTags: string[];
  isComplaint: boolean;
  content: string;
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

export interface EvidenceRecord {
  ownerSealingChecked: boolean;
  courierConditionChecked: boolean;
  customerMemoNote: string;
  escrowStatus: string;
  recordedAt: string;
}

export type PaymentMethod =
  | 'local_currency'
  | 'b2b_meal_point'
  | 'alle_regular_pass';

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
  menuSubtotal: number;
  optionsSubtotal: number;
  deliveryFee: number;
  sharedDeliveryApplied?: boolean;
  reservationSlot?: string | null;
  isB2B?: boolean;
  paymentMethod?: PaymentMethod;
  paymentMethodLabel?: string;
  couponCode: string | null;
  couponDiscount: number;
  totalAmount: number;
  status: OrderStatus;
  dispatchMode?: DispatchMode;
  createdAt: string;
  updatedAt: string;
  stockDeducted: boolean;
  stockRestored: boolean;
  mockRefunded: boolean;
  cancelRequested: boolean;
  cancelRequestReason: string | null;
  cancelRequestedAt: string | null;
  evidenceRecord?: EvidenceRecord | null;
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
  status: ErrandStatus;
  createdAt: string;
}

export interface GroupBuyPool {
  id: string;
  storeId: string;
  menuId: string;
  title: string;
  areaRadiusLabel: string;
  currentParticipants: number;
  targetParticipants: number;
  remainingTimeLabel: string;
  originalDeliveryFee: number;
  sharedDeliveryFee: number;
}

export interface ParsedCondition {
  rawInput: string;
  servings: number;
  tags: string[];
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

export interface AllePersistedState {
  stores: Store[];
  menus: MenuItem[];
  orders: Order[];
  errands: ErrandRequest[];
  stampCount: number;
  walletBalance: number;
  wishlistIds: string[];
  preferences: UserPreferences;
  lastConditionInput: string;
  reviewReplies: Record<string, ReviewReply>;
  priceReports: PriceReport[];
  savedLocations: SavedLocation[];
  selectedLocationId: string;
}
