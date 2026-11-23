import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bike,
  Building2,
  CheckCircle2,
  ChevronRight,
  CloudRain,
  LayoutGrid,
  MapPin,
  Megaphone,
  Mic,
  MicOff,
  Search,
  Star,
  Sun,
  Ticket,
  Wind,
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
  onAddReview?: (payload: {
    menuId: string;
    rating: number;
    content: string;
    prosTags: string[];
  }) => void;
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

type WeatherMode = 'chilly' | 'rainy' | 'clear';

const WEATHER_ORDER: WeatherMode[] = ['chilly', 'rainy', 'clear'];

function getDefaultWeatherMode(): WeatherMode {
  const month = new Date().getMonth() + 1;
  if (month >= 11 || month <= 3) return 'chilly';
  if (month === 7 || month === 8) return 'rainy';
  return 'clear';
}

const WEATHER_CONFIG: Record<
  WeatherMode,
  {
    label: string;
    shortLabel: string;
    tags: string[];
    keywords: string[];
  }
> = {
  chilly: {
    label: '쌀쌀한 날씨',
    shortLabel: '쌀쌀한 날',
    tags: ['국물', '국밥', '찌개', '김치찌개', '순두부', '짬뽕', '찜갈비', '마라', '한식'],
    keywords: ['국밥', '탕', '찌개', '짬뽕', '우동', '칼국수', '곰탕', '전골', '갈비', '마라'],
  },
  rainy: {
    label: '비 오는 날',
    shortLabel: '비 오는 날',
    tags: ['전', '국물', '짬뽕', '국밥', '떡볶이', '분식', '치킨', '찌개', '야식'],
    keywords: ['파전', '전', '국물', '짬뽕', '칼국수', '떡볶이', '치킨', '찌개', '국밥'],
  },
  clear: {
    label: '맑은 날씨',
    shortLabel: '맑은 날',
    tags: ['치킨', '돈까스', '덮밥', '초밥', '샐러드', '피자', '버거', '카페', '디저트'],
    keywords: ['치킨', '돈까스', '카츠', '덮밥', '초밥', '샐러드', '포케', '피자', '버거', '커피', '짜장'],
  },
};

interface TimeSlotContext {
  shortSlot: string;
  slotLabel: string;
  tags: string[];
  keywords: string[];
}

function getTimeSlotContext(hour: number): TimeSlotContext {
  if (hour >= 5 && hour <= 10) {
    return {
      shortSlot: '아침',
      slotLabel: '아침 시간대',
      tags: ['국밥', '국물', '담백한', '순한맛', '카페', '커피', '도시락', '김밥'],
      keywords: ['국밥', '죽', '곰탕', '커피', '아메리카노', '샌드위치', '김밥', '도시락'],
    };
  }
  if (hour >= 11 && hour <= 13) {
    return {
      shortSlot: '점심',
      slotLabel: '점심 시간대',
      tags: ['한식', '국밥', '찌개', '덮밥', '제육', '돈까스', '짜장', '짬뽕', '면'],
      keywords: ['국밥', '찌개', '덮밥', '제육', '돈가스', '돈까스', '짜장', '짬뽕', '칼국수'],
    };
  }
  if (hour >= 14 && hour <= 16) {
    return {
      shortSlot: '오후',
      slotLabel: '오후 티타임',
      tags: ['카페', '디저트', '커피', '케이크', '분식', '떡볶이', '버거', '샐러드'],
      keywords: ['커피', '라떼', '케이크', '크로플', '디저트', '떡볶이', '버거', '포케', '샐러드'],
    };
  }
  if (hour >= 17 && hour <= 20) {
    return {
      shortSlot: '저녁',
      slotLabel: '저녁 시간대',
      tags: ['치킨', '고기', '찜갈비', '한식', '국물', '마라', '피자', '중식', '족발'],
      keywords: ['치킨', '갈비', '찜갈비', '국밥', '찌개', '마라', '피자', '탕수육', '초밥', '보쌈'],
    };
  }
  return {
    shortSlot: '야식',
    slotLabel: '야식 시간대',
    tags: ['야식', '치킨', '족발', '보쌈', '떡볶이', '분식', '마라', '얼큰한', '국물'],
    keywords: ['치킨', '족발', '보쌈', '막창', '곱창', '떡볶이', '마라', '닭발', '피자', '국물'],
  };
}

