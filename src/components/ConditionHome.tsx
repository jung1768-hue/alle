import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Megaphone,
  Mic,
  MicOff,
  Search,
  Sparkles,
  Ticket,
  Zap,
} from 'lucide-react';
import {
  INITIAL_REVIEWS,
  VOICE_TRANSCRIPT_SAMPLES,
} from '../data/seedData';
import {
  MenuItem,
  Order,
  PaymentMethod,
  RecommendationMatch,
  Review,
  ReviewReply,
  SavedLocation,
  Store,
  StoreCoupon,
  StorePromotion,
} from '../types/alle';
import {
  matchesMenuPlatformCategory,
  PlatformCategoryId,
} from '../utils/categories';
import {
  evaluateRecommendations,
  formatWon,
  getEffectiveMenuPrice,
  isStoreDeliverableToLocation,
} from '../utils/parser';
import { calculateStoreDeliveryFee } from '../utils/pricing';
import { startKoreanVoiceInput } from '../utils/voice';
import { FoodImage } from './FoodImage';
import { MenuDetailReviewModal } from './MenuDetailReviewModal';

interface ConditionHomeProps {
  stores: Store[];
  menus: MenuItem[];
  orders: Order[];
  reviews?: Review[];
  reviewReplies?: Record<string, ReviewReply>;
  storePromotions?: StorePromotion[];
  storeCoupons?: StoreCoupon[];
  onOpenAiChat: (initialPrompt?: string) => void;
  onRawInputChange?: (next: string) => void;
  onQuickReorderToConfirm: (
    menuId: string,
    servings: number,
    options?: {
      sharedDeliveryApplied?: boolean;
      reservationSlot?: string;
      selectedOptionIds?: string[];
      paymentMethod?: PaymentMethod;
      customerNote?: string;
    }
  ) => void;
  onOpenQuickPay?: (payload: {
    menuId: string;
    servings: number;
    selectedOptionIds?: string[];
    paymentMethod?: PaymentMethod;
    customerNote?: string;
  }) => void;
  onOpenB2BMeal: () => void;
  onOpenErrand: () => void;
  onOpenBrowse?: (options?: {
    category?: PlatformCategoryId;
    query?: string;
  }) => void;
  onOpenStoreMenu?: (
    storeId: string,
    options?: {
      highlightMenuId?: string;
      initialServings?: number;
      preselectHighlight?: boolean;
    }
  ) => void;
  activeLocation?: SavedLocation;
}

const EASY_GRID_CATEGORIES: Array<{
  id: PlatformCategoryId;
  emoji: string;
  label: string;
}> = [
  { id: 'korean', emoji: '🍲', label: '한식·국밥' },
  { id: 'chicken', emoji: '🍗', label: '치킨' },
  { id: 'chinese', emoji: '🥟', label: '중식·마라' },
  { id: 'japanese', emoji: '🍱', label: '일식·돈까스' },
  { id: 'western', emoji: '🍕', label: '피자·양식' },
  { id: 'snack', emoji: '🌶️', label: '분식·야식' },
  { id: 'cafe', emoji: '☕', label: '카페·디저트' },
  { id: 'market', emoji: '🧺', label: '전통시장' },
  { id: 'closing', emoji: '🔥', label: '마감특가' },
  { id: 'all', emoji: '🔍', label: '전체 검색' },
];

