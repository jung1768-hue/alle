import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  MapPin,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react';
import { MOCK_COUPONS, RESERVATION_SLOTS_15M } from '../data/seedData';
import {
  CartLineItem,
  DeliveryMethod,
  MenuItem,
  OrderLineItem,
  PaymentMethod,
  Store,
  StoreCoupon,
  StorePromotion,
} from '../types/alle';
import { BARO_PARTNER_GEAR_SRC } from './AlleBrand';
import { formatWon, getEffectiveMenuPrice } from '../utils/parser';
import {
  calculateStoreDeliveryFee,
  DELIVERY_METHOD_OPTIONS,
  estimateCompetitorSavings,
  getAvailableCouponsForStore,
  getBestCoupon,
  getDeliveryMethodMeta,
  getLocalCurrencyLabel,
  isCouponEligible,
} from '../utils/pricing';
import { FoodImage } from './FoodImage';

interface OrderConfirmationViewProps {
  menu: MenuItem;
  store: Store;
  storeMenus?: MenuItem[];
  storePromotions?: StorePromotion[];
  storeCoupons?: StoreCoupon[];
  initialItems?: CartLineItem[];
  initialServings: number;
  initialOptionIds: string[];
  initialCouponCode: string;
  initialDeliveryMethod?: DeliveryMethod;
  initialSharedDelivery?: boolean;
  initialReservationSlot?: string;
  initialPaymentMethod?: PaymentMethod;
  activeAreaName?: string;
  defaultAddressAlias?: string;
  walletBalance?: number;
  stampCount: number;
  defaultNote: string;
  onTopupWalletConfirmed?: (amount: number) => void;
  onOpenLocationPicker?: () => void;
  onBack: () => void;
  onConfirmOrder: (payload: {
    menuId: string;
    servings: number;
    selectedOptionIds: string[];
    items: OrderLineItem[];
    couponCode: string;
    couponDiscount: number;
    deliveryMethod: DeliveryMethod;
    sharedDeliveryApplied: boolean;
    reservationSlot: string | null;
    customerAlias: string;
    addressAlias: string;
    customerNote: string;
    paymentMethod?: PaymentMethod;
    paymentMethodLabel?: string;
    estimatedSavings: number;
  }) => { ok: boolean; error?: string };
}

