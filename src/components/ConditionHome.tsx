import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bike,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Footprints,
  Heart,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Users,
  Zap,
} from 'lucide-react';
import {
  AVAILABLE_TAGS,
  INITIAL_REVIEWS,
  PRESET_QUERIES,
  VOICE_TRANSCRIPT_SAMPLES,
} from '../data/seedData';
import {
  MenuItem,
  Order,
  ParsedCondition,
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
}

function WaveformAccent() {
  return (
    <svg
      width="44"
      height="28"
      viewBox="0 0 44 28"
      fill="none"
      aria-hidden="true"
      className="hidden sm:block shrink-0 text-[#BACCA4]"
    >
      <rect x="2" y="10" width="3" height="8" rx="1.5" fill="currentColor" />
      <rect x="9" y="5" width="3" height="18" rx="1.5" fill="currentColor" />
      <rect x="16" y="2" width="3" height="24" rx="1.5" fill="currentColor" />
      <rect x="23" y="7" width="3" height="14" rx="1.5" fill="currentColor" />
      <rect x="30" y="4" width="3" height="20" rx="1.5" fill="currentColor" />
      <rect x="37" y="9" width="3" height="10" rx="1.5" fill="currentColor" />
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
  onEarnStamp,
  onRawInputChange,
  onUpdateParsedCondition,
  onSubmitSearch,
  onQuickSelectMenu,
  onQuickReorderToConfirm,
  onOpenSuperApp,
  onSavePreferences,
  onApplyPreferencesToInput,
}: ConditionHomeProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [draftPrefs, setDraftPrefs] = useState<UserPreferences>(preferences);
  const [prefsSavedNotice, setPrefsSavedNotice] = useState(false);
  const [onlyAvailableNow, setOnlyAvailableNow] = useState(true);
  const [showVoiceFallback, setShowVoiceFallback] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const stopVoiceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      stopVoiceRef.current?.();
    };
  }, []);

  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const reviewCountByMenu = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of INITIAL_REVIEWS) {
      counts.set(r.menuId, (counts.get(r.menuId) ?? 0) + 1);
    }
    return counts;
  }, []);

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

  const browseMenus = useMemo(
    () =>
      menus
        .filter((m) => {
          if (!onlyAvailableNow) return true;
          const st = storeMap.get(m.storeId);
          return Boolean(st?.isOpen && !m.isSoldOut && m.stock > 0);
        })
        .slice(0, 6),
    [menus, onlyAvailableNow, storeMap]
  );

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

  return (
    <div className="space-y-6">
      {/* Compact Location Bar */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 text-sm font-bold text-[#141812]">
          <MapPin className="w-4 h-4 text-[#2E531A] shrink-0" />
          <span>수령지 A</span>
          <ChevronDown className="w-3.5 h-3.5 text-[#4A5246]" />
        </div>
        <button
          type="button"
          onClick={() => onEarnStamp()}
          className="text-xs font-semibold text-[#2E531A] hover:underline underline-offset-4 cursor-pointer tabular-nums"
        >
          단골 스탬프 {stampCount}개
        </button>
      </div>

      {/* Top AI Hero Banner matching IMG_8626 */}
      <section className="bg-[#ECF3E2] border border-[#DCE6CF] rounded-3xl p-5 sm:p-7 shadow-[0_2px_12px_rgba(20,24,18,0.03)] space-y-5">
        {/* Bot Illustration + Headline + Spoken Examples */}
        <div className="flex items-center gap-4 sm:gap-6 max-w-2xl mx-auto">
          <div className="relative shrink-0">
            <AlleBotIllustration size="md" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#141812]">
              AI에게 주문해보세요
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm font-medium text-[#4A5246]">
              <button
                type="button"
                onClick={() =>
                  onOpenAiChat(
                    '성인 2명, 얼큰한 국물, 총액 25,000원 이하, 30분 이내'
                  )
                }
                className="hover:text-[#2E531A] hover:underline cursor-pointer text-left"
              >
                “따뜻한 국물요리 추천해줘”
              </button>
              <button
                type="button"
                onClick={() =>
                  onOpenAiChat('성인 2명, 총액 25,000원 이하, 30분 이내')
                }
                className="hover:text-[#2E531A] hover:underline cursor-pointer text-left"
              >
                “지금 먹을 수 있는 거?”
              </button>
            </div>
          </div>
        </div>

        {/* Centered Voice CTA flanked by Waveform Bars */}
        <div className="flex items-center justify-center gap-5">
          <WaveformAccent />
          <button
            type="button"
            onClick={handleVoiceTrigger}
            className={`min-h-[50px] px-7 py-3 rounded-full font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-sm transition-colors cursor-pointer whitespace-nowrap ${
              isListening
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-[#4B6B28] hover:bg-[#3A551D] text-white'
            }`}
          >
            {isListening ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
            <span>{isListening ? '음성 듣는 중...' : '말하고 바로 주문하기'}</span>
          </button>
          <WaveformAccent />
        </div>

        {/* Listening / Voice Samples */}
        {isListening && (
          <div className="max-w-2xl mx-auto p-3.5 bg-white border border-[#2E531A] rounded-2xl flex items-center justify-between gap-3 text-sm">
            <span className="font-bold text-[#141812]">
              듣고 있어요. 메뉴, 인원, 예산을 편하게 말씀해 주세요.
            </span>
            <button
              type="button"
              onClick={handleVoiceTrigger}
              className="px-3 py-1 bg-[#F4F6F1] rounded-lg text-xs font-bold text-[#374033] cursor-pointer shrink-0"
            >
              중지
            </button>
          </div>
        )}

        {showVoiceFallback && (
          <div className="max-w-3xl mx-auto p-4 bg-white border border-[#C5D8B5] rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#141812]">
                음성 예시를 선택해 바로 상담을 시작해 보세요
              </span>
              <button
                type="button"
                onClick={() => setShowVoiceFallback(false)}
                className="text-xs font-semibold text-[#4A5246] cursor-pointer"
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
                  className="p-3 rounded-xl border border-[#DDE3D7] hover:border-[#2E531A] bg-[#F4F6F1] text-left cursor-pointer"
                >
                  <div className="text-[11px] font-bold text-[#2E531A]">
                    {sample.label}
                  </div>
                  <div className="text-xs text-[#141812] mt-1 leading-snug">
                    “{sample.text}”
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Compact 1-Line Condition Bar + Counselor Shortcut */}
        <form onSubmit={handleFormSubmit} className="max-w-3xl mx-auto space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="condition-input" className="sr-only">
              주문 조건 입력
            </label>
            <div className="relative flex-1 flex items-center">
              <Search className="w-4 h-4 text-[#4A5246] absolute left-3.5 pointer-events-none" />
              <input
                id="condition-input"
                type="text"
                value={rawInput}
                onChange={(e) => onRawInputChange(e.target.value)}
                placeholder="예: 성인 2명, 얼큰한 국물, 총액 25,000원 이하, 30분 이내"
                className="w-full min-h-[44px] pl-10 pr-24 py-2 text-sm bg-white border border-[#D4E2C4] rounded-2xl text-[#141812] placeholder:text-[#5C6657] focus:outline-none focus:ring-2 focus:ring-[#2E531A]/30 focus:border-[#2E531A]"
              />
              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
                className="absolute right-2 min-h-[32px] px-2.5 py-1 text-xs font-bold text-[#2E531A] hover:bg-[#ECF3E2] rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>상세</span>
                {showFilters ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                type="submit"
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 bg-[#2E531A] hover:bg-[#234113] text-white text-xs sm:text-sm font-bold rounded-2xl cursor-pointer whitespace-nowrap"
              >
                조건 추천
              </button>
              <button
                type="button"
                onClick={() => onOpenAiChat(rawInput)}
                className="min-h-[44px] px-4 py-2 bg-white hover:bg-[#F4F6F1] border border-[#C5D8B5] text-[#141812] text-xs sm:text-sm font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <MessageSquare className="w-4 h-4 text-[#2E531A]" />
                <span>AI 상담</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-1.5">
            {PRESET_QUERIES.map((preset) => {
              const active = rawInput.trim() === preset.query;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onRawInputChange(preset.query)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-xl border text-[11px] font-semibold cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#2E531A] border-[#2E531A] text-white'
                      : 'bg-white/85 border-[#D4E2C4] text-[#374033] hover:bg-white'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </form>

        {/* Unknown Expression Clarification */}
        {parsedCondition.needsConfirmation &&
          parsedCondition.unknownTokens.length > 0 && (
            <div
              role="region"
              aria-label="조건 확인"
              className="max-w-3xl mx-auto p-4 bg-[#FFFBEF] border border-[#E8D595] rounded-2xl space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm text-[#141812]">
                  <strong>‘{parsedCondition.unknownTokens.join(', ')}’</strong>에
                  어울리는 맛을 골라주시면 정확히 추천해 드릴게요.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {['순한맛', '담백한', '국물', '바삭한', '얼큰한'].map(
                  (suggest) => {
                    const active = parsedCondition.tags.includes(suggest);
                    return (
                      <button
                        key={suggest}
                        type="button"
                        onClick={() => {
                          const nextTags = active
                            ? parsedCondition.tags.filter((t) => t !== suggest)
                            : [...parsedCondition.tags, suggest];
                          onUpdateParsedCondition({
                            ...parsedCondition,
                            tags: nextTags,
                          });
                        }}
                        className={`min-h-[36px] px-3 py-1 text-xs font-bold rounded-xl border cursor-pointer ${
                          active
                            ? 'bg-[#2E531A] text-white border-[#2E531A]'
                            : 'bg-white text-[#141812] border-[#CBDCC0]'
                        }`}
                      >
                        {active ? `✓ ${suggest}` : `+ ${suggest}`}
                      </button>
                    );
                  }
                )}
                <button
                  type="button"
                  onClick={handleConfirmUnknownAndSearch}
                  className="min-h-[36px] px-4 py-1 bg-[#2E531A] hover:bg-[#234113] text-white text-xs font-bold rounded-xl cursor-pointer ml-auto"
                >
                  확인하고 추천 보기
                </button>
              </div>
            </div>
          )}

        {/* Expandable Fine-Tuning Filters */}
        {showFilters && (
          <div className="max-w-3xl mx-auto p-4 bg-white border border-[#C5D8B5] rounded-2xl space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="parsed-servings"
                  className="block text-xs font-bold text-[#374033] mb-1"
                >
                  인원
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateParsedCondition({
                        ...parsedCondition,
                        servings: Math.max(1, parsedCondition.servings - 1),
                      })
                    }
                    className="min-w-[38px] min-h-[38px] rounded-xl border border-[#CBDCC0] bg-[#F4F6F1] font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    id="parsed-servings"
                    type="number"
                    min={1}
                    max={20}
                    value={parsedCondition.servings}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      onUpdateParsedCondition({
                        ...parsedCondition,
                        servings: Number.isInteger(val) && val > 0 ? val : 1,
                      });
                    }}
                    className="w-full min-h-[38px] text-center font-mono tabular-nums text-sm font-bold border border-[#CBDCC0] rounded-xl text-[#141812]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateParsedCondition({
                        ...parsedCondition,
                        servings: Math.min(20, parsedCondition.servings + 1),
                      })
                    }
                    className="min-w-[38px] min-h-[38px] rounded-xl border border-[#CBDCC0] bg-[#F4F6F1] font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="parsed-budget"
                  className="block text-xs font-bold text-[#374033] mb-1"
                >
                  총액 예산 (원 이하)
                </label>
                <input
                  id="parsed-budget"
                  type="number"
                  step={1000}
                  min={0}
                  value={parsedCondition.maxBudget ?? ''}
                  placeholder="제한 없음"
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      onUpdateParsedCondition({
                        ...parsedCondition,
                        maxBudget: null,
                      });
                      return;
                    }
                    const val = parseInt(raw, 10);
                    onUpdateParsedCondition({
                      ...parsedCondition,
                      maxBudget: Number.isInteger(val) && val >= 0 ? val : null,
                    });
                  }}
                  className="w-full min-h-[38px] px-3 font-mono tabular-nums text-sm font-bold border border-[#CBDCC0] rounded-xl text-[#141812]"
                />
              </div>

              <div>
                <label
                  htmlFor="parsed-minutes"
                  className="block text-xs font-bold text-[#374033] mb-1"
                >
                  배달 시간 (분 이내)
                </label>
                <input
                  id="parsed-minutes"
                  type="number"
                  step={5}
                  min={5}
                  value={parsedCondition.maxMinutes ?? ''}
                  placeholder="제한 없음"
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      onUpdateParsedCondition({
                        ...parsedCondition,
                        maxMinutes: null,
                      });
                      return;
                    }
                    const val = parseInt(raw, 10);
                    onUpdateParsedCondition({
                      ...parsedCondition,
                      maxMinutes: Number.isInteger(val) && val > 0 ? val : null,
                    });
                  }}
                  className="w-full min-h-[38px] px-3 font-mono tabular-nums text-sm font-bold border border-[#CBDCC0] rounded-xl text-[#141812]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {AVAILABLE_TAGS.map((tag) => {
                const active = parsedCondition.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleConditionTag(tag)}
                    className={`min-h-[32px] px-2.5 py-1 text-xs font-semibold rounded-lg border cursor-pointer ${
                      active
                        ? 'bg-[#2E531A] border-[#2E531A] text-white'
                        : 'bg-[#F4F6F1] border-[#DDE3D7] text-[#374033]'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 6-Tile Quick Action Strip matching IMG_8626 */}
      <section aria-label="빠른 주문 및 서비스">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (quickReorderCandidate) {
                onQuickReorderToConfirm(
                  quickReorderCandidate.menu.id,
                  quickReorderCandidate.servings
                );
              }
            }}
            className="min-h-[82px] p-3 rounded-2xl border border-[#C5D8A9] bg-[#DCE9C8] hover:bg-[#D0E2B8] text-[#223812] flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Zap className="w-5 h-5 text-[#2E531A]" />
            <span className="text-xs font-bold text-center leading-tight whitespace-nowrap">
              단골 1초결제
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (quickReorderCandidate) {
                onQuickReorderToConfirm(
                  quickReorderCandidate.menu.id,
                  quickReorderCandidate.servings,
                  { reservationSlot: 'slot-45' }
                );
              }
            }}
            className="min-h-[82px] p-3 rounded-2xl border border-[#E4EAE0] bg-white hover:bg-[#F4F6F1] text-[#141812] flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <CalendarClock className="w-5 h-5 text-[#141812]" />
            <span className="text-xs font-bold text-center leading-tight whitespace-nowrap">
              AI 예약주문
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSubmitSearch(parsedCondition)}
            className="min-h-[82px] p-3 rounded-2xl border border-[#E4EAE0] bg-white hover:bg-[#F4F6F1] text-[#141812] flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Bike className="w-5 h-5 text-[#2E531A]" />
            <span className="text-xs font-bold text-center leading-tight whitespace-nowrap">
              배달주문
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenSuperApp(SuperAppTab.GROUP_BUY)}
            className="min-h-[82px] p-3 rounded-2xl border border-[#E4EAE0] bg-white hover:bg-[#F4F6F1] text-[#141812] flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Users className="w-5 h-5 text-[#141812]" />
            <span className="text-xs font-bold text-center leading-tight whitespace-nowrap">
              배달비 줄이기
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenSuperApp(SuperAppTab.GROUP_BUY)}
            className="min-h-[82px] p-3 rounded-2xl border border-[#E4EAE0] bg-white hover:bg-[#F4F6F1] text-[#141812] flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <ShoppingBasket className="w-5 h-5 text-[#141812]" />
            <span className="text-xs font-bold text-center leading-tight whitespace-nowrap">
              이웃 묶음배달
            </span>
          </button>

          <button
            type="button"
            onClick={() => onOpenSuperApp(SuperAppTab.ERRAND)}
            className="min-h-[82px] p-3 rounded-2xl border border-[#E4EAE0] bg-white hover:bg-[#F4F6F1] text-[#141812] flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Footprints className="w-5 h-5 text-[#141812]" />
            <span className="text-xs font-bold text-center leading-tight whitespace-nowrap">
              심부름
            </span>
          </button>
        </div>
      </section>

      {/* AI Recommended Neighborhood Dishes matching IMG_8626 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-[#141812]">
              AI가 추천하는 우리 동네 맛집
            </h2>
            <span className="text-xs font-medium text-[#4A5246] tabular-nums">
              {parsedCondition.servings}인 기준 · {autoRecommendations.matches.length}건
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSubmitSearch(parsedCondition)}
            className="text-xs sm:text-sm font-bold text-[#374033] hover:text-[#2E531A] flex items-center gap-0.5 cursor-pointer"
          >
            <span>전체보기</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {autoRecommendations.matches.length === 0 ? (
          <div className="bg-white border border-[#DDE3D7] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs sm:text-sm font-medium text-[#374033]">
              입력하신 조건에 맞는 메뉴가 없습니다. 예산을 늘리거나 AI 상담사에게 물어보세요.
            </span>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onUpdateParsedCondition({
                    ...parsedCondition,
                    maxBudget: (parsedCondition.maxBudget ?? 20000) + 10000,
                  })
                }
                className="min-h-[38px] px-3.5 py-1.5 bg-[#E7EFE1] text-[#1F3A11] text-xs font-bold rounded-xl cursor-pointer"
              >
                예산 +1만원
              </button>
              <button
                type="button"
                onClick={() => onOpenAiChat(rawInput)}
                className="min-h-[38px] px-3.5 py-1.5 bg-[#2E531A] text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                AI 상담 주문
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {autoRecommendations.matches.slice(0, 3).map((item) => {
              const wished = wishlistIds.includes(item.menu.id);
              const reviewCount = reviewCountByMenu.get(item.menu.id) ?? 0;

              return (
                <article
                  key={item.menu.id}
                  className="group bg-white border border-[#E4EAE0] hover:border-[#2E531A] rounded-2xl overflow-hidden shadow-[0_2px_10px_rgba(20,24,18,0.03)] transition-colors flex flex-col justify-between"
                >
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => onToggleWishlist(item.menu.id)}
                      aria-label={`${item.menu.name} 찜하기`}
                      className="absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full bg-white/95 border border-black/10 flex items-center justify-center shadow-2xs cursor-pointer"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          wished ? 'fill-red-500 text-red-500' : 'text-[#4A5246]'
                        }`}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => onQuickSelectMenu(item.menu.id)}
                      className="w-full text-left cursor-pointer"
                    >
                      <div className="aspect-4/3 w-full overflow-hidden">
                        <FoodImage
                          src={item.menu.image}
                          alt={item.menu.name}
                          className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200"
                        />
                      </div>
                      <div className="p-4 space-y-1">
                        <h3 className="text-base font-bold text-[#141812] truncate">
                          {item.menu.name}
                        </h3>
                        <div className="text-xs text-[#4A5246] flex items-center gap-1.5 truncate tabular-nums">
                          <span>{item.store.name}</span>
                          <span aria-hidden="true">·</span>
                          <span>약 {item.effectiveMinutes}분</span>
                          {reviewCount > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>리뷰 {reviewCount}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center justify-between pt-1.5 text-xs">
                          <span className="font-mono tabular-nums font-bold text-sm text-[#2E531A]">
                            총 {formatWon(item.estimatedTotal)}
                          </span>
                          <span className="font-semibold text-[#374033]">
                            {item.isSameStorePrice
                              ? '매장 동일 가격'
                              : item.menu.storePrice === null
                                ? '가격자료 미입력'
                                : `매장가 ${formatWon(item.menu.storePrice)}`}
                          </span>
                        </div>
                      </div>
                    </button>
                  </div>

                  <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onQuickSelectMenu(item.menu.id)}
                      className="min-h-[38px] px-2 bg-[#F4F6F1] hover:bg-[#E7EFE1] text-[#141812] text-xs font-bold rounded-xl cursor-pointer"
                    >
                      상세 · 리뷰
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onQuickReorderToConfirm(item.menu.id, item.servings)
                      }
                      className="min-h-[38px] px-2 bg-[#2E531A] hover:bg-[#234113] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>바로 주문</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* All Neighborhood Menus */}
      <section className="space-y-3 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-lg font-bold text-[#141812]">전체 메뉴 둘러보기</h2>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              role="switch"
              aria-checked={onlyAvailableNow}
              onClick={() => setOnlyAvailableNow((prev) => !prev)}
              className={`min-h-[34px] px-3 py-1 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                onlyAvailableNow
                  ? 'bg-[#E7EFE1] border-[#6FA33A] text-[#1F3A11]'
                  : 'bg-white border-[#DDE3D7] text-[#374033]'
              }`}
            >
              {onlyAvailableNow ? '주문 가능만' : '품절 포함'}
            </button>
            <button
              type="button"
              onClick={() => onSubmitSearch(parsedCondition)}
              className="text-xs font-bold text-[#2E531A] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span>전체 비교</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {browseMenus.map((menu) => {
            const store = storeMap.get(menu.storeId);
            if (!store) return null;
            const unavailable = !store.isOpen || menu.isSoldOut || menu.stock <= 0;
            const lowStock = !unavailable && menu.stock <= 3;
            const effectiveMins =
              menu.estimatedMinutes + (store.extraPrepMinutes ?? 0);
            const wished = wishlistIds.includes(menu.id);

            return (
              <div
                key={menu.id}
                className={`group relative bg-white border rounded-2xl overflow-hidden shadow-[0_2px_10px_rgba(20,24,18,0.03)] transition-all ${
                  unavailable
                    ? 'border-[#DDE3D7] opacity-65'
                    : 'border-[#DDE3D7] hover:border-[#2E531A]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onToggleWishlist(menu.id)}
                  aria-label={`${menu.name} 찜하기`}
                  className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/95 border border-black/10 flex items-center justify-center shadow-xs hover:scale-105 transition-transform cursor-pointer"
                >
                  <Heart
                    className={`w-4 h-4 ${
                      wished ? 'fill-red-500 text-red-500' : 'text-[#4A5246]'
                    }`}
                  />
                </button>

                <button
                  type="button"
                  disabled={unavailable}
                  onClick={() => onQuickSelectMenu(menu.id)}
                  className={`w-full text-left ${
                    unavailable ? 'cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <div className="aspect-4/3 w-full overflow-hidden">
                    <FoodImage
                      src={menu.image}
                      alt={menu.name}
                      className="w-full h-full group-hover:scale-[1.02] transition-transform duration-200"
                    />
                  </div>
                  <div className="p-4 space-y-1">
                    <div className="text-xs font-medium text-[#4A5246] truncate">
                      {store.name} · 약 {effectiveMins}분
                    </div>
                    <h3 className="text-base font-bold text-[#141812] truncate">
                      {menu.name}
                    </h3>
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="font-mono tabular-nums font-bold text-sm text-[#141812]">
                        {formatWon(menu.pricePerPerson)}
                      </span>
                      <span
                        className={`font-bold tabular-nums ${
                          unavailable
                            ? 'text-red-700'
                            : lowStock
                              ? 'text-amber-800'
                              : 'text-[#2E531A]'
                        }`}
                      >
                        {!store.isOpen
                          ? '영업 중단'
                          : menu.isSoldOut || menu.stock <= 0
                            ? '품절'
                            : lowStock
                              ? `마감 임박 · ${menu.stock}개`
                              : menu.storePrice !== null &&
                                  menu.comparisonDate !== null &&
                                  menu.storePrice === menu.pricePerPerson
                                ? '매장 동일 가격'
                                : `재고 ${menu.stock}개`}
                      </span>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Compact Saved Preferences Strip */}
      <section className="bg-white border border-[#DDE3D7] rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-[#374033]">
            <span className="font-bold text-[#141812] flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-[#2E531A]" />
              내 맞춤 취향
            </span>
            <span className="tabular-nums">
              {preferences.defaultServings}인 ·{' '}
              {preferences.favoriteTags.join(', ') || '태그 전체'} ·{' '}
              {formatWon(preferences.defaultMaxBudget)} 이하 ·{' '}
              {preferences.defaultMaxMinutes}분
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onApplyPreferencesToInput(preferences)}
              className="min-h-[38px] px-3.5 py-1.5 bg-[#E7EFE1] hover:bg-[#D8E7CE] text-[#1F3A11] text-xs font-bold rounded-xl cursor-pointer"
            >
              취향 적용
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftPrefs(preferences);
                setEditingPrefs((prev) => !prev);
              }}
              className="min-h-[38px] px-3.5 py-1.5 border border-[#CBDCC0] bg-white hover:bg-[#F4F6F1] text-[#141812] text-xs font-semibold rounded-xl cursor-pointer"
            >
              {editingPrefs ? '닫기' : '수정'}
            </button>
          </div>
        </div>

        {prefsSavedNotice && (
          <div className="mt-2.5 flex items-center gap-1.5 text-xs font-bold text-[#2E531A]">
            <Check className="w-4 h-4" />
            <span>취향이 저장되었습니다.</span>
          </div>
        )}

        {editingPrefs && (
          <div className="mt-4 pt-4 border-t border-[#EBEFEB] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#374033] mb-1">
                  기본 인원
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={draftPrefs.defaultServings}
                  onChange={(e) =>
                    setDraftPrefs({
                      ...draftPrefs,
                      defaultServings: Math.max(
                        1,
                        parseInt(e.target.value, 10) || 1
                      ),
                    })
                  }
                  className="w-full min-h-[42px] px-3 border border-[#CBDCC0] rounded-xl text-sm font-mono tabular-nums text-[#141812]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#374033] mb-1">
                  기본 예산 (원 이하)
                </label>
                <input
                  type="number"
                  step={1000}
                  min={1000}
                  value={draftPrefs.defaultMaxBudget}
                  onChange={(e) =>
                    setDraftPrefs({
                      ...draftPrefs,
                      defaultMaxBudget: Math.max(
                        1000,
                        parseInt(e.target.value, 10) || 10000
                      ),
                    })
                  }
                  className="w-full min-h-[42px] px-3 border border-[#CBDCC0] rounded-xl text-sm font-mono tabular-nums text-[#141812]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#374033] mb-1">
                  기본 시간 (분 이내)
                </label>
                <input
                  type="number"
                  step={5}
                  min={5}
                  value={draftPrefs.defaultMaxMinutes}
                  onChange={(e) =>
                    setDraftPrefs({
                      ...draftPrefs,
                      defaultMaxMinutes: Math.max(
                        5,
                        parseInt(e.target.value, 10) || 30
                      ),
                    })
                  }
                  className="w-full min-h-[42px] px-3 border border-[#CBDCC0] rounded-xl text-sm font-mono tabular-nums text-[#141812]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_TAGS.map((tag) => {
                const active = draftPrefs.favoriteTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleDraftPrefTag(tag)}
                    className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-xl border cursor-pointer ${
                      active
                        ? 'bg-[#2E531A] border-[#2E531A] text-white'
                        : 'bg-white border-[#DDE3D7] text-[#374033]'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draftPrefs.memoNote}
                onChange={(e) =>
                  setDraftPrefs({ ...draftPrefs, memoNote: e.target.value })
                }
                placeholder="기본 요청 메모 (예: 일회용 수저 빼기)"
                className="flex-1 min-h-[42px] px-3 border border-[#CBDCC0] rounded-xl text-sm text-[#141812]"
              />
              <button
                type="button"
                onClick={handleSavePrefsSubmit}
                className="min-h-[42px] px-5 py-2 bg-[#2E531A] hover:bg-[#234113] text-white text-sm font-semibold rounded-xl cursor-pointer whitespace-nowrap"
              >
                저장
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