export function ConditionHome({
  stores,
  menus,
  orders,
  reviews = INITIAL_REVIEWS,
  reviewReplies = {},
  storePromotions = [],
  storeCoupons = [],
  onOpenAiChat,
  onRawInputChange,
  onQuickReorderToConfirm,
  onOpenQuickPay,
  onOpenB2BMeal,
  onOpenErrand,
  onOpenBrowse,
  onOpenStoreMenu,
  activeLocation,
}: ConditionHomeProps) {
  const [activeCategoryChip, setActiveCategoryChip] =
    useState<PlatformCategoryId>('all');
  const [easySearchQuery, setEasySearchQuery] = useState<string>('');
  const [detailMenuId, setDetailMenuId] = useState<string | null>(null);
  const [showVoiceFallback, setShowVoiceFallback] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const stopVoiceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      stopVoiceRef.current?.();
    };
  }, []);

  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const menusByStore = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const m of menus) {
      const list = map.get(m.storeId) ?? [];
      list.push(m);
      map.set(m.storeId, list);
    }
    return map;
  }, [menus]);

  const activePromoByStore = useMemo(() => {
    const map = new Map<string, StorePromotion>();
    for (const p of storePromotions) {
      if (p.isActive && !map.has(p.storeId)) {
        map.set(p.storeId, p);
      }
    }
    return map;
  }, [storePromotions]);

  const activeCouponByStore = useMemo(() => {
    const map = new Map<string, StoreCoupon>();
    for (const c of storeCoupons) {
      if (c.isActive && !map.has(c.storeId)) {
        map.set(c.storeId, c);
      }
    }
    return map;
  }, [storeCoupons]);

  const allAvailableByLocation = useMemo(
    () =>
      evaluateRecommendations(
        {
          rawInput: '',
          servings: 1,
          tags: [],
          excludeTags: [],
          maxBudget: null,
          maxMinutes: null,
          unknownTokens: [],
          needsConfirmation: false,
        },
        stores,
        menus,
        activeLocation
      ).matches,
    [stores, menus, activeLocation]
  );

  const hasDeliverableInArea = useMemo(
    () =>
      Boolean(
        activeLocation &&
          stores.some((s) => isStoreDeliverableToLocation(s, activeLocation))
      ),
    [stores, activeLocation]
  );

  const filteredRecommendations: RecommendationMatch[] = useMemo(() => {
    if (activeCategoryChip === 'all') {
      return allAvailableByLocation;
    }
    return evaluateRecommendations(
      {
        rawInput: '',
        servings: 1,
        tags: [],
        excludeTags: [],
        maxBudget: null,
        maxMinutes: null,
        unknownTokens: [],
        needsConfirmation: false,
      },
      stores,
      menus.filter((m) => {
        const st = storeMap.get(m.storeId);
        return Boolean(
          st && matchesMenuPlatformCategory(activeCategoryChip, st, m)
        );
      }),
      activeLocation
    ).matches;
  }, [
    activeCategoryChip,
    allAvailableByLocation,
    stores,
    menus,
    storeMap,
    activeLocation,
  ]);

  const featuredStoreEvents = useMemo(() => {
    const items: Array<{
      store: Store;
      promo?: StorePromotion;
      coupon?: StoreCoupon;
      isNearby: boolean;
    }> = [];
    const seenStoreIds = new Set<string>();

    for (const promo of storePromotions) {
      if (!promo.isActive || seenStoreIds.has(promo.storeId)) continue;
      const st = storeMap.get(promo.storeId);
      if (!st || !st.isOpen) continue;
      seenStoreIds.add(st.id);
      items.push({
        store: st,
        promo,
        coupon: activeCouponByStore.get(st.id),
        isNearby: Boolean(
          activeLocation && isStoreDeliverableToLocation(st, activeLocation)
        ),
      });
    }

    for (const coupon of storeCoupons) {
      if (!coupon.isActive || seenStoreIds.has(coupon.storeId)) continue;
      const st = storeMap.get(coupon.storeId);
      if (!st || !st.isOpen) continue;
      seenStoreIds.add(st.id);
      items.push({
        store: st,
        coupon,
        isNearby: Boolean(
          activeLocation && isStoreDeliverableToLocation(st, activeLocation)
        ),
      });
    }

    items.sort((a, b) => Number(b.isNearby) - Number(a.isNearby));
    return items.slice(0, 4);
  }, [
    storePromotions,
    storeCoupons,
    storeMap,
    activeCouponByStore,
    activeLocation,
  ]);

  const quickReorderCandidate = useMemo(() => {
    for (const ord of orders) {
      const m = menus.find((item) => item.id === ord.menuId);
      const st = m ? storeMap.get(m.storeId) : undefined;
      if (
        m &&
        st &&
        st.isOpen &&
        !m.isSoldOut &&
        m.stock >= 1 &&
        (!hasDeliverableInArea || isStoreDeliverableToLocation(st, activeLocation))
      ) {
        return {
          menu: m,
          store: st,
          servings: Math.min(ord.servings, m.stock),
          selectedOptionIds: ord.selectedOptionIds,
          paymentMethod: ord.paymentMethod,
          customerNote: ord.customerNote,
        };
      }
    }
    const fallbackMenu = menus.find((m) => {
      const st = storeMap.get(m.storeId);
      return Boolean(
        st?.isOpen &&
          !m.isSoldOut &&
          m.stock >= 1 &&
          (!hasDeliverableInArea || isStoreDeliverableToLocation(st, activeLocation))
      );
    });
    if (!fallbackMenu) return null;
    const fallbackStore = storeMap.get(fallbackMenu.storeId);
    if (!fallbackStore) return null;
    return {
      menu: fallbackMenu,
      store: fallbackStore,
      servings: 1,
      selectedOptionIds: [] as string[],
      paymentMethod: undefined,
      customerNote: '',
    };
  }, [orders, menus, storeMap, hasDeliverableInArea, activeLocation]);

  const triggerQuickPay = (payload: {
    menuId: string;
    servings: number;
    selectedOptionIds?: string[];
    paymentMethod?: PaymentMethod;
    customerNote?: string;
  }) => {
    if (onOpenQuickPay) {
      onOpenQuickPay(payload);
    } else {
      onQuickReorderToConfirm(payload.menuId, payload.servings, {
        selectedOptionIds: payload.selectedOptionIds,
        paymentMethod: payload.paymentMethod,
        customerNote: payload.customerNote,
      });
    }
  };

  const handleVoiceTrigger = () => {
    if (isListening) {
      stopVoiceRef.current?.();
      setIsListening(false);
      return;
    }

    setShowVoiceFallback(false);
    setIsListening(true);
    stopVoiceRef.current = startKoreanVoiceInput({
      onTranscript: (text) => {
        onRawInputChange?.(text);
        setIsListening(false);
        onOpenAiChat(text);
      },
      onUnavailableOrError: () => {
        setIsListening(false);
        setShowVoiceFallback(true);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });
  };

  const detailMenu = useMemo(
    () =>
      detailMenuId ? menus.find((m) => m.id === detailMenuId) ?? null : null,
    [detailMenuId, menus]
  );
  const detailStore = useMemo(
    () => (detailMenu ? storeMap.get(detailMenu.storeId) ?? null : null),
    [detailMenu, storeMap]
  );

  const detailStoreMenuCount = useMemo(
    () =>
      detailStore
        ? (menusByStore.get(detailStore.id) ?? []).filter(
            (m) => !m.isSoldOut && m.stock >= 1
          ).length
        : 0,
    [detailStore, menusByStore]
  );

  const easyPicks = filteredRecommendations.slice(0, 3);

  const quickReorderSubtotal = quickReorderCandidate
    ? getEffectiveMenuPrice(quickReorderCandidate.menu) *
      quickReorderCandidate.servings
    : 0;
  const quickReorderFeeInfo = quickReorderCandidate
    ? calculateStoreDeliveryFee(
        quickReorderCandidate.store,
        quickReorderSubtotal,
        'partner_direct'
      )
    : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Core Value Strip + Voice + Manual Search + Category Grid */}
      <section className="bg-[#EAF1E2] border-2 border-[#82B440] rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-[#3D5720]">
            💚 수수료 0% 착한가격 · 최소주문 없음 · 1개도 배달
          </span>
          <span className="px-2.5 py-1 rounded-full bg-white border border-[#D4E1C5] text-xs font-bold text-[#3D5720]">
            {activeLocation?.areaName ?? '대구 북구 산격동'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleVoiceTrigger}
          className={`w-full min-h-[78px] px-5 py-4 rounded-3xl font-extrabold text-lg sm:text-xl flex items-center justify-center gap-3 shadow-md transition-colors cursor-pointer ${
            isListening
              ? 'bg-red-600 text-white'
              : 'bg-[#4E6E2A] hover:bg-[#3F5A21] text-white'
          }`}
        >
          {isListening ? (
            <MicOff className="w-7 h-7 shrink-0" />
          ) : (
            <Mic className="w-7 h-7 shrink-0" />
          )}
          <span>
            {isListening
              ? '말씀하세요... 듣고 있어요 (누르면 중지)'
              : '🎙️ 누르고 먹고 싶은 음식을 말하세요'}
          </span>
        </button>

        {/* Direct Manual Search Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (onOpenBrowse) {
              onOpenBrowse({ category: 'all', query: easySearchQuery.trim() });
            } else if (easySearchQuery.trim()) {
              onOpenAiChat(easySearchQuery.trim());
            }
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 text-[#4E6E2A] absolute left-4 pointer-events-none" />
            <input
              type="text"
              value={easySearchQuery}
              onChange={(e) => setEasySearchQuery(e.target.value)}
              placeholder="가게명·메뉴명 직접 검색 (예: 국밥, 치킨)"
              className="w-full min-h-[50px] pl-10 pr-4 bg-white border border-[#D4E1C5] rounded-2xl text-base text-[#1A1D1A] placeholder:text-[#687064]"
            />
          </div>
          <button
            type="submit"
            className="min-h-[50px] px-5 rounded-2xl bg-[#1A1D1A] hover:bg-[#2F352F] text-white text-base font-extrabold whitespace-nowrap cursor-pointer shrink-0"
          >
            검색
          </button>
        </form>

        {showVoiceFallback && (
          <div className="p-4 bg-white border border-[#D4E1C5] rounded-2xl space-y-2.5">
            <p className="text-sm font-bold text-[#1A1D1A]">
              마이크 대신 아래 글자를 눌러도 올레가 바로 찾아드려요
            </p>
            <div className="grid grid-cols-1 gap-2">
              {VOICE_TRANSCRIPT_SAMPLES.slice(0, 3).map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => {
                    setShowVoiceFallback(false);
                    onOpenAiChat(sample.text);
                  }}
                  className="w-full px-4 py-3 bg-[#F7F8F5] hover:bg-[#EAF1E2] border border-[#E8ECE4] rounded-2xl text-left text-base font-bold text-[#1A1D1A] cursor-pointer"
                >
                  “{sample.text}”
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Classic Platform Category Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-sm font-extrabold text-[#3D5720]">
              카테고리로 직접 골라 주문하기
            </span>
            {onOpenBrowse && (
              <button
                type="button"
                onClick={() => onOpenBrowse({ category: 'all' })}
                className="easy-compact text-xs font-bold text-[#3D5720] underline underline-offset-2 cursor-pointer"
              >
                전체 보기 →
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {EASY_GRID_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  if (onOpenBrowse) {
                    onOpenBrowse({ category: cat.id });
                  } else {
                    setActiveCategoryChip((prev) =>
                      prev === cat.id ? 'all' : cat.id
                    );
                  }
                }}
                className="min-h-[68px] px-3 py-2.5 rounded-2xl border-2 bg-white border-[#D4E1C5] hover:border-[#4E6E2A] hover:bg-[#F7F8F5] text-[#1A1D1A] text-sm sm:text-base font-extrabold flex items-center sm:flex-col justify-center gap-2 sm:gap-1 cursor-pointer transition-colors"
              >
                <span className="text-2xl leading-none">{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Simple Horizontal Banners: B2B Enterprise Group Order & Life Errands */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onOpenB2BMeal}
          className="min-h-[76px] w-full px-5 py-4 rounded-2xl bg-white hover:bg-[#EAF1E2] text-[#1A1D1A] border-2 border-[#D4E1C5] hover:border-[#4E6E2A] shadow-sm flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
        >
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-extrabold truncate">
              🏢 B2B 기업 단체 선주문
            </div>
            <div className="text-xs sm:text-sm text-[#555E52] mt-0.5 truncate">
              원하는 시간 예약 · 카드/계좌 즉시 결제 · 거래명세표
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-[#EAF1E2] border border-[#82B440]/60 text-[#3D5720] text-xs sm:text-sm font-extrabold shrink-0 whitespace-nowrap">
            바로 주문 →
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenErrand}
          className="min-h-[76px] w-full px-5 py-4 rounded-2xl bg-white hover:bg-[#EAF1E2] text-[#1A1D1A] border-2 border-[#D4E1C5] hover:border-[#4E6E2A] shadow-sm flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
        >
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-extrabold truncate">
              🛵 생활 심부름
            </div>
            <div className="text-xs sm:text-sm text-[#555E52] mt-0.5 truncate">
              동네 장보기 · 세탁물 · 픽업 대행 (매칭 100원)
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-[#EAF1E2] border border-[#82B440]/60 text-[#3D5720] text-xs sm:text-sm font-extrabold shrink-0 whitespace-nowrap">
            요청하기 →
          </span>
        </button>
      </section>

      {/* Owner Store Events & Coupons Strip */}
      {featuredStoreEvents.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-[#1A1D1A] inline-flex items-center gap-1.5">
              <Megaphone className="w-5 h-5 text-[#4E6E2A]" />
              <span>🎉 우리 동네 가게 이벤트 · 쿠폰</span>
            </h2>
            {onOpenBrowse && (
              <button
                type="button"
                onClick={() => onOpenBrowse({ category: 'all' })}
                className="easy-compact text-xs font-bold text-[#4E6E2A] underline underline-offset-2 cursor-pointer"
              >
                더 보기
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {featuredStoreEvents.map(({ store, promo, coupon, isNearby }) => (
              <button
                key={store.id}
                type="button"
                onClick={() => onOpenStoreMenu?.(store.id)}
                className="p-4 rounded-2xl bg-white hover:bg-[#FAFCF8] border-2 border-[#D4E1C5] hover:border-[#4E6E2A] text-left space-y-2 transition-colors cursor-pointer shadow-2xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="px-2 py-0.5 rounded-full bg-[#4E6E2A] text-white text-xs font-bold">
                    {promo?.badgeText ?? '가게 쿠폰'}
                  </span>
                  {isNearby && (
                    <span className="text-xs font-bold text-[#3D5720]">
                      📍 내 주변 배달 가능
                    </span>
                  )}
                </div>
                <p className="text-sm font-extrabold text-[#4E6E2A] truncate">
                  {store.name}
                </p>
                {promo && (
                  <p className="text-base font-extrabold text-[#1A1D1A] leading-snug line-clamp-1">
                    {promo.title}
                  </p>
                )}
                {coupon && (
                  <p className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#EAF1E2] text-[#3D5720] text-xs font-bold">
                    <Ticket className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{coupon.label}</span>
                  </p>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Quick Reorder Card */}
      {quickReorderCandidate && quickReorderFeeInfo && (
        <section className="bg-white border-2 border-[#4E6E2A] rounded-3xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-[#4E6E2A]">
            <span className="inline-flex items-center gap-1.5">
              <Zap className="w-5 h-5 fill-[#82B440]" />
              <span>자주 시키던 메뉴 바로 시키기</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-xs font-extrabold">
              💚 착한가격 · 1개도 배달
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border border-[#E8ECE4] shrink-0">
              <FoodImage
                src={quickReorderCandidate.menu.image}
                alt={quickReorderCandidate.menu.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#4E6E2A] truncate">
                {quickReorderCandidate.store.name}
              </p>
              <p className="text-lg font-extrabold text-[#1A1D1A] truncate">
                {quickReorderCandidate.menu.name}
              </p>
              <p className="text-base font-bold text-[#1A1D1A] mt-1 tabular-nums">
                {quickReorderCandidate.servings}인분 · 배달비 포함{' '}
                {formatWon(
                  quickReorderSubtotal + quickReorderFeeInfo.finalDeliveryFee
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              triggerQuickPay({
                menuId: quickReorderCandidate.menu.id,
                servings: quickReorderCandidate.servings,
                selectedOptionIds: quickReorderCandidate.selectedOptionIds,
                paymentMethod: quickReorderCandidate.paymentMethod,
                customerNote: quickReorderCandidate.customerNote,
              })
            }
            className="w-full min-h-[56px] px-5 py-3 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-lg font-extrabold rounded-2xl cursor-pointer"
          >
            ⚡ 지난번 그대로 바로 주문하기
          </button>
        </section>
      )}

      {/* Nearby Affordable-Price Stores */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold text-[#1A1D1A]">
            지금 바로 배달되는 착한가격 맛집
          </h2>
          {onOpenBrowse && (
            <button
              type="button"
              onClick={() => onOpenBrowse({ category: 'all' })}
              className="easy-compact px-3.5 py-1.5 rounded-xl bg-[#EAF1E2] text-sm font-bold text-[#3D5720] cursor-pointer shrink-0"
            >
              더 찾아보기 →
            </button>
          )}
        </div>

        <div className="space-y-4">
          {easyPicks.map((item) => {
            const storeMenuCount = (
              menusByStore.get(item.store.id) ?? []
            ).filter((m) => !m.isSoldOut && m.stock >= 1).length;
            const storePromo = activePromoByStore.get(item.store.id);
            const storeCoupon = activeCouponByStore.get(item.store.id);
            const hasTiers = Boolean(
              item.store.deliveryFeeTiers && item.store.deliveryFeeTiers.length > 0
            );

            return (
              <article
                key={item.menu.id}
                className="bg-white border border-[#E8ECE4] rounded-3xl p-5 space-y-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.isSameStorePrice && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-xs font-extrabold">
                      💚 착한가격 · 매장 동일가
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-full bg-[#F7F8F5] border border-[#E8ECE4] text-[#555E52] text-xs font-bold">
                    1개도 배달
                  </span>
                  {hasTiers && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#F0F7E8] text-[#4E6E2A] text-xs font-bold">
                      금액별 배달비 지원
                    </span>
                  )}
                  {(storePromo || storeCoupon) && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold">
                      🎉 {storeCoupon ? '쿠폰 할인' : storePromo?.badgeText ?? '이벤트'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden border border-[#E8ECE4] shrink-0">
                    <FoodImage
                      src={item.menu.image}
                      alt={item.menu.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-bold text-[#4E6E2A] truncate">
                      {item.store.name} · 약 {item.effectiveMinutes}분
                    </p>
                    <h3 className="text-lg font-extrabold text-[#1A1D1A] truncate">
                      {item.menu.name}
                    </h3>
                    <p className="text-base font-extrabold text-[#1A1D1A] tabular-nums">
                      배달비 포함 {formatWon(item.estimatedTotal)}
                    </p>
                  </div>
                </div>

                <div
                  className={`grid gap-2.5 ${
                    onOpenStoreMenu && storeMenuCount > 1
                      ? 'grid-cols-3'
                      : 'grid-cols-2'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setDetailMenuId(item.menu.id)}
                    className="min-h-[52px] px-2 bg-white hover:bg-[#F7F8F5] border-2 border-[#E8ECE4] text-[#1A1D1A] text-sm sm:text-base font-extrabold rounded-2xl cursor-pointer"
                  >
                    상세 · 리뷰
                  </button>
                  {onOpenStoreMenu && storeMenuCount > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenStoreMenu(item.store.id, {
                          highlightMenuId: item.menu.id,
                          initialServings: item.servings,
                          preselectHighlight: true,
                        })
                      }
                      className="min-h-[52px] px-2 bg-[#F7F8F5] hover:bg-[#EAF1E2] border-2 border-[#D4E1C5] text-[#3D5720] text-sm sm:text-base font-extrabold rounded-2xl cursor-pointer"
                    >
                      가게 메뉴
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      triggerQuickPay({
                        menuId: item.menu.id,
                        servings: item.servings,
                      })
                    }
                    className="min-h-[52px] px-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] border-2 border-[#4E6E2A] text-[#3D5720] text-sm sm:text-base font-extrabold rounded-2xl cursor-pointer"
                  >
                    바로 시키기
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {onOpenBrowse && (
          <button
            type="button"
            onClick={() => onOpenBrowse({ category: 'all' })}
            className="w-full min-h-[54px] px-5 py-3 bg-white hover:bg-[#EAF1E2] border-2 border-[#82B440] text-[#3D5720] text-base font-extrabold rounded-2xl cursor-pointer transition-colors"
          >
            🍽️ 전체 카테고리 · 맛집 더 찾아보기 →
          </button>
        )}
      </section>

      <MenuDetailReviewModal
        menu={detailMenu}
        store={detailStore}
        storeMenuCount={detailStoreMenuCount}
        reviews={reviews}
        reviewReplies={reviewReplies}
        onClose={() => setDetailMenuId(null)}
        onQuickOrder={(id, servings) => onQuickReorderToConfirm(id, servings)}
        onOpenStoreMenu={
          detailStore && detailMenu && onOpenStoreMenu
            ? () =>
                onOpenStoreMenu(detailStore.id, {
                  highlightMenuId: detailMenu.id,
                  preselectHighlight: true,
                })
            : undefined
        }
      />
    </div>
  );
}