export function OrderConfirmationView({
  menu,
  store,
  storeMenus,
  storePromotions = [],
  storeCoupons = [],
  initialItems,
  initialServings,
  initialOptionIds,
  initialCouponCode,
  initialDeliveryMethod,
  initialSharedDelivery = false,
  initialReservationSlot = 'now',
  initialPaymentMethod = 'kakaopay',
  activeAreaName = '서울 강남구 역삼동',
  defaultAddressAlias = '강남구 역삼동 수령지 A',
  walletBalance = 35000,
  stampCount,
  defaultNote,
  onTopupWalletConfirmed,
  onOpenLocationPicker,
  onBack,
  onConfirmOrder,
}: OrderConfirmationViewProps) {
  const allStoreMenus = useMemo(() => {
    const list = storeMenus && storeMenus.length > 0 ? storeMenus : [menu];
    return list.some((m) => m.id === menu.id) ? list : [menu, ...list];
  }, [storeMenus, menu]);

  const menuById = useMemo(
    () => new Map(allStoreMenus.map((m) => [m.id, m])),
    [allStoreMenus]
  );

  const [lineItems, setLineItems] = useState<CartLineItem[]>(() => {
    if (initialItems && initialItems.length > 0) {
      return initialItems.map((it) => ({
        menuId: it.menuId,
        quantity: Math.max(1, it.quantity),
        selectedOptionIds: [...it.selectedOptionIds],
      }));
    }
    return [
      {
        menuId: menu.id,
        quantity: Math.max(1, initialServings),
        selectedOptionIds: [...initialOptionIds],
      },
    ];
  });

  const [showAddMoreMenus, setShowAddMoreMenus] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>(initialPaymentMethod);
  const [couponManuallyChosen, setCouponManuallyChosen] = useState<boolean>(
    Boolean(initialCouponCode && initialCouponCode !== 'NONE')
  );
  const [couponCode, setCouponCode] = useState<string>(() => {
    const firstSubtotal =
      getEffectiveMenuPrice(menu) * Math.max(1, initialServings);
    const pool = getAvailableCouponsForStore(
      MOCK_COUPONS,
      storeCoupons,
      store.id,
      firstSubtotal
    );
    return getBestCoupon(pool, {
      menuSubtotal: firstSubtotal,
      stampCount,
      paymentMethod: initialPaymentMethod,
      preferredCode:
        initialCouponCode && initialCouponCode !== 'NONE'
          ? initialCouponCode
          : undefined,
    }).code;
  });

  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(
    initialDeliveryMethod ??
      (initialSharedDelivery ? 'auto_bundle' : 'partner_direct')
  );
  const [reservationSlotId, setReservationSlotId] = useState<string>(
    initialReservationSlot || 'now'
  );
  const [customerAlias, setCustomerAlias] = useState<string>('고객 A');
  const [addressAlias, setAddressAlias] = useState<string>(defaultAddressAlias);
  const [showDetailOptions, setShowDetailOptions] = useState<boolean>(false);

  useEffect(() => {
    setAddressAlias(defaultAddressAlias);
  }, [defaultAddressAlias]);

  const [customerNote, setCustomerNote] = useState<string>(defaultNote);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const localCurrency = useMemo(
    () => getLocalCurrencyLabel(activeAreaName),
    [activeAreaName]
  );

  const paymentOptions: Array<{
    id: PaymentMethod;
    shortLabel: string;
    label: string;
    subtitle: string;
    benefitText: string;
  }> = useMemo(
    () => [
      {
        id: 'kakaopay',
        shortLabel: '카카오페이',
        label: '카카오페이',
        subtitle: '원터치 간편결제',
        benefitText: '카카오페이 원터치 결제 · 추가 수수료 없이 매장가 그대로 결제됩니다.',
      },
      {
        id: 'tosspay',
        shortLabel: '토스페이',
        label: '토스페이',
        subtitle: '빠른 계좌·카드',
        benefitText: '토스페이 간편결제 · 결제 금액과 매장가가 100% 일치합니다.',
      },
      {
        id: 'naverpay',
        shortLabel: '네이버페이',
        label: '네이버페이',
        subtitle: '포인트 적립·사용',
        benefitText: '네이버페이 포인트 적립과 함께 수수료 없는 착한 배달을 이용하세요.',
      },
      {
        id: 'card_oneclick',
        shortLabel: '등록카드',
        label: '등록카드 1초결제',
        subtitle: '신용·체크카드',
        benefitText: '등록된 카드로 비밀번호 입력 없이 1초 만에 바로 주문합니다.',
      },
      {
        id: 'openbanking',
        shortLabel: '오픈뱅킹 계좌이체',
        label: '오픈뱅킹 1초 계좌이체',
        subtitle: '수수료 0.5%↓ · 최저원가',
        benefitText: '오픈뱅킹 계좌 직결제로 결제 수수료를 0.5% 이하로 낮춰 매장 상생에 기여합니다.',
      },
      {
        id: 'alle_pay',
        shortLabel: 'Baro페이',
        label: 'Baro페이 잔액',
        subtitle: `잔액 ${formatWon(walletBalance)} · 수수료 1.5%`,
        benefitText:
          '충전해 둔 Baro페이 잔액으로 즉시 결제/환불되며, 결제 수수료 1.5%(타사 PG 약 3% 대비 절반)로 점주 상생에 기여합니다.',
      },
      {
        id: 'local_currency',
        shortLabel: localCurrency.shortLabel,
        label: localCurrency.fullLabel,
        subtitle: '지역화폐 직결제',
        benefitText: `${localCurrency.shortLabel} 결제 시 추가 할인 쿠폰이 자동 적용됩니다.`,
      },
      {
        id: 'b2b_meal_point',
        shortLabel: '기업 식대',
        label: '기업 식대 포인트',
        subtitle: '임직원 복지 식대',
        benefitText: '제휴 회사 식대 포인트로 영수증 처리 없이 간편하게 결제합니다.',
      },
    ],
    [localCurrency, walletBalance]
  );

  const selectedPaymentOption =
    paymentOptions.find((p) => p.id === paymentMethod) ?? paymentOptions[0];

  const resolvedOrderLines: OrderLineItem[] = useMemo(() => {
    return lineItems
      .map((line): OrderLineItem | null => {
        const itemMenu = menuById.get(line.menuId);
        if (!itemMenu) return null;
        const unitPrice = getEffectiveMenuPrice(itemMenu);
        const selectedOpts = itemMenu.options.filter((o) =>
          line.selectedOptionIds.includes(o.id)
        );
        const optionsSubtotal =
          selectedOpts.reduce((sum, o) => sum + o.priceDelta, 0) * line.quantity;
        return {
          menuId: itemMenu.id,
          menuName: itemMenu.name,
          unitPrice,
          originalUnitPrice: itemMenu.pricePerPerson,
          quantity: line.quantity,
          selectedOptionIds: selectedOpts.map((o) => o.id),
          selectedOptionNames: selectedOpts.map((o) => o.name),
          optionsSubtotal,
          lineSubtotal: unitPrice * line.quantity,
        };
      })
      .filter((x): x is OrderLineItem => x !== null);
  }, [lineItems, menuById]);

  const menuSubtotal = useMemo(
    () => resolvedOrderLines.reduce((sum, l) => sum + l.lineSubtotal, 0),
    [resolvedOrderLines]
  );

  const originalMenuSubtotal = useMemo(
    () =>
      resolvedOrderLines.reduce(
        (sum, l) => sum + (l.originalUnitPrice ?? l.unitPrice) * l.quantity,
        0
      ),
    [resolvedOrderLines]
  );

  const optionsSubtotal = useMemo(
    () => resolvedOrderLines.reduce((sum, l) => sum + l.optionsSubtotal, 0),
    [resolvedOrderLines]
  );

  const totalServings = useMemo(
    () => resolvedOrderLines.reduce((sum, l) => sum + l.quantity, 0),
    [resolvedOrderLines]
  );

  const allSameStorePrice = useMemo(() => {
    if (lineItems.length === 0) return false;
    return lineItems.every((line) => {
      const m = menuById.get(line.menuId);
      return Boolean(
        m &&
          m.storePrice !== null &&
          m.comparisonDate !== null &&
          m.storePrice === m.pricePerPerson
      );
    });
  }, [lineItems, menuById]);

  const availableCoupons = useMemo(
    () =>
      getAvailableCouponsForStore(
        MOCK_COUPONS,
        storeCoupons,
        store.id,
        menuSubtotal
      ),
    [storeCoupons, store.id, menuSubtotal]
  );

  const activeStorePromos = useMemo(
    () =>
      storePromotions.filter((p) => p.storeId === store.id && p.isActive),
    [storePromotions, store.id]
  );

  useEffect(() => {
    if (!couponManuallyChosen) {
      const best = getBestCoupon(availableCoupons, {
        menuSubtotal,
        stampCount,
        paymentMethod,
      });
      setCouponCode(best.code);
    }
  }, [
    availableCoupons,
    menuSubtotal,
    stampCount,
    paymentMethod,
    couponManuallyChosen,
  ]);

  const isStoreClosed = !store.isOpen;
  const stockIssueMessage = useMemo(() => {
    for (const line of lineItems) {
      const m = menuById.get(line.menuId);
      if (!m) return '메뉴 정보를 찾을 수 없습니다.';
      if (m.isSoldOut || m.stock <= 0) {
        return `'${m.name}' 메뉴가 품절되었습니다.`;
      }
      if (line.quantity > m.stock) {
        return `'${m.name}' 남은 재고(${m.stock}개)보다 수량이 많습니다.`;
      }
    }
    return null;
  }, [lineItems, menuById]);

  const deliveryFeeCalc = useMemo(
    () => calculateStoreDeliveryFee(store, menuSubtotal, deliveryMethod),
    [store, menuSubtotal, deliveryMethod]
  );
  const deliveryFee = deliveryFeeCalc.finalDeliveryFee;
  const deliveryMeta = getDeliveryMethodMeta(deliveryMethod);

  const selectedCoupon =
    availableCoupons.find((c) => c.code === couponCode) ?? availableCoupons[0];

  const isSelectedCouponEligible =
    selectedCoupon.code === 'NONE' ||
    isCouponEligible(selectedCoupon, {
      menuSubtotal,
      stampCount,
      paymentMethod,
    });

  const effectiveCouponDiscount = isSelectedCouponEligible
    ? Math.max(0, Math.min(selectedCoupon.discountAmount, menuSubtotal))
    : 0;

  const totalAmount =
    menuSubtotal + optionsSubtotal + deliveryFee - effectiveCouponDiscount;

  const insufficientAllePay =
    paymentMethod === 'alle_pay' && walletBalance < totalAmount;

  const isBlocked = isStoreClosed || Boolean(stockIssueMessage) || lineItems.length === 0;

  const savings = estimateCompetitorSavings({
    menuSubtotal,
    originalMenuSubtotal,
    deliveryFee,
    originalDeliveryFee: deliveryFeeCalc.baseFee,
    couponDiscount: effectiveCouponDiscount,
    isSameStorePrice: allSameStorePrice,
  });

  const chosenReservationObj =
    RESERVATION_SLOTS_15M.find((s) => s.id === reservationSlotId) ??
    RESERVATION_SLOTS_15M[0];

  const handleUpdateLineQty = (idx: number, delta: number) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const m = menuById.get(item.menuId);
        const maxStock = Math.max(1, m?.stock ?? 99);
        return {
          ...item,
          quantity: Math.min(maxStock, Math.max(1, item.quantity + delta)),
        };
      })
    );
  };

  const handleRemoveLine = (idx: number) => {
    setLineItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const handleAddSameStoreMenu = (targetMenuId: string) => {
    setLineItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) => it.menuId === targetMenuId && it.selectedOptionIds.length === 0
      );
      if (existingIdx >= 0) {
        const m = menuById.get(targetMenuId);
        const maxStock = Math.max(1, m?.stock ?? 99);
        return prev.map((it, i) =>
          i === existingIdx
            ? { ...it, quantity: Math.min(maxStock, it.quantity + 1) }
            : it
        );
      }
      return [...prev, { menuId: targetMenuId, quantity: 1, selectedOptionIds: [] }];
    });
  };

  const togglePrimaryOption = (optionId: string) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== 0) return item;
        const exists = item.selectedOptionIds.includes(optionId);
        return {
          ...item,
          selectedOptionIds: exists
            ? item.selectedOptionIds.filter((id) => id !== optionId)
            : [...item.selectedOptionIds, optionId],
        };
      })
    );
  };

  const handleAutoBestCoupon = () => {
    setCouponManuallyChosen(false);
    const best = getBestCoupon(availableCoupons, {
      menuSubtotal,
      stampCount,
      paymentMethod,
    });
    setCouponCode(best.code);
  };

  const handleConfirm = () => {
    if (isSubmitting || isBlocked || insufficientAllePay) return;
    if (resolvedOrderLines.length === 0) {
      setSubmitError('주문할 메뉴가 비어 있습니다.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const leadLine = resolvedOrderLines[0];
    const result = onConfirmOrder({
      menuId: leadLine.menuId,
      servings: totalServings,
      selectedOptionIds: leadLine.selectedOptionIds,
      items: resolvedOrderLines,
      couponCode: isSelectedCouponEligible ? selectedCoupon.code : 'NONE',
      couponDiscount: effectiveCouponDiscount,
      deliveryMethod,
      sharedDeliveryApplied: deliveryMethod === 'auto_bundle',
      reservationSlot:
        reservationSlotId === 'now' ? null : chosenReservationObj.label,
      customerAlias: customerAlias.trim() || '고객 A',
      addressAlias: addressAlias.trim() || defaultAddressAlias,
      customerNote: customerNote.trim(),
      paymentMethod,
      paymentMethodLabel: selectedPaymentOption.label,
      estimatedSavings: savings.totalSaved,
    });

    if (!result.ok) {
      setSubmitError(result.error ?? '주문을 확정할 수 없습니다.');
      setIsSubmitting(false);
    }
  };

  const leadLine = lineItems[0];
  const leadMenu = (leadLine ? menuById.get(leadLine.menuId) : undefined) ?? menu;
  const availableExtraMenus = allStoreMenus.filter(
    (m) => !m.isSoldOut && m.stock >= 1
  );
  const estimatedArrivalMinutes = Math.max(
    10,
    leadMenu.estimatedMinutes +
      (store.extraPrepMinutes ?? 0) +
      deliveryFeeCalc.etaDeltaMinutes
  );

  const autoAppliedSummary = [
    `${totalServings}개 메뉴`,
    chosenReservationObj.label,
    deliveryMeta.label,
    effectiveCouponDiscount > 0
      ? `${selectedCoupon.label} 자동 적용`
      : '착한가격 적용',
  ].join(' · ');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Minimal Header */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3.5 py-1.5 border border-[#E8ECE4] bg-white hover:bg-[#F7F8F5] text-[#1A1D1A] text-sm font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>뒤로</span>
        </button>
        <h1 className="text-base font-bold text-[#1A1D1A]">원탭 간편결제</h1>
      </div>

      {isBlocked && (
        <div
          role="alert"
          className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-sm text-red-900"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">현재 주문할 수 없습니다</p>
            <p className="text-xs mt-1 text-red-700">
              {isStoreClosed
                ? '영업 중단 상태인 매장입니다.'
                : stockIssueMessage ?? '주문 내역을 확인해 주세요.'}
            </p>
          </div>
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-800"
        >
          {submitError}
        </div>
      )}

      {/* 1. Store, Multi-Menu Line Items & Delivery Context Card */}
      <section className="os-card rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#4E6E2A]">
              {store.name} · {store.areaLabel.split(' · ')[0]}
            </p>
            <h2 className="text-lg sm:text-xl font-bold text-[#1A1D1A] mt-0.5">
              주문 메뉴 ({lineItems.length}종 · {totalServings}개)
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {allSameStorePrice && (
              <span className="px-2.5 py-1 rounded-full bg-[#EAF1E2] border border-[#D4E1C5] text-[#3D5720] text-xs font-semibold">
                착한가격 · 매장 동일가
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full bg-[#F7F8F5] border border-[#E8ECE4] text-[#555E52] text-xs font-semibold">
              1개도 배달
            </span>
          </div>
        </div>

        {/* Line items list */}
        <div className="space-y-3">
          {lineItems.map((line, idx) => {
            const itemMenu = menuById.get(line.menuId);
            if (!itemMenu) return null;
            const effectiveUnit = getEffectiveMenuPrice(itemMenu);
            const hasClosing = (itemMenu.closingDiscountPercent ?? 0) > 0;
            const chosenOpts = itemMenu.options.filter((o) =>
              line.selectedOptionIds.includes(o.id)
            );
            return (
              <div
                key={`${line.menuId}-${idx}`}
                className="p-3.5 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-[#E8ECE4]">
                    <FoodImage
                      src={itemMenu.image}
                      alt={itemMenu.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#1A1D1A] truncate">
                      {itemMenu.name}
                    </p>
                    <p className="text-xs text-[#687064] tabular-nums mt-0.5">
                      {hasClosing && (
                        <span className="line-through mr-1">
                          {formatWon(itemMenu.pricePerPerson)}
                        </span>
                      )}
                      <strong className="text-[#4E6E2A] font-semibold">
                        {formatWon(effectiveUnit)}
                      </strong>
                      {hasClosing && ` (-${itemMenu.closingDiscountPercent}%)`}
                      {' · '}재고 {itemMenu.stock}개
                    </p>
                    {chosenOpts.length > 0 && (
                      <p className="text-[11px] text-[#555E52] truncate mt-0.5">
                        옵션: {chosenOpts.map((o) => o.name).join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleUpdateLineQty(idx, -1)}
                    aria-label={`${itemMenu.name} 수량 감소`}
                    className="min-w-[34px] min-h-[34px] rounded-xl border border-[#E8ECE4] bg-white hover:bg-[#EAF1E2] text-[#1A1D1A] font-semibold cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-7 text-center font-mono tabular-nums text-sm font-bold text-[#1A1D1A]">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUpdateLineQty(idx, 1)}
                    aria-label={`${itemMenu.name} 수량 증가`}
                    className="min-w-[34px] min-h-[34px] rounded-xl border border-[#E8ECE4] bg-white hover:bg-[#EAF1E2] text-[#1A1D1A] font-semibold cursor-pointer"
                  >
                    +
                  </button>
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      aria-label={`${itemMenu.name} 삭제`}
                      className="p-1.5 text-[#687064] hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add More From Same Store */}
        {availableExtraMenus.length > 1 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAddMoreMenus((prev) => !prev)}
              className="text-xs font-bold text-[#4E6E2A] hover:underline underline-offset-4 inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>
                {showAddMoreMenus
                  ? '같은 가게 메뉴 접기'
                  : '같은 가게 다른 메뉴 함께 담기'}
              </span>
            </button>

            {showAddMoreMenus && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {availableExtraMenus.map((extra) => (
                  <button
                    key={extra.id}
                    type="button"
                    onClick={() => handleAddSameStoreMenu(extra.id)}
                    className="p-2.5 rounded-xl bg-white border border-[#E8ECE4] hover:border-[#82B440] flex items-center justify-between gap-2 text-left cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1A1D1A] truncate">
                        {extra.name}
                      </p>
                      <p className="text-[11px] font-mono text-[#4E6E2A]">
                        {formatWon(getEffectiveMenuPrice(extra))}
                      </p>
                    </div>
                    <span className="px-2 py-1 rounded-lg bg-[#EAF1E2] text-[#3D5720] text-[11px] font-bold shrink-0">
                      + 담기
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeStorePromos.length > 0 && (
          <div className="px-3.5 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950">
            <span className="font-bold mr-1.5">
              [{activeStorePromos[0].badgeText ?? '가게 이벤트'}]
            </span>
            <span className="font-semibold">{activeStorePromos[0].title}</span>
          </div>
        )}

        {deliveryFeeCalc.nextTierLabel && (
          <div className="px-3.5 py-2 rounded-2xl bg-[#EAF1E2] border border-[#D4E1C5] flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#3D5720]">
              {deliveryFeeCalc.nextTierLabel}
            </span>
            {availableExtraMenus.length > 1 && (
              <button
                type="button"
                onClick={() => setShowAddMoreMenus(true)}
                className="easy-compact font-bold text-[#4E6E2A] underline cursor-pointer"
              >
                메뉴 더 담기 →
              </button>
            )}
          </div>
        )}

        {leadMenu.aiReason && (
          <div className="px-4 py-3 bg-[#EAF1E2] border border-[#D4E1C5] rounded-2xl flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-[#4E6E2A] shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-[#3D5720]">
              <strong className="font-semibold text-[#4E6E2A] mr-1.5">
                바로 추천 근거
              </strong>
              {leadMenu.aiReason}
            </p>
          </div>
        )}

        {/* Delivery Destination Row */}
        <div className="pt-4 border-t border-[#E8ECE4] flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[#687064]">배달지 ({activeAreaName})</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-semibold text-[#1A1D1A] truncate">
                {addressAlias}
              </span>
              {onOpenLocationPicker && (
                <button
                  type="button"
                  onClick={onOpenLocationPicker}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#4E6E2A] hover:underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>변경</span>
                </button>
              )}
            </div>
          </div>

          <span className="text-xs font-semibold text-[#4E6E2A] tabular-nums">
            약 {estimatedArrivalMinutes}분 도착 ({deliveryMeta.shortLabel})
          </span>
        </div>

        {/* Efficient Delivery Method Selector (Always Visible) */}
        <div className="pt-4 border-t border-[#E8ECE4] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-[#1A1D1A] inline-flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-[#4E6E2A]" />
              <span>배송 방식 선택</span>
            </span>
            <span className="text-xs text-[#687064]">
              최소주문 없이 1개부터 효율 배송
            </span>
          </div>
          <div
            role="radiogroup"
            aria-label="배송 방식 선택"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2"
          >
            {DELIVERY_METHOD_OPTIONS.map((option) => {
              const active = deliveryMethod === option.id;
              const optFee = calculateStoreDeliveryFee(
                store,
                menuSubtotal,
                option.id
              ).finalDeliveryFee;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDeliveryMethod(option.id)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer space-y-1 ${
                    active
                      ? 'bg-[#EAF1E2] border-[#4E6E2A] ring-1 ring-[#4E6E2A]'
                      : 'bg-[#F7F8F5] border-[#E8ECE4] hover:border-[#82B440]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs sm:text-sm font-bold text-[#1A1D1A]">
                      {option.label}
                    </span>
                    <span className="font-mono text-xs font-bold text-[#4E6E2A] tabular-nums shrink-0">
                      {optFee === 0 ? '무료' : formatWon(optFee)}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-[#3D5720]">
                    {option.badge}
                  </p>
                  <p className="text-[11px] text-[#687064] leading-snug">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="p-3 rounded-2xl bg-[#F5F3EC] border border-[#E4E0D3] flex items-center gap-3">
            <img
              src={BARO_PARTNER_GEAR_SRC}
              alt="Baro 모자와 보온 배달 가방"
              className="w-20 h-14 rounded-xl object-cover shrink-0 bg-[#F5F3EC] border border-[#E4E0D3]"
            />
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs sm:text-sm font-bold text-[#364215]">
                Baro 공식 모자 · 보온 가방 착용 파트너 배송
              </p>
              <p className="text-[11px] sm:text-xs text-[#555E52] leading-snug break-keep">
                일반 배달 신청 시 Baro 전용 보온 가방으로 음식을 따뜻하고 안전하게 전해드려요.
              </p>
            </div>
          </div>
        </div>

        {/* Collapsible Fine-Tuning Drawer */}
        <div className="pt-3 border-t border-[#E8ECE4]">
          <button
            type="button"
            onClick={() => setShowDetailOptions((prev) => !prev)}
            aria-expanded={showDetailOptions}
            className="w-full min-h-[40px] flex items-center justify-between gap-2 text-xs font-semibold text-[#555E52] hover:text-[#1A1D1A] cursor-pointer"
          >
            <span className="flex items-center gap-1.5 truncate">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
              <span>도착 시간 · 옵션 · 쿠폰 · 요청사항 수정</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[#4E6E2A] shrink-0">
              <span>{showDetailOptions ? '접기' : '열기'}</span>
              {showDetailOptions ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {showDetailOptions && (
            <div className="pt-4 mt-3 border-t border-[#E8ECE4] space-y-5">
              {/* Arrival Slot */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#1A1D1A] flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-[#4E6E2A]" />
                  <span>도착 시간</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {RESERVATION_SLOTS_15M.map((slot) => {
                    const active = reservationSlotId === slot.id;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => setReservationSlotId(slot.id)}
                        className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-left text-xs font-semibold cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#EAF1E2] border-[#4E6E2A] text-[#4E6E2A]'
                            : 'bg-white border-[#E8ECE4] text-[#555E52] hover:border-[#4E6E2A]/40'
                        }`}
                      >
                        {slot.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Primary Menu Options */}
              {leadMenu.options.length > 0 && leadLine && (
                <div className="space-y-2">
                  <span className="block text-xs font-semibold text-[#1A1D1A]">
                    추가 옵션 ({leadMenu.name})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {leadMenu.options.map((opt) => {
                      const checked = leadLine.selectedOptionIds.includes(opt.id);
                      return (
                        <label
                          key={opt.id}
                          className={`min-h-[42px] px-3.5 py-2 rounded-xl border flex items-center justify-between gap-2 cursor-pointer ${
                            checked
                              ? 'bg-[#EAF1E2] border-[#4E6E2A] text-[#1A1D1A]'
                              : 'bg-white border-[#E8ECE4] text-[#1A1D1A]'
                          }`}
                        >
                          <span className="flex items-center gap-2 text-xs font-medium">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePrimaryOption(opt.id)}
                              className="w-4 h-4 accent-[#4E6E2A]"
                            />
                            <span>{opt.name}</span>
                          </span>
                          <span className="text-xs font-mono tabular-nums font-semibold text-[#4E6E2A]">
                            +{formatWon(opt.priceDelta)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Coupon */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="confirm-coupon"
                    className="text-xs font-semibold text-[#1A1D1A]"
                  >
                    쿠폰 할인 (스탬프 {stampCount}개)
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoBestCoupon}
                    className="text-xs font-semibold text-[#4E6E2A] hover:underline underline-offset-2 cursor-pointer"
                  >
                    최대 할인 자동 선택
                  </button>
                </div>
                <select
                  id="confirm-coupon"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponManuallyChosen(true);
                    setCouponCode(e.target.value);
                  }}
                  className="w-full min-h-[42px] px-3.5 bg-white border border-[#E8ECE4] rounded-xl text-xs text-[#1A1D1A]"
                >
                  {availableCoupons.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.label}
                      {c.requiresStamps
                        ? ` (스탬프 ${c.requiresStamps}개 이상)`
                        : ''}
                      {c.minSubtotal
                        ? ` (${formatWon(c.minSubtotal)} 이상)`
                        : ''}
                    </option>
                  ))}
                </select>
                {!isSelectedCouponEligible && selectedCoupon.code !== 'NONE' && (
                  <p className="text-xs text-amber-800 font-medium">
                    현재 결제 수단·주문 금액 또는 스탬프 조건이 맞지 않아 적용되지 않습니다.
                  </p>
                )}
              </div>

              {/* Delivery Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#687064] mb-1">
                    주문자
                  </label>
                  <input
                    type="text"
                    value={customerAlias}
                    onChange={(e) => setCustomerAlias(e.target.value)}
                    className="w-full min-h-[40px] px-3 border border-[#E8ECE4] rounded-xl text-xs bg-[#F7F8F5] text-[#1A1D1A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#687064] mb-1">
                    배달지 상세
                  </label>
                  <input
                    type="text"
                    value={addressAlias}
                    onChange={(e) => setAddressAlias(e.target.value)}
                    className="w-full min-h-[40px] px-3 border border-[#E8ECE4] rounded-xl text-xs bg-[#F7F8F5] text-[#1A1D1A]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#687064] mb-1">
                  가게 요청사항
                </label>
                <input
                  type="text"
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder="예: 일회용 수저 빼기"
                  className="w-full min-h-[40px] px-3 border border-[#E8ECE4] rounded-xl text-xs text-[#1A1D1A]"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. Nationwide Payment Selector */}
      <section className="os-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-[#1A1D1A] flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-[#4E6E2A]" />
            <span>결제 수단 선택</span>
          </h2>
          <span className="text-xs text-[#687064]">
            매장 가격 그대로 · 추가 중개수수료 0원
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="결제 수단 선택"
          className="grid grid-cols-2 sm:grid-cols-3 gap-2.5"
        >
          {paymentOptions.map((option) => {
            const active = paymentMethod === option.id;
            const Icon =
              option.id === 'b2b_meal_point'
                ? Briefcase
                : option.id === 'alle_pay' || option.id === 'local_currency'
                  ? Wallet
                  : CreditCard;

            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPaymentMethod(option.id)}
                className={`min-h-[86px] p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                  active
                    ? 'bg-[#EAF1E2] border-[#82B440] ring-1 ring-[#82B440]/30'
                    : 'bg-white border-[#E8ECE4] hover:border-[#82B440]/60 hover:bg-[#F7F8F5]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      active
                        ? 'bg-[#4E6E2A] text-white'
                        : 'bg-[#F0F3EC] text-[#555E52]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      active
                        ? 'bg-[#82B440] border-[#82B440] text-white'
                        : 'border-[#D4DCD0] bg-white'
                    }`}
                  >
                    {active && <Check className="w-2.5 h-2.5" />}
                  </div>
                </div>

                <div>
                  <div className="text-xs sm:text-sm font-bold text-[#1A1D1A] leading-snug truncate">
                    {option.shortLabel}
                  </div>
                  <div className="text-[11px] text-[#687064] leading-snug truncate">
                    {option.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-xs font-medium text-[#4E6E2A] pt-0.5">
          {selectedPaymentOption.benefitText}
        </p>

        {insufficientAllePay && (
          <div className="p-3.5 bg-[#FFFBEF] border border-[#E8D595] rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <span>
              Baro페이 잔액({formatWon(walletBalance)})이 결제 금액({formatWon(totalAmount)})보다 부족합니다.
            </span>
            {onTopupWalletConfirmed && (
              <button
                type="button"
                onClick={() => onTopupWalletConfirmed(10000)}
                className="px-3.5 py-1.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white font-bold rounded-xl cursor-pointer shrink-0"
              >
                +10,000원 바로 충전
              </button>
            )}
          </div>
        )}
      </section>

      {/* 3. Summary Receipt, Competitor Savings Comparison & One-Tap CTA */}
      <section className="os-card rounded-2xl p-5 sm:p-6 space-y-5">
        {/* Auto Best Coupon Strip */}
        <div className="px-4 py-3 bg-[#EAF1E2] border border-[#DCE7CF] rounded-2xl flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <Ticket className="w-4 h-4 text-[#4E6E2A] shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-bold text-[#3D5720]">
                {effectiveCouponDiscount > 0
                  ? `최대 할인 자동 적용: ${selectedCoupon.label} (-${formatWon(effectiveCouponDiscount)})`
                  : '이전 옵션 자동 적용 완료'}
              </p>
              <p className="text-xs text-[#4C6235] leading-relaxed">
                {autoAppliedSummary}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowDetailOptions(true)}
            className="text-xs font-bold text-[#4E6E2A] hover:underline underline-offset-2 shrink-0 cursor-pointer"
          >
            변경
          </button>
        </div>

        {/* Competitor Savings Comparison Box */}
        {savings.totalSaved > 0 && (
          <div className="p-4 bg-[#F7F8F5] border border-[#D4E1C5] rounded-2xl space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#555E52] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#82B440]" />
                <span>타 배달앱 예상 결제액</span>
              </span>
              <span className="font-mono line-through text-[#687064] tabular-nums">
                {formatWon(savings.competitorEstimatedTotal + optionsSubtotal)}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
              <span className="font-bold text-[#3D5720]">
                Baro로 주문하면 예상 절약액
              </span>
              <span className="font-mono font-bold text-[#4E6E2A] tabular-nums">
                총 약 {formatWon(savings.totalSaved)} 절약!
              </span>
            </div>
          </div>
        )}

        {/* Receipt Itemized Breakdown */}
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between text-[#555E52]">
            <dt>메뉴 합계 ({totalServings}개)</dt>
            <dd className="font-mono tabular-nums font-medium text-[#1A1D1A]">
              {originalMenuSubtotal > menuSubtotal && (
                <span className="line-through text-xs text-[#687064] mr-1.5">
                  {formatWon(originalMenuSubtotal)}
                </span>
              )}
              {formatWon(menuSubtotal)}
            </dd>
          </div>
          {optionsSubtotal > 0 && (
            <div className="flex justify-between text-[#555E52]">
              <dt>추가 옵션</dt>
              <dd className="font-mono tabular-nums">
                +{formatWon(optionsSubtotal)}
              </dd>
            </div>
          )}
          <div className="flex justify-between text-[#555E52]">
            <dt>
              배달비 ({deliveryMeta.label}
              {deliveryFeeCalc.tierSavings > 0
                ? ` · 점주 상생 -${formatWon(deliveryFeeCalc.tierSavings)}`
                : ''}
              )
            </dt>
            <dd className="font-mono tabular-nums">
              {deliveryFee === 0 ? '무료 (0원)' : `+${formatWon(deliveryFee)}`}
            </dd>
          </div>
          {effectiveCouponDiscount > 0 && (
            <div className="flex justify-between text-[#4E6E2A]">
              <dt>쿠폰 할인 ({selectedCoupon.code})</dt>
              <dd className="font-mono tabular-nums font-semibold">
                -{formatWon(effectiveCouponDiscount)}
              </dd>
            </div>
          )}

          {/* Dashed Receipt Total Row */}
          <div className="pt-4 mt-3 border-t border-dashed border-[#D4DCD0] flex items-baseline justify-between gap-4">
            <div>
              <dt className="text-sm font-bold text-[#1A1D1A]">최종 결제 금액</dt>
              <p className="text-xs text-[#687064] mt-0.5">
                {selectedPaymentOption.shortLabel} · 중개수수료 0원
              </p>
            </div>
            <dd className="os-kpi text-2xl sm:text-3xl font-bold text-[#4E6E2A]">
              {formatWon(totalAmount)}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          disabled={isBlocked || isSubmitting || insufficientAllePay}
          onClick={handleConfirm}
          className="w-full min-h-[58px] py-3.5 px-6 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#E8ECE4] disabled:text-[#687064] text-white font-bold text-base rounded-2xl transition-colors cursor-pointer disabled:cursor-not-allowed shadow-[0_8px_20px_rgba(78,110,42,0.22)]"
        >
          {isSubmitting
            ? '주문 접수 중...'
            : `${selectedPaymentOption.shortLabel}로 ${formatWon(totalAmount)} 원탭 결제`}
        </button>
      </section>
    </div>
  );
}
