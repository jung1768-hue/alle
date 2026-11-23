import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  Check,
  CreditCard,
  MapPin,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { MOCK_COUPONS } from '../data/seedData';
import {
  DeliveryMethod,
  MenuItem,
  OrderLineItem,
  PaymentMethod,
  SavedLocation,
  Store,
  StoreCoupon,
} from '../types/alle';
import { formatWon, getEffectiveMenuPrice } from '../utils/parser';
import {
  calculateStoreDeliveryFee,
  DELIVERY_METHOD_OPTIONS,
  estimateCompetitorSavings,
  getAvailableCouponsForStore,
  getBestCoupon,
  getDeliveryMethodMeta,
  getLocalCurrencyLabel,
} from '../utils/pricing';
import { FoodImage } from './FoodImage';

export interface QuickPayResolvedItem {
  menu: MenuItem;
  quantity: number;
  selectedOptionIds: string[];
}

interface QuickPayBottomSheetProps {
  isOpen: boolean;
  store: Store | null;
  storeCoupons?: StoreCoupon[];
  items: QuickPayResolvedItem[];
  defaultPaymentMethod?: PaymentMethod;
  defaultDeliveryMethod?: DeliveryMethod;
  defaultCouponCode?: string;
  walletBalance: number;
  stampCount: number;
  activeLocation: SavedLocation;
  customerNote: string;
  onTopupWallet: (amount: number) => void;
  onOpenFullCheckout: (payload: {
    paymentMethod: PaymentMethod;
    deliveryMethod: DeliveryMethod;
    couponCode: string;
  }) => void;
  onConfirmQuickPay: (payload: {
    storeId: string;
    items: OrderLineItem[];
    couponCode: string;
    couponDiscount: number;
    deliveryMethod: DeliveryMethod;
    paymentMethod: PaymentMethod;
    paymentMethodLabel: string;
    customerNote: string;
    estimatedSavings: number;
  }) => { ok: boolean; error?: string };
  onClose: () => void;
}

