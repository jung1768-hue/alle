import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Flame,
  Globe,
  Heart,
  MapPin,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Store as StoreIcon,
  Ticket,
  X,
  Zap,
} from 'lucide-react';
import {
  MenuItem,
  Review,
  SavedLocation,
  Store,
  StoreCoupon,
  StorePromotion,
} from '../types/alle';
import {
  matchesMenuPlatformCategory,
  matchesStorePlatformCategory,
  PLATFORM_CATEGORIES,
  PlatformCategoryId,
  POPULAR_SEARCH_KEYWORDS,
} from '../utils/categories';
import {
  formatWon,
  getEffectiveMenuPrice,
  isStoreDeliverableToLocation,
} from '../utils/parser';
import { FoodImage } from './FoodImage';

type BrowseSortKey =
  | 'recommended'
  | 'rating'
  | 'fastest'
  | 'low_fee'
  | 'reviews';

interface CategoryBrowseViewProps {
  stores: Store[];
  menus: MenuItem[];
  reviews: Review[];
  storePromotions?: StorePromotion[];
  storeCoupons?: StoreCoupon[];
  wishlistIds: string[];
  activeLocation?: SavedLocation;
  initialCategory?: PlatformCategoryId;
  initialQuery?: string;
  onBackToHome: () => void;
  onOpenLocationPicker: () => void;
  onOpenAiChat: (prompt?: string) => void;
  onToggleWishlist: (menuId: string) => void;
  onAddToCart: (
    menuId: string,
    quantity?: number,
    selectedOptionIds?: string[]
  ) => void;
  onOpenStoreMenu: (
    storeId: string,
    options?: {
      highlightMenuId?: string;
      initialServings?: number;
      preselectHighlight?: boolean;
    }
  ) => void;
  onQuickOrderMenu: (menuId: string, servings: number) => void;
}

