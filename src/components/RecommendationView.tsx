import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Flag,
  Heart,
  Info,
  MessageSquare,
  RotateCcw,
  Store as StoreIcon,
} from 'lucide-react';
import { MOCK_COUPONS } from '../data/seedData';
import {
  ExcludedCandidate,
  ParsedCondition,
  RecommendationMatch,
  Review,
  ReviewReply,
} from '../types/alle';
import { formatWon } from '../utils/parser';
import { AlleBotIllustration } from './AlleBrand';
import { FoodImage } from './FoodImage';

interface RecommendationViewProps {
  condition: ParsedCondition;
  matches: RecommendationMatch[];
  excluded: ExcludedCandidate[];
  reviews: Review[];
  reviewReplies: Record<string, ReviewReply>;
  selectedMenuId: string | null;
  wishlistIds?: string[];
  onToggleWishlist?: (menuId: string) => void;
  onSelectMenu: (menuId: string) => void;
  onBackToHome: () => void;
  onQuickRelaxCondition: (patch: Partial<ParsedCondition>) => void;
  onReportPriceDifference: (payload: {
    menuId: string;
    menuName: string;
    storeName: string;
    appPrice: number;
    storePrice: number;
  }) => void;
  onProceedToConfirm: (payload: {
    menuId: string;
    servings: number;
    selectedOptionIds: string[];
    couponCode: string;
  }) => void;
}

