import {
  DeliveryFeeTier,
  DeliveryMethod,
  DispatchMode,
  MenuItem,
  MockCoupon,
  Order,
  OrderStatus,
  PaymentMethod,
  Store,
  StoreCoupon,
} from '../types/alle';

/** 심부름 · 개인 라이더 건당 플랫폼 매칭 수수료 (원) */
export const MATCHING_FEE_PER_CASE = 100;

/** alle페이 자체 결제 수수료율 (1.5%, 일반 PG 약 3% 대비 절반) */
export const ALLE_PAY_FEE_RATE = 0.015;

/** B2B 기업 식대 정산·관제 서비스 이용료율 (3.5%) */
export const B2B_SERVICE_FEE_RATE = 0.035;

function formatWonInline(amount: number): string {
  return `${Math.round(amount).toLocaleString('ko-KR')}원`;
}

export interface DeliveryMethodMeta {
  id: DeliveryMethod;
  label: string;
  shortLabel: string;
  badge: string;
  description: string;
  dispatchMode: DispatchMode;
  etaDeltaMinutes: number;
}

export const DELIVERY_METHOD_OPTIONS: DeliveryMethodMeta[] = [
  {
    id: 'partner_direct',
    label: '동네 파트너 배송',
    shortLabel: '동네 파트너',
    badge: '1개도 효율배송',
    description: '근거리 이웃 파트너가 소량 주문도 빠르게 배송',
    dispatchMode: DispatchMode.NEIGHBOR_WALK,
    etaDeltaMinutes: 0,
  },
  {
    id: 'auto_bundle',
    label: '자동 묶음배송',
    shortLabel: '자동 묶음',
    badge: '배달비 40% 절약',
    description: '플랫폼이 같은 방향 주문을 자동으로 모아 알뜰 배송',
    dispatchMode: DispatchMode.AGENCY_RIDER,
    etaDeltaMinutes: 10,
  },
  {
    id: 'single_express',
    label: '한집 빠른배송',
    shortLabel: '한집 빠른',
    badge: '경유 없이 직행',
    description: '내 주문만 바로 직행 (+1,000원)',
    dispatchMode: DispatchMode.AGENCY_RIDER,
    etaDeltaMinutes: -3,
  },
];

export function getDeliveryMethodMeta(
  method?: DeliveryMethod
): DeliveryMethodMeta {
  return (
    DELIVERY_METHOD_OPTIONS.find((m) => m.id === (method ?? 'partner_direct')) ??
    DELIVERY_METHOD_OPTIONS[0]
  );
}

export interface StoreDeliveryFeeCalculation {
  baseFee: number;
  tierFee: number;
  finalDeliveryFee: number;
  tierSavings: number;
  bundleSavings: number;
  expressSurcharge: number;
  appliedTier: DeliveryFeeTier | null;
  nextTier: DeliveryFeeTier | null;
  amountToNextTier: number;
  nextTierLabel: string | null;
  etaDeltaMinutes: number;
}

/**
 * Calculates mutual-benefit tiered delivery fee based on order subtotal and chosen delivery method.
 */
export function calculateStoreDeliveryFee(
  store: Pick<Store, 'deliveryFee' | 'deliveryFeeTiers'>,
  menuSubtotal: number,
  deliveryMethod: DeliveryMethod = 'partner_direct'
): StoreDeliveryFeeCalculation {
  const baseFee = Math.max(0, store.deliveryFee ?? 0);
  const tiers = [...(store.deliveryFeeTiers ?? [])]
    .filter((t) => t.minSubtotal > 0 && t.deliveryFee >= 0)
    .sort((a, b) => a.minSubtotal - b.minSubtotal);

  let appliedTier: DeliveryFeeTier | null = null;
  for (const tier of tiers) {
    if (menuSubtotal >= tier.minSubtotal) {
      appliedTier = tier;
    }
  }

  const tierFee = appliedTier ? appliedTier.deliveryFee : baseFee;
  const nextTier = tiers.find((t) => t.minSubtotal > menuSubtotal) ?? null;
  const amountToNextTier = nextTier
    ? Math.max(0, nextTier.minSubtotal - menuSubtotal)
    : 0;

  let nextTierLabel: string | null = null;
  if (nextTier && amountToNextTier > 0) {
    if (nextTier.deliveryFee === 0) {
      nextTierLabel = `${formatWonInline(amountToNextTier)} 더 담으면 배달비 무료!`;
    } else if (nextTier.deliveryFee < tierFee) {
      nextTierLabel = `${formatWonInline(amountToNextTier)} 더 담으면 배달비 ${formatWonInline(
        tierFee - nextTier.deliveryFee
      )} 할인!`;
    }
  }

  let finalDeliveryFee = tierFee;
  if (deliveryMethod === 'auto_bundle') {
    finalDeliveryFee =
      tierFee === 0 ? 0 : Math.round((tierFee * 0.6) / 100) * 100;
  } else if (deliveryMethod === 'single_express') {
    finalDeliveryFee = tierFee + 1000;
  }

  const etaDeltaMinutes = getDeliveryMethodMeta(deliveryMethod).etaDeltaMinutes;

  return {
    baseFee,
    tierFee,
    finalDeliveryFee,
    tierSavings: Math.max(0, baseFee - tierFee),
    bundleSavings: Math.max(0, tierFee - finalDeliveryFee),
    expressSurcharge: deliveryMethod === 'single_express' ? 1000 : 0,
    appliedTier,
    nextTier,
    amountToNextTier,
    nextTierLabel,
    etaDeltaMinutes,
  };
}

