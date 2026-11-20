import {
  MenuItem,
  MockCoupon,
  Order,
  OrderStatus,
  PaymentMethod,
} from '../types/alle';

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
  if (coupon.minOrderAmount && params.menuSubtotal < coupon.minOrderAmount) {
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