function getStoreProximityScore(
  store: Store,
  activeLocation?: SavedLocation
): number {
  if (!activeLocation) return 0;
  const area = activeLocation.areaName.trim();
  if (!area) return 0;
  const tokens = area.split(/\s+/).filter((t) => t.length >= 2);
  const areaLower = store.areaLabel.toLowerCase();
  const nameLower = store.name.toLowerCase();
  let score = 0;

  tokens.forEach((tok, idx) => {
    const lower = tok.toLowerCase();
    const stem = lower.replace(/(구|동|시|군|읍|면)$/, '');
    const matched =
      areaLower.includes(lower) ||
      nameLower.includes(lower) ||
      (stem.length >= 2 && (areaLower.includes(stem) || nameLower.includes(stem)));
    if (!matched) return;

    if (idx === 0) {
      score += 4;
    } else if (/(동|읍|면)$/.test(tok) || idx === tokens.length - 1) {
      score += 14;
    } else {
      score += 10;
    }
  });

  if (score === 0 && store.region && area.includes(store.region)) {
    score += 4;
  }

  return score;
}

function extractDistanceOrDong(areaLabel: string): string {
  const kmMatch = areaLabel.match(/(\d+(?:\.\d+)?\s*km)/i);
  if (kmMatch) return kmMatch[1].replace(/\s+/g, '');
  const parenDongMatch = areaLabel.match(/\(([^)]+(?:동|읍|면))\)/);
  if (parenDongMatch) return parenDongMatch[1];
  const dongMatch = areaLabel.match(/([가-힣0-9]+(?:동|읍|면))/);
  if (dongMatch) return dongMatch[1];
  return '주변';
}

function formatCouponShort(coupon: StoreCoupon): string {
  return coupon.discountType === 'fixed'
    ? `${coupon.discountValue.toLocaleString('ko-KR')}원 할인`
    : `${coupon.discountValue}% 할인`;
}

function countContextHits(
  menu: MenuItem,
  tags: string[],
  keywords: string[]
): number {
  const menuTagSet = new Set(menu.tags);
  const searchable = `${menu.name} ${menu.description}`.toLowerCase();
  let hits = 0;
  for (const tag of tags) {
    if (menuTagSet.has(tag)) hits += 1;
  }
  for (const kw of keywords) {
    if (searchable.includes(kw.toLowerCase())) hits += 1;
  }
  return hits;
}

interface QuickReorderPick {
  menu: MenuItem;
  store: Store;
  servings: number;
  selectedOptionIds: string[];
  paymentMethod?: PaymentMethod;
  customerNote: string;
  reasonBadge: string;
  subtotal: number;
  finalDeliveryFee: number;
  effectiveMinutes: number;
}