/**
 * Merges active owner-issued store coupons with platform coupons so both compete in auto-selection.
 */
export function getAvailableCouponsForStore(
  baseCoupons: MockCoupon[],
  storeCoupons: StoreCoupon[],
  storeId: string,
  menuSubtotal: number
): MockCoupon[] {
  const noneCoupon = baseCoupons.find((c) => c.code === 'NONE') ?? {
    id: 'none',
    code: 'NONE',
    label: '쿠폰 적용 안 함',
    discountAmount: 0,
    autoSelectEligible: false,
  };
  const platformCoupons = baseCoupons.filter((c) => c.code !== 'NONE');

  const activeOwnerCoupons: MockCoupon[] = storeCoupons
    .filter((c) => c.storeId === storeId && c.isActive)
    .map((c) => {
      const computedDiscount =
        c.discountType === 'percent'
          ? Math.min(
              c.maxDiscountAmount ?? 50000,
              Math.round((Math.max(0, menuSubtotal) * c.discountValue) / 100)
            )
          : c.discountValue;
      return {
        id: c.id,
        code: c.code,
        label: `[가게 쿠폰] ${c.label}`,
        discountAmount: Math.max(0, computedDiscount),
        minSubtotal: c.minSubtotal,
        autoSelectEligible: true,
        storeId: c.storeId,
        isStoreCoupon: true,
      };
    });

  return [noneCoupon, ...activeOwnerCoupons, ...platformCoupons];
}

export interface LocalCurrencyLabel {
  shortLabel: string;
  fullLabel: string;
}

/**
 * Returns the region-appropriate local currency voucher name based on the user's selected area.
 */
export function getLocalCurrencyLabel(areaName?: string): LocalCurrencyLabel {
  const area = (areaName ?? '').trim();
  if (area.includes('서울')) {
    return {
      shortLabel: '서울사랑상품권',
      fullLabel: '서울사랑상품권 (지역화폐)',
    };
  }
  if (area.includes('경기')) {
    return {
      shortLabel: '경기지역화폐',
      fullLabel: '경기지역화폐 (지역화폐)',
    };
  }
  if (area.includes('부산')) {
    return {
      shortLabel: '동백전',
      fullLabel: '동백전 (부산 지역화폐)',
    };
  }
  if (area.includes('대구')) {
    return {
      shortLabel: '대구로페이',
      fullLabel: '대구로페이 (대구 지역화폐)',
    };
  }
  if (area.includes('대전')) {
    return {
      shortLabel: '대전사랑카드',
      fullLabel: '대전사랑카드 (대전 지역화폐)',
    };
  }
  if (area.includes('광주')) {
    return {
      shortLabel: '광주상생카드',
      fullLabel: '광주상생카드 (광주 지역화폐)',
    };
  }
  if (area.includes('인천')) {
    return {
      shortLabel: '인천e음',
      fullLabel: '인천e음 (인천 지역화폐)',
    };
  }
  return {
    shortLabel: '지역화폐',
    fullLabel: '전국 지역화폐 (사랑상품권)',
  };
}

/**
 * Checks whether a coupon can currently be applied given subtotal, stamps, and payment method.
 */
export function isCouponEligible(
  coupon: MockCoupon,
  params: {
    menuSubtotal: number;
    stampCount: number;
    paymentMethod: PaymentMethod;
  }
): boolean {
  if (coupon.code === 'NONE') return false;
  if (coupon.requiresStamps && params.stampCount < coupon.requiresStamps) {
    return false;
  }
  if (coupon.minSubtotal && params.menuSubtotal < coupon.minSubtotal) {
    return false;
  }
  if (
    coupon.paymentMethodOnly &&
    coupon.paymentMethodOnly !== params.paymentMethod
  ) {
    return false;
  }
  return params.menuSubtotal > 0;
}

/**
 * Picks the highest-discount eligible coupon automatically, or respects a valid preferredCode.
 */
