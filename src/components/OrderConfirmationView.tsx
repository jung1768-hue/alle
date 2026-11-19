import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  CalendarClock,
  Check,
  CreditCard,
  MapPin,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { MOCK_COUPONS, RESERVATION_SLOTS_15M } from '../data/seedData';
import { MenuItem, PaymentMethod, Store } from '../types/alle';
import { formatWon } from '../utils/parser';
import { FoodImage } from './FoodImage';

const PAYMENT_OPTIONS: Array<{
  id: PaymentMethod;
  label: string;
  subtitle: string;
  benefitText: string;
}> = [
  {
    id: 'local_currency',
    label: '대구로페이 / 지역화폐',
    subtitle: '지역 상권 직결제 · 중개수수료 0%',
    benefitText: '보조금 소진 이후에도 수수료 0% 직결제 구조 유지',
  },
  {
    id: 'b2b_meal_point',
    label: '기업 식대 포인트 (B2B 법인결제)',
    subtitle: '대구 제휴 오피스 식대 · 자동 법인 정산',
    benefitText: '지자체 예산 없이 기업 복지 식대로 자생 매출 창출',
  },
  {
    id: 'alle_regular_pass',
    label: 'Alle 단골 패스',
    subtitle: 'AI 단골 구독 결제 · 스탬프 +1 자동 적립',
    benefitText: '단골 패스 주문 시 스탬프 자동 적립 · 이웃 묶음 우선 매칭',
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

  const menuSubtotal = Math.round(menu.pricePerPerson) * servings;
  const optionsSubtotal = menu.options
    .filter((o) => selectedOptionIds.includes(o.id))
    .reduce((sum, o) => sum + o.priceDelta, 0);
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

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3.5 py-1.5 border border-[#CBDCC0] bg-white hover:bg-[#F4F6F1] text-[#141812] text-sm font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>뒤로</span>
        </button>
        <h1 className="text-base font-bold text-[#141812]">주문 확인</h1>
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

      <section className="bg-white border border-[#DDE3D7] rounded-3xl p-5 sm:p-6 space-y-5 shadow-[0_2px_12px_rgba(20,24,18,0.03)]">
        <div className="flex gap-4">
          <div className="w-24 h-20 rounded-2xl overflow-hidden shrink-0 border border-[#EBEFEB]">
            <FoodImage src={menu.image} alt={menu.name} className="w-full h-full" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[#4A5246]">
              {store.name} · 약{' '}
              {menu.estimatedMinutes + (store.extraPrepMinutes ?? 0)}분 · 재고{' '}
              <span className="tabular-nums font-bold text-[#141812]">
                {menu.stock}개
              </span>
            </p>
            <h2 className="text-xl font-bold text-[#141812] mt-0.5">{menu.name}</h2>
            <p className="text-xs font-medium text-[#374033] mt-1">
              {menu.servingSpec} · 1인 {formatWon(menu.pricePerPerson)}
              {isSameStorePrice && ' · 매장 동일 가격'}
            </p>
          </div>
        </div>

        {menu.aiReason && (
          <div className="px-3.5 py-2.5 bg-[#EFF5E6] border border-[#CFE0B9] rounded-2xl flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-[#2E531A] shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-[#223B13]">
              <span className="font-bold text-[#2E531A] mr-1.5">AI 추천 근거</span>
              <span>{menu.aiReason}</span>
            </div>
          </div>
        )}

        {/* Quantity */}
        <div className="pt-4 border-t border-[#EBEFEB] flex items-center justify-between gap-4">
          <span className="text-sm font-bold text-[#141812]">수량</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              aria-label="수량 감소"
              className="min-w-[42px] min-h-[42px] rounded-xl border border-[#CBDCC0] bg-[#F4F6F1] hover:bg-[#E9F1E2] text-[#141812] font-semibold cursor-pointer"
            >
              -
            </button>
            <input
              type="number"
              min={1}
              max={Math.max(1, menu.stock)}
              value={servings}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                setServings(Number.isInteger(parsed) && parsed >= 1 ? parsed : 1);
              }}
              className="w-16 min-h-[42px] text-center font-mono tabular-nums font-bold border border-[#CBDCC0] rounded-xl text-[#141812]"
            />
            <button
              type="button"
              onClick={() =>
                setServings((s) => Math.min(Math.max(1, menu.stock), s + 1))
              }
              aria-label="수량 증가"
              className="min-w-[42px] min-h-[42px] rounded-xl border border-[#CBDCC0] bg-[#F4F6F1] hover:bg-[#E9F1E2] text-[#141812] font-semibold cursor-pointer"
            >
              +
            </button>
          </div>
        </div>

        {/* Arrival Slot */}
        <div className="pt-4 border-t border-[#EBEFEB] space-y-2.5">
          <span className="text-sm font-bold text-[#141812] flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4 text-[#2E531A]" />
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
                      ? 'bg-[#E9F1E2] border-[#6FA33A] text-[#1F3A11]'
                      : 'bg-white border-[#DDE3D7] text-[#374033] hover:border-[#2E531A]/40'
                  }`}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Options */}
        {menu.options.length > 0 && (
          <div className="pt-4 border-t border-[#EBEFEB] space-y-2.5">
            <span className="block text-sm font-bold text-[#141812]">
              추가 옵션
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {menu.options.map((opt) => {
                const checked = selectedOptionIds.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={`min-h-[44px] px-3.5 py-2 rounded-2xl border flex items-center justify-between gap-2 cursor-pointer ${
                      checked
                        ? 'bg-[#E9F1E2] border-[#6FA33A] text-[#141812]'
                        : 'bg-white border-[#DDE3D7] text-[#141812]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOption(opt.id)}
                        className="w-4 h-4 accent-[#2E531A]"
                      />
                      <span>{opt.name}</span>
                    </span>
                    <span className="text-xs font-mono tabular-nums font-bold text-[#2E531A]">
                      +{formatWon(opt.priceDelta)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Coupon */}
        <div className="pt-4 border-t border-[#EBEFEB] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="confirm-coupon"
              className="block text-sm font-bold text-[#141812]"
            >
              쿠폰 할인 (스탬프 {stampCount}개)
            </label>
            <button
              type="button"
              onClick={handleAutoBestCoupon}
              className="min-h-[34px] px-3 py-1 bg-[#E7EFE1] hover:bg-[#D8E7CE] text-[#1F3A11] text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>최대 할인 적용</span>
            </button>
          </div>
          <select
            id="confirm-coupon"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            className="w-full min-h-[44px] px-3.5 bg-white border border-[#CBDCC0] rounded-2xl text-sm text-[#141812]"
          >
            {MOCK_COUPONS.map((c) => (
              <option key={c.id} value={c.code}>
                {c.label}
                {c.requiresStamps ? ` (스탬프 ${c.requiresStamps}개 이상)` : ''}
              </option>
            ))}
          </select>
          {!isStampRequirementMet && (
            <p className="text-xs text-amber-800 font-medium">
              스탬프 {selectedCoupon.requiresStamps}개 이상 시 적용 가능합니다.
            </p>
          )}
          {isStampRequirementMet &&
            selectedCoupon.discountAmount > menuSubtotal && (
              <p className="text-xs text-amber-800 font-medium">
                쿠폰은 상품합계({formatWon(menuSubtotal)}) 한도 내로 적용됩니다.
              </p>
            )}
        </div>

        {/* Neighbor Shared Delivery */}
        <div className="pt-4 border-t border-[#EBEFEB]">
          <label
            className={`min-h-[48px] p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
              sharedDeliveryApplied
                ? 'bg-[#E9F1E2] border-[#6FA33A]'
                : 'bg-[#F4F6F1] border-[#DDE3D7]'
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={sharedDeliveryApplied}
                onChange={(e) => setSharedDeliveryApplied(e.target.checked)}
                className="w-4 h-4 accent-[#2E531A] shrink-0"
              />
              <div>
                <div className="text-sm font-bold text-[#141812] flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#2E531A]" />
                  <span>이웃 묶음배달 (배달비 50% 절약)</span>
                </div>
              </div>
            </div>
            <span className="text-xs font-mono tabular-nums font-bold text-[#2E531A] shrink-0">
              {formatWon(Math.round(store.deliveryFee / 2))}
            </span>
          </label>
        </div>

        {/* Delivery Info */}
        <div className="pt-4 border-t border-[#EBEFEB] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#374033] mb-1">
                주문자
              </label>
              <input
                type="text"
                value={customerAlias}
                onChange={(e) => setCustomerAlias(e.target.value)}
                className="w-full min-h-[42px] px-3.5 border border-[#CBDCC0] rounded-xl text-sm bg-[#F4F6F1] text-[#141812]"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-medium text-[#374033]">
                  배달지
                </label>
                {onOpenLocationPicker && (
                  <button
                    type="button"
                    onClick={onOpenLocationPicker}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2E531A] hover:underline underline-offset-2 cursor-pointer"
                  >
                    <MapPin className="w-3 h-3" />
                    <span>등록 위치 변경</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                value={addressAlias}
                onChange={(e) => setAddressAlias(e.target.value)}
                className="w-full min-h-[42px] px-3.5 border border-[#CBDCC0] rounded-xl text-sm bg-[#F4F6F1] text-[#141812]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#374033] mb-1">
              가게 요청사항
            </label>
            <input
              type="text"
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="예: 일회용 수저 빼기"
              className="w-full min-h-[42px] px-3.5 border border-[#CBDCC0] rounded-xl text-sm text-[#141812]"
            />
          </div>
        </div>
      </section>

      {/* Self-Sustaining Payment Method Selector */}
      <section className="bg-white border border-[#DDE3D7] rounded-3xl p-5 sm:p-6 space-y-3.5 shadow-[0_2px_12px_rgba(20,24,18,0.03)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-[#141812] flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-[#2E531A]" />
            <span>결제 수단</span>
          </h2>
          <span className="text-xs font-medium text-[#4A5246]">
            지역화폐 · 기업 식대 · 단골 패스 자생 결제
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="결제 수단 선택"
          className="space-y-2.5"
        >
          {PAYMENT_OPTIONS.map((option) => {
            const active = paymentMethod === option.id;
            const Icon =
              option.id === 'local_currency'
                ? Wallet
                : option.id === 'b2b_meal_point'
                  ? Briefcase
                  : Sparkles;

            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPaymentMethod(option.id)}
                className={`w-full min-h-[64px] p-3.5 rounded-2xl border text-left transition-colors flex items-start justify-between gap-3 cursor-pointer ${
                  active
                    ? 'bg-[#ECF3E2] border-[#2E531A] ring-1 ring-[#2E531A]/20'
                    : 'bg-white border-[#DDE3D7] hover:border-[#6FA33A]'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      active
                        ? 'bg-[#2E531A] text-white'
                        : 'bg-[#F4F6F1] text-[#374033]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-bold text-[#141812]">
                      {option.label}
                    </div>
                    <div className="text-xs font-medium text-[#374033]">
                      {option.subtitle}
                    </div>
                    {active && (
                      <div className="text-[11px] font-semibold text-[#2E531A] pt-0.5">
                        {option.benefitText}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-1 ${
                    active
                      ? 'bg-[#2E531A] border-[#2E531A] text-white'
                      : 'border-[#C5D8B5] bg-white'
                  }`}
                >
                  {active && <Check className="w-3 h-3" />}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Final Checkout Summary */}
      <section className="bg-white border border-[#DDE3D7] rounded-3xl p-5 sm:p-6 space-y-4 shadow-[0_2px_12px_rgba(20,24,18,0.03)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-[#141812]">결제 금액</h2>
          <span className="text-xs font-bold text-[#2E531A]">
            {selectedPaymentOption.label}
          </span>
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between text-[#141812]">
            <dt>
              메뉴 금액 ({formatWon(menu.pricePerPerson)} × {servings})
            </dt>
            <dd className="font-mono tabular-nums font-medium">
              {formatWon(menuSubtotal)}
            </dd>
          </div>
          <div className="flex justify-between text-[#374033]">
            <dt>추가 옵션</dt>
            <dd className="font-mono tabular-nums">+{formatWon(optionsSubtotal)}</dd>
          </div>
          <div className="flex justify-between text-[#374033]">
            <dt>배달비 {sharedDeliveryApplied ? '(묶음배달 적용)' : ''}</dt>
            <dd className="font-mono tabular-nums">+{formatWon(deliveryFee)}</dd>
          </div>
          <div className="flex justify-between text-[#2E531A]">
            <dt>쿠폰 할인</dt>
            <dd className="font-mono tabular-nums font-bold">
              -{formatWon(effectiveCouponDiscount)}
            </dd>
          </div>
          <div className="pt-3 border-t border-[#EBEFEB] flex justify-between items-baseline text-base font-bold text-[#141812]">
            <dt>총 결제 금액</dt>
            <dd className="font-mono tabular-nums text-xl text-[#2E531A]">
              {formatWon(totalAmount)}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          disabled={isBlocked || isSubmitting}
          onClick={handleConfirm}
          className="w-full min-h-[50px] py-3 px-6 bg-[#2E531A] hover:bg-[#234113] disabled:bg-[#DDE3D7] disabled:text-[#4A5246] text-white font-semibold text-base rounded-2xl transition-colors cursor-pointer disabled:cursor-not-allowed shadow-xs"
        >
          {isSubmitting
            ? '주문 접수 중...'
            : `${selectedPaymentOption.label} · ${formatWon(totalAmount)} 주문하기`}
        </button>
      </section>
    </div>
  );
}