export function QuickPayBottomSheet({
  isOpen,
  store,
  storeCoupons = [],
  items,
  defaultPaymentMethod = 'kakaopay',
  defaultDeliveryMethod = 'partner_direct',
  defaultCouponCode,
  walletBalance,
  stampCount,
  activeLocation,
  customerNote,
  onTopupWallet,
  onOpenFullCheckout,
  onConfirmQuickPay,
  onClose,
}: QuickPayBottomSheetProps) {
  const localCurrency = useMemo(
    () => getLocalCurrencyLabel(activeLocation.areaName),
    [activeLocation.areaName]
  );

  const paymentOptions: Array<{
    id: PaymentMethod;
    shortLabel: string;
    label: string;
  }> = useMemo(
    () => [
      { id: 'kakaopay', shortLabel: '카카오페이', label: '카카오페이' },
      { id: 'tosspay', shortLabel: '토스페이', label: '토스페이' },
      { id: 'naverpay', shortLabel: '네이버페이', label: '네이버페이' },
      { id: 'card_oneclick', shortLabel: '등록카드', label: '등록카드 1초결제' },
      {
        id: 'alle_pay',
        shortLabel: `Baro페이 (${formatWon(walletBalance)})`,
        label: 'Baro페이 잔액 (수수료 1.5%)',
      },
      {
        id: 'local_currency',
        shortLabel: localCurrency.shortLabel,
        label: localCurrency.fullLabel,
      },
      {
        id: 'b2b_meal_point',
        shortLabel: '기업 식대',
        label: '기업 식대 포인트',
      },
    ],
    [localCurrency, walletBalance]
  );

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>(defaultPaymentMethod);
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>(defaultDeliveryMethod);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPaymentMethod(defaultPaymentMethod);
      setDeliveryMethod(defaultDeliveryMethod);
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, defaultPaymentMethod, defaultDeliveryMethod]);

  const computed = useMemo(() => {
    if (!store || items.length === 0) return null;

    let menuSubtotal = 0;
    let originalMenuSubtotal = 0;
    let optionsSubtotal = 0;
    let allSameStorePrice = true;

    const resolvedLines: OrderLineItem[] = items.map((entry) => {
      const unitPrice = getEffectiveMenuPrice(entry.menu);
      const selectedOpts = entry.menu.options.filter((o) =>
        entry.selectedOptionIds.includes(o.id)
      );
      const lineOptionsSum =
        selectedOpts.reduce((s, o) => s + o.priceDelta, 0) * entry.quantity;
      const lineSub = unitPrice * entry.quantity;
      menuSubtotal += lineSub;
      originalMenuSubtotal += entry.menu.pricePerPerson * entry.quantity;
      optionsSubtotal += lineOptionsSum;

      const isSame =
        entry.menu.storePrice !== null &&
        entry.menu.comparisonDate !== null &&
        entry.menu.storePrice === entry.menu.pricePerPerson;
      if (!isSame) allSameStorePrice = false;

      return {
        menuId: entry.menu.id,
        menuName: entry.menu.name,
        unitPrice,
        originalUnitPrice: entry.menu.pricePerPerson,
        quantity: entry.quantity,
        selectedOptionIds: selectedOpts.map((o) => o.id),
        selectedOptionNames: selectedOpts.map((o) => o.name),
        optionsSubtotal: lineOptionsSum,
        lineSubtotal: lineSub,
      };
    });

    const availableCoupons = getAvailableCouponsForStore(
      MOCK_COUPONS,
      storeCoupons,
      store.id,
      menuSubtotal
    );

    const bestCoupon = getBestCoupon(availableCoupons, {
      menuSubtotal,
      stampCount,
      paymentMethod,
      preferredCode: defaultCouponCode,
    });

    const couponDiscount = Math.min(bestCoupon.discountAmount, menuSubtotal);
    const deliveryFeeCalc = calculateStoreDeliveryFee(
      store,
      menuSubtotal,
      deliveryMethod
    );
    const deliveryFee = deliveryFeeCalc.finalDeliveryFee;
    const totalAmount =
      menuSubtotal + optionsSubtotal + deliveryFee - couponDiscount;

    const savings = estimateCompetitorSavings({
      menuSubtotal,
      originalMenuSubtotal,
      deliveryFee,
      originalDeliveryFee: deliveryFeeCalc.baseFee,
      couponDiscount,
      isSameStorePrice: allSameStorePrice,
    });

    const unavailable =
      !store.isOpen ||
      items.some(
        (entry) =>
          entry.menu.isSoldOut ||
          entry.menu.stock <= 0 ||
          entry.quantity > entry.menu.stock
      );

    return {
      resolvedLines,
      menuSubtotal,
      originalMenuSubtotal,
      optionsSubtotal,
      deliveryFee,
      deliveryFeeCalc,
      bestCoupon,
      couponDiscount,
      totalAmount,
      savings,
      unavailable,
    };
  }, [
    store,
    storeCoupons,
    items,
    stampCount,
    paymentMethod,
    deliveryMethod,
    defaultCouponCode,
  ]);

  if (!isOpen || !store || !computed) return null;

  const selectedPayOption =
    paymentOptions.find((p) => p.id === paymentMethod) ?? paymentOptions[0];
  const insufficientWallet =
    paymentMethod === 'alle_pay' && walletBalance < computed.totalAmount;

  const leadItem = items[0];
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const optionSummary = computed.resolvedLines
    .flatMap((l) => l.selectedOptionNames)
    .slice(0, 3);

  const handlePayClick = () => {
    if (isSubmitting || computed.unavailable || insufficientWallet) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    const res = onConfirmQuickPay({
      storeId: store.id,
      items: computed.resolvedLines,
      couponCode: computed.bestCoupon.code,
      couponDiscount: computed.couponDiscount,
      deliveryMethod,
      paymentMethod,
      paymentMethodLabel: selectedPayOption.label,
      customerNote,
      estimatedSavings: computed.savings.totalSaved,
    });
    if (!res.ok) {
      setErrorMsg(res.error ?? '결제 처리에 실패했습니다.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="단골 1초 원탭 결제"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[#1A1D1A]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl border border-[#E8ECE4] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E8ECE4] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-[#EAF1E2] text-[#4E6E2A] flex items-center justify-center">
              <Zap className="w-4 h-4 fill-[#82B440]" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[#1A1D1A]">
                1초 원탭 간편결제
              </h2>
              <p className="text-[11px] text-[#687064]">
                이전 옵션 · 최대 할인 자동 적용
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-9 h-9 rounded-xl hover:bg-[#F7F8F5] text-[#687064] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Item & Address Summary */}
          <div className="p-4 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-3">
            <div className="flex items-center gap-3.5">
              <div className="w-16 h-16 rounded-xl overflow-hidden border border-[#E8ECE4] shrink-0">
                <FoodImage
                  src={leadItem.menu.image}
                  alt={leadItem.menu.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#4E6E2A] truncate">
                  {store.name}
                </p>
                <p className="text-sm sm:text-base font-bold text-[#1A1D1A] truncate">
                  {items.length > 1
                    ? `${leadItem.menu.name} 외 ${items.length - 1}건`
                    : leadItem.menu.name}{' '}
                  ({totalQty}개)
                </p>
                <p className="text-xs text-[#687064] truncate mt-0.5">
                  {optionSummary.length > 0
                    ? `이전 옵션: ${optionSummary.join(', ')}`
                    : '기본 옵션'}
                  {customerNote ? ` · ${customerNote}` : ''}
                </p>
              </div>
            </div>

            <div className="pt-2.5 border-t border-[#E8ECE4] flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-[#555E52] truncate">
                <MapPin className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
                <span className="truncate">{activeLocation.detailAddress}</span>
              </span>
              <span className="font-mono font-bold text-[#4E6E2A] shrink-0">
                약{' '}
                {Math.max(
                  10,
                  leadItem.menu.estimatedMinutes +
                    (store.extraPrepMinutes ?? 0) +
                    computed.deliveryFeeCalc.etaDeltaMinutes
                )}
                분
              </span>
            </div>
          </div>

          {/* Compact Delivery Method Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#1A1D1A]">배송 방식</span>
              <span className="text-[#4E6E2A] font-semibold">
                착한가격 · 최소주문 없음
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {DELIVERY_METHOD_OPTIONS.map((opt) => {
                const active = deliveryMethod === opt.id;
                const optFee = calculateStoreDeliveryFee(
                  store,
                  computed.menuSubtotal,
                  opt.id
                ).finalDeliveryFee;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDeliveryMethod(opt.id)}
                    className={`easy-compact p-2 rounded-xl border text-center cursor-pointer transition-colors ${
                      active
                        ? 'bg-[#EAF1E2] border-[#4E6E2A] ring-1 ring-[#4E6E2A] text-[#3D5720]'
                        : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#434B40]'
                    }`}
                  >
                    <div className="text-xs font-bold truncate">
                      {opt.shortLabel}
                    </div>
                    <div className="text-[11px] font-mono font-bold text-[#4E6E2A]">
                      {optFee === 0 ? '무료' : formatWon(optFee)}
                    </div>
                  </button>
                );
              })}
            </div>
            {computed.deliveryFeeCalc.nextTierLabel && (
              <p className="text-[11px] font-semibold text-[#4E6E2A]">
                {computed.deliveryFeeCalc.nextTierLabel}
              </p>
            )}
          </div>

          {/* Savings & Auto-Applied Best Coupon */}
          <div className="p-3.5 rounded-2xl bg-[#EAF1E2] border border-[#D4E1C5] space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#3D5720]">
                <Sparkles className="w-3.5 h-3.5 text-[#4E6E2A]" />
                <span>
                  타 배달앱 예상가({formatWon(computed.savings.competitorEstimatedTotal + computed.optionsSubtotal)}) 대비
                </span>
              </span>
              <strong className="font-mono text-sm font-bold text-[#4E6E2A]">
                약 {formatWon(computed.savings.totalSaved)} 절약
              </strong>
            </div>

            {computed.couponDiscount > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs text-[#3D5720] pt-1.5 border-t border-[#D4E1C5]">
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Ticket className="w-3.5 h-3.5" />
                  <span>최대 할인 자동 적용: {computed.bestCoupon.label}</span>
                </span>
                <span className="font-mono font-bold">
                  -{formatWon(computed.couponDiscount)}
                </span>
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#1A1D1A] flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-[#4E6E2A]" />
                <span>결제 수단</span>
              </span>
              <span className="text-[#687064]">착한가격 · 중개수수료 0원</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {paymentOptions.slice(0, 5).map((opt) => {
                  const active = paymentMethod === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPaymentMethod(opt.id)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                          : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#434B40] hover:border-[#82B440]'
                      }`}
                    >
                      {active && <Check className="w-3 h-3 shrink-0" />}
                      {opt.id === 'alle_pay' && !active && (
                        <Wallet className="w-3 h-3 shrink-0 text-[#4E6E2A]" />
                      )}
                      {opt.id === 'b2b_meal_point' && !active && (
                        <Briefcase className="w-3 h-3 shrink-0 text-[#4E6E2A]" />
                      )}
                      <span>{opt.shortLabel}</span>
                    </button>
                  );
                })}
            </div>

            {insufficientWallet && (
              <div className="p-3 bg-[#FFFBEF] border border-[#E8D595] rounded-xl flex items-center justify-between gap-2 text-xs text-amber-900">
                <span>
                  Baro페이 잔액({formatWon(walletBalance)})이 부족합니다.
                </span>
                <button
                  type="button"
                  onClick={() => onTopupWallet(10000)}
                  className="px-3 py-1.5 bg-[#4E6E2A] text-white font-bold rounded-lg cursor-pointer shrink-0"
                >
                  +10,000원 충전
                </button>
              </div>
            )}
          </div>

          {computed.unavailable && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-red-800"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>현재 영업 중단이거나 재고가 부족해 결제할 수 없습니다.</span>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-800"
            >
              {errorMsg}
            </div>
          )}

          {/* Price Breakdown Line */}
          <div className="pt-2 border-t border-dashed border-[#D4DCD0] flex items-baseline justify-between gap-3">
            <span className="text-xs font-semibold text-[#687064]">
              최종 결제 금액 ({getDeliveryMethodMeta(deliveryMethod).shortLabel}{' '}
              {computed.deliveryFee === 0
                ? '무료'
                : formatWon(computed.deliveryFee)}
              )
            </span>
            <span className="os-kpi text-2xl font-bold text-[#4E6E2A]">
              {formatWon(computed.totalAmount)}
            </span>
          </div>

          {/* Primary CTA + Secondary Link */}
          <div className="space-y-2">
            <button
              type="button"
              disabled={
                computed.unavailable || insufficientWallet || isSubmitting
              }
              onClick={handlePayClick}
              className="w-full min-h-[56px] py-3.5 px-5 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] disabled:text-[#687064] text-white font-bold text-base rounded-2xl inline-flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(78,110,42,0.22)] cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>
                {isSubmitting
                  ? '주문 접수 중...'
                  : `${selectedPayOption.shortLabel}로 ${formatWon(computed.totalAmount)} 바로 결제`}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onOpenFullCheckout({
                  paymentMethod,
                  deliveryMethod,
                  couponCode: computed.bestCoupon.code,
                })
              }
              className="w-full min-h-[40px] py-1.5 text-xs font-semibold text-[#555E52] hover:text-[#4E6E2A] inline-flex items-center justify-center gap-1 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>옵션 · 쿠폰 · 배달지 자세히 수정하기</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