export function getBestCoupon(
  coupons: MockCoupon[],
  params: {
    menuSubtotal: number;
    stampCount: number;
    paymentMethod: PaymentMethod;
    preferredCode?: string;
  }
): MockCoupon {
  const noneCoupon = coupons.find((c) => c.code === 'NONE') ?? {
    id: 'none',
    code: 'NONE',
    label: '쿠폰 적용 안 함',
    discountAmount: 0,
  };

  if (params.preferredCode && params.preferredCode !== 'NONE') {
    const preferred = coupons.find((c) => c.code === params.preferredCode);
    if (preferred && isCouponEligible(preferred, params)) {
      return preferred;
    }
  }

  let bestCoupon = noneCoupon;
  let bestDiscount = 0;

  for (const coupon of coupons) {
    if (coupon.autoSelectEligible === false) continue;
    if (!isCouponEligible(coupon, params)) continue;
    const usable = Math.min(coupon.discountAmount, params.menuSubtotal);
    if (usable > bestDiscount) {
      bestDiscount = usable;
      bestCoupon = coupon;
    }
  }

  return bestCoupon;
}

export interface CompetitorSavingsBreakdown {
  dualPriceAvoided: number;
  closingSavings: number;
  deliverySavings: number;
  couponDiscount: number;
  totalSaved: number;
  competitorEstimatedTotal: number;
}

/**
 * Estimates savings vs major delivery apps that apply dual pricing (~10%), lack closing sales, or charge full delivery fees.
 */
export function estimateCompetitorSavings(params: {
  menuSubtotal: number;
  originalMenuSubtotal: number;
  deliveryFee: number;
  originalDeliveryFee: number;
  couponDiscount: number;
  isSameStorePrice: boolean;
}): CompetitorSavingsBreakdown {
  const dualPriceAvoided = params.isSameStorePrice
    ? Math.max(1500, Math.round(params.originalMenuSubtotal * 0.1))
    : 0;
  const closingSavings = Math.max(
    0,
    params.originalMenuSubtotal - params.menuSubtotal
  );
  const deliverySavings = Math.max(
    0,
    params.originalDeliveryFee - params.deliveryFee
  );
  const couponDiscount = Math.max(0, Math.round(params.couponDiscount));
  const totalSaved =
    dualPriceAvoided + closingSavings + deliverySavings + couponDiscount;
  const alleNet = Math.max(
    0,
    params.menuSubtotal + params.deliveryFee - couponDiscount
  );
  const competitorEstimatedTotal = alleNet + totalSaved;

  return {
    dualPriceAvoided,
    closingSavings,
    deliverySavings,
    couponDiscount,
    totalSaved,
    competitorEstimatedTotal,
  };
}

export interface MonthlySavingsSummary {
  totalSaved: number;
  validOrderCount: number;
  samePriceOrderCount: number;
  dualPriceAvoidedTotal: number;
  discountAndDeliverySavedTotal: number;
}

/**
 * Aggregates cumulative food-expense savings across all non-cancelled orders.
 */
export function calculateMonthlySavings(
  orders: Order[],
  menus: MenuItem[]
): MonthlySavingsSummary {
  const menuMap = new Map(menus.map((m) => [m.id, m]));
  let totalSaved = 0;
  let validOrderCount = 0;
  let samePriceOrderCount = 0;
  let dualPriceAvoidedTotal = 0;
  let discountAndDeliverySavedTotal = 0;

  for (const order of orders) {
    if (order.status === OrderStatus.CANCELLED) continue;
    validOrderCount += 1;

    const menu = menuMap.get(order.menuId);
    const isSameStore = Boolean(
      menu &&
        menu.storePrice !== null &&
        menu.comparisonDate !== null &&
        menu.storePrice === menu.pricePerPerson
    );
    if (isSameStore || (order.estimatedSavings ?? 0) > 0) {
      samePriceOrderCount += 1;
    }

    const originalMenuSubtotal =
      order.items && order.items.length > 0
        ? order.items.reduce(
            (sum, it) =>
              sum + (it.originalUnitPrice ?? it.unitPrice) * it.quantity,
            0
          )
        : (menu?.pricePerPerson ?? Math.round(order.menuSubtotal / Math.max(1, order.servings))) *
          order.servings;

    const originalDeliveryFee = order.sharedDeliveryApplied
      ? order.deliveryFee * 2
      : order.deliveryFee;

    const breakdown = estimateCompetitorSavings({
      menuSubtotal: order.menuSubtotal,
      originalMenuSubtotal: Math.max(originalMenuSubtotal, order.menuSubtotal),
      deliveryFee: order.deliveryFee,
      originalDeliveryFee,
      couponDiscount: order.couponDiscount,
      isSameStorePrice: isSameStore || (order.estimatedSavings ?? 0) > 0,
    });

    const orderSavings = order.estimatedSavings ?? breakdown.totalSaved;
    totalSaved += orderSavings;
    dualPriceAvoidedTotal += breakdown.dualPriceAvoided;
    discountAndDeliverySavedTotal += Math.max(
      0,
      orderSavings - breakdown.dualPriceAvoided
    );
  }

  return {
    totalSaved,
    validOrderCount,
    samePriceOrderCount,
    dualPriceAvoidedTotal,
    discountAndDeliverySavedTotal,
  };
}
