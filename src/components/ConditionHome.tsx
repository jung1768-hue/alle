import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bike,
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
  ShoppingBasket,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  Zap,
} from 'lucide-react';
import {
  AVAILABLE_TAGS,
  PRESET_QUERIES,
  VOICE_TRANSCRIPT_SAMPLES,
} from '../data/seedData';
import {
  MenuItem,
  Order,
  ParsedCondition,
  SavedLocation,
  Store,
  SuperAppTab,
  UserPreferences,
} from '../types/alle';
import { evaluateRecommendations, formatWon } from '../utils/parser';
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
    options?: { sharedDeliveryApplied?: boolean; reservationSlot?: string }
  ) => void;
  onOpenSuperApp: (tab: SuperAppTab) => void;
  onSavePreferences: (next: UserPreferences) => void;
  onApplyPreferencesToInput: (prefs: UserPreferences) => void;
  activeLocation?: SavedLocation;
  onOpenLocationPicker?: () => void;
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
  onToggleWishlist,
  onOpenAiChat,
  onRawInputChange,
  onUpdateParsedCondition,
  onSubmitSearch,
  onQuickSelectMenu,
  onQuickReorderToConfirm,
  onOpenSuperApp,
  onSavePreferences,
  onApplyPreferencesToInput,
  activeLocation,
}: ConditionHomeProps) {
  const [showAdvancedInput, setShowAdvancedInput] = useState(false);
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [draftPrefs, setDraftPrefs] = useState<UserPreferences>(preferences);
  const [prefsSavedNotice, setPrefsSavedNotice] = useState(false);
  const [showVoiceFallback, setShowVoiceFallback] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const stopVoiceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      stopVoiceRef.current?.();
    };
  }, []);

  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const autoRecommendations = useMemo(
    () => evaluateRecommendations(parsedCondition, stores, menus),
    [parsedCondition, stores, menus]
  );

  const quickReorderCandidate = useMemo(() => {
    for (const ord of orders) {
      const m = menus.find((item) => item.id === ord.menuId);
      const st = m ? storeMap.get(m.storeId) : undefined;
      if (m && st && st.isOpen && !m.isSoldOut && m.stock >= 1) {
        return { menu: m, store: st, servings: Math.min(ord.servings, m.stock) };
      }
    }
    const fallbackMenu = menus.find((m) => {
      const st = storeMap.get(m.storeId);
      return st?.isOpen && !m.isSoldOut && m.stock >= 1;
    });
    if (!fallbackMenu) return null;
    const fallbackStore = storeMap.get(fallbackMenu.storeId);
    if (!fallbackStore) return null;
    return { menu: fallbackMenu, store: fallbackStore, servings: 1 };
  }, [orders, menus, storeMap]);

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

  const topPicks = autoRecommendations.matches.slice(0, 3);

  const quickServices = [
    {
      id: 'reserve',
      label: 'AI 예약주문',
      icon: CalendarClock,
      onClick: () => onOpenSuperApp(SuperAppTab.B2B),
    },
    {
      id: 'delivery',
      label: '배달주문',
      icon: Bike,
      onClick: () => onSubmitSearch(parsedCondition),
    },
    {
      id: 'save-fee',
      label: '배달비 줄이기',
      icon: Users,
      onClick: () => onOpenSuperApp(SuperAppTab.GROUP_BUY),
    },
    {
      id: 'group-buy',
      label: '이웃 공동구매',
      icon: ShoppingBasket,
      onClick: () => onOpenSuperApp(SuperAppTab.GROUP_BUY),
    },
    {
      id: 'errand',
      label: '심부름',
      icon: Footprints,
      onClick: () => onOpenSuperApp(SuperAppTab.ERRAND),
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-7">
      {/* 1. Soft Sage Green Hero Card: 'AI에게 주문해보세요' */}
      <section
        aria-label="AI에게 주문해보세요"
        className="bg-[#EAF1E2] border border-[#DCE7CF] shadow-sm rounded-3xl p-6 sm:p-8 space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#3D5720]">
            <Sparkles className="w-3.5 h-3.5 text-[#82B440] shrink-0" />
            <span>
              오늘의 컨디션 맞춤 · {activeLocation?.areaName ?? '대구 수성구 범어동'}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#687064] tabular-nums">
            <Clock className="w-3.5 h-3.5 text-[#4E6E2A]" />
            <span>탐색 시간</span>
            <span className="line-through">12분</span>
            <strong className="text-[#3D5720]">15초</strong>
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
                onClick={() => onOpenAiChat('치킨 시켜줘')}
                className="hover:text-[#3D5720] transition-colors cursor-pointer"
              >
                “치킨 시켜줘”
              </button>
              <button
                type="button"
                onClick={() => onOpenAiChat('달달한 커피랑 케이크')}
                className="hover:text-[#3D5720] transition-colors cursor-pointer"
              >
                “달달한 커피랑 케이크”
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Pill Primary CTA flanked by Voice Waveforms */}
        <div className="flex items-center justify-center gap-2.5 sm:gap-4 pt-1">
          <VoiceWaveformIcon className="text-[#82B440] shrink-0" />
          <button
            type="button"
            onClick={() => onOpenAiChat()}
            className="flex-1 max-w-md min-h-[54px] px-5 sm:px-6 py-3.5 rounded-full bg-[#4E6E2A] hover:bg-[#3F5A21] active:scale-[0.99] text-white font-bold text-sm sm:text-base inline-flex items-center justify-center gap-2 shadow-[0_8px_20px_-6px_rgba(78,110,42,0.45)] transition-all cursor-pointer whitespace-nowrap"
          >
            <Mic className="w-5 h-5 shrink-0" />
            <span>말하고 바로 주문하기</span>
          </button>
          <VoiceWaveformIcon className="text-[#82B440] shrink-0" />
        </div>

        <div className="flex items-center justify-center gap-3 text-xs text-[#687064]">
          <button
            type="button"
            onClick={handleVoiceTrigger}
            className={`inline-flex items-center gap-1 font-semibold cursor-pointer transition-colors ${
              isListening
                ? 'text-red-600'
                : 'text-[#3D5720] hover:text-[#4E6E2A]'
            }`}
          >
            {isListening ? (
              <MicOff className="w-3.5 h-3.5" />
            ) : (
              <Mic className="w-3.5 h-3.5" />
            )}
            <span>{isListening ? '음성 듣기 중지' : '바로 음성 입력하기'}</span>
          </button>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            대구 인기 매장 {stores.filter((s) => s.isOpen).length}곳 영업 중 · 스탬프 {stampCount}개
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

      {/* 2. White Card Bar: '⚡ 단골 1초결제' */}
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
              <div className="inline-flex items-center gap-1 text-xs font-bold text-[#4E6E2A]">
                <Zap className="w-3.5 h-3.5 fill-[#82B440] text-[#4E6E2A] shrink-0" />
                <span>단골 1초결제</span>
              </div>
              <p className="text-sm font-bold text-[#1A1D1A] truncate mt-0.5">
                {quickReorderCandidate.store.name} ·{' '}
                {quickReorderCandidate.menu.name}
              </p>
              <p className="text-xs text-[#687064] truncate tabular-nums">
                {quickReorderCandidate.servings}인 ·{' '}
                {formatWon(
                  quickReorderCandidate.menu.pricePerPerson *
                    quickReorderCandidate.servings +
                    quickReorderCandidate.store.deliveryFee
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onQuickReorderToConfirm(
                quickReorderCandidate.menu.id,
                quickReorderCandidate.servings
              )
            }
            className="min-h-[42px] px-4 py-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] border border-[#D4E1C5] text-[#3D5720] text-xs sm:text-sm font-bold rounded-xl inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-[#4E6E2A] fill-[#82B440] shrink-0" />
            <span>1초 결제</span>
          </button>
        </section>
      )}

      {/* 3. Service Quick Menu (5 Clean White Rounded Icon Boxes with Deep Olive Line Icons) */}
      <section
        aria-label="서비스 퀵 메뉴"
        className="grid grid-cols-5 gap-2 sm:gap-3"
      >
        {quickServices.map((svc) => {
          const Icon = svc.icon;
          return (
            <button
              key={svc.id}
              type="button"
              onClick={svc.onClick}
              className="flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="w-14 h-14 sm:w-[68px] sm:h-[68px] bg-white border border-[#E8ECE4] group-hover:border-[#82B440] rounded-2xl shadow-sm flex items-center justify-center text-[#4E6E2A] transition-all">
                <Icon className="w-6 h-6" strokeWidth={1.85} />
              </div>
              <span className="text-[11px] sm:text-xs font-semibold text-[#1A1D1A] text-center leading-tight whitespace-nowrap">
                {svc.label}
              </span>
            </button>
          );
        })}
      </section>

      {/* 4. 'AI가 추천하는 우리 동네 맛집' Cards */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-0.5">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#1A1D1A]">
              AI가 추천하는 우리 동네 맛집
            </h2>
            <p className="text-xs text-[#687064] mt-0.5">
              현재 컨디션과 도착 시간을 계산해 선별한 대구 단골 맛집
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

        {topPicks.length === 0 ? (
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
            {topPicks.map((item) => {
              const wished = wishlistIds.includes(item.menu.id);
              const reasonText =
                item.aiReason ??
                item.menu.aiReason ??
                `약 ${item.effectiveMinutes}분 내 빠른 배달 · 매장 동일가`;
              const storeRating = (item.store.rating ?? 4.9).toFixed(1);
              const storeReviewCount = (
                item.store.reviewCount ?? 1200
              ).toLocaleString('ko-KR');

              return (
                <article
                  key={item.menu.id}
                  className="os-card hover:border-[#82B440] rounded-3xl overflow-hidden flex flex-col justify-between transition-all"
                >
                  <div>
                    {/* Clean Food Photo Top */}
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
                    </div>

                    {/* Crisp White Lower Area */}
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

                      {/* Lime Green Star Rating & Delivery ETA */}
                      <div className="flex items-center gap-1.5 text-xs tabular-nums">
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

                      {/* Soft Sage AI Reason Line */}
                      <div className="px-2.5 py-2 rounded-xl bg-[#EAF1E2] text-[11px] font-medium text-[#3D5720] line-clamp-2 leading-snug">
                        ✨ {reasonText}
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pb-4 pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onQuickReorderToConfirm(item.menu.id, item.servings)
                      }
                      className="flex-1 min-h-[38px] px-3 py-1.5 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs font-bold rounded-xl inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
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
                    placeholder="예: 성인 2명, 얼큰한 국물, 총액 25,000원 이하, 30분 이내"
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
