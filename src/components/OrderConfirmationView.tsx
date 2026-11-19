import { useEffect, useState } from 'react';
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
  SlidersHorizontal,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { MOCK_COUPONS, RESERVATION_SLOTS_15M } from '../data/seedData';
import { MenuItem, PaymentMethod, Store } from '../types/alle';
import { formatWon, getEffectiveMenuPrice } from '../utils/parser';
import { FoodImage } from './FoodImage';

const PAYMENT_OPTIONS: Array<{
  id: PaymentMethod;
  shortLabel: string;
  label: string;
  subtitle: string;
  benefitText: string;
}> = [
  {
    id: 'b2b_meal_point',
    shortLabel: '기업 식대 포인트',
    label: '기업 식대 포인트 (B2B 법인결제)',
    subtitle: 'B2B 법인 자동 정산',
    benefitText: '지자체 보조금 없이 대구 제휴 기업 복지 식대로 자생 매출 창출',
  },
  {
    id: 'local_currency',
    shortLabel: '대구로페이',
    label: '대구로페이 / 지역화폐',
    subtitle: '지역화폐 · 수수료 0%',
    benefitText: '보조금 소진 이후에도 점주 중개수수료 0% 직결제 구조 유지',
  },
  {
    id: 'alle_regular_pass',
    shortLabel: 'Alle 단골 패스',
    label: 'Alle 단골 패스',
    subtitle: '스탬프 +1 자동 적립',
    benefitText: 'AI 단골 구독 결제 · 스탬프 자동 적립 및 이웃 묶음 우선 매칭',
  },
];

interface OrderConfirmationViewProps {
  menu: MenuItem;
  store: Store;
  initialServings: number;
  initialOptionIds: string[];
  initialCouponCode: string;
  initialSharedDelivery?: boolean;
  initialReservationSlot?: string;
  initialPaymentMethod?: PaymentMethod;
  defaultAddressAlias?: string;
  stampCount: number;
  defaultNote: string;
  onOpenLocationPicker?: () => void;
  onBack: () => void;
  onConfirmOrder: (payload: {
    menuId: string;
    servings: number;
    selectedOptionIds: string[];
    couponCode: string;
    couponDiscount: number;
    sharedDeliveryApplied: boolean;
    reservationSlot: string | null;
    customerAlias: string;
    addressAlias: string;
    customerNote: string;
    paymentMethod?: PaymentMethod;
    paymentMethodLabel?: string;
  }) => { ok: boolean; error?: string };
}

