import { useEffect, useMemo, useRef, useState } from 'react';
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
  Plus,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Store as StoreIcon,
  Zap,
} from 'lucide-react';
import { MOCK_COUPONS } from '../data/seedData';
import {
  CartLineItem,
  ExcludedCandidate,
  MenuItem,
  ParsedCondition,
  RecommendationMatch,
  Review,
  ReviewReply,
} from '../types/alle';
import { formatWon, getEffectiveMenuPrice } from '../utils/parser';
import { estimateCompetitorSavings } from '../utils/pricing';
import {
  buildRuleReviewSummary,
  hasGeminiApiKey,
  ReviewAiSummary,
  summarizeReviewsWithAI,
} from '../utils/gemini';
import { AlleBotIllustration } from './AlleBrand';
import { FoodImage } from './FoodImage';

interface RecommendationViewProps {
  condition: ParsedCondition;
  matches: RecommendationMatch[];
  excluded: ExcludedCandidate[];
  reviews: Review[];
  reviewReplies: Record<string, ReviewReply>;
  allMenus?: MenuItem[];
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
  onAddToCart?: (
    menuId: string,
    quantity?: number,
    selectedOptionIds?: string[]
  ) => void;
  onAddMultipleToCart?: (storeId: string, items: CartLineItem[]) => void;
  onOpenStoreMenu?: (
    storeId: string,
    options?: {
      highlightMenuId?: string;
      initialServings?: number;
      initialOptionIds?: string[];
      preselectHighlight?: boolean;
    }
  ) => void;
  onProceedToConfirmWithItems?: (payload: {
    storeId: string;
    items: CartLineItem[];
    couponCode?: string;
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
  allMenus = [],
  selectedMenuId,
  wishlistIds = [],
  onToggleWishlist,
  onSelectMenu,
  onBackToHome,
  onQuickRelaxCondition,
  onReportPriceDifference,
  onAddToCart,
  onAddMultipleToCart,
  onOpenStoreMenu,
  onProceedToConfirmWithItems,
  onProceedToConfirm,
}: RecommendationViewProps) {
  const [selectedOptionsByMenu, setSelectedOptionsByMenu] = useState<
    Record<string, string[]>
  >({});
  const [extraQtyByStoreMenu, setExtraQtyByStoreMenu] = useState<
    Record<string, number>
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

  const [aiReviewSummary, setAiReviewSummary] = useState<ReviewAiSummary | null>(
    null
  );
  const [isSummarizingReviews, setIsSummarizingReviews] = useState(false);

  useEffect(() => {
    if (!activeMatch || activeReviews.length === 0) {
      setAiReviewSummary(null);
      setIsSummarizingReviews(false);
      return;
    }

    const fallback = buildRuleReviewSummary(activeReviews);
    setAiReviewSummary(fallback);

    if (!hasGeminiApiKey()) return;

    let cancelled = false;
    setIsSummarizingReviews(true);
    summarizeReviewsWithAI(
      activeMatch.menu.name,
      activeMatch.store.name,
      activeReviews
    ).then((res) => {
      if (!cancelled) {
        setAiReviewSummary(res);
        setIsSummarizingReviews(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeMatch, activeReviews]);

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
  const unitOptionsSubtotal = activeMatch
    ? activeMatch.menu.options
        .filter((o) => activeOptionIds.includes(o.id))
        .reduce((sum, o) => sum + o.priceDelta, 0)
    : 0;
  const optionsSubtotal = activeMatch
    ? unitOptionsSubtotal * activeMatch.servings
    : 0;

  const effectiveUnitPrice = activeMatch
    ? getEffectiveMenuPrice(activeMatch.menu)
    : 0;
  const effectiveMenuSubtotal = activeMatch
    ? effectiveUnitPrice * activeMatch.servings
    : 0;
  const originalMenuSubtotal = activeMatch
    ? activeMatch.menu.pricePerPerson * activeMatch.servings
    : 0;

  const selectedCoupon =
    MOCK_COUPONS.find((c) => c.code === selectedCouponCode) ?? MOCK_COUPONS[0];
  const rawCouponDiscount = selectedCoupon.discountAmount;
  const effectiveCouponDiscount = activeMatch
    ? Math.min(rawCouponDiscount, effectiveMenuSubtotal)
    : 0;

  const finalEstimatedTotal = activeMatch
    ? effectiveMenuSubtotal +
      optionsSubtotal +
      activeMatch.deliveryFee -
      effectiveCouponDiscount
    : 0;

  const savingsBreakdown = activeMatch
    ? estimateCompetitorSavings({
        menuSubtotal: effectiveMenuSubtotal,
        originalMenuSubtotal,
        deliveryFee: activeMatch.deliveryFee,
        originalDeliveryFee: activeMatch.deliveryFee,
        couponDiscount: effectiveCouponDiscount,
        isSameStorePrice: activeMatch.isSameStorePrice,
      })
    : null;

  const sameStoreOtherMenus = useMemo(() => {
    if (!activeMatch || allMenus.length === 0) return [];
    return allMenus.filter(
      (m) =>
        m.storeId === activeMatch.store.id &&
        m.id !== activeMatch.menu.id &&
        !m.isSoldOut &&
        m.stock >= 1
    );
  }, [activeMatch, allMenus]);

  const selectedExtraMenus = useMemo(() => {
    return sameStoreOtherMenus
      .map((m) => ({
        menu: m,
        quantity: extraQtyByStoreMenu[m.id] ?? 0,
      }))
      .filter((entry) => entry.quantity > 0);
  }, [sameStoreOtherMenus, extraQtyByStoreMenu]);

  const extraMenusSubtotal = useMemo(
    () =>
      selectedExtraMenus.reduce(
        (sum, entry) => sum + getEffectiveMenuPrice(entry.menu) * entry.quantity,
        0
      ),
    [selectedExtraMenus]
  );

  const combinedMenuSubtotal = effectiveMenuSubtotal + extraMenusSubtotal;
  const combinedCouponDiscount = activeMatch
    ? Math.min(rawCouponDiscount, combinedMenuSubtotal)
    : 0;
  const combinedEstimatedTotal = activeMatch
    ? combinedMenuSubtotal +
      optionsSubtotal +
      activeMatch.deliveryFee -
      combinedCouponDiscount
    : 0;

  const adjustExtraMenuQty = (menu: MenuItem, delta: number) => {
    setExtraQtyByStoreMenu((prev) => {
      const next = Math.max(0, Math.min(menu.stock, (prev[menu.id] ?? 0) + delta));
      return { ...prev, [menu.id]: next };
    });
  };

  const buildCombinedCartItems = (): CartLineItem[] => {
    if (!activeMatch) return [];
    const lines: CartLineItem[] = [
      {
        menuId: activeMatch.menu.id,
        quantity: activeMatch.servings,
        selectedOptionIds: activeOptionIds,
      },
    ];
    for (const extra of selectedExtraMenus) {
      lines.push({
        menuId: extra.menu.id,
        quantity: extra.quantity,
        selectedOptionIds: [],
      });
    }
    return lines;
  };

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
      <div className="bg-white border border-[#E8ECE4] rounded-3xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(26,29,26,0.03)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToHome}
            className="min-h-[40px] px-3.5 py-1.5 border border-[#E8ECE4] bg-white hover:bg-[#F7F8F5] text-[#1A1D1A] text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>조건 변경</span>
          </button>

          <div className="px-4 py-1.5 bg-[#4E6E2A] text-white text-xs sm:text-sm font-semibold rounded-2xl tabular-nums">
            {conditionSummaryText}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <AlleBotIllustration size="sm" />
          <div className="bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl rounded-tl-xs px-4 py-2.5 text-sm text-[#1A1D1A]">
            {matches.length > 0 ? (
              <span>
                조건에 맞는{' '}
                <strong className="font-bold text-[#4E6E2A]">
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
        <div className="bg-white border border-[#E8ECE4] rounded-3xl p-6 sm:p-10 text-center space-y-5">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[#EAF1E2] flex items-center justify-center text-[#4E6E2A]">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-lg font-bold text-[#1A1D1A]">
              일치하는 메뉴가 없습니다
            </h2>
            <p className="text-sm text-[#555E52]">
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
                className="min-h-[42px] px-4 py-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-sm font-semibold rounded-xl cursor-pointer"
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
                className="min-h-[42px] px-4 py-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-sm font-semibold rounded-xl cursor-pointer"
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
              className="min-h-[42px] px-5 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-sm font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
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
                  className={`w-full text-left bg-white rounded-3xl border overflow-hidden transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#4E6E2A] ring-2 ring-[#4E6E2A]/15 shadow-[0_4px_16px_rgba(78,110,42,0.08)]'
                      : 'border-[#E8ECE4] hover:border-[#4E6E2A]/40'
                  }`}
                >
                  {/* Top Explainable AI Reason Highlight Strip */}
                  {(item.aiReason || item.menu.aiReason) && (
                    <div
                      className={`px-4 py-2 border-b flex items-center gap-1.5 text-[11px] sm:text-xs font-bold ${
                        isSelected
                          ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                          : 'bg-[#EAF1E2] border-[#DCE7CF] text-[#3D5720]'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {item.aiReason ?? item.menu.aiReason}
                      </span>
                    </div>
                  )}

                  <div className="p-4 flex items-center gap-3.5">
                    <div className="w-18 h-18 rounded-2xl overflow-hidden shrink-0 border border-[#E8ECE4]">
                      <FoodImage
                        src={item.menu.image}
                        alt={item.menu.name}
                        className="w-full h-full"
                      />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium text-[#687064] truncate">
                          {item.store.name}
                          <span aria-hidden="true"> · </span>
                          <span className="tabular-nums">
                            약 {item.effectiveMinutes}분
                          </span>
                        </div>
                        <h2 className="text-base font-bold text-[#1A1D1A] mt-0.5 truncate">
                          {item.menu.name}
                        </h2>
                        <p className="text-xs text-[#687064] mt-0.5 truncate">
                          <span
                            className={`tabular-nums ${
                              lowStock ? 'text-amber-800 font-semibold' : ''
                            }`}
                          >
                            {lowStock
                              ? `마감 임박 (${item.menu.stock}개)`
                              : `재고 ${item.menu.stock}개`}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span>
                            {item.store.singlePriceRevoked
                              ? '가격 확인 중'
                              : item.isSameStorePrice
                                ? '매장 동일가'
                                : '배달 포함'}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="os-kpi text-lg font-bold text-[#1A1D1A]">
                          {formatWon(item.estimatedTotal)}
                        </span>
                        <span
                          className={`px-3 py-1 rounded-full text-[11px] font-semibold shrink-0 ${
                            isSelected
                              ? 'bg-[#4E6E2A] text-white'
                              : 'bg-[#F0F3EC] text-[#555E52]'
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

          {/* Right: Selected Detail (AI Reason Hero + Compact Square Thumbnail) */}
          {activeMatch && (
            <div
              ref={detailPanelRef}
              className="lg:col-span-7 os-card rounded-3xl overflow-hidden scroll-mt-20"
            >
              <div className="p-6 sm:p-7 space-y-6">
                {/* Visual Hero #1: Prominent Explainable AI Reason Box */}
                <div className="p-5 rounded-2xl bg-[#EAF1E2] border border-[#D4E1C5] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4E6E2A]">
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>바로가 이 메뉴를 추천한 이유</span>
                    </span>
                    <span className="text-[11px] font-mono font-semibold text-[#3D5720] tabular-nums">
                      예상 도착 {activeMatch.effectiveMinutes}분
                    </span>
                  </div>
                  <p className="text-sm sm:text-base font-bold text-[#1A1D1A] leading-relaxed">
                    {activeMatch.aiReason ??
                      activeMatch.menu.aiReason ??
                      `현재 위치 기준 약 ${activeMatch.effectiveMinutes}분 내 빠른 배달과 매장 동일 가격이 검증된 메뉴입니다.`}
                  </p>
                </div>

                {/* Compact Square Thumbnail + Menu Metadata */}
                <div className="flex items-start gap-4 sm:gap-5">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden shrink-0 border border-[#E8ECE4]">
                    <FoodImage
                      src={activeMatch.menu.image}
                      alt={activeMatch.menu.name}
                      className="w-full h-full"
                    />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 text-xs font-medium text-[#687064]">
                          <StoreIcon className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
                          <span className="truncate">
                            {activeMatch.store.name} · {activeMatch.store.areaLabel}
                          </span>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-bold text-[#1A1D1A] mt-0.5 tracking-tight break-keep">
                          {activeMatch.menu.name}
                        </h2>
                      </div>
                      {onToggleWishlist && (
                        <button
                          type="button"
                          onClick={() => onToggleWishlist(activeMatch.menu.id)}
                          aria-label={`${activeMatch.menu.name} 찜하기`}
                          className="min-w-[38px] min-h-[38px] px-2.5 rounded-xl border border-[#E8ECE4] bg-white hover:bg-[#F7F8F5] flex items-center gap-1 text-xs font-semibold text-[#555E52] shrink-0 cursor-pointer"
                        >
                          <Heart
                            className={`w-4 h-4 ${
                              wishlistIds.includes(activeMatch.menu.id)
                                ? 'fill-red-500 text-red-500'
                                : 'text-[#919A8D]'
                            }`}
                          />
                          <span>
                            {wishlistIds.includes(activeMatch.menu.id) ? '찜됨' : '찜'}
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-[#687064]">
                      <span className="inline-flex items-center gap-1 tabular-nums text-[#1A1D1A] font-semibold">
                        <Clock className="w-3.5 h-3.5 text-[#4E6E2A]" />
                        약 {activeMatch.effectiveMinutes}분
                        {activeMatch.store.extraPrepMinutes > 0 &&
                          ` (+${activeMatch.store.extraPrepMinutes}분)`}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`tabular-nums ${
                          activeMatch.menu.stock <= 3
                            ? 'text-amber-700 font-semibold'
                            : ''
                        }`}
                      >
                        남은 수량 {activeMatch.menu.stock}개
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{activeMatch.menu.servingSpec}</span>
                    </div>

                    <p className="text-xs sm:text-sm text-[#687064] leading-relaxed">
                      {activeMatch.menu.description}
                    </p>
                  </div>
                </div>

                {/* Price Comparison */}
                <div className="p-4 sm:p-5 bg-[#EAF1E2] border border-[#E8ECE4] rounded-2xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#1A1D1A]">
                      가격 상세 ({activeMatch.servings}인)
                    </h3>
                    {activeMatch.isSameStorePrice ? (
                      <span className="text-xs font-bold text-[#4E6E2A]">
                        매장 동일 가격 · {activeMatch.menu.comparisonDate}
                      </span>
                    ) : activeMatch.menu.storePrice === null ? (
                      <span className="text-xs font-semibold text-amber-800">
                        가격자료 미입력
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-[#555E52]">
                        매장가 대비 차이 있음 ({activeMatch.menu.comparisonDate})
                      </span>
                    )}
                  </div>

                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between text-[#555E52]">
                      <dt>매장가 (1인)</dt>
                      <dd className="font-mono tabular-nums font-medium">
                        {activeMatch.menu.storePrice !== null
                          ? `${formatWon(activeMatch.menu.storePrice)} (총 ${formatWon(
                              activeMatch.menu.storePrice * activeMatch.servings
                            )})`
                          : '가격자료 미입력'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-[#1A1D1A]">
                      <dt>
                        메뉴 금액 ({formatWon(effectiveUnitPrice)} ×{' '}
                        {activeMatch.servings})
                        {(activeMatch.menu.closingDiscountPercent ?? 0) > 0 && (
                          <span className="ml-1.5 text-[11px] font-bold text-amber-800">
                            (마감 -{activeMatch.menu.closingDiscountPercent}%)
                          </span>
                        )}
                      </dt>
                      <dd className="font-mono tabular-nums font-semibold">
                        {(activeMatch.menu.closingDiscountPercent ?? 0) > 0 && (
                          <span className="line-through text-[#687064] mr-1.5 font-normal text-xs">
                            {formatWon(originalMenuSubtotal)}
                          </span>
                        )}
                        {formatWon(effectiveMenuSubtotal)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-[#555E52]">
                      <dt>추가 옵션</dt>
                      <dd className="font-mono tabular-nums">
                        +{formatWon(optionsSubtotal)}
                      </dd>
                    </div>
                    {selectedExtraMenus.length > 0 && (
                      <div className="flex items-center justify-between text-[#3D5720]">
                        <dt>
                          같은 가게 추가 메뉴 ({selectedExtraMenus.length}종)
                        </dt>
                        <dd className="font-mono tabular-nums font-semibold">
                          +{formatWon(extraMenusSubtotal)}
                        </dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[#555E52]">
                      <dt>배달비</dt>
                      <dd className="font-mono tabular-nums">
                        +{formatWon(activeMatch.deliveryFee)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-[#4E6E2A]">
                      <dt>쿠폰 할인</dt>
                      <dd className="font-mono tabular-nums font-bold">
                        -{formatWon(combinedCouponDiscount)}
                      </dd>
                    </div>
                    <div className="pt-2.5 border-t border-[#E8ECE4] flex items-center justify-between text-base font-bold text-[#1A1D1A]">
                      <dt>예상 결제 금액</dt>
                      <dd className="font-mono tabular-nums text-lg text-[#4E6E2A]">
                        {formatWon(combinedEstimatedTotal)}
                      </dd>
                    </div>
                  </dl>

                  {savingsBreakdown && savingsBreakdown.totalSaved > 0 && (
                    <div className="p-3 bg-white border border-[#D4E1C5] rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-[#3D5720] font-semibold">
                        타 배달앱 예상가{' '}
                        <span className="line-through font-mono text-[#687064]">
                          {formatWon(
                            savingsBreakdown.competitorEstimatedTotal +
                              optionsSubtotal
                          )}
                        </span>{' '}
                        대비
                      </span>
                      <span className="font-mono font-extrabold text-[#4E6E2A]">
                        총 약 {formatWon(savingsBreakdown.totalSaved)} 절약 ✓
                      </span>
                    </div>
                  )}

                  {activeMatch.menu.storePrice !== null &&
                    activeMatch.menu.pricePerPerson !==
                      activeMatch.menu.storePrice && (
                      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#E8ECE4]/70">
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
                          className="min-h-[34px] px-3 py-1 bg-white border border-[#E8ECE4] hover:bg-[#EAF1E2] text-xs font-semibold text-[#3D5720] rounded-xl flex items-center gap-1 cursor-pointer"
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
                  <h3 className="text-sm font-bold text-[#1A1D1A]">추가 옵션</h3>
                  {activeMatch.menu.options.length === 0 ? (
                    <p className="text-xs text-[#687064]">
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
                                ? 'bg-[#EAF1E2] border-[#82B440] text-[#1A1D1A]'
                                : 'bg-white border-[#E8ECE4] text-[#1A1D1A] hover:border-[#4E6E2A]/40'
                            }`}
                          >
                            <span className="flex items-center gap-3 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  toggleOption(activeMatch.menu.id, opt.id)
                                }
                                className="w-4 h-4 accent-[#4E6E2A] rounded"
                              />
                              <span>{opt.name}</span>
                            </span>
                            <span className="text-sm font-mono tabular-nums font-bold text-[#4E6E2A] shrink-0">
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
                    className="block text-sm font-bold text-[#1A1D1A]"
                  >
                    할인 쿠폰
                  </label>
                  <select
                    id="recommend-coupon"
                    value={selectedCouponCode}
                    onChange={(e) => setSelectedCouponCode(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 bg-white border border-[#E8ECE4] rounded-2xl text-sm text-[#1A1D1A]"
                  >
                    {MOCK_COUPONS.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Honest Review Summary */}
                <div className="pt-5 border-t border-[#E8ECE4] space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#1A1D1A]">
                      리뷰 요약 ({activeReviews.length}건)
                    </h3>
                    {activeReviews.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowOriginalReviews((prev) => !prev)}
                        className="min-h-[38px] px-3.5 py-1.5 border border-[#E8ECE4] bg-[#EAF1E2] hover:bg-[#EAF1E2] text-xs font-semibold text-[#3D5720] rounded-xl flex items-center gap-1.5 cursor-pointer"
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
                    <p className="text-xs font-medium text-[#687064] p-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl">
                      등록된 리뷰가 없습니다.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {aiReviewSummary && (
                        <div className="p-3.5 bg-[#EAF1E2]/70 border border-[#D4E1C5] rounded-2xl space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3D5720]">
                              <Sparkles className="w-3.5 h-3.5 text-[#4E6E2A]" />
                              <span>{aiReviewSummary.headline}</span>
                            </span>
                            <span className="text-[10px] font-semibold text-[#4E6E2A]">
                              {isSummarizingReviews
                                ? '리뷰 요약 중...'
                                : aiReviewSummary.source === 'gemini'
                                  ? 'Baro 분석 요약'
                                  : '자동 태그 요약'}
                            </span>
                          </div>
                          <p className="text-xs text-[#3D5720]">
                            💡 {aiReviewSummary.recommendationTip}
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl space-y-1.5">
                        <span className="block text-xs font-bold text-[#1A1D1A]">
                          좋은 점
                        </span>
                        {reviewTagSummary.pros.length > 0 ? (
                          <ul className="space-y-1 text-xs text-[#555E52]">
                            {reviewTagSummary.pros.map(([tag, count]) => (
                              <li
                                key={tag}
                                className="flex items-center justify-between"
                              >
                                <span>{tag}</span>
                                <span className="font-mono tabular-nums font-bold text-[#4E6E2A]">
                                  {count}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-[#687064]">없음</p>
                        )}
                      </div>

                      <div className="p-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl space-y-1.5">
                        <span className="block text-xs font-bold text-[#1A1D1A]">
                          아쉬운 점
                        </span>
                        {reviewTagSummary.cons.length > 0 ? (
                          <ul className="space-y-1 text-xs text-[#555E52]">
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
                          <p className="text-xs text-[#687064]">없음</p>
                        )}
                      </div>
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
                                : 'bg-white border-[#E8ECE4]'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[#687064]">
                              <span className="font-bold text-[#1A1D1A]">
                                {review.author}
                              </span>
                              <span className="font-mono tabular-nums">
                                <span className="text-[#82B440]">★</span> {review.rating} · {review.date}
                              </span>
                            </div>
                            <p className="text-sm text-[#1A1D1A] leading-relaxed">
                              {review.content}
                            </p>
                            {ownerReply && (
                              <div className="p-3 bg-[#EAF1E2] border border-[#E8ECE4] rounded-xl text-xs text-[#3D5720] space-y-1">
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

                {/* Same-Store Additional Menu Cross-Sell */}
                {sameStoreOtherMenus.length > 0 && (
                  <div className="pt-4 border-t border-[#E8ECE4] space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-[#1A1D1A]">
                        이 가게 다른 메뉴 함께 추가 ({sameStoreOtherMenus.length}개)
                      </h3>
                      {onOpenStoreMenu && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenStoreMenu(activeMatch.store.id, {
                              highlightMenuId: activeMatch.menu.id,
                              initialServings: activeMatch.servings,
                              initialOptionIds: activeOptionIds,
                              preselectHighlight: true,
                            })
                          }
                          className="easy-compact text-xs font-bold text-[#4E6E2A] hover:underline cursor-pointer"
                        >
                          가게 전체 메뉴 보기 →
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {sameStoreOtherMenus.map((other) => {
                        const extraQty = extraQtyByStoreMenu[other.id] ?? 0;
                        return (
                          <div
                            key={other.id}
                            className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                              extraQty > 0
                                ? 'bg-[#EAF1E2]/60 border-[#82B440]'
                                : 'bg-[#F7F8F5] border-[#E8ECE4]'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-11 h-11 rounded-xl overflow-hidden border border-[#E8ECE4] shrink-0">
                                <FoodImage
                                  src={other.image}
                                  alt={other.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-[#1A1D1A] truncate">
                                  {other.name}
                                </p>
                                <p className="text-xs font-mono font-semibold text-[#4E6E2A] tabular-nums">
                                  {formatWon(getEffectiveMenuPrice(other))}
                                  {(other.closingDiscountPercent ?? 0) > 0 &&
                                    ` (-${other.closingDiscountPercent}%)`}
                                </p>
                              </div>
                            </div>

                            {extraQty === 0 ? (
                              <button
                                type="button"
                                onClick={() => adjustExtraMenuQty(other, 1)}
                                className="easy-compact min-h-[36px] px-3 py-1.5 bg-white hover:bg-[#EAF1E2] border border-[#D4E1C5] text-[#3D5720] text-xs font-bold rounded-xl inline-flex items-center gap-1 shrink-0 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>추가</span>
                              </button>
                            ) : (
                              <div className="inline-flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => adjustExtraMenuQty(other, -1)}
                                  aria-label={`${other.name} 수량 감소`}
                                  className="easy-compact w-7 h-7 rounded-lg bg-white border border-[#D4E1C5] text-xs font-bold cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="w-5 text-center font-mono text-xs font-bold text-[#3D5720]">
                                  {extraQty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => adjustExtraMenuQty(other, 1)}
                                  aria-label={`${other.name} 수량 증가`}
                                  className="easy-compact w-7 h-7 rounded-lg bg-[#4E6E2A] text-white text-xs font-bold cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Large Unmistakable One-Tap Primary CTA */}
                <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(onAddMultipleToCart || onAddToCart) && (
                    <button
                      type="button"
                      onClick={() => {
                        const lines = buildCombinedCartItems();
                        if (onAddMultipleToCart) {
                          onAddMultipleToCart(activeMatch.store.id, lines);
                        } else if (onAddToCart) {
                          onAddToCart(
                            activeMatch.menu.id,
                            activeMatch.servings,
                            activeOptionIds
                          );
                        }
                      }}
                      className="min-h-[58px] py-3.5 px-5 bg-[#EAF1E2] hover:bg-[#DCE7CF] border border-[#82B440] text-[#3D5720] font-bold text-sm sm:text-base rounded-2xl transition-all cursor-pointer inline-flex items-center justify-center gap-2"
                    >
                      <ShoppingBag className="w-5 h-5 shrink-0" />
                      <span>
                        {selectedExtraMenus.length > 0
                          ? `장바구니 담기 (${1 + selectedExtraMenus.length}종)`
                          : '장바구니 담기'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        selectedExtraMenus.length > 0 &&
                        onProceedToConfirmWithItems
                      ) {
                        onProceedToConfirmWithItems({
                          storeId: activeMatch.store.id,
                          items: buildCombinedCartItems(),
                          couponCode: selectedCouponCode,
                        });
                      } else {
                        onProceedToConfirm({
                          menuId: activeMatch.menu.id,
                          servings: activeMatch.servings,
                          selectedOptionIds: activeOptionIds,
                          couponCode: selectedCouponCode,
                        });
                      }
                    }}
                    className={`${
                      onAddMultipleToCart || onAddToCart ? '' : 'sm:col-span-2'
                    } w-full min-h-[58px] py-4 px-6 bg-[#4E6E2A] hover:bg-[#3F5A21] active:scale-[0.99] text-white font-bold text-base sm:text-lg rounded-2xl transition-all cursor-pointer shadow-[0_14px_30px_-8px_rgba(78,110,42,0.48)] inline-flex items-center justify-center gap-2.5`}
                  >
                    <Zap className="w-5 h-5 shrink-0" />
                    <span>
                      원탭 바로 주문 · {formatWon(combinedEstimatedTotal)}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Excluded Items Disclosure */}
      {excluded.length > 0 && (
        <div className="bg-white border border-[#E8ECE4] rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowExcluded((prev) => !prev)}
            className="w-full min-h-[46px] px-5 py-3 flex items-center justify-between text-left text-xs sm:text-sm font-bold text-[#555E52] hover:bg-[#F7F8F5] cursor-pointer"
          >
            <span>제외된 메뉴 ({excluded.length}개)</span>
            {showExcluded ? (
              <ChevronUp className="w-4 h-4 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" />
            )}
          </button>
          {showExcluded && (
            <div className="border-t border-[#E8ECE4] divide-y divide-[#E8ECE4]">
              {excluded.map((ex) => (
                <div
                  key={ex.menu.id}
                  className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-[#1A1D1A]">{ex.menu.name}</span>
                    <span className="text-[#687064] ml-2">
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
