import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Footprints,
  Heart,
  Mic,
  MicOff,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  AVAILABLE_TAGS,
  DAILY_WEATHER_CURATIONS,
  INITIAL_REVIEWS,
  PRESET_QUERIES,
  VOICE_TRANSCRIPT_SAMPLES,
} from '../data/seedData';
import {
  MenuItem,
  Order,
  ParsedCondition,
  PaymentMethod,
  RecommendationMatch,
  SavedLocation,
  Store,
  SuperAppTab,
  UserPreferences,
} from '../types/alle';
import {
  evaluateRecommendations,
  formatWon,
  getEffectiveMenuPrice,
} from '../utils/parser';
import { estimateCompetitorSavings } from '../utils/pricing';
import { startKoreanVoiceInput } from '../utils/voice';
import { AlleBotIllustration } from './AlleBrand';
import { FoodImage } from './FoodImage';

interface ConditionHomeProps {
  rawInput: string;
  parsedCondition: ParsedCondition;
  preferences: UserPreferences;
  stores: Store[];
  menus: MenuItem[];
  orders: Order[];
  stampCount: number;
  wishlistIds: string[];
  easyMode?: boolean;
  onToggleEasyMode?: () => void;
  onToggleWishlist: (menuId: string) => void;
  onOpenAiChat: (initialPrompt?: string) => void;
  onEarnStamp: () => void;
  onRawInputChange: (next: string) => void;
  onUpdateParsedCondition: (next: ParsedCondition) => void;
  onSubmitSearch: (confirmedCondition: ParsedCondition) => void;
  onQuickSelectMenu: (menuId: string) => void;
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
  onAddToCart?: (
    menuId: string,
    quantity?: number,
    selectedOptionIds?: string[]
  ) => void;
  onOpenSuperApp: (tab: SuperAppTab) => void;
  onSavePreferences: (next: UserPreferences) => void;
  onApplyPreferencesToInput: (prefs: UserPreferences) => void;
  activeLocation?: SavedLocation;
  onOpenLocationPicker?: () => void;
}

const QUICK_CATEGORY_CHIPS = [
  { id: 'all', label: '전체' },
  { id: 'closing', label: '🔥 마감특가' },
  { id: 'korean', label: '한식·국밥' },
  { id: 'chicken', label: '치킨' },
  { id: 'chinese', label: '중식·마라' },
  { id: 'japanese', label: '일식·돈까스' },
  { id: 'western', label: '피자·샐러드' },
  { id: 'snack', label: '분식·야식' },
  { id: 'cafe', label: '카페·디저트' },
  { id: 'market', label: '전통시장' },
] as const;

type QuickCategoryId = (typeof QUICK_CATEGORY_CHIPS)[number]['id'];

const EASY_CATEGORIES = [
  { id: 'korean' as QuickCategoryId, emoji: '🍲', label: '따뜻한 국물' },
  { id: 'chicken' as QuickCategoryId, emoji: '🍗', label: '바삭 치킨' },
  { id: 'chinese' as QuickCategoryId, emoji: '🍜', label: '중식·분식' },
  { id: 'cafe' as QuickCategoryId, emoji: '☕', label: '커피·간식' },
];

function matchesCategoryChip(
  chipId: QuickCategoryId,
  store: Store,
  menu: MenuItem
): boolean {
  if (chipId === 'all') return true;
  if (chipId === 'closing') return (menu.closingDiscountPercent ?? 0) > 0;
  const grp = store.categoryGroup ?? '';
  if (chipId === 'korean') {
    return grp.includes('한식') || menu.tags.includes('한식');
  }
  if (chipId === 'chicken') {
    return grp === '치킨' || menu.tags.includes('치킨');
  }
  if (chipId === 'chinese') {
    return grp === '중식' || menu.tags.includes('중식');
  }
  if (chipId === 'japanese') {
    return grp.includes('일식') || menu.tags.includes('일식');
  }
  if (chipId === 'western') {
    return (
      grp.includes('피자') ||
      grp.includes('양식') ||
      menu.tags.includes('양식') ||
      menu.tags.includes('샐러드')
    );
  }
  if (chipId === 'snack') {
    return grp.includes('분식') || grp.includes('야식') || menu.tags.includes('분식');
  }
  if (chipId === 'cafe') {
    return grp.includes('카페') || menu.tags.includes('카페') || menu.tags.includes('디저트');
  }
  if (chipId === 'market') {
    return grp.includes('전통시장') || store.minOrderAmount === 0;
  }
  return true;
}

function VoiceWaveformIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="32"
      height="22"
      viewBox="0 0 32 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect x="2" y="8" width="3" height="6" rx="1.5" fill="currentColor" opacity="0.45" />
      <rect x="8" y="4" width="3" height="14" rx="1.5" fill="currentColor" opacity="0.65" />
      <rect x="14" y="1" width="3" height="20" rx="1.5" fill="currentColor" opacity="0.85" />
      <rect x="20" y="5" width="3" height="12" rx="1.5" fill="currentColor" opacity="0.65" />
      <rect x="26" y="8" width="3" height="6" rx="1.5" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