export function OrderConfirmationView({
  menu,
  store,
  initialServings,
  initialOptionIds,
  initialCouponCode,
  initialSharedDelivery = false,
  initialReservationSlot = 'now',
  initialPaymentMethod = 'local_currency',
  defaultAddressAlias = '수성구 범어동 수령지 A',
  stampCount,
  defaultNote,
  onOpenLocationPicker,
  onBack,
  onConfirmOrder,
}: OrderConfirmationViewProps) {
  const [servings, setServings] = useState<number>(Math.max(1, initialServings));
  const [selectedOptionIds, setSelectedOptionIds] =
    useState<string[]>(initialOptionIds);
  const [couponCode, setCouponCode] = useState<string>(initialCouponCode);
  const [sharedDeliveryApplied, setSharedDeliveryApplied] = useState<boolean>(
    initialSharedDelivery
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
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>(initialPaymentMethod);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const selectedPaymentOption =
    PAYMENT_OPTIONS.find((p) => p.id === paymentMethod) ?? PAYMENT_OPTIONS[0];

  const isStoreClosed = !store.isOpen;
  const isMenuSoldOut = menu.isSoldOut || menu.stock <= 0;
  const isInsufficientStock = servings > menu.stock;
  const isBlocked = isStoreClosed || isMenuSoldOut || isInsufficientStock;

  const effectiveUnitPrice = getEffectiveMenuPrice(menu);
  const menuSubtotal = Math.round(effectiveUnitPrice) * servings;
  const selectedOptions = menu.options.filter((o) =>
    selectedOptionIds.includes(o.id)
  );
  const optionsSubtotal = selectedOptions.reduce(
    (sum, o) => sum + o.priceDelta,
    0
  );
  const deliveryFee = sharedDeliveryApplied
    ? Math.round(store.deliveryFee / 2)
    : store.deliveryFee;

  const selectedCoupon =
    MOCK_COUPONS.find((c) => c.code === couponCode) ?? MOCK_COUPONS[0];
  const isStampRequirementMet =
    !selectedCoupon.requiresStamps || stampCount >= selectedCoupon.requiresStamps;

  const effectiveCouponDiscount = isStampRequirementMet
    ? Math.max(0, Math.min(selectedCoupon.discountAmount, menuSubtotal))
    : 0;

  const totalAmount =
    menuSubtotal + optionsSubtotal + deliveryFee - effectiveCouponDiscount;

  const isSameStorePrice =
    menu.storePrice !== null &&
    menu.comparisonDate !== null &&
    menu.storePrice === menu.pricePerPerson;

  const chosenReservationObj =
    RESERVATION_SLOTS_15M.find((s) => s.id === reservationSlotId) ??
    RESERVATION_SLOTS_15M[0];

  const toggleOption = (optionId: string) => {
    setSelectedOptionIds((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    );
  };

  const handleAutoBestCoupon = () => {
    let bestCoupon = MOCK_COUPONS[0];
    let bestValue = 0;
    for (const c of MOCK_COUPONS) {
      if (c.requiresStamps && stampCount < c.requiresStamps) continue;
      const usable = Math.min(c.discountAmount, menuSubtotal);
      if (usable > bestValue) {
        bestValue = usable;
        bestCoupon = c;
      }
    }
    setCouponCode(bestCoupon.code);
  };

  const handleConfirm = () => {
    if (isSubmitting || isBlocked) return;
    if (!Number.isInteger(servings) || servings < 1) {
      setSubmitError('수량은 1 이상의 정수여야 합니다.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const result = onConfirmOrder({
      menuId: menu.id,
      servings,
      selectedOptionIds,
      couponCode: isStampRequirementMet ? selectedCoupon.code : 'NONE',
      couponDiscount: effectiveCouponDiscount,
      sharedDeliveryApplied,
      reservationSlot:
        reservationSlotId === 'now' ? null : chosenReservationObj.label,
      customerAlias: customerAlias.trim() || '고객 A',
      addressAlias: addressAlias.trim() || '대구 수성구 범어동 수령지 A',
      customerNote: customerNote.trim(),
      paymentMethod,
      paymentMethodLabel: selectedPaymentOption.label,
    });

    if (!result.ok) {
      setSubmitError(result.error ?? '주문을 확정할 수 없습니다.');
      setIsSubmitting(false);
    }
  };

  const autoAppliedSummary = [
    `${servings}인분`,
    chosenReservationObj.label,
    sharedDeliveryApplied ? '이웃 묶음배달 50% 절약' : '빠른 직배달',
    selectedOptions.length > 0
      ? selectedOptions.map((o) => o.name).join(', ')
      : '기본 옵션',
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
                : isMenuSoldOut
                  ? '품절된 메뉴입니다.'
                  : `남은 재고(${menu.stock}개)보다 수량이 많습니다.`}
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

      {/* 1. Compact Menu & AI Auto-Applied Context Card */}
      <section className="os-card rounded-[28px] p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-[#E8ECE4]">
            <FoodImage
              src={menu.image}
              alt={menu.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-xs text-[#687064] tabular-nums">
              {store.name} · 약{' '}
              {menu.estimatedMinutes + (store.extraPrepMinutes ?? 0)}분 · 재고{' '}
              {menu.stock}개
            </p>
            <h2 className="text-xl font-bold text-[#1A1D1A] tracking-tight truncate">
              {menu.name}
            </h2>
            <p className="text-xs font-medium text-[#687064] tabular-nums">
              {menu.servingSpec} · 1인 {formatWon(menu.pricePerPerson)}
              {isSameStorePrice && ' · 매장 동일 가격'}
            </p>
          </div>
        </div>

        {menu.aiReason && (
          <div className="px-4 py-3 bg-[#EAF1E2] border border-[#D4E1C5] rounded-2xl flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-[#4E6E2A] shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-[#3D5720]">
              <strong className="font-semibold text-[#4E6E2A] mr-1.5">
                AI 추천 근거
              </strong>
              {menu.aiReason}
            </p>
          </div>
        )}

        {/* Delivery Destination & Quick Quantity Row */}
        <div className="pt-4 border-t border-[#E8ECE4] flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[#687064]">배달지</p>
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

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              aria-label="수량 감소"
              className="min-w-[36px] min-h-[36px] rounded-xl border border-[#E8ECE4] bg-[#F7F8F5] hover:bg-[#EAF1E2] text-[#1A1D1A] font-semibold cursor-pointer"
            >
              -
            </button>
            <span className="w-10 text-center font-mono tabular-nums text-sm font-bold text-[#1A1D1A]">
              {servings}인
            </span>
            <button
              type="button"
              onClick={() =>
                setServings((s) => Math.min(Math.max(1, menu.stock), s + 1))
              }
              aria-label="수량 증가"
              className="min-w-[36px] min-h-[36px] rounded-xl border border-[#E8ECE4] bg-[#F7F8F5] hover:bg-[#EAF1E2] text-[#1A1D1A] font-semibold cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* Collapsible Fine-Tuning Drawer (Hidden by Default for One-Tap Calmness) */}
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

              {/* Menu Options */}
              {menu.options.length > 0 && (
                <div className="space-y-2">
                  <span className="block text-xs font-semibold text-[#1A1D1A]">
                    추가 옵션
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {menu.options.map((opt) => {
                      const checked = selectedOptionIds.includes(opt.id);
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
                              onChange={() => toggleOption(opt.id)}
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

              {/* Neighbor Shared Delivery */}
              <label
                className={`min-h-[46px] p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                  sharedDeliveryApplied
                    ? 'bg-[#EAF1E2] border-[#4E6E2A]'
                    : 'bg-[#F7F8F5] border-[#E8ECE4]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={sharedDeliveryApplied}
                    onChange={(e) => setSharedDeliveryApplied(e.target.checked)}
                    className="w-4 h-4 accent-[#4E6E2A] shrink-0"
                  />
                  <span className="text-xs font-semibold text-[#1A1D1A] flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#4E6E2A]" />
                    <span>이웃 묶음배달 (배달비 50% 절약)</span>
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-[#4E6E2A] shrink-0">
                  {formatWon(Math.round(store.deliveryFee / 2))}
                </span>
              </label>

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
                  onChange={(e) => setCouponCode(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 bg-white border border-[#E8ECE4] rounded-xl text-xs text-[#1A1D1A]"
                >
                  {MOCK_COUPONS.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.label}
                      {c.requiresStamps
                        ? ` (스탬프 ${c.requiresStamps}개 이상)`
                        : ''}
                    </option>
                  ))}
                </select>
                {!isStampRequirementMet && (
                  <p className="text-xs text-[#687064] font-medium">
                    스탬프 {selectedCoupon.requiresStamps}개 이상 시 적용됩니다.
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

      {/* 2. Horizontal Radio Card Payment Selector */}
      <section className="os-card rounded-[28px] p-6 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-[#1A1D1A] flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-[#4E6E2A]" />
            <span>결제 수단 선택</span>
          </h2>
          <span className="text-xs text-[#687064]">
            보조금 없는 자생 결제 구조
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="결제 수단 선택"
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          {PAYMENT_OPTIONS.map((option) => {
            const active = paymentMethod === option.id;
            const Icon =
              option.id === 'b2b_meal_point'
                ? Briefcase
                : option.id === 'local_currency'
                  ? Wallet
                  : Sparkles;

            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPaymentMethod(option.id)}
                className={`min-h-[108px] p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                  active
                    ? 'bg-[#EAF1E2] border-[#82B440] ring-1 ring-[#82B440]/30'
                    : 'bg-white border-[#E8ECE4] hover:border-[#82B440]/60 hover:bg-[#F7F8F5]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      active
                        ? 'bg-[#4E6E2A] text-white'
                        : 'bg-[#F0F3EC] text-[#555E52]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                      active
                        ? 'bg-[#82B440] border-[#82B440] text-white'
                        : 'border-[#D4DCD0] bg-white'
                    }`}
                  >
                    {active && <Check className="w-3 h-3" />}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="text-sm font-bold text-[#1A1D1A] leading-snug">
                    {option.shortLabel}
                  </div>
                  <div className="text-[11px] text-[#687064] leading-snug">
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
      </section>

      {/* 3. Clean Summary Receipt & Dominant One-Tap CTA */}
      <section className="os-card rounded-[28px] p-6 sm:p-7 space-y-5">
        {/* AI Auto-Applied Confirmation Strip */}
        <div className="px-4 py-3 bg-[#EAF1E2] border border-[#DCE7CF] rounded-2xl flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-[#82B440] shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs font-bold text-[#3D5720]">
              AI 자동 옵션 적용 완료
            </p>
            <p className="text-xs text-[#4C6235] leading-relaxed">
              {autoAppliedSummary}
            </p>
          </div>
        </div>

        {/* Receipt Itemized Breakdown */}
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between text-[#555E52]">
            <dt>
              메뉴 금액 ({formatWon(menu.pricePerPerson)} × {servings})
            </dt>
            <dd className="font-mono tabular-nums font-medium text-[#1A1D1A]">
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
            <dt>배달비 {sharedDeliveryApplied ? '(이웃 묶음 50%)' : ''}</dt>
            <dd className="font-mono tabular-nums">+{formatWon(deliveryFee)}</dd>
          </div>
          {effectiveCouponDiscount > 0 && (
            <div className="flex justify-between text-[#4E6E2A]">
              <dt>쿠폰 할인</dt>
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
          disabled={isBlocked || isSubmitting}
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