export function CategoryBrowseView({
  stores,
  menus,
  reviews,
  storePromotions = [],
  storeCoupons = [],
  wishlistIds,
  activeLocation,
  initialCategory = 'all',
  initialQuery = '',
  onBackToHome,
  onOpenLocationPicker,
  onOpenAiChat,
  onToggleWishlist,
  onAddToCart,
  onOpenStoreMenu,
  onQuickOrderMenu,
}: CategoryBrowseViewProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<PlatformCategoryId>(initialCategory);
  const [searchQuery, setSearchQuery] = useState<string>(initialQuery);
  const [nearbyOnly, setNearbyOnly] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<BrowseSortKey>('recommended');
  const [onlyClosingSale, setOnlyClosingSale] = useState<boolean>(false);
  const [onlySameStorePrice, setOnlySameStorePrice] = useState<boolean>(false);
  const [onlyWithPromoOrCoupon, setOnlyWithPromoOrCoupon] =
    useState<boolean>(false);
  const [onlyLowDeliveryFee, setOnlyLowDeliveryFee] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'stores' | 'menus'>('stores');
  const [visibleCount, setVisibleCount] = useState<number>(12);

  useEffect(() => {
    setSelectedCategory(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    setSearchQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setVisibleCount(12);
  }, [
    selectedCategory,
    searchQuery,
    nearbyOnly,
    sortBy,
    onlyClosingSale,
    onlySameStorePrice,
    onlyWithPromoOrCoupon,
    onlyLowDeliveryFee,
    viewMode,
    activeLocation?.id,
  ]);

  const promoStoreIds = useMemo(
    () =>
      new Set([
        ...storePromotions.filter((p) => p.isActive).map((p) => p.storeId),
        ...storeCoupons.filter((c) => c.isActive).map((c) => c.storeId),
      ]),
    [storePromotions, storeCoupons]
  );

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

  const reviewCountByMenu = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reviews) {
      counts.set(r.menuId, (counts.get(r.menuId) ?? 0) + 1);
    }
    return counts;
  }, [reviews]);

  const hasDeliverableInArea = useMemo(
    () =>
      Boolean(
        activeLocation &&
          stores.some(
            (s) => s.isOpen && isStoreDeliverableToLocation(s, activeLocation)
          )
      ),
    [stores, activeLocation]
  );

  const openStores = useMemo(
    () =>
      stores.filter((s) => {
        if (!s.isOpen) return false;
        const list = menusByStore.get(s.id) ?? [];
        return list.some((m) => !m.isSoldOut && m.stock > 0);
      }),
    [stores, menusByStore]
  );

  const nearbyOpenStores = useMemo(
    () =>
      hasDeliverableInArea && activeLocation
        ? openStores.filter((s) => isStoreDeliverableToLocation(s, activeLocation))
        : openStores,
    [openStores, hasDeliverableInArea, activeLocation]
  );

  const scopedStores = nearbyOnly ? nearbyOpenStores : openStores;

  const categoryStoreCounts = useMemo(() => {
    const counts: Record<PlatformCategoryId, number> = {
      all: scopedStores.length,
      korean: 0,
      chicken: 0,
      chinese: 0,
      japanese: 0,
      western: 0,
      snack: 0,
      cafe: 0,
      market: 0,
      convenience: 0,
      closing: 0,
    };
    for (const store of scopedStores) {
      const stMenus = menusByStore.get(store.id) ?? [];
      for (const cat of PLATFORM_CATEGORIES) {
        if (cat.id === 'all') continue;
        if (matchesStorePlatformCategory(cat.id, store, stMenus)) {
          counts[cat.id] += 1;
        }
      }
    }
    return counts;
  }, [scopedStores, menusByStore]);

  const trimmedQuery = searchQuery.trim().toLowerCase();

  const filteredStores = useMemo(() => {
    const result = scopedStores.filter((store) => {
      const stMenus = (menusByStore.get(store.id) ?? []).filter(
        (m) => !m.isSoldOut && m.stock > 0
      );
      if (stMenus.length === 0) return false;

      if (!matchesStorePlatformCategory(selectedCategory, store, stMenus)) {
        return false;
      }
      if (
        onlyClosingSale &&
        !stMenus.some((m) => (m.closingDiscountPercent ?? 0) > 0)
      ) {
        return false;
      }
      if (
        onlySameStorePrice &&
        (store.singlePriceRevoked ||
          !stMenus.some(
            (m) => m.storePrice !== null && m.storePrice === m.pricePerPerson
          ))
      ) {
        return false;
      }
      if (onlyLowDeliveryFee && store.deliveryFee > 2000) {
        return false;
      }
      if (onlyWithPromoOrCoupon && !promoStoreIds.has(store.id)) {
        return false;
      }

      if (trimmedQuery) {
        const storeHit =
          store.name.toLowerCase().includes(trimmedQuery) ||
          store.category.toLowerCase().includes(trimmedQuery) ||
          (store.categoryGroup ?? '').toLowerCase().includes(trimmedQuery) ||
          store.areaLabel.toLowerCase().includes(trimmedQuery);
        const menuHit = stMenus.some(
          (m) =>
            m.name.toLowerCase().includes(trimmedQuery) ||
            m.description.toLowerCase().includes(trimmedQuery) ||
            m.tags.some((t) => t.toLowerCase().includes(trimmedQuery))
        );
        if (!storeHit && !menuHit) return false;
      }
      return true;
    });

    const sorted = [...result];
    sorted.sort((a, b) => {
      const aNearby =
        activeLocation && isStoreDeliverableToLocation(a, activeLocation) ? 1 : 0;
      const bNearby =
        activeLocation && isStoreDeliverableToLocation(b, activeLocation) ? 1 : 0;

      if (sortBy === 'rating') {
        return (
          (b.rating ?? 4.8) - (a.rating ?? 4.8) ||
          (b.reviewCount ?? 0) - (a.reviewCount ?? 0)
        );
      }
      if (sortBy === 'fastest') {
        return (
          a.basePrepMinutes +
          (a.extraPrepMinutes ?? 0) -
          (b.basePrepMinutes + (b.extraPrepMinutes ?? 0))
        );
      }
      if (sortBy === 'low_fee') {
        return (
          a.deliveryFee - b.deliveryFee ||
          (b.rating ?? 4.8) - (a.rating ?? 4.8)
        );
      }
      if (sortBy === 'reviews') {
        return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
      }
      // recommended: nearby first, then rating & review count
      if (aNearby !== bNearby) return bNearby - aNearby;
      return (
        (b.rating ?? 4.8) - (a.rating ?? 4.8) ||
        (b.reviewCount ?? 0) - (a.reviewCount ?? 0)
      );
    });
    return sorted;
  }, [
    scopedStores,
    menusByStore,
    selectedCategory,
    onlyClosingSale,
    onlySameStorePrice,
    onlyWithPromoOrCoupon,
    onlyLowDeliveryFee,
    promoStoreIds,
    trimmedQuery,
    sortBy,
    activeLocation,
  ]);

  const filteredMenus = useMemo(() => {
    const allowedStoreIds = new Set(scopedStores.map((s) => s.id));
    const list = menus.filter((m) => {
      if (!allowedStoreIds.has(m.storeId)) return false;
      if (m.isSoldOut || m.stock <= 0) return false;
      const store = storeMap.get(m.storeId);
      if (!store) return false;

      if (
        m.isSideMenu &&
        (!trimmedQuery || !m.name.toLowerCase().includes(trimmedQuery))
      ) {
        return false;
      }

      if (!matchesMenuPlatformCategory(selectedCategory, store, m)) {
        return false;
      }
      if (onlyClosingSale && (m.closingDiscountPercent ?? 0) <= 0) {
        return false;
      }
      if (
        onlySameStorePrice &&
        (store.singlePriceRevoked ||
          m.storePrice === null ||
          m.storePrice !== m.pricePerPerson)
      ) {
        return false;
      }
      if (onlyLowDeliveryFee && store.deliveryFee > 2000) {
        return false;
      }
      if (onlyWithPromoOrCoupon && !promoStoreIds.has(store.id)) {
        return false;
      }
      if (trimmedQuery) {
        const hit =
          m.name.toLowerCase().includes(trimmedQuery) ||
          m.description.toLowerCase().includes(trimmedQuery) ||
          m.tags.some((t) => t.toLowerCase().includes(trimmedQuery)) ||
          store.name.toLowerCase().includes(trimmedQuery) ||
          store.category.toLowerCase().includes(trimmedQuery);
        if (!hit) return false;
      }
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      const sa = storeMap.get(a.storeId);
      const sb = storeMap.get(b.storeId);
      if (!sa || !sb) return 0;
      if (sortBy === 'rating') {
        return (sb.rating ?? 4.8) - (sa.rating ?? 4.8);
      }
      if (sortBy === 'fastest') {
        return (
          a.estimatedMinutes +
          (sa.extraPrepMinutes ?? 0) -
          (b.estimatedMinutes + (sb.extraPrepMinutes ?? 0))
        );
      }
      if (sortBy === 'low_fee') {
        return (
          sa.deliveryFee - sb.deliveryFee ||
          getEffectiveMenuPrice(a) - getEffectiveMenuPrice(b)
        );
      }
      if (sortBy === 'reviews') {
        return (
          (reviewCountByMenu.get(b.id) ?? 0) - (reviewCountByMenu.get(a.id) ?? 0) ||
          (sb.reviewCount ?? 0) - (sa.reviewCount ?? 0)
        );
      }
      return (
        (sb.rating ?? 4.8) - (sa.rating ?? 4.8) ||
        a.estimatedMinutes - b.estimatedMinutes
      );
    });
    return sorted;
  }, [
    scopedStores,
    menus,
    storeMap,
    trimmedQuery,
    selectedCategory,
    onlyClosingSale,
    onlySameStorePrice,
    onlyWithPromoOrCoupon,
    onlyLowDeliveryFee,
    promoStoreIds,
    sortBy,
    reviewCountByMenu,
  ]);

  const activeCategoryDef =
    PLATFORM_CATEGORIES.find((c) => c.id === selectedCategory) ??
    PLATFORM_CATEGORIES[0];

  const totalResultCount =
    viewMode === 'stores' ? filteredStores.length : filteredMenus.length;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Top Bar & Search Header */}
      <section className="os-card rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBackToHome}
              className="easy-compact min-h-[38px] px-3 py-1.5 rounded-xl border border-[#E8ECE4] bg-white hover:bg-[#F7F8F5] text-xs sm:text-sm font-semibold text-[#1A1D1A] inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>홈</span>
            </button>
            <button
              type="button"
              onClick={onOpenLocationPicker}
              className="easy-compact min-h-[38px] px-3 py-1.5 rounded-xl bg-[#EAF1E2] hover:bg-[#DCE7CF] text-xs font-bold text-[#3D5720] inline-flex items-center gap-1 min-w-0 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {activeLocation?.areaName ?? '지역 선택'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onOpenAiChat(searchQuery.trim() || undefined)}
            className="easy-compact text-xs font-bold text-[#4E6E2A] hover:underline underline-offset-2 inline-flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI 바로에게 추천받기 →</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#4E6E2A] absolute left-4 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="음식점 이름, 메뉴명, 카테고리를 검색하세요 (예: 국밥, 치킨, 범어동)"
            aria-label="음식점 및 메뉴 검색"
            className="w-full min-h-[48px] pl-10 pr-10 py-2.5 bg-[#F7F8F5] border border-[#D4E1C5] rounded-2xl text-sm text-[#1A1D1A] placeholder:text-[#687064]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="검색어 지우기"
              className="easy-compact absolute right-3 w-7 h-7 rounded-full hover:bg-[#E8ECE4] text-[#687064] flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Popular Search Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          <span className="text-[11px] font-bold text-[#687064] shrink-0 mr-1">
            인기 검색
          </span>
          {POPULAR_SEARCH_KEYWORDS.map((kw) => {
            const active = searchQuery.trim() === kw;
            return (
              <button
                key={kw}
                type="button"
                onClick={() => setSearchQuery(active ? '' : kw)}
                className={`easy-compact px-2.5 py-1 rounded-full border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                    : 'bg-white border-[#E8ECE4] text-[#434B40] hover:border-[#82B440]'
                }`}
              >
                {kw}
              </button>
            );
          })}
        </div>
      </section>

      {/* Classic Platform Category Icon Grid */}
      <section aria-label="배달 카테고리 선택" className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h1 className="text-base sm:text-lg font-bold text-[#1A1D1A]">
            카테고리별 가게 찾기
          </h1>
          <span className="text-xs text-[#687064]">
            {activeCategoryDef.emoji} {activeCategoryDef.label} ·{' '}
            {activeCategoryDef.description}
          </span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {PLATFORM_CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.id;
            const count = categoryStoreCounts[cat.id];
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1 text-center cursor-pointer transition-all ${
                  active
                    ? 'bg-[#EAF1E2] border-[#4E6E2A] ring-1 ring-[#4E6E2A]'
                    : 'bg-white border-[#E8ECE4] hover:border-[#82B440]'
                }`}
              >
                <span className="text-xl sm:text-2xl leading-none">
                  {cat.emoji}
                </span>
                <span
                  className={`text-xs font-bold leading-tight truncate max-w-full ${
                    active ? 'text-[#3D5720]' : 'text-[#1A1D1A]'
                  }`}
                >
                  {cat.shortLabel}
                </span>
                <span className="text-[10px] font-mono text-[#687064] tabular-nums">
                  {count}곳
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Filter, Scope & Sort Controls */}
      <section className="bg-white border border-[#E8ECE4] rounded-2xl p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Scope Toggle */}
          <div className="inline-flex p-0.5 bg-[#F0F3EC] rounded-xl border border-[#E8ECE4]">
            <button
              type="button"
              onClick={() => setNearbyOnly(true)}
              className={`easy-compact px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                nearbyOnly
                  ? 'bg-[#4E6E2A] text-white'
                  : 'text-[#555E52] hover:text-[#1A1D1A]'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>내 주변 ({nearbyOpenStores.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setNearbyOnly(false)}
              className={`easy-compact px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                !nearbyOnly
                  ? 'bg-[#4E6E2A] text-white'
                  : 'text-[#555E52] hover:text-[#1A1D1A]'
              }`}
            >
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>전국 전체 ({openStores.length})</span>
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="inline-flex p-0.5 bg-[#F0F3EC] rounded-xl border border-[#E8ECE4]">
            <button
              type="button"
              onClick={() => setViewMode('stores')}
              className={`easy-compact px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                viewMode === 'stores'
                  ? 'bg-white text-[#1A1D1A] shadow-2xs'
                  : 'text-[#555E52]'
              }`}
            >
              가게별 보기
            </button>
            <button
              type="button"
              onClick={() => setViewMode('menus')}
              className={`easy-compact px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                viewMode === 'menus'
                  ? 'bg-white text-[#1A1D1A] shadow-2xs'
                  : 'text-[#555E52]'
              }`}
            >
              메뉴별 보기
            </button>
          </div>
        </div>

        {/* Sort & Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#E8ECE4]">
          {(
            [
              { id: 'recommended', label: '추천순' },
              { id: 'rating', label: '별점순' },
              { id: 'fastest', label: '배달 빠른순' },
              { id: 'low_fee', label: '배달비 낮은순' },
              { id: 'reviews', label: '리뷰 많은순' },
            ] as Array<{ id: BrowseSortKey; label: string }>
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSortBy(opt.id)}
              className={`easy-compact px-2.5 py-1 rounded-full border text-xs font-bold cursor-pointer transition-colors ${
                sortBy === opt.id
                  ? 'bg-[#1A1D1A] border-[#1A1D1A] text-white'
                  : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#434B40] hover:border-[#82B440]'
              }`}
            >
              {opt.label}
            </button>
          ))}

          <span aria-hidden="true" className="h-4 w-px bg-[#E8ECE4] mx-1" />

          <button
            type="button"
            onClick={() => setOnlyClosingSale((p) => !p)}
            className={`easy-compact px-2.5 py-1 rounded-full border text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
              onlyClosingSale
                ? 'bg-amber-600 border-amber-600 text-white'
                : 'bg-white border-[#E8ECE4] text-[#434B40]'
            }`}
          >
            <Flame className="w-3.5 h-3.5 shrink-0" />
            <span>마감특가</span>
          </button>
          <button
            type="button"
            onClick={() => setOnlySameStorePrice((p) => !p)}
            className={`easy-compact px-2.5 py-1 rounded-full border text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
              onlySameStorePrice
                ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                : 'bg-white border-[#E8ECE4] text-[#434B40]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>착한가격</span>
          </button>
          <button
            type="button"
            onClick={() => setOnlyWithPromoOrCoupon((p) => !p)}
            className={`easy-compact px-2.5 py-1 rounded-full border text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors ${
              onlyWithPromoOrCoupon
                ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                : 'bg-white border-[#E8ECE4] text-[#434B40]'
            }`}
          >
            <Ticket className="w-3.5 h-3.5 shrink-0" />
            <span>가게 이벤트·쿠폰</span>
          </button>
          <button
            type="button"
            onClick={() => setOnlyLowDeliveryFee((p) => !p)}
            className={`easy-compact px-2.5 py-1 rounded-full border text-xs font-bold cursor-pointer transition-colors ${
              onlyLowDeliveryFee
                ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                : 'bg-white border-[#E8ECE4] text-[#434B40]'
            }`}
          >
            배달비 2,000원↓
          </button>
        </div>
      </section>

      {/* Result Count Bar */}
      <div className="flex items-center justify-between px-1 text-xs font-semibold text-[#687064]">
        <span>
          {activeCategoryDef.emoji} {activeCategoryDef.label} · 검색 결과{' '}
          <strong className="text-[#1A1D1A]">{totalResultCount}</strong>
          {viewMode === 'stores' ? '개 가게' : '개 메뉴'}
        </span>
        {(selectedCategory !== 'all' ||
          searchQuery ||
          onlyClosingSale ||
          onlySameStorePrice ||
          onlyWithPromoOrCoupon ||
          onlyLowDeliveryFee) && (
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('all');
              setSearchQuery('');
              setOnlyClosingSale(false);
              setOnlySameStorePrice(false);
              setOnlyWithPromoOrCoupon(false);
              setOnlyLowDeliveryFee(false);
            }}
            className="easy-compact text-[#4E6E2A] font-bold hover:underline cursor-pointer"
          >
            필터 초기화
          </button>
        )}
      </div>

      {/* Empty State */}
      {totalResultCount === 0 ? (
        <div className="os-card rounded-2xl p-8 text-center space-y-4">
          <p className="text-base font-bold text-[#1A1D1A]">
            조건에 맞는 {viewMode === 'stores' ? '가게' : '메뉴'}가 아직 없어요
          </p>
          <p className="text-xs sm:text-sm text-[#687064]">
            {nearbyOnly
              ? '현재 동네 배달 가능 매장에 해당 조건이 없거나 필터가 좁습니다.'
              : '검색어나 필터 조건을 조금 넓혀서 다시 찾아보세요.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {nearbyOnly && (
              <button
                type="button"
                onClick={() => setNearbyOnly(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                전국 전체 매장에서 보기
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
                setOnlyClosingSale(false);
                setOnlySameStorePrice(false);
                setOnlyWithPromoOrCoupon(false);
                setOnlyLowDeliveryFee(false);
              }}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#EAF1E2] text-[#3D5720] text-xs sm:text-sm font-bold cursor-pointer"
            >
              전체 보기
            </button>
          </div>
        </div>
      ) : viewMode === 'stores' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredStores.slice(0, visibleCount).map((store) => {
            const availableStoreMenus = (menusByStore.get(store.id) ?? []).filter(
              (m) => !m.isSoldOut && m.stock > 0
            );
            const hasClosing = availableStoreMenus.some(
              (m) => (m.closingDiscountPercent ?? 0) > 0
            );
            const isNearby = Boolean(
              activeLocation && isStoreDeliverableToLocation(store, activeLocation)
            );
            const eta = store.basePrepMinutes + 8 + (store.extraPrepMinutes ?? 0);

            const sortedPreviewMenus = [...availableStoreMenus].sort((a, b) => {
              if (trimmedQuery) {
                const aHit = a.name.toLowerCase().includes(trimmedQuery) ? 1 : 0;
                const bHit = b.name.toLowerCase().includes(trimmedQuery) ? 1 : 0;
                if (aHit !== bHit) return bHit - aHit;
              }
              return (a.isSideMenu ? 1 : 0) - (b.isSideMenu ? 1 : 0);
            });
            const previewMenus = sortedPreviewMenus.slice(0, 3);

            return (
              <article
                key={store.id}
                className="os-card rounded-2xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Store Banner */}
                  <div className="p-4 flex items-start gap-3.5 border-b border-[#E8ECE4]/80">
                    <button
                      type="button"
                      onClick={() => onOpenStoreMenu(store.id)}
                      className="easy-compact w-20 h-20 rounded-2xl overflow-hidden border border-[#E8ECE4] shrink-0 cursor-pointer"
                      aria-label={`${store.name} 메뉴 보기`}
                    >
                      <FoodImage
                        src={store.image}
                        alt={store.name}
                        className="w-full h-full object-cover"
                      />
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1">
                        {isNearby && (
                          <span className="px-2 py-0.5 rounded-full bg-[#1A1D1A] text-white text-[10px] font-bold">
                            내 주변
                          </span>
                        )}
                        {!store.singlePriceRevoked && (
                          <span className="px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[10px] font-bold">
                            착한가격 · 매장 동일가
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full bg-[#F7F8F5] border border-[#E8ECE4] text-[#555E52] text-[10px] font-bold">
                          1개도 배달
                        </span>
                        {promoStoreIds.has(store.id) && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold">
                            이벤트·쿠폰
                          </span>
                        )}
                        {hasClosing && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10px] font-bold">
                            마감특가
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenStoreMenu(store.id)}
                        className="easy-compact text-left w-full cursor-pointer"
                      >
                        <h2 className="text-base font-bold text-[#1A1D1A] truncate hover:text-[#4E6E2A]">
                          {store.name}
                        </h2>
                      </button>

                      <p className="text-xs text-[#687064] truncate">
                        {store.category}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums">
                        <span className="inline-flex items-center gap-0.5 font-bold text-[#1A1D1A]">
                          <Star className="w-3.5 h-3.5 fill-[#82B440] text-[#82B440]" />
                          {(store.rating ?? 4.9).toFixed(1)}
                          <span className="font-normal text-[#687064] ml-0.5">
                            ({(store.reviewCount ?? 500).toLocaleString('ko-KR')})
                          </span>
                        </span>
                        <span className="text-[#687064]">·</span>
                        <span className="inline-flex items-center gap-0.5 font-semibold text-[#3D5720]">
                          <Clock className="w-3 h-3" />
                          {eta}분
                        </span>
                        <span className="text-[#687064]">·</span>
                        <span className="text-[#687064]">
                          배달비{' '}
                          {store.deliveryFee === 0
                            ? '무료'
                            : formatWon(store.deliveryFee)}
                          {store.deliveryFeeTiers &&
                            store.deliveryFeeTiers.length > 0 && (
                              <strong className="ml-1 text-[#4E6E2A]">
                                (구간 지원)
                              </strong>
                            )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Preview Menus List */}
                  <div className="p-3.5 space-y-2 bg-[#FAFCF8]">
                    {previewMenus.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-white border border-[#E8ECE4]"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onOpenStoreMenu(store.id, {
                              highlightMenuId: m.id,
                              preselectHighlight: true,
                            })
                          }
                          className="easy-compact min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <p className="text-xs font-bold text-[#1A1D1A] truncate">
                            {m.name}
                          </p>
                          <p className="text-[11px] font-mono font-bold text-[#4E6E2A] tabular-nums">
                            {formatWon(getEffectiveMenuPrice(m))}
                            {(m.closingDiscountPercent ?? 0) > 0 && (
                              <span className="text-amber-700 ml-1">
                                (-{m.closingDiscountPercent}%)
                              </span>
                            )}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => onAddToCart(m.id, 1, [])}
                          aria-label={`${m.name} 장바구니 담기`}
                          className="easy-compact px-2.5 py-1.5 rounded-lg bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-[11px] font-bold inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>담기</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-4 pb-4 pt-1 bg-[#FAFCF8]">
                  <button
                    type="button"
                    onClick={() => onOpenStoreMenu(store.id)}
                    className="w-full min-h-[42px] px-4 py-2 rounded-2xl bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <StoreIcon className="w-4 h-4 shrink-0" />
                    <span>
                      가게 전체 메뉴 보기 ({availableStoreMenus.length}개) →
                    </span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMenus.slice(0, visibleCount).map((m) => {
            const store = storeMap.get(m.storeId);
            if (!store) return null;
            const effectivePrice = getEffectiveMenuPrice(m);
            const wished = wishlistIds.includes(m.id);
            const eta = m.estimatedMinutes + (store.extraPrepMinutes ?? 0);
            const totalMenusInStore = (menusByStore.get(store.id) ?? []).filter(
              (item) => !item.isSoldOut && item.stock > 0
            ).length;

            return (
              <article
                key={m.id}
                className="os-card rounded-2xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-4/3 bg-[#F0F3EC]">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenStoreMenu(store.id, {
                          highlightMenuId: m.id,
                          preselectHighlight: true,
                        })
                      }
                      className="easy-compact w-full h-full block cursor-pointer"
                    >
                      <FoodImage
                        src={m.image}
                        alt={m.name}
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleWishlist(m.id)}
                      aria-label={`${m.name} 찜하기`}
                      className="easy-compact absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-sm cursor-pointer"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          wished ? 'fill-red-500 text-red-500' : 'text-[#687064]'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="p-4 space-y-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenStoreMenu(store.id)}
                      className="easy-compact text-xs font-bold text-[#4E6E2A] hover:underline truncate block max-w-full cursor-pointer"
                    >
                      {store.name} · 메뉴 {totalMenusInStore}개 →
                    </button>
                    <h3 className="text-base font-bold text-[#1A1D1A] truncate">
                      {m.name}
                    </h3>
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="font-mono font-bold text-[#1A1D1A] text-sm">
                        {formatWon(effectivePrice)}
                      </span>
                      <span className="text-[#687064]">
                        ★ {(store.rating ?? 4.9).toFixed(1)} · 약 {eta}분
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenStoreMenu(store.id, {
                        highlightMenuId: m.id,
                        preselectHighlight: true,
                      })
                    }
                    className="easy-compact min-h-[38px] px-1.5 py-1.5 rounded-xl bg-[#F7F8F5] hover:bg-[#EAF1E2] border border-[#E8ECE4] text-[11px] font-bold text-[#1A1D1A] cursor-pointer"
                  >
                    가게 메뉴
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddToCart(m.id, 1, [])}
                    className="easy-compact min-h-[38px] px-1.5 py-1.5 rounded-xl bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[11px] font-bold text-[#3D5720] inline-flex items-center justify-center gap-0.5 cursor-pointer"
                  >
                    <ShoppingBag className="w-3 h-3" />
                    <span>담기</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuickOrderMenu(m.id, 1)}
                    className="easy-compact min-h-[38px] px-1.5 py-1.5 rounded-xl bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-[11px] font-bold inline-flex items-center justify-center gap-0.5 cursor-pointer"
                  >
                    <Zap className="w-3 h-3" />
                    <span>주문</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalResultCount > visibleCount && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + 12)}
            className="min-h-[44px] px-6 py-2.5 bg-white hover:bg-[#EAF1E2] border border-[#D4E1C5] text-[#3D5720] text-xs sm:text-sm font-bold rounded-2xl shadow-2xs inline-flex items-center gap-2 cursor-pointer"
          >
            <span>더 보기 (+{totalResultCount - visibleCount})</span>
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