export function ConditionHome({
  rawInput,
  parsedCondition,
  preferences,
  stores,
  menus,
  orders,
  stampCount,
  wishlistIds,
  easyMode = false,
  onToggleEasyMode,
  onToggleWishlist,
  onOpenAiChat,
  onRawInputChange,
  onUpdateParsedCondition,
  onSubmitSearch,
  onQuickSelectMenu,
  onQuickReorderToConfirm,
  onOpenQuickPay,
  onAddToCart,
  onOpenSuperApp,
  onSavePreferences,
  onApplyPreferencesToInput,
  activeLocation,
}: ConditionHomeProps) {
  const [activeCategoryChip, setActiveCategoryChip] =
    useState<QuickCategoryId>('all');
  const [showAdvancedInput, setShowAdvancedInput] = useState(false);
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [draftPrefs, setDraftPrefs] = useState<UserPreferences>(preferences);
  const [prefsSavedNotice, setPrefsSavedNotice] = useState(false);
  const [showVoiceFallback, setShowVoiceFallback] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const stopVoiceRef = useRef<(() => void) | null>(null);
  const recommendationSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => {
      stopVoiceRef.current?.();
    };
  }, []);

  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const autoRecommendations = useMemo(() => {
    const baseCondition: ParsedCondition =
      rawInput.trim().length > 0
        ? parsedCondition
        : {
            rawInput: '',
            servings: 1,
            tags: [],
            excludeTags: [],
            maxBudget: null,
            maxMinutes: null,
            unknownTokens: [],
            needsConfirmation: false,
          };
    return evaluateRecommendations(baseCondition, stores, menus, activeLocation);
  }, [rawInput, parsedCondition, stores, menus, activeLocation]);

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

  const displayedRecommendations: RecommendationMatch[] = useMemo(() => {
    if (activeCategoryChip === 'all') {
      return autoRecommendations.matches.slice(0, 6);
    }
    const wideList = evaluateRecommendations(
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
        return Boolean(st && matchesCategoryChip(activeCategoryChip, st, m));
      }),
      activeLocation
    );
    return wideList.matches.slice(0, 6);
  }, [
    activeCategoryChip,
    autoRecommendations.matches,
    stores,
    menus,
    storeMap,
    activeLocation,
  ]);

  const quickReorderCandidate = useMemo(() => {
    for (const ord of orders) {
      const m = menus.find((item) => item.id === ord.menuId);
      const st = m ? storeMap.get(m.storeId) : undefined;
      if (m && st && st.isOpen && !m.isSoldOut && m.stock >= 1) {
        return {
          menu: m,
          store: st,
          servings: Math.min(ord.servings, m.stock),
          selectedOptionIds: ord.selectedOptionIds,
          selectedOptionNames: ord.selectedOptionNames,
          paymentMethod: ord.paymentMethod,
          customerNote: ord.customerNote,
        };
      }
    }
    const fallbackMenu = menus.find((m) => {
      const st = storeMap.get(m.storeId);
      return st?.isOpen && !m.isSoldOut && m.stock >= 1;
    });
    if (!fallbackMenu) return null;
    const fallbackStore = storeMap.get(fallbackMenu.storeId);
    if (!fallbackStore) return null;
    return {
      menu: fallbackMenu,
      store: fallbackStore,
      servings: 1,
      selectedOptionIds: [] as string[],
      selectedOptionNames: [] as string[],
      paymentMethod: undefined,
      customerNote: preferences.memoNote,
    };
  }, [orders, menus, storeMap, preferences.memoNote]);

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
        onRawInputChange(text);
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

  const toggleConditionTag = (tag: string) => {
    const exists = parsedCondition.tags.includes(tag);
    const nextTags = exists
      ? parsedCondition.tags.filter((t) => t !== tag)
      : [...parsedCondition.tags, tag];
    onUpdateParsedCondition({
      ...parsedCondition,
      tags: nextTags,
      unknownTokens: [],
      needsConfirmation: false,
    });
  };

  const handleConfirmUnknownAndSearch = () => {
    const confirmed: ParsedCondition = {
      ...parsedCondition,
      unknownTokens: [],
      needsConfirmation: false,
    };
    onUpdateParsedCondition(confirmed);
    onSubmitSearch(confirmed);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitSearch(parsedCondition);
  };

  const toggleDraftPrefTag = (tag: string) => {
    setDraftPrefs((prev) => ({
      ...prev,
      favoriteTags: prev.favoriteTags.includes(tag)
        ? prev.favoriteTags.filter((t) => t !== tag)
        : [...prev.favoriteTags, tag],
    }));
  };

  const handleSavePrefsSubmit = () => {
    const safeServings = Math.max(1, Math.floor(draftPrefs.defaultServings || 1));
    const safeBudget = Math.max(
      1000,
      Math.floor(draftPrefs.defaultMaxBudget || 10000)
    );
    const safeMinutes = Math.max(5, Math.floor(draftPrefs.defaultMaxMinutes || 30));
    const cleaned: UserPreferences = {
      ...draftPrefs,
      defaultServings: safeServings,
      defaultMaxBudget: safeBudget,
      defaultMaxMinutes: safeMinutes,
    };
    onSavePreferences(cleaned);
    setDraftPrefs(cleaned);
    setEditingPrefs(false);
    setPrefsSavedNotice(true);
    window.setTimeout(() => setPrefsSavedNotice(false), 2500);
  };

  const closingSaleItems = useMemo(() => {
    return menus
      .filter((m) => {
        const st = storeMap.get(m.storeId);
        return (
          Boolean(st?.isOpen) &&
          !m.isSoldOut &&
          m.stock > 0 &&
          (m.closingDiscountPercent ?? 0) > 0
        );
      })
      .slice(0, 4)
      .map((m) => ({
        menu: m,
        store: storeMap.get(m.storeId)!,
        discountedPrice: getEffectiveMenuPrice(m),
      }));
  }, [menus, storeMap]);

  const quickServices = [
    {
      id: 'market-bundle',
      label: '전통시장·골목 한 바구니 묶음',
      icon: Sparkles,
      onClick: () => onOpenSuperApp(SuperAppTab.MARKET_BUNDLE),
    },
    {
      id: 'group-buy',
      label: '이웃 공동구매 · 배달비 1/N',
      icon: Users,
      onClick: () => onOpenSuperApp(SuperAppTab.GROUP_BUY),
    },
    {
      id: 'reserve',
      label: '오피스 B2B 15분 예약',
      icon: CalendarClock,
      onClick: () => onOpenSuperApp(SuperAppTab.B2B),
    },
    {
      id: 'errand',
      label: '생활 심부름',
      icon: Footprints,
      onClick: () => onOpenSuperApp(SuperAppTab.ERRAND),
    },
  ];

  // ============================================================================
  // EASY MODE HOME (Large Text, Voice-First, Max 2~3 Clear Choices)
  // ============================================================================
  if (easyMode) {
    const easyPicks = (
      activeCategoryChip === 'all'
        ? allAvailableByLocation
        : displayedRecommendations
    ).slice(0, 3);

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <section className="bg-[#EAF1E2] border-2 border-[#82B440] rounded-3xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-[#3D5720]">
              큰 글씨 · 쉬운 주문 모드 ({activeLocation?.areaName ?? '서울 강남구 역삼동'})
            </span>
            {onToggleEasyMode && (
              <button
                type="button"
                onClick={onToggleEasyMode}
                className="px-4 py-2 rounded-xl bg-white border border-[#D4E1C5] text-sm font-bold text-[#1A1D1A] cursor-pointer"
              >
                일반 화면으로
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleVoiceTrigger}
            className={`w-full min-h-[84px] px-6 py-5 rounded-3xl font-extrabold text-lg sm:text-xl flex items-center justify-center gap-3 shadow-md transition-colors cursor-pointer ${
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

          {showVoiceFallback && (
            <div className="p-4 bg-white border border-[#D4E1C5] rounded-2xl space-y-2.5">
              <p className="text-sm font-bold text-[#1A1D1A]">
                마이크 대신 아래 글자를 눌러도 바로 찾아드려요
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

          <div className="grid grid-cols-2 gap-3">
            {EASY_CATEGORIES.map((cat) => {
              const active = activeCategoryChip === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() =>
                    setActiveCategoryChip((prev) =>
                      prev === cat.id ? 'all' : cat.id
                    )
                  }
                  className={`min-h-[72px] px-4 py-3 rounded-2xl border-2 text-base font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                      : 'bg-white border-[#D4E1C5] text-[#1A1D1A] hover:bg-[#F7F8F5]'
                  }`}
                >
                  <span className="text-2xl">{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {quickReorderCandidate && (
          <section className="bg-white border-2 border-[#4E6E2A] rounded-3xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-[#4E6E2A]">
              <Zap className="w-5 h-5 fill-[#82B440]" />
              <span>자주 시키던 메뉴 바로 시키기</span>
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
                  {quickReorderCandidate.servings}인분 ·{' '}
                  {formatWon(
                    getEffectiveMenuPrice(quickReorderCandidate.menu) *
                      quickReorderCandidate.servings +
                      quickReorderCandidate.store.deliveryFee
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
              className="w-full min-h-[58px] px-5 py-3 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-lg font-extrabold rounded-2xl cursor-pointer"
            >
              ⚡ 지난번 그대로 바로 주문하기
            </button>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-[#1A1D1A]">
              지금 바로 배달되는 근처 맛집
            </h2>
            {activeCategoryChip !== 'all' && (
              <button
                type="button"
                onClick={() => setActiveCategoryChip('all')}
                className="px-3 py-1.5 rounded-xl bg-[#EAF1E2] text-sm font-bold text-[#3D5720] cursor-pointer"
              >
                전체 보기
              </button>
            )}
          </div>

          <div className="space-y-4">
            {easyPicks.map((item) => (
              <article
                key={item.menu.id}
                className="bg-white border border-[#E8ECE4] rounded-3xl p-5 space-y-4 shadow-sm"
              >
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
                      {item.isSameStorePrice && ' (매장가 그대로)'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    triggerQuickPay({
                      menuId: item.menu.id,
                      servings: item.servings,
                    })
                  }
                  className="w-full min-h-[56px] bg-[#EAF1E2] hover:bg-[#DCE7CF] border-2 border-[#4E6E2A] text-[#3D5720] text-lg font-extrabold rounded-2xl cursor-pointer"
                >
                  바로 시키기
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // ============================================================================
  // STANDARD MODE HOME
  // ============================================================================
  const quickReorderUnitPrice = quickReorderCandidate
    ? getEffectiveMenuPrice(quickReorderCandidate.menu)
    : 0;
  const quickReorderTotal = quickReorderCandidate
    ? quickReorderUnitPrice * quickReorderCandidate.servings +
      quickReorderCandidate.store.deliveryFee
    : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* 1. Soft Sage Green Hero Card: 'AI에게 주문해보세요' */}
      <section
        aria-label="AI에게 주문해보세요"
        className="bg-[#EAF1E2] border border-[#DCE7CF] shadow-sm rounded-3xl p-5 sm:p-7 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#3D5720]">
            <Sparkles className="w-3.5 h-3.5 text-[#82B440] shrink-0" />
            <span>
              Zero-UI 1줄 주문 · {activeLocation?.areaName ?? '서울 강남구 역삼동'}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#687064] tabular-nums">
            <Clock className="w-3.5 h-3.5 text-[#4E6E2A]" />
            <span>기존 20번 터치</span>
            <span aria-hidden="true">→</span>
            <strong className="text-[#3D5720]">1줄 · 15초</strong>
          </span>
        </div>

        {/* Left Mini Robot Illustration + Headline & Spoken Prompts */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="shrink-0">
            <AlleBotIllustration size="md" />
          </div>
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl sm:text-[30px] font-extrabold tracking-tight text-[#1A1D1A] leading-tight">
              AI에게 주문해보세요
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-[#687064]">
              <button
                type="button"
                onClick={() => onOpenAiChat('비 오는데 전이나 국물')}
                className="hover:text-[#3D5720] transition-colors cursor-pointer"
              >
                “비 오는데 전이나 국물”
              </button>
              <button
                type="button"
                onClick={() => onOpenAiChat('안 매운 국물 20분 이내')}
                className="hover:text-[#3D5720] transition-colors cursor-pointer"
              >
                “안 매운 국물 20분 이내”
              </button>
              <button
                type="button"
                onClick={() => onOpenAiChat('치킨 시켜줘')}
                className="hover:text-[#3D5720] transition-colors cursor-pointer"
              >
                “치킨 시켜줘”
              </button>
            </div>
          </div>
        </div>

        {/* Direct 1-Line Zero-UI Input + Clear X + Voice CTA */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = rawInput.trim();
            if (q) {
              onOpenAiChat(q);
            } else {
              onOpenAiChat();
            }
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 text-[#4E6E2A] absolute left-4 pointer-events-none" />
            <input
              type="text"
              value={rawInput}
              onChange={(e) => onRawInputChange(e.target.value)}
              placeholder="예: 어제 야근해서 안 매운 따뜻한 국물 2인, 25분 이내"
              className="w-full min-h-[48px] pl-10 pr-10 py-2.5 bg-white border border-[#D4E1C5] rounded-full text-sm text-[#1A1D1A] placeholder:text-[#687064] shadow-2xs"
            />
            {rawInput.trim().length > 0 && (
              <button
                type="button"
                onClick={() => onRawInputChange('')}
                aria-label="입력 지우기"
                className="absolute right-3 w-7 h-7 rounded-full hover:bg-[#F0F3EC] text-[#687064] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex-1 sm:flex-initial min-h-[48px] px-5 py-2.5 rounded-full bg-[#4E6E2A] hover:bg-[#3F5A21] text-white font-bold text-sm inline-flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>AI 바로 찾기</span>
            </button>
            <button
              type="button"
              onClick={handleVoiceTrigger}
              aria-label={isListening ? '음성 듣기 중지' : '음성으로 주문하기'}
              className={`min-w-[48px] min-h-[48px] px-3.5 rounded-full border inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                isListening
                  ? 'bg-red-600 border-red-600 text-white'
                  : 'bg-white border-[#D4E1C5] text-[#4E6E2A] hover:bg-[#F7F8F5]'
              }`}
            >
              {isListening ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          </div>
        </form>

        <div className="flex items-center justify-center gap-3 text-xs text-[#687064]">
          <button
            type="button"
            onClick={() => onOpenAiChat()}
            className="inline-flex items-center gap-1 font-semibold text-[#3D5720] hover:text-[#4E6E2A] cursor-pointer"
          >
            <VoiceWaveformIcon className="text-[#82B440] w-5 h-3.5" />
            <span>대화형 AI 주문 열기</span>
          </button>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            전국 매장 {stores.filter((s) => s.isOpen).length}곳 영업 중 · 스탬프 {stampCount}개
          </span>
        </div>

        {isListening && (
          <div className="p-3.5 bg-white border border-[#D4E1C5] rounded-2xl flex items-center justify-between gap-3 text-xs sm:text-sm">
            <span className="font-semibold text-[#3D5720]">
              듣고 있어요. 메뉴, 인원, 예산을 편하게 말씀해 주세요.
            </span>
            <button
              type="button"
              onClick={handleVoiceTrigger}
              className="px-3 py-1 bg-[#EAF1E2] rounded-xl text-xs font-semibold text-[#3D5720] cursor-pointer shrink-0"
            >
              중지
            </button>
          </div>
        )}

        {showVoiceFallback && (
          <div className="p-4 bg-white border border-[#E8ECE4] rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#1A1D1A]">
                예시 문장을 눌러 바로 AI 주문을 시작해 보세요
              </span>
              <button
                type="button"
                onClick={() => setShowVoiceFallback(false)}
                className="text-xs font-medium text-[#687064] cursor-pointer"
              >
                닫기
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {VOICE_TRANSCRIPT_SAMPLES.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => {
                    onRawInputChange(sample.text);
                    setShowVoiceFallback(false);
                    onOpenAiChat(sample.text);
                  }}
                  className="p-3 rounded-xl border border-[#E8ECE4] hover:border-[#4E6E2A] bg-[#F7F8F5] text-left cursor-pointer transition-colors"
                >
                  <div className="text-[11px] font-semibold text-[#4E6E2A]">
                    {sample.label}
                  </div>
                  <div className="text-xs text-[#1A1D1A] mt-1 leading-snug">
                    “{sample.text}”
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 1-1. 1-Tap Weather / Time / Situation Curation Strip */}
      <section
        aria-label="상황별 1탭 추천"
        className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
      >
        {DAILY_WEATHER_CURATIONS.map((curation) => (
          <button
            key={curation.id}
            type="button"
            onClick={() => {
              if (curation.isClosingSaleFilter) {
                setActiveCategoryChip('closing');
                recommendationSectionRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
              } else {
                onOpenAiChat(curation.query);
              }
            }}
            className="p-3.5 bg-white hover:bg-[#EAF1E2]/70 border border-[#E8ECE4] hover:border-[#82B440] rounded-2xl text-left space-y-1 transition-all cursor-pointer shadow-2xs"
          >
            <span className="inline-block text-[11px] font-bold text-[#4E6E2A]">
              {curation.badge}
            </span>
            <p className="text-xs sm:text-sm font-bold text-[#1A1D1A] truncate">
              {curation.situation}
            </p>
            <p className="text-[11px] text-[#687064] line-clamp-1">
              {curation.summary}
            </p>
          </button>
        ))}
      </section>

      {/* 2. White Card Bar: '⚡ 단골 1초결제' (Opens QuickPay BottomSheet) */}
      {quickReorderCandidate && (
        <section
          aria-label="단골 1초결제"
          className="os-card rounded-2xl p-4 flex items-center justify-between gap-3.5"
        >
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="w-13 h-13 rounded-xl overflow-hidden border border-[#E8ECE4] shrink-0">
              <FoodImage
                src={quickReorderCandidate.menu.image}
                alt={quickReorderCandidate.menu.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="inline-flex flex-wrap items-center gap-1.5 text-xs font-bold text-[#4E6E2A]">
                <Zap className="w-3.5 h-3.5 fill-[#82B440] text-[#4E6E2A] shrink-0" />
                <span>단골 1초결제</span>
                {quickReorderCandidate.menu.storePrice ===
                  quickReorderCandidate.menu.pricePerPerson && (
                  <span className="px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[11px] font-bold">
                    매장 동일가 ✓
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-[#1A1D1A] truncate mt-0.5">
                {quickReorderCandidate.store.name} ·{' '}
                {quickReorderCandidate.menu.name}
              </p>
              <p className="text-xs text-[#687064] truncate tabular-nums">
                {quickReorderCandidate.servings}인 · {formatWon(quickReorderTotal)}
                {quickReorderCandidate.selectedOptionNames.length > 0 &&
                  ` · ${quickReorderCandidate.selectedOptionNames[0]}`}
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
            className="min-h-[42px] px-4 py-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] border border-[#D4E1C5] text-[#3D5720] text-xs sm:text-sm font-bold rounded-xl inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-[#4E6E2A] fill-[#82B440] shrink-0" />
            <span>1초 결제</span>
          </button>
        </section>
      )}

      {/* 3. Compact Extension Pill Strip (Streamlined UX) */}
      <section
        aria-label="확장 서비스"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      >
        {quickServices.map((svc) => {
          const Icon = svc.icon;
          return (
            <button
              key={svc.id}
              type="button"
              onClick={svc.onClick}
              className="w-full min-w-0 min-h-[44px] px-3.5 py-2.5 bg-white border border-[#E8ECE4] hover:border-[#82B440] rounded-2xl shadow-2xs inline-flex items-center justify-center gap-2 text-xs font-semibold text-[#1A1D1A] transition-all cursor-pointer"
            >
              <Icon className="w-4 h-4 text-[#4E6E2A] shrink-0" strokeWidth={1.9} />
              <span className="truncate">{svc.label}</span>
            </button>
          );
        })}
      </section>

      {/* 3-1. Closing Time-Sale Strip */}
      {closingSaleItems.length > 0 && (
        <section
          aria-label="동네 마감 특가"
          className="bg-[#FFFBEF] border border-[#E8D595] rounded-3xl p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[11px] font-bold">
                마감 특가
              </span>
              <h2 className="text-sm sm:text-base font-bold text-[#1A1D1A]">
                지금 픽업·배달 가능한 동네 잔여 특가
              </h2>
            </div>
            <span className="text-xs text-amber-900 font-medium">
              소상공인 식재료 낭비 Zero
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {closingSaleItems.map(({ menu, store, discountedPrice }) => (
              <div
                key={menu.id}
                className="p-3 bg-white border border-[#E8ECE4] rounded-2xl flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#E8ECE4] shrink-0">
                    <FoodImage
                      src={menu.image}
                      alt={menu.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#4E6E2A] truncate">
                      {store.name} · 남은 {menu.stock}개
                    </p>
                    <p className="text-sm font-bold text-[#1A1D1A] truncate">
                      {menu.name}
                    </p>
                    <p className="text-xs tabular-nums flex items-center gap-1.5">
                      <span className="line-through text-[#687064]">
                        {formatWon(menu.pricePerPerson)}
                      </span>
                      <strong className="text-amber-800 font-bold">
                        {formatWon(discountedPrice)} (-{menu.closingDiscountPercent}%)
                      </strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    triggerQuickPay({ menuId: menu.id, servings: 1 })
                  }
                  className="min-h-[38px] px-3 py-1.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs font-bold rounded-xl shrink-0 cursor-pointer"
                >
                  특가 주문
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. 'AI가 추천하는 내 주변 맛집' + Horizontal Category Chips */}
      <section ref={recommendationSectionRef} className="space-y-4 scroll-mt-20">
        <div className="flex items-center justify-between gap-3 px-0.5">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#1A1D1A]">
              AI가 추천하는 내 주변 맛집
            </h2>
            <p className="text-xs text-[#687064] mt-0.5">
              {activeLocation?.areaName ?? '선택 지역'} 기준 · 매장 동일가 검증 맛집
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSubmitSearch(parsedCondition)}
            className="text-xs sm:text-sm font-semibold text-[#687064] hover:text-[#4E6E2A] inline-flex items-center gap-0.5 shrink-0 cursor-pointer transition-colors"
          >
            <span>전체보기</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Horizontal 1-Row Quick Category Chips */}
        <div
          role="tablist"
          aria-label="빠른 카테고리 둘러보기"
          className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar"
        >
          {QUICK_CATEGORY_CHIPS.map((chip) => {
            const active = activeCategoryChip === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveCategoryChip(chip.id)}
                className={`min-h-[36px] px-3.5 py-1.5 rounded-full border text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                    : 'bg-white border-[#E8ECE4] text-[#434B40] hover:border-[#82B440]'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {displayedRecommendations.length === 0 ? (
          <div className="os-card rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <span className="text-sm text-[#687064]">
              현재 조건에 맞는 메뉴가 없습니다. AI 상담으로 조건을 가볍게
              조정해 보세요.
            </span>
            <button
              type="button"
              onClick={() => onOpenAiChat(rawInput)}
              className="min-h-[42px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs font-semibold rounded-xl shrink-0 cursor-pointer"
            >
              AI 상담 열기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {displayedRecommendations.map((item) => {
              const wished = wishlistIds.includes(item.menu.id);
              const reasonText =
                item.aiReason ??
                item.menu.aiReason ??
                `약 ${item.effectiveMinutes}분 내 빠른 배달 · 매장 동일가`;
              const storeRating = (item.store.rating ?? 4.9).toFixed(1);
              const storeReviewCount = (
                item.store.reviewCount ?? 1200
              ).toLocaleString('ko-KR');
              const menuReviews = INITIAL_REVIEWS.filter(
                (r) => r.menuId === item.menu.id
              );
              const topReview = menuReviews[0];
              const estimatedSavings =
                item.estimatedSavingsVsCompetitor ??
                estimateCompetitorSavings({
                  menuSubtotal: item.menuSubtotal,
                  originalMenuSubtotal: item.menu.pricePerPerson * item.servings,
                  deliveryFee: item.deliveryFee,
                  originalDeliveryFee: item.deliveryFee,
                  couponDiscount: 0,
                  isSameStorePrice: item.isSameStorePrice,
                }).totalSaved;

              return (
                <article
                  key={item.menu.id}
                  className="os-card hover:border-[#82B440] rounded-3xl overflow-hidden flex flex-col justify-between transition-all"
                >
                  <div>
                    <div className="relative aspect-4/3 w-full overflow-hidden bg-[#F0F3EC]">
                      <button
                        type="button"
                        onClick={() => onQuickSelectMenu(item.menu.id)}
                        className="w-full h-full block cursor-pointer"
                        aria-label={`${item.store.name} ${item.menu.name} 상세 보기`}
                      >
                        <FoodImage
                          src={item.menu.image}
                          alt={item.menu.name}
                          className="w-full h-full object-cover"
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleWishlist(item.menu.id)}
                        aria-label={`${item.menu.name} 찜하기`}
                        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 hover:bg-white shadow-sm flex items-center justify-center cursor-pointer"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            wished
                              ? 'fill-red-500 text-red-500'
                              : 'text-[#687064]'
                          }`}
                        />
                      </button>

                      <div className="absolute bottom-2.5 left-2.5 flex flex-wrap items-center gap-1">
                        {item.isNearbyArea && (
                          <span className="px-2 py-0.5 rounded-full bg-[#1A1D1A]/85 text-white text-[10.5px] font-bold">
                            내 주변
                          </span>
                        )}
                        {item.isSameStorePrice && (
                          <span className="px-2 py-0.5 rounded-full bg-white/95 text-[#3D5720] border border-[#D4E1C5] text-[10.5px] font-bold shadow-2xs">
                            매장 동일가 ✓
                          </span>
                        )}
                        {(item.menu.closingDiscountPercent ?? 0) > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[10.5px] font-bold shadow-2xs">
                            마감 -{item.menu.closingDiscountPercent}%
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <button
                        type="button"
                        onClick={() => onQuickSelectMenu(item.menu.id)}
                        className="text-left w-full cursor-pointer"
                      >
                        <h3 className="text-base font-bold text-[#1A1D1A] truncate">
                          {item.store.name}
                        </h3>
                        <p className="text-xs font-medium text-[#687064] truncate mt-0.5">
                          {item.menu.name} · {formatWon(item.estimatedTotal)}
                        </p>
                      </button>

                      <div className="flex items-center justify-between gap-1.5 text-xs tabular-nums">
                        <div className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-[#82B440] text-[#82B440] shrink-0" />
                          <span className="font-bold text-[#1A1D1A]">
                            {storeRating}
                          </span>
                          <span className="text-[#687064]">({storeReviewCount})</span>
                          <span className="text-[#687064]" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-semibold text-[#1A1D1A]">
                            {item.effectiveMinutes}분
                          </span>
                        </div>
                        {estimatedSavings > 0 && (
                          <span className="text-[10.5px] font-bold text-[#4E6E2A]">
                            약 {formatWon(estimatedSavings)}↓
                          </span>
                        )}
                      </div>

                      <div className="px-2.5 py-2 rounded-xl bg-[#EAF1E2] text-[11px] font-medium text-[#3D5720] line-clamp-2 leading-snug">
                        ✨ {reasonText}
                      </div>

                      {topReview && (
                        <button
                          type="button"
                          onClick={() => onQuickSelectMenu(item.menu.id)}
                          className="w-full text-left px-2.5 py-2 rounded-xl bg-[#F7F8F5] hover:bg-[#EAF1E2]/60 border border-[#E8ECE4] text-[11px] text-[#434B40] line-clamp-2 leading-snug cursor-pointer transition-colors"
                        >
                          💬 “{topReview.content}”
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="px-4 pb-4 pt-1 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onAddToCart
                          ? onAddToCart(item.menu.id, item.servings, [])
                          : onQuickSelectMenu(item.menu.id)
                      }
                      className="min-h-[38px] px-2.5 py-1.5 bg-[#F7F8F5] hover:bg-[#EAF1E2] border border-[#E8ECE4] text-[#1A1D1A] text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 text-[#4E6E2A]" />
                      <span>담기</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        triggerQuickPay({
                          menuId: item.menu.id,
                          servings: item.servings,
                        })
                      }
                      className="min-h-[38px] px-2.5 py-1.5 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>1초 주문</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Collapsible Direct Condition & Preference Controls */}
      <section className="os-card rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvancedInput((prev) => !prev)}
          className="w-full min-h-[50px] px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#F7F8F5] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#555E52]">
            <SlidersHorizontal className="w-4 h-4 text-[#4E6E2A]" />
            <span>조건 직접 입력 · 내 취향 설정</span>
          </div>
          {showAdvancedInput ? (
            <ChevronUp className="w-4 h-4 text-[#687064]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#687064]" />
          )}
        </button>

        {showAdvancedInput && (
          <div className="p-5 pt-4 border-t border-[#E8ECE4] space-y-5">
            <form onSubmit={handleFormSubmit} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1 flex items-center">
                  <Search className="w-4 h-4 text-[#687064] absolute left-3.5 pointer-events-none" />
                  <input
                    id="condition-input"
                    type="text"
                    value={rawInput}
                    onChange={(e) => onRawInputChange(e.target.value)}
                    placeholder="예: 성인 2명, 안 매운 국물, 총액 25,000원 이하, 30분 이내"
                    className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm bg-[#F7F8F5] border border-[#E8ECE4] rounded-xl text-[#1A1D1A] placeholder:text-[#687064]"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-semibold rounded-xl cursor-pointer whitespace-nowrap"
                >
                  조건으로 비교
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PRESET_QUERIES.map((preset) => {
                  const active = rawInput.trim() === preset.query;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => onRawInputChange(preset.query)}
                      className={`px-3 py-1 rounded-full border text-[11px] font-medium cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                          : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#687064] hover:text-[#1A1D1A]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {AVAILABLE_TAGS.map((tag) => {
                  const active = parsedCondition.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleConditionTag(tag)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#EAF1E2] border-[#4E6E2A] text-[#3D5720]'
                          : 'bg-white border-[#E8ECE4] text-[#687064]'
                      }`}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            </form>

            {parsedCondition.needsConfirmation &&
              parsedCondition.unknownTokens.length > 0 && (
                <div
                  role="region"
                  aria-label="조건 확인"
                  className="p-4 bg-[#EAF1E2] border border-[#D4E1C5] rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs text-[#3D5720]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-[#4E6E2A] shrink-0" />
                    ‘{parsedCondition.unknownTokens.join(', ')}’ 조건 확인 후
                    추천을 보실 수 있습니다.
                  </span>
                  <button
                    type="button"
                    onClick={handleConfirmUnknownAndSearch}
                    className="px-3 py-1.5 bg-[#4E6E2A] text-white font-semibold rounded-xl cursor-pointer"
                  >
                    확인하고 보기
                  </button>
                </div>
              )}

            <div className="pt-4 border-t border-[#E8ECE4] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[#687064]">
                  기본 취향:{' '}
                  <strong className="text-[#1A1D1A]">
                    {preferences.defaultServings}인 ·{' '}
                    {formatWon(preferences.defaultMaxBudget)} 이하 ·{' '}
                    {preferences.defaultMaxMinutes}분 이내
                  </strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onApplyPreferencesToInput(preferences)}
                    className="px-3 py-1.5 bg-[#EAF1E2] text-[#3D5720] font-semibold rounded-lg cursor-pointer"
                  >
                    조건에 적용
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftPrefs(preferences);
                      setEditingPrefs((prev) => !prev);
                    }}
                    className="px-3 py-1.5 bg-[#F7F8F5] border border-[#E8ECE4] text-[#555E52] font-semibold rounded-lg cursor-pointer"
                  >
                    {editingPrefs ? '닫기' : '편집'}
                  </button>
                </div>
              </div>

              {prefsSavedNotice && (
                <p className="text-xs font-semibold text-[#4E6E2A]">
                  기본 취향이 저장되었습니다.
                </p>
              )}

              {editingPrefs && (
                <div className="p-4 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl space-y-3">
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#687064] mb-1">
                        인원
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={draftPrefs.defaultServings}
                        onChange={(e) =>
                          setDraftPrefs((p) => ({
                            ...p,
                            defaultServings: parseInt(e.target.value, 10) || 1,
                          }))
                        }
                        className="w-full min-h-[38px] px-3 bg-white border border-[#E8ECE4] rounded-xl text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#687064] mb-1">
                        예산 (원)
                      </label>
                      <input
                        type="number"
                        step={1000}
                        min={1000}
                        value={draftPrefs.defaultMaxBudget}
                        onChange={(e) =>
                          setDraftPrefs((p) => ({
                            ...p,
                            defaultMaxBudget:
                              parseInt(e.target.value, 10) || 20000,
                          }))
                        }
                        className="w-full min-h-[38px] px-3 bg-white border border-[#E8ECE4] rounded-xl text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#687064] mb-1">
                        시간 (분)
                      </label>
                      <input
                        type="number"
                        step={5}
                        min={5}
                        value={draftPrefs.defaultMaxMinutes}
                        onChange={(e) =>
                          setDraftPrefs((p) => ({
                            ...p,
                            defaultMaxMinutes: parseInt(e.target.value, 10) || 30,
                          }))
                        }
                        className="w-full min-h-[38px] px-3 bg-white border border-[#E8ECE4] rounded-xl text-xs font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {AVAILABLE_TAGS.map((tag) => {
                      const selected = draftPrefs.favoriteTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleDraftPrefTag(tag)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border cursor-pointer ${
                            selected
                              ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                              : 'bg-white border-[#E8ECE4] text-[#687064]'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleSavePrefsSubmit}
                    className="min-h-[38px] px-4 py-1.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                  >
                    취향 저장
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