interface AffordableStoreCard {
  store: Store;
  primaryMenu: MenuItem;
  collageImages: string[];
  storePromo?: StorePromotion;
  storeCoupon?: StoreCoupon;
  hasFreeDeliveryTier: boolean;
  isSameStorePrice: boolean;
  effectiveMinutes: number;
  distanceOrDong: string;
  deliveryFeeText: string;
  benefitPillText: string;
  minMenuPrice: number;
}

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
  onAddReview,
  activeLocation,
}: ConditionHomeProps) {
  const [activeCategoryChip, setActiveCategoryChip] =
    useState<PlatformCategoryId>('all');
  const [easySearchQuery, setEasySearchQuery] = useState<string>('');
  const [detailMenuId, setDetailMenuId] = useState<string | null>(null);
  const [showVoiceFallback, setShowVoiceFallback] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [weatherMode, setWeatherMode] = useState<WeatherMode>(() =>
    getDefaultWeatherMode()
  );
  const stopVoiceRef = useRef<(() => void) | null>(null);

  const nowHour = useMemo(() => new Date().getHours(), []);
  const timeSlot = useMemo(() => getTimeSlotContext(nowHour), [nowHour]);
  const weatherConfig = WEATHER_CONFIG[weatherMode];

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

  const hasDeliverableInArea = useMemo(
    () =>
      Boolean(
        activeLocation &&
          stores.some((s) => isStoreDeliverableToLocation(s, activeLocation))
      ),
    [stores, activeLocation]
  );

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

  const contextualQuickPicks: QuickReorderPick[] = useMemo(() => {
    const pastOrdersByMenu = new Map<string, { count: number; latest: Order }>();
    for (const ord of orders) {
      const existing = pastOrdersByMenu.get(ord.menuId);
      if (existing) {
        existing.count += 1;
      } else {
        pastOrdersByMenu.set(ord.menuId, { count: 1, latest: ord });
      }
    }

    const scored: Array<{ score: number; pick: QuickReorderPick }> = [];

    for (const m of menus) {
      if (m.isSoldOut || m.stock < 1 || m.pricePerPerson <= 0 || m.isSideMenu) {
        continue;
      }
      const store = storeMap.get(m.storeId);
      if (!store || !store.isOpen) continue;
      if (
        hasDeliverableInArea &&
        !isStoreDeliverableToLocation(store, activeLocation)
      ) {
        continue;
      }

      const pastInfo = pastOrdersByMenu.get(m.id);
      const weatherHits = countContextHits(
        m,
        weatherConfig.tags,
        weatherConfig.keywords
      );
      const timeHits = countContextHits(m, timeSlot.tags, timeSlot.keywords);

      const pastBoost = pastInfo
        ? 18 + Math.min(2, pastInfo.count - 1) * 3
        : 0;
      const weatherBoost =
        weatherHits > 0 ? 12 + Math.min(2, weatherHits - 1) * 4 : 0;
      const timeBoost = timeHits > 0 ? 12 + Math.min(2, timeHits - 1) * 4 : 0;
      const proximityBoost = getStoreProximityScore(store, activeLocation) * 0.5;
      const sameStorePriceBoost =
        !store.singlePriceRevoked &&
        m.storePrice !== null &&
        m.storePrice === m.pricePerPerson
          ? 3
          : 0;
      const effectiveMinutes =
        m.estimatedMinutes + (store.extraPrepMinutes ?? 0);
      const ratingBoost = ((store.rating ?? 4.8) - 4.5) * 3;
      const speedBoost = Math.max(0, 35 - effectiveMinutes) * 0.1;

      const score =
        pastBoost +
        weatherBoost +
        timeBoost +
        proximityBoost +
        sameStorePriceBoost +
        ratingBoost +
        speedBoost;

      const servings = pastInfo
        ? Math.min(Math.max(1, pastInfo.latest.servings), m.stock)
        : 1;
      const subtotal = getEffectiveMenuPrice(m) * servings;
      const feeInfo = calculateStoreDeliveryFee(
        store,
        subtotal,
        'partner_direct'
      );

      let reasonBadge = '동네 단골 추천';
      if (pastInfo && (weatherHits > 0 || timeHits > 0)) {
        reasonBadge = `자주 시킨 · ${timeSlot.shortSlot}`;
      } else if (pastInfo) {
        reasonBadge = '지난번 주문';
      } else if (weatherHits > 0 && timeHits > 0) {
        reasonBadge = `${weatherConfig.shortLabel} · ${timeSlot.shortSlot}`;
      } else if (weatherHits > 0) {
        reasonBadge = `${weatherConfig.shortLabel} 인기`;
      } else if (timeHits > 0) {
        reasonBadge = '이 시간 자주 주문';
      }

      scored.push({
        score,
        pick: {
          menu: m,
          store,
          servings,
          selectedOptionIds: pastInfo?.latest.selectedOptionIds ?? [],
          paymentMethod: pastInfo?.latest.paymentMethod,
          customerNote: pastInfo?.latest.customerNote ?? '',
          reasonBadge,
          subtotal,
          finalDeliveryFee: feeInfo.finalDeliveryFee,
          effectiveMinutes,
        },
      });
    }

    scored.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.01) {
        return b.score - a.score;
      }
      const ratingDiff =
        (b.pick.store.rating ?? 4.8) - (a.pick.store.rating ?? 4.8);
      if (Math.abs(ratingDiff) > 0.01) {
        return ratingDiff;
      }
      return a.pick.effectiveMinutes - b.pick.effectiveMinutes;
    });

    const selected: QuickReorderPick[] = [];
    const usedStoreIds = new Set<string>();
    const usedImages = new Set<string>();
    const usedMenuIds = new Set<string>();

    const tryPick = (requireUniqueStore: boolean, requireUniqueImage: boolean) => {
      for (const { pick } of scored) {
        if (selected.length >= 2) break;
        if (usedMenuIds.has(pick.menu.id)) continue;
        if (requireUniqueStore && usedStoreIds.has(pick.store.id)) continue;
        if (requireUniqueImage && usedImages.has(pick.menu.image)) continue;
        selected.push(pick);
        usedMenuIds.add(pick.menu.id);
        usedStoreIds.add(pick.store.id);
        usedImages.add(pick.menu.image);
      }
    };

    tryPick(true, true);
    if (selected.length < 2) tryPick(true, false);
    if (selected.length < 2) tryPick(false, false);

    return selected;
  }, [
    orders,
    menus,
    storeMap,
    hasDeliverableInArea,
    activeLocation,
    weatherConfig,
    timeSlot,
  ]);

  const affordableStoreCards: AffordableStoreCard[] = useMemo(() => {
    const scored: Array<{ score: number; card: AffordableStoreCard }> = [];

    for (const store of stores) {
      if (!store.isOpen) continue;
      if (
        hasDeliverableInArea &&
        !isStoreDeliverableToLocation(store, activeLocation)
      ) {
        continue;
      }

      const validMenus = (menusByStore.get(store.id) ?? []).filter(
        (m) =>
          !m.isSoldOut &&
          m.stock >= 1 &&
          m.pricePerPerson > 0 &&
          !m.isSideMenu &&
          (activeCategoryChip === 'all' ||
            matchesMenuPlatformCategory(activeCategoryChip, store, m))
      );

      if (validMenus.length === 0) continue;

      const sortedMenus = [...validMenus].sort((a, b) => {
        const aSame =
          !store.singlePriceRevoked &&
          a.storePrice !== null &&
          a.storePrice === a.pricePerPerson;
        const bSame =
          !store.singlePriceRevoked &&
          b.storePrice !== null &&
          b.storePrice === b.pricePerPerson;
        if (aSame !== bSame) return Number(bSame) - Number(aSame);
        const priceDiff = getEffectiveMenuPrice(a) - getEffectiveMenuPrice(b);
        if (priceDiff !== 0) return priceDiff;
        return a.estimatedMinutes - b.estimatedMinutes;
      });

      const primaryMenu = sortedMenus[0];
      const minMenuPrice = Math.min(
        ...validMenus.map((m) => getEffectiveMenuPrice(m))
      );

      const collageImages: string[] = [];
      const pushUniqueImage = (img?: string) => {
        if (!img || collageImages.includes(img) || collageImages.length >= 3) {
          return;
        }
        collageImages.push(img);
      };
      pushUniqueImage(primaryMenu.image);
      for (const m of sortedMenus.slice(1)) {
        pushUniqueImage(m.image);
      }
      pushUniqueImage(store.image);

      const storePromo = activePromoByStore.get(store.id);
      const storeCoupon = activeCouponByStore.get(store.id);
      const hasFreeDeliveryTier =
        store.deliveryFee === 0 ||
        Boolean(store.deliveryFeeTiers?.some((t) => t.deliveryFee === 0));
      const isSameStorePrice =
        !store.singlePriceRevoked &&
        primaryMenu.storePrice !== null &&
        primaryMenu.comparisonDate !== null &&
        primaryMenu.storePrice === primaryMenu.pricePerPerson;
      const effectiveMinutes =
        primaryMenu.estimatedMinutes + (store.extraPrepMinutes ?? 0);
      const distanceOrDong = extractDistanceOrDong(store.areaLabel);
      const deliveryFeeText =
        store.deliveryFee === 0
          ? '배달비 0원'
          : hasFreeDeliveryTier
            ? '배달비 0원~'
            : `배달비 ${formatWon(store.deliveryFee)}`;

      let benefitPillText = '수수료 0% · 매장 정가 그대로';
      if (hasFreeDeliveryTier && storeCoupon) {
        benefitPillText = `배달비 0원~ + ${formatCouponShort(storeCoupon)}`;
      } else if (storeCoupon) {
        benefitPillText = `매장 정가 + ${formatCouponShort(storeCoupon)}`;
      } else if (hasFreeDeliveryTier && storePromo) {
        benefitPillText = `배달비 0원~ + ${storePromo.badgeText ?? '이벤트'}`;
      } else if (hasFreeDeliveryTier) {
        benefitPillText = '매장 정가 · 조건부 배달비 0원';
      } else if (storePromo) {
        benefitPillText = `매장 정가 · ${storePromo.badgeText ?? '가게 이벤트'}`;
      }

      const score =
        getStoreProximityScore(store, activeLocation) +
        (storePromo || storeCoupon ? 4 : 0) +
        (hasFreeDeliveryTier ? 2 : 0) +
        (isSameStorePrice ? 2 : 0) +
        (collageImages.length >= 2 ? 1.5 : 0) +
        ((store.rating ?? 4.8) - 4.5) * 3 +
        Math.min(2, (store.reviewCount ?? 0) / 1000);

      scored.push({
        score,
        card: {
          store,
          primaryMenu,
          collageImages,
          storePromo,
          storeCoupon,
          hasFreeDeliveryTier,
          isSameStorePrice,
          effectiveMinutes,
          distanceOrDong,
          deliveryFeeText,
          benefitPillText,
          minMenuPrice,
        },
      });
    }

    scored.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.01) {
        return b.score - a.score;
      }
      const ratingDiff =
        (b.card.store.rating ?? 4.8) - (a.card.store.rating ?? 4.8);
      if (Math.abs(ratingDiff) > 0.01) {
        return ratingDiff;
      }
      const reviewDiff =
        (b.card.store.reviewCount ?? 0) - (a.card.store.reviewCount ?? 0);
      if (reviewDiff !== 0) {
        return reviewDiff;
      }
      return a.card.effectiveMinutes - b.card.effectiveMinutes;
    });

    return scored.slice(0, 6).map((item) => item.card);
  }, [
    stores,
    menusByStore,
    hasDeliverableInArea,
    activeLocation,
    activeCategoryChip,
    activePromoByStore,
    activeCouponByStore,
  ]);

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

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Hero: Value Strip + Voice CTA + Manual Search */}
      <section className="os-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#3D5720]">
            <CheckCircle2 className="w-4 h-4 text-[#4E6E2A] shrink-0" />
            <span>수수료 0% · 매장 동일가 · 최소주문 없음</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F7F8F5] border border-[#E8ECE4] text-xs font-medium text-[#555E52]">
            <MapPin className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
            <span>{activeLocation?.areaName ?? '대구 북구 산격동'}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={handleVoiceTrigger}
          className={`w-full min-h-[60px] px-5 py-3.5 rounded-xl font-bold text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-sm transition-colors cursor-pointer ${
            isListening
              ? 'bg-red-600 text-white'
              : 'bg-[#4E6E2A] hover:bg-[#3F5A21] text-white'
          }`}
        >
          {isListening ? (
            <MicOff className="w-5 h-5 shrink-0" />
          ) : (
            <Mic className="w-5 h-5 shrink-0" />
          )}
          <span>
            {isListening
              ? '말씀하세요... 듣고 있어요 (누르면 중지)'
              : '누르고 먹고 싶은 음식을 말하세요'}
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
            <Search className="w-4 h-4 text-[#4E6E2A] absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={easySearchQuery}
              onChange={(e) => setEasySearchQuery(e.target.value)}
              placeholder="가게명·메뉴명 직접 검색 (예: 국밥, 치킨)"
              className="w-full min-h-[46px] pl-10 pr-4 bg-[#F7F8F5] border border-[#E8ECE4] rounded-xl text-sm sm:text-base text-[#1A1D1A] placeholder:text-[#4A5348]"
            />
          </div>
          <button
            type="submit"
            className="min-h-[46px] px-5 rounded-xl bg-[#1A1D1A] hover:bg-[#2F352F] text-white text-sm sm:text-base font-semibold whitespace-nowrap cursor-pointer shrink-0 transition-colors"
          >
            검색
          </button>
        </form>

        {showVoiceFallback && (
          <div className="p-4 bg-[#F7F8F5] border border-[#E8ECE4] rounded-xl space-y-2.5">
            <p className="text-xs sm:text-sm font-semibold text-[#1A1D1A]">
              마이크 대신 아래 문장을 눌러도 바로가 찾아드려요
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
                  className="w-full px-4 py-2.5 bg-white hover:bg-[#EAF1E2] border border-[#E8ECE4] rounded-xl text-left text-sm font-medium text-[#1A1D1A] cursor-pointer transition-colors"
                >
                  “{sample.text}”
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Separated Category Grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-base sm:text-lg font-bold text-[#1A1D1A]">
            카테고리
          </h2>
          {onOpenBrowse && (
            <button
              type="button"
              onClick={() => onOpenBrowse({ category: 'all' })}
              className="easy-compact inline-flex items-center gap-0.5 text-xs sm:text-sm font-semibold text-[#4E6E2A] hover:text-[#3D5720] cursor-pointer"
            >
              <span>전체 보기</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {EASY_GRID_CATEGORIES.map((cat) => {
            const isSelected = !onOpenBrowse && activeCategoryChip === cat.id;
            return (
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
                className={`os-card-interactive min-h-[64px] px-3 py-2.5 rounded-xl text-sm sm:text-base font-bold flex items-center sm:flex-col justify-center gap-2 sm:gap-1.5 cursor-pointer ${
                  isSelected
                    ? '!border-[#4E6E2A] !bg-[#EAF1E2]/70 text-[#3D5720]'
                    : 'text-[#1A1D1A]'
                }`}
              >
                {cat.id === 'all' ? (
                  <LayoutGrid className="w-5 h-5 text-[#4E6E2A] shrink-0" />
                ) : (
                  <span className="text-xl leading-none">{cat.emoji}</span>
                )}
                <span className="truncate">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Simple Horizontal Banners: B2B Enterprise Group Order & Life Errands */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onOpenB2BMeal}
          className="os-card-interactive min-h-[72px] w-full p-4 rounded-2xl flex items-center justify-between gap-3 text-left cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#EAF1E2] text-[#4E6E2A] flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-bold text-[#1A1D1A] truncate">
                B2B 기업 단체 선주문
              </div>
              <div className="text-xs text-[#444D42] mt-0.5 truncate">
                원하는 시간 예약 · 카드/계좌 결제 · 거래명세표
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#444D42] shrink-0" />
        </button>

        <button
          type="button"
          onClick={onOpenErrand}
          className="os-card-interactive min-h-[72px] w-full p-4 rounded-2xl flex items-center justify-between gap-3 text-left cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#EAF1E2] text-[#4E6E2A] flex items-center justify-center shrink-0">
              <Bike className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-bold text-[#1A1D1A] truncate">
                생활 심부름
              </div>
              <div className="text-xs text-[#444D42] mt-0.5 truncate">
                동네 장보기 · 세탁물 · 픽업 대행 (매칭 100원)
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#444D42] shrink-0" />
        </button>
      </section>

      {/* Owner Store Events & Coupons Slim Banner Strip */}
      {featuredStoreEvents.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-bold text-[#1A1D1A] inline-flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-[#4E6E2A] shrink-0" />
              <span>우리 동네 가게 이벤트 · 쿠폰</span>
            </h2>
            {onOpenBrowse && (
              <button
                type="button"
                onClick={() => onOpenBrowse({ category: 'all' })}
                className="easy-compact inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#4E6E2A] hover:text-[#3D5720] cursor-pointer"
              >
                <span>더 보기</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-0.5">
            {featuredStoreEvents.map(({ store, promo, coupon, isNearby }) => {
              const headline = coupon?.label ?? promo?.title ?? '';
              return (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => onOpenStoreMenu?.(store.id)}
                  className="easy-compact shrink-0 w-[86%] sm:w-[calc(50%-4px)] snap-start px-3 py-2 rounded-xl bg-gradient-to-r from-[#EFF5E7] via-[#F7FAF3] to-[#FFF9EC] border border-[#D8E5C8] hover:border-[#4E6E2A]/60 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="px-1.5 py-1 rounded-md bg-[#4E6E2A] text-white text-[11.5px] leading-none font-bold shrink-0">
                      {promo?.badgeText ?? '쿠폰'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-[11.5px] leading-tight text-[#4E6E2A] font-semibold">
                        <span className="truncate">{store.name}</span>
                        {isNearby && (
                          <span className="shrink-0 text-[#3D5720]">· 주변</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[12.5px] leading-tight font-bold text-[#1A1D1A] mt-0.5">
                        {coupon && (
                          <Ticket className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
                        )}
                        <span className="truncate">{headline}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#4E6E2A] shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Weather & Time Contextual Quick Reorder (2-Card Row) */}
      {contextualQuickPicks.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-bold text-[#1A1D1A] inline-flex items-center gap-1.5">
              <Zap className="w-4 h-4 fill-[#82B440] text-[#4E6E2A] shrink-0" />
              <span>자주 시키던 메뉴 바로 시키기</span>
            </h2>
            <button
              type="button"
              onClick={() =>
                setWeatherMode((prev) => {
                  const idx = WEATHER_ORDER.indexOf(prev);
                  return WEATHER_ORDER[(idx + 1) % WEATHER_ORDER.length];
                })
              }
              title="날씨 조건 전환하기"
              className="easy-compact inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-[11.5px] font-semibold cursor-pointer transition-colors"
            >
              {weatherMode === 'chilly' ? (
                <Wind className="w-3.5 h-3.5 shrink-0" />
              ) : weatherMode === 'rainy' ? (
                <CloudRain className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Sun className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {weatherConfig.shortLabel} · {nowHour}시 {timeSlot.shortSlot}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {contextualQuickPicks.map((pick) => {
              const totalWithDelivery = pick.subtotal + pick.finalDeliveryFee;
              return (
                <article
                  key={pick.menu.id}
                  className="os-card rounded-2xl overflow-hidden flex flex-col"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailMenuId(pick.menu.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailMenuId(pick.menu.id);
                      }
                    }}
                    aria-label={`${pick.menu.name} 상세 보기`}
                    className="relative h-24 sm:h-32 w-full overflow-hidden cursor-pointer group shrink-0"
                  >
                    <FoodImage
                      src={pick.menu.image}
                      alt={pick.menu.name}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                    />
                    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-white/95 backdrop-blur-sm text-[#3D5720] text-[11.5px] font-bold shadow-sm max-w-[calc(100%-12px)] truncate">
                      {pick.reasonBadge}
                    </span>
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/65 text-white text-[11.5px] font-semibold tabular-nums">
                      {pick.effectiveMinutes}분
                    </span>
                  </div>

                  <div className="p-2.5 sm:p-3 flex-1 flex flex-col justify-between gap-2">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetailMenuId(pick.menu.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDetailMenuId(pick.menu.id);
                        }
                      }}
                      className="min-w-0 cursor-pointer space-y-0.5"
                    >
                      <p className="text-[11.5px] font-semibold text-[#4E6E2A] truncate">
                        {pick.store.name}
                      </p>
                      <h3 className="text-[13.5px] sm:text-[14.5px] font-bold text-[#1A1D1A] truncate">
                        {pick.menu.name}
                      </h3>
                      <p className="text-[12px] font-bold text-[#1A1D1A] tabular-nums truncate">
                        {formatWon(totalWithDelivery)}
                        <span className="text-[#555E52] font-medium">
                          {' '}
                          ·{' '}
                          {pick.finalDeliveryFee === 0
                            ? '배달 0원'
                            : `배달 ${formatWon(pick.finalDeliveryFee)}`}
                        </span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        triggerQuickPay({
                          menuId: pick.menu.id,
                          servings: pick.servings,
                          selectedOptionIds: pick.selectedOptionIds,
                          paymentMethod: pick.paymentMethod,
                          customerNote: pick.customerNote,
                        })
                      }
                      className="easy-compact w-full py-1.5 sm:py-2 px-2.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-[12px] font-semibold rounded-xl inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5 shrink-0" />
                      <span>바로 주문</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Nearby Affordable-Price Stores (Compact 2-Column Food Collage Grid) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base sm:text-lg font-bold text-[#1A1D1A]">
            지금 바로 배달되는 착한가격 맛집
          </h2>
          {onOpenBrowse && (
            <button
              type="button"
              onClick={() => onOpenBrowse({ category: 'all' })}
              className="easy-compact inline-flex items-center gap-0.5 text-[12px] sm:text-sm font-semibold text-[#4E6E2A] hover:text-[#3D5720] cursor-pointer shrink-0"
            >
              <span>더 찾아보기</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {affordableStoreCards.length === 0 ? (
          <div className="os-card rounded-2xl p-6 text-center text-sm text-[#555E52]">
            선택한 조건에 맞는 배달 가능 매장을 찾지 못했어요.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
            {affordableStoreCards.map((card) => {
              const storeRating = card.store.rating ?? 4.8;
              const storeReviewCount = card.store.reviewCount ?? 120;
              return (
                <article
                  key={card.store.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (onOpenStoreMenu) {
                      onOpenStoreMenu(card.store.id, {
                        highlightMenuId: card.primaryMenu.id,
                      });
                    } else {
                      setDetailMenuId(card.primaryMenu.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onOpenStoreMenu) {
                        onOpenStoreMenu(card.store.id, {
                          highlightMenuId: card.primaryMenu.id,
                        });
                      } else {
                        setDetailMenuId(card.primaryMenu.id);
                      }
                    }
                  }}
                  aria-label={`${card.store.name} 메뉴 및 혜택 보기`}
                  className="bg-white rounded-2xl p-1.5 sm:p-2 border border-[#E8ECE4]/90 shadow-[0_1px_3px_rgba(26,29,26,0.04)] hover:border-[#C7D7B5] hover:shadow-[0_6px_16px_-4px_rgba(26,29,26,0.08)] transition-all cursor-pointer group flex flex-col"
                >
                  {/* Asymmetric Food Photo Collage */}
                  <div className="h-[108px] sm:h-[148px] w-full rounded-xl overflow-hidden bg-white">
                    {card.collageImages.length >= 3 ? (
                      <div className="grid grid-cols-[2.1fr_1fr] gap-[2px] w-full h-full bg-white">
                        <div className="w-full h-full overflow-hidden">
                          <FoodImage
                            src={card.collageImages[0]}
                            alt={card.primaryMenu.name}
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                          />
                        </div>
                        <div className="grid grid-rows-2 gap-[2px] w-full h-full bg-white">
                          <div className="w-full h-full overflow-hidden">
                            <FoodImage
                              src={card.collageImages[1]}
                              alt={card.store.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="w-full h-full overflow-hidden">
                            <FoodImage
                              src={card.collageImages[2]}
                              alt={card.store.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>
                      </div>
                    ) : card.collageImages.length === 2 ? (
                      <div className="grid grid-cols-[1.85fr_1fr] gap-[2px] w-full h-full bg-white">
                        <div className="w-full h-full overflow-hidden">
                          <FoodImage
                            src={card.collageImages[0]}
                            alt={card.primaryMenu.name}
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                          />
                        </div>
                        <div className="w-full h-full overflow-hidden">
                          <FoodImage
                            src={card.collageImages[1]}
                            alt={card.store.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full overflow-hidden">
                        <FoodImage
                          src={card.collageImages[0] ?? card.store.image}
                          alt={card.primaryMenu.name}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                        />
                      </div>
                    )}
                  </div>

                  {/* Overlapping Baro Gradient Benefit Pill */}
                  <div className="-mt-3 sm:-mt-3.5 relative z-10 mx-1 sm:mx-2">
                    <div className="rounded-full bg-gradient-to-r from-[#2D4715] via-[#4E6E2A] to-[#6B9B34] px-2 sm:px-3 py-0.5 sm:py-1 shadow-sm flex items-center justify-center gap-1">
                      <span className="text-[11.5px] font-extrabold text-[#DFF2B8] tracking-tight shrink-0">
                        Baro
                      </span>
                      <span className="text-[11.5px] font-bold text-white truncate">
                        {card.benefitPillText}
                      </span>
                    </div>
                  </div>

                  {/* Compact Store Metadata */}
                  <div className="pt-2 px-0.5 sm:px-1 pb-0.5 space-y-1 flex-1 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <h3 className="text-[13.5px] sm:text-[15px] font-extrabold text-[#1A1D1A] group-hover:text-[#3D5720] transition-colors truncate">
                          {card.store.name}
                        </h3>
                        {card.storeCoupon && (
                          <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[11.5px] font-bold shrink-0">
                            +쿠폰
                          </span>
                        )}
                      </div>
                      <span className="text-[12px] font-semibold text-[#555E52] shrink-0 tabular-nums">
                        {card.effectiveMinutes}분
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11.5px] sm:text-[12.5px] text-[#444D42] truncate">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                      <span className="font-bold text-[#1A1D1A] tabular-nums">
                        {storeRating.toFixed(1)}
                      </span>
                      <span className="tabular-nums">
                        ({storeReviewCount.toLocaleString('ko-KR')})
                      </span>
                      <span>·</span>
                      <span className="truncate">{card.distanceOrDong}</span>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <span className="text-[11.5px] sm:text-[12px] font-bold text-[#1A1D1A] truncate">
                        {card.deliveryFeeText}
                      </span>
                      <span className="text-[11.5px] sm:text-[12px] font-semibold text-[#444D42] shrink-0 tabular-nums">
                        {formatWon(card.minMenuPrice)}~
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {onOpenBrowse && (
          <button
            type="button"
            onClick={() => onOpenBrowse({ category: 'all' })}
            className="w-full min-h-[48px] px-5 py-3 bg-white hover:bg-[#EAF1E2] border border-[#D4E1C5] text-[#3D5720] text-sm sm:text-base font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <span>전체 카테고리 · 맛집 더 찾아보기</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </section>

      <MenuDetailReviewModal
        menu={detailMenu}
        store={detailStore}
        storeMenuCount={detailStoreMenuCount}
        reviews={reviews}
        reviewReplies={reviewReplies}
        onAddReview={onAddReview}
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