export function RecommendationView({
  condition,
  matches,
  excluded,
  reviews,
  reviewReplies,
  selectedMenuId,
  wishlistIds = [],
  onToggleWishlist,
  onSelectMenu,
  onBackToHome,
  onQuickRelaxCondition,
  onReportPriceDifference,
  onProceedToConfirm,
}: RecommendationViewProps) {
  const [selectedOptionsByMenu, setSelectedOptionsByMenu] = useState<
    Record<string, string[]>
  >({});
  const [selectedCouponCode, setSelectedCouponCode] = useState<string>('NONE');
  const [showOriginalReviews, setShowOriginalReviews] = useState<boolean>(false);
  const [showExcluded, setShowExcluded] = useState<boolean>(false);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);

  const activeMatch = useMemo(() => {
    if (matches.length === 0) return null;
    return matches.find((m) => m.menu.id === selectedMenuId) ?? matches[0];
  }, [matches, selectedMenuId]);

  const activeReviews = useMemo(() => {
    if (!activeMatch) return [];
    return reviews.filter((r) => r.menuId === activeMatch.menu.id);
  }, [activeMatch, reviews]);

  const reviewTagSummary = useMemo(() => {
    const prosCount = new Map<string, number>();
    const consCount = new Map<string, number>();
    let complaintCount = 0;

    for (const r of activeReviews) {
      if (r.isComplaint) complaintCount += 1;
      for (const p of r.prosTags) {
        prosCount.set(p, (prosCount.get(p) ?? 0) + 1);
      }
      for (const c of r.consTags) {
        consCount.set(c, (consCount.get(c) ?? 0) + 1);
      }
    }

    return {
      pros: Array.from(prosCount.entries()).sort((a, b) => b[1] - a[1]),
      cons: Array.from(consCount.entries()).sort((a, b) => b[1] - a[1]),
      complaintCount,
    };
  }, [activeReviews]);

  const toggleOption = (menuId: string, optionId: string) => {
    setSelectedOptionsByMenu((prev) => {
      const current = prev[menuId] ?? [];
      const exists = current.includes(optionId);
      return {
        ...prev,
        [menuId]: exists
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      };
    });
  };

  const activeOptionIds = activeMatch
    ? selectedOptionsByMenu[activeMatch.menu.id] ?? []
    : [];
  const optionsSubtotal = activeMatch
    ? activeMatch.menu.options
        .filter((o) => activeOptionIds.includes(o.id))
        .reduce((sum, o) => sum + o.priceDelta, 0)
    : 0;

  const selectedCoupon =
    MOCK_COUPONS.find((c) => c.code === selectedCouponCode) ?? MOCK_COUPONS[0];
  const rawCouponDiscount = selectedCoupon.discountAmount;
  const effectiveCouponDiscount = activeMatch
    ? Math.min(rawCouponDiscount, activeMatch.menuSubtotal)
    : 0;

  const finalEstimatedTotal = activeMatch
    ? activeMatch.menuSubtotal +
      optionsSubtotal +
      activeMatch.deliveryFee -
      effectiveCouponDiscount
    : 0;

  const conditionSummaryText = [
    `${condition.servings}인`,
    condition.tags.length > 0 ? condition.tags.join(' ') : '전체',
    condition.maxBudget !== null
      ? `${formatWon(condition.maxBudget)} 이하`
      : '예산 무관',
    condition.maxMinutes !== null ? `${condition.maxMinutes}분 이내` : '시간 무관',
  ].join(' · ');

  return (
    <div className="space-y-6">
      {/* Compact Header & Condition */}
      <div className="bg-white border border-[#DDE3D7] rounded-3xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(20,24,18,0.03)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToHome}
            className="min-h-[40px] px-3.5 py-1.5 border border-[#CBDCC0] bg-white hover:bg-[#F4F6F1] text-[#141812] text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>조건 변경</span>
          </button>

          <div className="px-4 py-1.5 bg-[#2E531A] text-white text-xs sm:text-sm font-semibold rounded-2xl tabular-nums">
            {conditionSummaryText}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <AlleBotIllustration size="sm" />
          <div className="bg-[#F4F6F1] border border-[#DDE3D7] rounded-2xl rounded-tl-xs px-4 py-2.5 text-sm text-[#141812]">
            {matches.length > 0 ? (
              <span>
                조건에 맞는{' '}
                <strong className="font-bold text-[#2E531A]">
                  {matches.length}개 메뉴
                </strong>
                를 찾았습니다.
              </span>
            ) : (
              <span>조건에 모두 맞는 메뉴를 찾지 못했습니다.</span>
            )}
          </div>
        </div>
      </div>

      {/* 0-Result State */}
      {matches.length === 0 ? (
        <div className="bg-white border border-[#DDE3D7] rounded-3xl p-6 sm:p-10 text-center space-y-5">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[#E9F1E2] flex items-center justify-center text-[#2E531A]">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-lg font-bold text-[#141812]">
              일치하는 메뉴가 없습니다
            </h2>
            <p className="text-sm text-[#374033]">
              예산이나 배달 시간 조건을 조금 넓혀 다시 검색해 보세요.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            {condition.maxBudget !== null && (
              <button
                type="button"
                onClick={() =>
                  onQuickRelaxCondition({
                    maxBudget: condition.maxBudget! + 10000,
                  })
                }
                className="min-h-[42px] px-4 py-2 bg-[#E7EFE1] hover:bg-[#D8E7CE] text-[#1F3A11] text-sm font-semibold rounded-xl cursor-pointer"
              >
                예산 +10,000원
              </button>
            )}
            {condition.maxMinutes !== null && (
              <button
                type="button"
                onClick={() =>
                  onQuickRelaxCondition({
                    maxMinutes: condition.maxMinutes! + 15,
                  })
                }
                className="min-h-[42px] px-4 py-2 bg-[#E7EFE1] hover:bg-[#D8E7CE] text-[#1F3A11] text-sm font-semibold rounded-xl cursor-pointer"
              >
                시간 +15분
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                onQuickRelaxCondition({
                  tags: ['얼큰한', '국물'],
                  maxBudget: 25000,
                  maxMinutes: 30,
                  unknownTokens: [],
                  needsConfirmation: false,
                })
              }
              className="min-h-[42px] px-5 py-2 bg-[#2E531A] hover:bg-[#234113] text-white text-sm font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>기본 추천 보기</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Candidate Cards */}
          <div className="lg:col-span-5 space-y-3">
            {matches.map((item) => {
              const isSelected = activeMatch?.menu.id === item.menu.id;
              const lowStock = item.menu.stock > 0 && item.menu.stock <= 3;

              return (
                <button
                  key={item.menu.id}
                  type="button"
                  onClick={() => {
                    onSelectMenu(item.menu.id);
                    setShowOriginalReviews(false);
                    if (window.innerWidth < 1024) {
                      window.setTimeout(() => {
                        detailPanelRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      }, 50);
                    }
                  }}
                  className={`w-full text-left bg-white rounded-3xl border p-4 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#2E531A] ring-2 ring-[#2E531A]/15 shadow-[0_4px_16px_rgba(46,83,26,0.08)]'
                      : 'border-[#DDE3D7] hover:border-[#2E531A]/40'
                  }`}
                >
                  <div className="flex gap-3.5">
                    <div className="w-24 h-20 sm:w-28 sm:h-24 rounded-2xl overflow-hidden shrink-0 border border-[#EBEFEB]">
                      <FoodImage
                        src={item.menu.image}
                        alt={item.menu.name}
                        className="w-full h-full"
                      />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="text-xs font-medium text-[#4A5246] truncate">
                          {item.store.name}
                          <span aria-hidden="true"> · </span>
                          <span className="tabular-nums">
                            약 {item.effectiveMinutes}분
                          </span>
                        </div>
                        <h2 className="text-base font-bold text-[#141812] mt-0.5 truncate">
                          {item.menu.name}
                        </h2>
                        <p className="text-xs text-[#374033] mt-0.5 truncate">
                          {item.menu.tags.slice(0, 3).join(' · ')}
                          <span aria-hidden="true"> · </span>
                          <span
                            className={`tabular-nums ${
                              lowStock ? 'text-amber-800 font-semibold' : ''
                            }`}
                          >
                            {lowStock
                              ? `마감 임박 (${item.menu.stock}개)`
                              : `재고 ${item.menu.stock}개`}
                          </span>
                        </p>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-base font-bold text-[#141812] font-mono tabular-nums">
                            {formatWon(item.estimatedTotal)}
                          </span>
                          <span className="block text-[11px] font-medium text-[#374033] tabular-nums">
                            {item.isSameStorePrice
                              ? '매장 동일 가격'
                              : item.menu.storePrice === null
                                ? '가격자료 미입력'
                                : `매장가 ${formatWon(item.menu.storePrice)}`}
                          </span>
                        </div>
                        <span
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 ${
                            isSelected
                              ? 'bg-[#2E531A] text-white'
                              : 'bg-[#E7EFE1] text-[#1F3A11]'
                          }`}
                        >
                          {isSelected ? '선택됨' : '보기'}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Selected Detail */}
          {activeMatch && (
            <div
              ref={detailPanelRef}
              className="lg:col-span-7 bg-white border border-[#DDE3D7] rounded-3xl overflow-hidden shadow-[0_2px_14px_rgba(20,24,18,0.04)] scroll-mt-16"
            >
              <div className="p-4 sm:p-5 pb-0">
                <div className="aspect-4/3 sm:aspect-16/9 max-h-[280px] w-full rounded-2xl overflow-hidden border border-[#EBEFEB]">
                  <FoodImage
                    src={activeMatch.menu.image}
                    alt={activeMatch.menu.name}
                    className="w-full h-full"
                  />
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-6">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-xl sm:text-2xl font-bold text-[#141812]">
                      {activeMatch.menu.name}
                    </h2>
                    {onToggleWishlist && (
                      <button
                        type="button"
                        onClick={() => onToggleWishlist(activeMatch.menu.id)}
                        aria-label={`${activeMatch.menu.name} 찜하기`}
                        className="min-w-[40px] min-h-[40px] px-3 rounded-xl border border-[#DDE3D7] bg-white hover:bg-[#F4F6F1] flex items-center gap-1.5 text-xs font-bold text-[#141812] shrink-0 cursor-pointer"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            wishlistIds.includes(activeMatch.menu.id)
                              ? 'fill-red-500 text-red-500'
                              : 'text-[#4A5246]'
                          }`}
                        />
                        <span>
                          {wishlistIds.includes(activeMatch.menu.id) ? '찜됨' : '찜'}
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[#374033] mt-1">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Clock className="w-3.5 h-3.5 text-[#2E531A]" />
                      예상 {activeMatch.effectiveMinutes}분
                      {activeMatch.store.extraPrepMinutes > 0 &&
                        ` (+${activeMatch.store.extraPrepMinutes}분)`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`tabular-nums ${
                        activeMatch.menu.stock <= 3
                          ? 'text-amber-800 font-semibold'
                          : ''
                      }`}
                    >
                      남은 수량 {activeMatch.menu.stock}개
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeMatch.menu.servingSpec}</span>
                  </div>
                  <p className="text-sm text-[#374033] mt-2 leading-relaxed">
                    {activeMatch.menu.description}
                  </p>

                  <div className="mt-3.5 py-2.5 px-3.5 bg-[#F4F6F1] border border-[#DDE3D7] rounded-2xl flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 font-bold text-[#141812]">
                      <StoreIcon className="w-4 h-4 text-[#2E531A]" />
                      {activeMatch.store.name}
                    </span>
                    <span className="font-medium text-[#4A5246]">
                      {activeMatch.store.areaLabel}
                    </span>
                  </div>
                </div>

                {/* Price Comparison */}
                <div className="p-4 sm:p-5 bg-[#E9F1E2] border border-[#CBDCC0] rounded-2xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#141812]">
                      가격 상세 ({activeMatch.servings}인)
                    </h3>
                    {activeMatch.isSameStorePrice ? (
                      <span className="text-xs font-bold text-[#2E531A]">
                        매장 동일 가격 · {activeMatch.menu.comparisonDate}
                      </span>
                    ) : activeMatch.menu.storePrice === null ? (
                      <span className="text-xs font-semibold text-amber-800">
                        가격자료 미입력
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-[#374033]">
                        매장가 대비 차이 있음 ({activeMatch.menu.comparisonDate})
                      </span>
                    )}
                  </div>

                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between text-[#374033]">
                      <dt>매장가 (1인)</dt>
                      <dd className="font-mono tabular-nums font-medium">
                        {activeMatch.menu.storePrice !== null
                          ? `${formatWon(activeMatch.menu.storePrice)} (총 ${formatWon(
                              activeMatch.menu.storePrice * activeMatch.servings
                            )})`
                          : '가격자료 미입력'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-[#141812]">
                      <dt>
                        메뉴 금액 ({formatWon(activeMatch.menu.pricePerPerson)} ×{' '}
                        {activeMatch.servings})
                      </dt>
                      <dd className="font-mono tabular-nums font-semibold">
                        {formatWon(activeMatch.menuSubtotal)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-[#374033]">
                      <dt>추가 옵션</dt>
                      <dd className="font-mono tabular-nums">
                        +{formatWon(optionsSubtotal)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-[#374033]">
                      <dt>배달비</dt>
                      <dd className="font-mono tabular-nums">
                        +{formatWon(activeMatch.deliveryFee)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-[#2E531A]">
                      <dt>쿠폰 할인</dt>
                      <dd className="font-mono tabular-nums font-bold">
                        -{formatWon(effectiveCouponDiscount)}
                      </dd>
                    </div>
                    <div className="pt-2.5 border-t border-[#CBDCC0] flex items-center justify-between text-base font-bold text-[#141812]">
                      <dt>예상 결제 금액</dt>
                      <dd className="font-mono tabular-nums text-lg text-[#2E531A]">
                        {formatWon(finalEstimatedTotal)}
                      </dd>
                    </div>
                  </dl>

                  {activeMatch.menu.storePrice !== null &&
                    activeMatch.menu.pricePerPerson !==
                      activeMatch.menu.storePrice && (
                      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#DCE5CF]/70">
                        <span className="text-xs text-amber-900">
                          매장가보다{' '}
                          {formatWon(
                            activeMatch.menu.pricePerPerson -
                              activeMatch.menu.storePrice
                          )}{' '}
                          높습니다.
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onReportPriceDifference({
                              menuId: activeMatch.menu.id,
                              menuName: activeMatch.menu.name,
                              storeName: activeMatch.store.name,
                              appPrice: activeMatch.menu.pricePerPerson,
                              storePrice: activeMatch.menu.storePrice!,
                            })
                          }
                          className="min-h-[34px] px-3 py-1 bg-white border border-[#CBDCC0] hover:bg-[#E9F1E2] text-xs font-semibold text-[#1F3A11] rounded-xl flex items-center gap-1 cursor-pointer"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          <span>가격 차이 제보</span>
                        </button>
                      </div>
                    )}

                  {rawCouponDiscount > activeMatch.menuSubtotal && (
                    <p className="text-xs text-amber-800 flex items-start gap-1.5 pt-1">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        쿠폰은 상품합계({formatWon(activeMatch.menuSubtotal)})
                        한도 내로 적용됩니다.
                      </span>
                    </p>
                  )}
                </div>

                {/* Optional Add-ons */}
                <div className="space-y-2.5">
                  <h3 className="text-sm font-bold text-[#141812]">추가 옵션</h3>
                  {activeMatch.menu.options.length === 0 ? (
                    <p className="text-xs text-[#4A5246]">
                      선택 가능한 추가 옵션이 없습니다.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeMatch.menu.options.map((opt) => {
                        const checked = activeOptionIds.includes(opt.id);
                        return (
                          <label
                            key={opt.id}
                            className={`min-h-[46px] px-4 py-2 rounded-2xl border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                              checked
                                ? 'bg-[#E9F1E2] border-[#6FA33A] text-[#141812]'
                                : 'bg-white border-[#DDE3D7] text-[#141812] hover:border-[#2E531A]/40'
                            }`}
                          >
                            <span className="flex items-center gap-3 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleOption(activeMatch.menu.id, opt.id)
                                }
                                className="w-4 h-4 accent-[#2E531A] rounded"
                              />
                              <span>{opt.name}</span>
                            </span>
                            <span className="text-sm font-mono tabular-nums font-bold text-[#2E531A] shrink-0">
                              +{formatWon(opt.priceDelta)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Coupon */}
                <div className="space-y-2">
                  <label
                    htmlFor="recommend-coupon"
                    className="block text-sm font-bold text-[#141812]"
                  >
                    할인 쿠폰
                  </label>
                  <select
                    id="recommend-coupon"
                    value={selectedCouponCode}
                    onChange={(e) => setSelectedCouponCode(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 bg-white border border-[#CBDCC0] rounded-2xl text-sm text-[#141812]"
                  >
                    {MOCK_COUPONS.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Honest Review Summary */}
                <div className="pt-5 border-t border-[#EBEFEB] space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#141812]">
                      리뷰 요약 ({activeReviews.length}건)
                    </h3>
                    {activeReviews.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowOriginalReviews((prev) => !prev)}
                        className="min-h-[38px] px-3.5 py-1.5 border border-[#CBDCC0] bg-[#E9F1E2] hover:bg-[#E7EFE1] text-xs font-semibold text-[#1F3A11] rounded-xl flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>
                          {showOriginalReviews
                            ? '원문 닫기'
                            : `원문 보기 (${activeReviews.length})`}
                        </span>
                      </button>
                    )}
                  </div>

                  {activeReviews.length === 0 ? (
                    <p className="text-xs font-medium text-[#4A5246] p-3.5 bg-[#F4F6F1] border border-[#DDE3D7] rounded-2xl">
                      등록된 리뷰가 없습니다.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3.5 bg-[#F4F6F1] border border-[#DDE3D7] rounded-2xl space-y-1.5">
                        <span className="block text-xs font-bold text-[#141812]">
                          좋은 점
                        </span>
                        {reviewTagSummary.pros.length > 0 ? (
                          <ul className="space-y-1 text-xs text-[#374033]">
                            {reviewTagSummary.pros.map(([tag, count]) => (
                              <li
                                key={tag}
                                className="flex items-center justify-between"
                              >
                                <span>{tag}</span>
                                <span className="font-mono tabular-nums font-bold text-[#2E531A]">
                                  {count}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-[#4A5246]">없음</p>
                        )}
                      </div>

                      <div className="p-3.5 bg-[#F4F6F1] border border-[#DDE3D7] rounded-2xl space-y-1.5">
                        <span className="block text-xs font-bold text-[#141812]">
                          아쉬운 점
                        </span>
                        {reviewTagSummary.cons.length > 0 ? (
                          <ul className="space-y-1 text-xs text-[#374033]">
                            {reviewTagSummary.cons.map(([tag, count]) => (
                              <li
                                key={tag}
                                className="flex items-center justify-between"
                              >
                                <span>{tag}</span>
                                <span className="font-mono tabular-nums font-bold text-amber-800">
                                  {count}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-[#4A5246]">없음</p>
                        )}
                      </div>
                    </div>
                  )}

                  {showOriginalReviews && activeReviews.length > 0 && (
                    <div className="space-y-2.5 pt-1">
                      {activeReviews.map((review) => {
                        const ownerReply = reviewReplies[review.id];
                        return (
                          <div
                            key={review.id}
                            className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                              review.isComplaint
                                ? 'bg-[#FFFBEF] border-[#E8D595]'
                                : 'bg-white border-[#DDE3D7]'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[#4A5246]">
                              <span className="font-bold text-[#141812]">
                                {review.author}
                              </span>
                              <span className="font-mono tabular-nums">
                                ★ {review.rating} · {review.date}
                              </span>
                            </div>
                            <p className="text-sm text-[#141812] leading-relaxed">
                              {review.content}
                            </p>
                            {ownerReply && (
                              <div className="p-3 bg-[#E9F1E2] border border-[#CBDCC0] rounded-xl text-xs text-[#1F3A11] space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-1 font-bold">
                                  <span>사장님 답글 ({ownerReply.updatedAt})</span>
                                  {ownerReply.flaggedForReview && (
                                    <span className="text-amber-800">
                                      확인 요청됨
                                    </span>
                                  )}
                                </div>
                                {ownerReply.text && <p>{ownerReply.text}</p>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Primary CTA */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      onProceedToConfirm({
                        menuId: activeMatch.menu.id,
                        servings: activeMatch.servings,
                        selectedOptionIds: activeOptionIds,
                        couponCode: selectedCouponCode,
                      })
                    }
                    className="w-full min-h-[50px] py-3 px-6 bg-[#2E531A] hover:bg-[#234113] active:scale-[0.99] text-white font-semibold text-base rounded-2xl transition-colors cursor-pointer shadow-xs"
                  >
                    주문 확인 · {formatWon(finalEstimatedTotal)}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Excluded Items Disclosure */}
      {excluded.length > 0 && (
        <div className="bg-white border border-[#DDE3D7] rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowExcluded((prev) => !prev)}
            className="w-full min-h-[46px] px-5 py-3 flex items-center justify-between text-left text-xs sm:text-sm font-bold text-[#374033] hover:bg-[#F4F6F1] cursor-pointer"
          >
            <span>제외된 메뉴 ({excluded.length}개)</span>
            {showExcluded ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>
          {showExcluded && (
            <div className="border-t border-[#EBEFEB] divide-y divide-[#EBEFEB]">
              {excluded.map((ex) => (
                <div
                  key={ex.menu.id}
                  className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-[#141812]">{ex.menu.name}</span>
                    <span className="text-[#4A5246] ml-2">
                      {ex.store.name} · {formatWon(ex.menu.pricePerPerson)} ·{' '}
                      {ex.menu.estimatedMinutes + (ex.store.extraPrepMinutes ?? 0)}분
                    </span>
                  </div>
                  <span className="text-amber-800 font-bold">
                    {ex.reasons.join(', ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
