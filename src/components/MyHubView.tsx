import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  MapPin,
  Minus,
  Plus,
  QrCode,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  TrendingDown,
  UserCheck,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import {
  AVAILABLE_TAGS,
  INITIAL_ZERO_CLICK_ROUTINE,
  MOCK_COUPONS,
} from '../data/seedData';
import {
  DemoRole,
  MenuItem,
  Order,
  SavedLocation,
  UserPreferences,
  WeekdayId,
  ZeroClickRoutine,
} from '../types/alle';
import { formatWon } from '../utils/parser';
import { calculateMonthlySavings } from '../utils/pricing';
import { BARO_PARTNER_KIT_SRC } from './AlleBrand';

interface MyHubViewProps {
  role: DemoRole;
  walletBalance: number;
  stampCount: number;
  preferences: UserPreferences;
  routine?: ZeroClickRoutine;
  wishlistCount: number;
  orderCount: number;
  orders?: Order[];
  menus?: MenuItem[];
  regularMenuId?: string;
  regularMenuName?: string;
  regularStoreName?: string;
  regularServings?: number;
  activeLocation?: SavedLocation;
  onTopupWalletConfirmed: (amount: number) => void;
  onEarnStamp: () => void;
  onChangeRole: (nextRole: DemoRole) => void;
  onShareDemoSummary: () => void;
  onSavePreferences: (nextPrefs: UserPreferences) => void;
  onSaveRoutine?: (nextRoutine: ZeroClickRoutine) => void;
  onGoToHomePrefs?: () => void;
  onQuickReorderToConfirm?: (menuId: string, servings: number) => void;
  onOpenAiChat?: (initialPrompt?: string) => void;
  onOpenLocationPicker?: () => void;
}

const SERVING_PRESETS = [1, 2, 3, 4];
const BUDGET_PRESETS = [15000, 20000, 25000, 30000, 40000, 50000];
const MINUTE_PRESETS = [20, 30, 40, 50, 60];
const MEMO_PRESETS = [
  '일회용 수저 빼기',
  '문 앞에 두고 벨 눌러주세요',
  '덜 맵게 해주세요',
];

const WEEKDAY_OPTIONS: Array<{ id: WeekdayId; label: string }> = [
  { id: 'mon', label: '월' },
  { id: 'tue', label: '화' },
  { id: 'wed', label: '수' },
  { id: 'thu', label: '목' },
  { id: 'fri', label: '금' },
  { id: 'sat', label: '토' },
  { id: 'sun', label: '일' },
];
const ALL_WEEKDAYS: WeekdayId[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_ONLY: WeekdayId[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const WEEKEND_ONLY: WeekdayId[] = ['sat', 'sun'];
const ROUTINE_LEAD_OPTIONS = [15, 20, 25, 30, 40];
const ROUTINE_MINUTES = [0, 10, 20, 30, 40, 50];
const ROUTINE_TIME_PRESETS: Array<{ label: string; hour: number; minute: number }> = [
  { label: '아침 08:00', hour: 8, minute: 0 },
  { label: '점심 11:30', hour: 11, minute: 30 },
  { label: '저녁 18:30', hour: 18, minute: 30 },
  { label: '야식 21:30', hour: 21, minute: 30 },
];

function formatRoutineDaysSummary(days: WeekdayId[]): string {
  if (days.length === 0 || days.length === 7) return '매일';
  if (
    days.length === 5 &&
    WEEKDAY_ONLY.every((d) => days.includes(d))
  ) {
    return '평일(월~금)';
  }
  if (
    days.length === 2 &&
    WEEKEND_ONLY.every((d) => days.includes(d))
  ) {
    return '주말(토·일)';
  }
  const ordered = WEEKDAY_OPTIONS.filter((w) => days.includes(w.id)).map(
    (w) => w.label
  );
  return `매주 ${ordered.join('·')}`;
}

function formatTime24(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function buildPreferencePrompt(prefs: UserPreferences): string {
  const tagsPart =
    prefs.favoriteTags.length > 0 ? `${prefs.favoriteTags.join(' ')}, ` : '';
  return `성인 ${prefs.defaultServings}명, ${tagsPart}총액 ${prefs.defaultMaxBudget.toLocaleString(
    'ko-KR'
  )}원 이하, ${prefs.defaultMaxMinutes}분 이내`;
}

export function MyHubView({
  role,
  walletBalance,
  stampCount,
  preferences,
  routine = INITIAL_ZERO_CLICK_ROUTINE,
  wishlistCount,
  orderCount,
  orders = [],
  menus = [],
  regularMenuId = 'm1',
  regularMenuName = '얼큰 소고기국밥',
  regularStoreName = '역삼 진국 소고기국밥',
  regularServings = 2,
  activeLocation,
  onTopupWalletConfirmed,
  onEarnStamp,
  onChangeRole,
  onShareDemoSummary,
  onSavePreferences,
  onSaveRoutine,
  onGoToHomePrefs,
  onQuickReorderToConfirm,
  onOpenAiChat,
  onOpenLocationPicker,
}: MyHubViewProps) {
  const [confirmTopupAmount, setConfirmTopupAmount] = useState<number | null>(
    null
  );
  const [editingRoutine, setEditingRoutine] = useState<boolean>(false);
  const [draftRoutine, setDraftRoutine] = useState<ZeroClickRoutine>(routine);
  const [routineSavedNotice, setRoutineSavedNotice] = useState<boolean>(false);
  const [showOperatorSettings, setShowOperatorSettings] =
    useState<boolean>(false);
  const [editingPrefs, setEditingPrefs] = useState<boolean>(false);
  const [draftPrefs, setDraftPrefs] = useState<UserPreferences>(preferences);
  const [prefsSavedNotice, setPrefsSavedNotice] = useState<boolean>(false);
  const savedTimerRef = useRef<number | null>(null);
  const routineTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!editingPrefs) {
      setDraftPrefs(preferences);
    }
  }, [preferences, editingPrefs]);

  useEffect(() => {
    if (!editingRoutine) {
      setDraftRoutine(routine);
    }
  }, [routine, editingRoutine]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
      if (routineTimerRef.current !== null) {
        window.clearTimeout(routineTimerRef.current);
      }
    };
  }, []);

  const toggleDraftRoutineDay = (day: WeekdayId) => {
    setDraftRoutine((prev) => {
      const exists = prev.days.includes(day);
      const nextDays = exists
        ? prev.days.filter((d) => d !== day)
        : WEEKDAY_OPTIONS.filter(
            (w) => w.id === day || prev.days.includes(w.id)
          ).map((w) => w.id);
      return {
        ...prev,
        days: nextDays.length > 0 ? nextDays : [day],
      };
    });
  };

  const handleSaveRoutineSubmit = () => {
    const safeDays =
      draftRoutine.days.length > 0 ? draftRoutine.days : (['fri'] as WeekdayId[]);
    const safeHour = Math.min(23, Math.max(0, Math.floor(draftRoutine.hour)));
    const safeMinute = Math.min(59, Math.max(0, Math.floor(draftRoutine.minute)));
    const safeLead = Math.min(60, Math.max(5, Math.floor(draftRoutine.leadMinutes)));
    const cleaned: ZeroClickRoutine = {
      enabled: draftRoutine.enabled,
      days: safeDays,
      hour: safeHour,
      minute: safeMinute,
      leadMinutes: safeLead,
      title:
        draftRoutine.title.trim() ||
        `${formatRoutineDaysSummary(safeDays)} ${formatTime24(safeHour, safeMinute)} 자동 제안`,
    };
    onSaveRoutine?.(cleaned);
    setDraftRoutine(cleaned);
    setEditingRoutine(false);
    setRoutineSavedNotice(true);
    if (routineTimerRef.current !== null) {
      window.clearTimeout(routineTimerRef.current);
    }
    routineTimerRef.current = window.setTimeout(() => {
      setRoutineSavedNotice(false);
    }, 2500);
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
    const cleaned: UserPreferences = {
      defaultServings: Math.min(
        20,
        Math.max(1, Math.floor(Number(draftPrefs.defaultServings) || 1))
      ),
      defaultMaxBudget: Math.max(
        5000,
        Math.floor(Number(draftPrefs.defaultMaxBudget) || 25000)
      ),
      defaultMaxMinutes: Math.min(
        120,
        Math.max(10, Math.floor(Number(draftPrefs.defaultMaxMinutes) || 30))
      ),
      favoriteTags: Array.from(new Set(draftPrefs.favoriteTags)),
      memoNote: draftPrefs.memoNote.trim(),
    };
    onSavePreferences(cleaned);
    setDraftPrefs(cleaned);
    setEditingPrefs(false);
    setPrefsSavedNotice(true);
    if (savedTimerRef.current !== null) {
      window.clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = window.setTimeout(() => {
      setPrefsSavedNotice(false);
    }, 2500);
  };

  const savingsSummary = useMemo(
    () => calculateMonthlySavings(orders, menus),
    [orders, menus]
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1D1A]">MY Baro</h1>
        </div>
        <button
          type="button"
          onClick={() => onOpenLocationPicker?.()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#EAF1E2] border border-[#E8ECE4] text-xs font-bold text-[#4E6E2A] cursor-pointer transition-colors"
        >
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>
            {activeLocation
              ? `${activeLocation.label} · ${activeLocation.areaName}`
              : '고객 A · 서울 강남구 역삼동'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        </button>
      </div>

      {/* Saved Preferences Inline Editor */}
      <section
        aria-label="저장된 내 취향 설정"
        className="os-card rounded-2xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3.5">
          <div className="space-y-1.5 min-w-0">
            <h2 className="!text-[18px] sm:!text-[19px] font-extrabold text-[#111827] flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-[#0F6B46] shrink-0" />
              <span>저장된 내 취향 설정</span>
            </h2>
            <p className="text-[15px] text-[#374151] font-medium tabular-nums leading-relaxed break-keep">
              {preferences.defaultServings}인 ·{' '}
              {preferences.favoriteTags.join(', ') || '태그 전체'} ·{' '}
              {formatWon(preferences.defaultMaxBudget)} 이하 ·{' '}
              {preferences.defaultMaxMinutes}분 이내
            </p>
            {preferences.memoNote.trim() && (
              <p className="text-[14px] text-[#4B5563]">
                기본 요청 메모: {preferences.memoNote.trim()}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto shrink-0">
            {onOpenAiChat && (
              <button
                type="button"
                onClick={() => onOpenAiChat(buildPreferencePrompt(preferences))}
                className="easy-compact min-h-[44px] px-3.5 sm:px-4 py-2 bg-[#0F6B46] hover:bg-[#0B5638] text-white text-[14.5px] font-bold rounded-xl whitespace-nowrap cursor-pointer transition-colors"
              >
                이 취향으로 추천
              </button>
            )}
            <button
              type="button"
              aria-expanded={editingPrefs}
              onClick={() => {
                if (!editingPrefs) {
                  setDraftPrefs(preferences);
                }
                setEditingPrefs((prev) => !prev);
              }}
              className={`easy-compact ${
                !onOpenAiChat ? 'col-span-2 ' : ''
              }min-h-[44px] px-3.5 sm:px-4 py-2 bg-[#EAF6F0] hover:bg-[#DCF0E6] text-[#0B4F34] text-[14.5px] font-bold rounded-xl whitespace-nowrap cursor-pointer transition-colors`}
            >
              {editingPrefs ? '닫기' : '취향 수정'}
            </button>
          </div>
        </div>

        {prefsSavedNotice && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EAF6F0] text-[#0F6B46] text-[14px] font-bold">
            <Check className="w-4 h-4 shrink-0" />
            <span>내 취향이 저장되었습니다.</span>
          </div>
        )}

        {editingPrefs && (
          <div className="pt-4 border-t border-[#E5E8EC] space-y-5">
            {/* 1. 기본 인원 */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15.5px] font-bold text-[#111827]">
                  기본 인원
                </span>
                <span className="text-[15px] font-extrabold text-[#0F6B46] tabular-nums">
                  {draftPrefs.defaultServings}인
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap gap-2">
                  {SERVING_PRESETS.map((n) => {
                    const active = draftPrefs.defaultServings === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() =>
                          setDraftPrefs((prev) => ({
                            ...prev,
                            defaultServings: n,
                          }))
                        }
                        className={`easy-compact min-h-[42px] px-4 py-2 rounded-xl text-[14.5px] font-bold border transition-colors cursor-pointer tabular-nums ${
                          active
                            ? 'bg-[#0F6B46] border-[#0F6B46] text-white'
                            : 'bg-white hover:bg-[#EAF6F0] border-[#D7DEE5] text-[#374151]'
                        }`}
                      >
                        {n}인
                      </button>
                    );
                  })}
                </div>
                <div className="inline-flex items-center gap-2 bg-[#F6F7F8] border border-[#E5E8EC] rounded-xl p-1">
                  <button
                    type="button"
                    aria-label="인원 감소"
                    onClick={() =>
                      setDraftPrefs((prev) => ({
                        ...prev,
                        defaultServings: Math.max(1, prev.defaultServings - 1),
                      }))
                    }
                    disabled={draftPrefs.defaultServings <= 1}
                    className="easy-compact w-10 h-10 rounded-lg bg-white hover:bg-[#EAF6F0] border border-[#D7DEE5] text-[#111827] flex items-center justify-center cursor-pointer disabled:opacity-40"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="min-w-[44px] text-center text-[15px] font-extrabold font-mono tabular-nums text-[#111827]">
                    {draftPrefs.defaultServings}인
                  </span>
                  <button
                    type="button"
                    aria-label="인원 증가"
                    onClick={() =>
                      setDraftPrefs((prev) => ({
                        ...prev,
                        defaultServings: Math.min(20, prev.defaultServings + 1),
                      }))
                    }
                    disabled={draftPrefs.defaultServings >= 20}
                    className="easy-compact w-10 h-10 rounded-lg bg-white hover:bg-[#EAF6F0] border border-[#D7DEE5] text-[#111827] flex items-center justify-center cursor-pointer disabled:opacity-40"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* 2. 기본 예산 (총액 기준) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="pref-budget-input"
                  className="text-[15.5px] font-bold text-[#111827]"
                >
                  기본 예산 (총액 기준)
                </label>
                <span className="text-[15px] font-extrabold text-[#0F6B46] tabular-nums">
                  {formatWon(draftPrefs.defaultMaxBudget || 0)} 이하
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {BUDGET_PRESETS.map((amount) => {
                  const active = draftPrefs.defaultMaxBudget === amount;
                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() =>
                        setDraftPrefs((prev) => ({
                          ...prev,
                          defaultMaxBudget: amount,
                        }))
                      }
                      className={`easy-compact min-h-[42px] px-3.5 py-2 rounded-xl text-[14.5px] font-bold border transition-colors cursor-pointer tabular-nums ${
                        active
                          ? 'bg-[#0F6B46] border-[#0F6B46] text-white'
                          : 'bg-white hover:bg-[#EAF6F0] border-[#D7DEE5] text-[#374151]'
                      }`}
                    >
                      {formatWon(amount)}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="pref-budget-input"
                  type="number"
                  step={1000}
                  min={5000}
                  max={200000}
                  value={draftPrefs.defaultMaxBudget || ''}
                  onChange={(e) => {
                    const nextVal = parseInt(e.target.value, 10);
                    setDraftPrefs((prev) => ({
                      ...prev,
                      defaultMaxBudget: Number.isNaN(nextVal)
                        ? 0
                        : Math.min(200000, Math.max(0, nextVal)),
                    }));
                  }}
                  onBlur={() =>
                    setDraftPrefs((prev) => ({
                      ...prev,
                      defaultMaxBudget: Math.max(
                        5000,
                        Math.min(200000, prev.defaultMaxBudget || 25000)
                      ),
                    }))
                  }
                  className="flex-1 min-w-0 min-h-[46px] px-3.5 border border-[#D7DEE5] focus:border-[#0F6B46] rounded-xl text-[15.5px] font-mono tabular-nums text-[#111827] bg-white"
                />
                <span className="text-[15px] font-semibold text-[#374151] shrink-0">
                  원 이하
                </span>
              </div>
            </div>

            {/* 3. 희망 배달시간 */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15.5px] font-bold text-[#111827]">
                  희망 배달시간
                </span>
                <span className="text-[15px] font-extrabold text-[#0F6B46] tabular-nums">
                  {draftPrefs.defaultMaxMinutes}분 이내
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {MINUTE_PRESETS.map((min) => {
                  const active = draftPrefs.defaultMaxMinutes === min;
                  return (
                    <button
                      key={min}
                      type="button"
                      onClick={() =>
                        setDraftPrefs((prev) => ({
                          ...prev,
                          defaultMaxMinutes: min,
                        }))
                      }
                      className={`easy-compact min-h-[42px] px-4 py-2 rounded-xl text-[14.5px] font-bold border transition-colors cursor-pointer tabular-nums ${
                        active
                          ? 'bg-[#0F6B46] border-[#0F6B46] text-white'
                          : 'bg-white hover:bg-[#EAF6F0] border-[#D7DEE5] text-[#374151]'
                      }`}
                    >
                      {min}분
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. 선호 음식 · 맛 취향 */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15.5px] font-bold text-[#111827]">
                  선호 음식 · 맛 취향
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[14px] font-bold text-[#0F6B46] tabular-nums">
                    {draftPrefs.favoriteTags.length}개 선택
                  </span>
                  {draftPrefs.favoriteTags.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftPrefs((prev) => ({
                          ...prev,
                          favoriteTags: [],
                        }))
                      }
                      className="easy-compact min-h-[34px] px-2.5 py-1 rounded-lg bg-[#EFF2F5] hover:bg-[#E5E8EC] text-[13px] font-bold text-[#4B5563] cursor-pointer transition-colors"
                    >
                      전체 해제
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_TAGS.map((tag) => {
                  const active = draftPrefs.favoriteTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleDraftPrefTag(tag)}
                      className={`easy-compact min-h-[40px] px-3.5 py-1.5 rounded-full text-[14.5px] font-bold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#0F6B46] border-[#0F6B46] text-white'
                          : 'bg-white hover:bg-[#EAF6F0] border-[#D7DEE5] text-[#374151]'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5. 기본 요청 메모 */}
            <div className="space-y-2.5">
              <label
                htmlFor="pref-memo-input"
                className="block text-[15.5px] font-bold text-[#111827]"
              >
                기본 요청 메모 (결제·재주문 시 자동 입력)
              </label>
              <input
                id="pref-memo-input"
                type="text"
                value={draftPrefs.memoNote}
                onChange={(e) =>
                  setDraftPrefs((prev) => ({
                    ...prev,
                    memoNote: e.target.value,
                  }))
                }
                placeholder="예: 일회용 수저 빼기, 문 앞에 놓아주세요"
                className="w-full min-h-[46px] px-3.5 border border-[#D7DEE5] focus:border-[#0F6B46] rounded-xl text-[15.5px] text-[#111827] bg-white"
              />
              <div className="flex flex-wrap gap-2">
                {MEMO_PRESETS.map((preset) => {
                  const selected = draftPrefs.memoNote.trim() === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        setDraftPrefs((prev) => ({
                          ...prev,
                          memoNote:
                            prev.memoNote.trim() === preset ? '' : preset,
                        }))
                      }
                      className={`easy-compact min-h-[38px] px-3 py-1.5 rounded-full text-[13.5px] font-bold border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#EAF6F0] border-[#0F6B46] text-[#0B4F34]'
                          : 'bg-[#F6F7F8] hover:bg-[#EAF6F0] border-[#E5E8EC] text-[#4B5563]'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 6. Footer action buttons */}
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDraftPrefs(preferences);
                  setEditingPrefs(false);
                }}
                className="easy-compact min-h-[48px] px-4 py-2.5 bg-[#EFF2F5] hover:bg-[#E5E8EC] text-[#111827] text-[15.5px] font-bold rounded-2xl cursor-pointer transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSavePrefsSubmit}
                className="easy-compact min-h-[48px] px-4 py-2.5 bg-[#0F6B46] hover:bg-[#0B5638] text-white text-[15.5px] font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>취향 저장하기</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Monthly Food Expense Savings Report Card */}
      <section
        aria-label="이번 달 Baro로 아낀 외식비"
        className="bg-[#EAF1E2] border border-[#82B440]/50 rounded-2xl p-5 sm:p-6 space-y-4 shadow-[0_2px_12px_rgba(78,110,42,0.06)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3D5720]">
              <TrendingDown className="w-4 h-4 text-[#4E6E2A]" />
              <span>이번 달 Baro로 아낀 외식비</span>
            </div>
            <div className="os-kpi text-3xl sm:text-4xl font-bold text-[#4E6E2A]">
              +{formatWon(savingsSummary.totalSaved)} 절약
            </div>
            <p className="text-xs text-[#3D5720]">
              유효 주문 {savingsSummary.validOrderCount}건 · 착한가격(매장 동일가) · 수수료 0% 혜택 적용 중
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-white border border-[#D4E1C5] text-xs font-bold text-[#4E6E2A] shrink-0">
            착한가격 · 수수료 0%
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="p-3 bg-white/90 border border-[#D4E1C5] rounded-2xl">
            <div className="text-[11px] font-semibold text-[#687064]">
              착한가격으로 아낀 차액
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-[#1A1D1A] mt-0.5">
              +{formatWon(savingsSummary.dualPriceAvoidedTotal)}
            </div>
          </div>
          <div className="p-3 bg-white/90 border border-[#D4E1C5] rounded-2xl">
            <div className="text-[11px] font-semibold text-[#687064]">
              쿠폰 · 특가 · 묶음 절감
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-[#4E6E2A] mt-0.5">
              +{formatWon(savingsSummary.discountAndDeliverySavedTotal)}
            </div>
          </div>
        </div>
      </section>

      {/* Encrypted Alias Profile & allePay Wallet */}
      <section className="os-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#687064] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#4E6E2A]" />
              <span>안심 가명 프로필</span>
            </div>
            <div className="text-lg font-bold text-[#1A1D1A] mt-1">
              고객 A · {activeLocation?.detailAddress ?? '역삼동 수령지 A'}
            </div>
            <p className="text-xs text-[#687064] mt-0.5 tabular-nums">
              주문 {orderCount}건 · 찜 {wishlistCount}개 · 스탬프{' '}
              {stampCount}개
            </p>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-xs font-semibold text-[#687064] flex items-center sm:justify-end gap-1">
              <Wallet className="w-3.5 h-3.5 text-[#4E6E2A]" />
              <span>Baro페이 잔액</span>
            </div>
            <div className="text-2xl font-bold text-[#4E6E2A] font-mono tabular-nums mt-0.5">
              {formatWon(walletBalance)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[#E8ECE4]">
          <button
            type="button"
            onClick={() => setConfirmTopupAmount(10000)}
            className="min-h-[44px] px-4 py-2.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-sm font-bold rounded-2xl cursor-pointer"
          >
            + 10,000원 충전
          </button>
          <button
            type="button"
            onClick={onShareDemoSummary}
            className="min-h-[44px] px-4 py-2.5 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-sm font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>내 요약 공유하기</span>
          </button>
        </div>
      </section>

      {/* Zero-Click Routine */}
      <section
        aria-label="나의 Zero-Click 단골 루틴"
        className="os-card rounded-2xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#1A1D1A] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#0F6B46]" />
              <span>나의 Zero-Click 단골 루틴</span>
            </h2>
            <p className="text-xs text-[#687064] mt-0.5">
              원하는 요일·시각을 지정해 3초 만에 자주 먹던 메뉴를 자동 제안받으세요
            </p>
          </div>
          <button
            type="button"
            aria-expanded={editingRoutine}
            onClick={() => {
              if (!editingRoutine) {
                setDraftRoutine(routine);
              }
              setEditingRoutine((prev) => !prev);
            }}
            className="easy-compact min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#EAF6F0] hover:bg-[#DCF0E6] text-[#0B4F34] text-[14px] font-bold cursor-pointer transition-colors shrink-0"
          >
            {editingRoutine ? '루틴 닫기' : '루틴 설정'}
          </button>
        </div>

        {routineSavedNotice && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EAF6F0] text-[#0F6B46] text-[14px] font-bold">
            <Check className="w-4 h-4 shrink-0" />
            <span>단골 루틴 일정이 저장되었습니다.</span>
          </div>
        )}

        {editingRoutine && (
          <div className="p-4 bg-[#F9FBFA] border border-[#CFE4D8] rounded-2xl space-y-5">
            {/* 요일 선택 */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[15.5px] font-bold text-[#111827]">
                  알림 요일
                </span>
                <span className="text-[14px] font-extrabold text-[#0F6B46]">
                  {formatRoutineDaysSummary(draftRoutine.days)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: '매일', days: ALL_WEEKDAYS },
                  { label: '평일', days: WEEKDAY_ONLY },
                  { label: '주말', days: WEEKEND_ONLY },
                  { label: '금요일만', days: ['fri'] as WeekdayId[] },
                ].map((preset) => {
                  const isMatch =
                    preset.days.length === draftRoutine.days.length &&
                    preset.days.every((d) => draftRoutine.days.includes(d));
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setDraftRoutine((prev) => ({
                          ...prev,
                          days: [...preset.days],
                        }))
                      }
                      className={`easy-compact min-h-[36px] px-3 py-1 rounded-full text-[13.5px] font-bold border cursor-pointer transition-colors ${
                        isMatch
                          ? 'bg-[#EAF6F0] border-[#0F6B46] text-[#0B4F34]'
                          : 'bg-[#F6F7F8] hover:bg-[#EAF6F0] border-[#E5E8EC] text-[#4B5563]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_OPTIONS.map((w) => {
                  const active = draftRoutine.days.includes(w.id);
                  return (
                    <button
                      key={w.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleDraftRoutineDay(w.id)}
                      className={`easy-compact min-h-[42px] rounded-xl text-[14.5px] font-bold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#0F6B46] border-[#0F6B46] text-white'
                          : 'bg-white hover:bg-[#EAF6F0] border-[#D7DEE5] text-[#374151]'
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 시각 설정 (시/분 + 프리셋) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15.5px] font-bold text-[#111827]">
                  알림 시각 (시 · 분)
                </span>
                <span className="text-[15px] font-extrabold text-[#0F6B46] font-mono tabular-nums">
                  {formatTime24(draftRoutine.hour, draftRoutine.minute)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ROUTINE_TIME_PRESETS.map((tp) => {
                  const active =
                    draftRoutine.hour === tp.hour &&
                    draftRoutine.minute === tp.minute;
                  return (
                    <button
                      key={tp.label}
                      type="button"
                      onClick={() =>
                        setDraftRoutine((prev) => ({
                          ...prev,
                          hour: tp.hour,
                          minute: tp.minute,
                        }))
                      }
                      className={`easy-compact min-h-[38px] px-3 py-1.5 rounded-xl text-[13.5px] font-bold border cursor-pointer transition-colors tabular-nums ${
                        active
                          ? 'bg-[#0F6B46] border-[#0F6B46] text-white'
                          : 'bg-white hover:bg-[#EAF6F0] border-[#D7DEE5] text-[#374151]'
                      }`}
                    >
                      {tp.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <select
                  aria-label="루틴 알림 시"
                  value={draftRoutine.hour}
                  onChange={(e) =>
                    setDraftRoutine((prev) => ({
                      ...prev,
                      hour: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  className="min-h-[44px] px-3 bg-white border border-[#D7DEE5] rounded-xl text-[15px] font-bold text-[#111827]"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}시
                    </option>
                  ))}
                </select>
                <select
                  aria-label="루틴 알림 분"
                  value={draftRoutine.minute}
                  onChange={(e) =>
                    setDraftRoutine((prev) => ({
                      ...prev,
                      minute: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  className="min-h-[44px] px-3 bg-white border border-[#D7DEE5] rounded-xl text-[15px] font-bold text-[#111827]"
                >
                  {ROUTINE_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}분
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 사전 알림 시점 */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15.5px] font-bold text-[#111827]">
                  도착 전 알림 시점
                </span>
                <span className="text-[14.5px] font-extrabold text-[#0F6B46] tabular-nums">
                  {draftRoutine.leadMinutes}분 전 알림
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ROUTINE_LEAD_OPTIONS.map((lead) => {
                  const active = draftRoutine.leadMinutes === lead;
                  return (
                    <button
                      key={lead}
                      type="button"
                      onClick={() =>
                        setDraftRoutine((prev) => ({
                          ...prev,
                          leadMinutes: lead,
                        }))
                      }
                      className={`easy-compact min-h-[40px] px-3.5 py-1.5 rounded-xl text-[14px] font-bold border transition-colors cursor-pointer tabular-nums ${
                        active
                          ? 'bg-[#0F6B46] border-[#0F6B46] text-white'
                          : 'bg-white hover:bg-[#EAF6F0] border-[#D7DEE5] text-[#374151]'
                      }`}
                    >
                      {lead}분 전
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 루틴 이름 */}
            <div className="space-y-2">
              <label
                htmlFor="routine-title-input"
                className="block text-[15.5px] font-bold text-[#111827]"
              >
                루틴 이름
              </label>
              <input
                id="routine-title-input"
                type="text"
                value={draftRoutine.title}
                onChange={(e) =>
                  setDraftRoutine((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="예: 평일 저녁 퇴근길 자동 제안"
                className="w-full min-h-[46px] px-3.5 border border-[#D7DEE5] focus:border-[#0F6B46] rounded-xl text-[15.5px] text-[#111827] bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setDraftRoutine(routine);
                  setEditingRoutine(false);
                }}
                className="easy-compact min-h-[46px] px-4 py-2 bg-[#EFF2F5] hover:bg-[#E5E8EC] text-[#111827] text-[15px] font-bold rounded-2xl cursor-pointer transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveRoutineSubmit}
                className="easy-compact min-h-[46px] px-4 py-2 bg-[#0F6B46] hover:bg-[#0B5638] text-white text-[15px] font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>루틴 저장하기</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 bg-[#F6F7F8] border border-[#D7DEE5] rounded-2xl flex flex-col justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[13.5px] font-bold text-[#0F6B46] min-w-0">
                  <CalendarClock className="w-4 h-4 shrink-0" />
                  <span className="truncate tabular-nums">
                    {formatRoutineDaysSummary(routine.days)}{' '}
                    {formatTime24(routine.hour, routine.minute)} 자동 알림
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={routine.enabled}
                  onClick={() => {
                    const next = { ...routine, enabled: !routine.enabled };
                    setDraftRoutine(next);
                    onSaveRoutine?.(next);
                  }}
                  className={`easy-compact min-h-[30px] px-2.5 py-0.5 rounded-lg text-[12px] font-bold border transition-colors cursor-pointer shrink-0 ${
                    routine.enabled
                      ? 'bg-[#0F6B46] border-[#0F6B46] text-white'
                      : 'bg-white border-[#D7DEE5] text-[#4B5563]'
                  }`}
                >
                  {routine.enabled ? '자동 ON' : '꺼짐'}
                </button>
              </div>
              <div>
                <h3 className="text-[15.5px] font-extrabold text-[#111827]">
                  {routine.title}
                </h3>
                <p className="text-[13.5px] text-[#4B5563] mt-1 leading-relaxed tabular-nums">
                  설정한 시간 기준 도착{' '}
                  <strong className="text-[#111827]">
                    {routine.leadMinutes}분 전
                  </strong>{' '}
                  ‘{regularMenuName}’ 등 맞춤 메뉴를 먼저 제안합니다.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onOpenAiChat
                  ? onOpenAiChat(buildPreferencePrompt(preferences))
                  : onGoToHomePrefs?.()
              }
              className="w-full min-h-[42px] px-3.5 py-2 bg-white hover:bg-[#EAF6F0] border border-[#CBD5DF] text-[#0B4F34] text-[14px] font-bold rounded-xl cursor-pointer transition-colors"
            >
              지금 맞춤 제안 바로 보기
            </button>
          </div>

          <div className="p-4 bg-[#EAF6F0] text-[#111827] border border-[#CFE4D8] rounded-2xl flex flex-col justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[#0B4F34] flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-[#0F6B46] fill-[#0F6B46] shrink-0" />
                  <span>탐색 0단계 · 단골 고정</span>
                </span>
                <span className="font-mono font-semibold text-[#0F6B46] tabular-nums">
                  평균 3초
                </span>
              </div>
              <div>
                <h3 className="text-[15.5px] font-extrabold text-[#111827]">
                  원탭 3초 재주문
                </h3>
                <p className="text-[13.5px] text-[#0B4F34] mt-1 leading-relaxed">
                  {regularStoreName} ·{' '}
                  <strong className="text-[#111827] font-bold">
                    {regularMenuName} ({regularServings}인)
                  </strong>{' '}
                  이전 옵션과 요청사항 그대로 즉시 주문합니다.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onQuickReorderToConfirm
                  ? onQuickReorderToConfirm(regularMenuId, regularServings)
                  : onGoToHomePrefs?.()
              }
              className="w-full min-h-[42px] px-3.5 py-2 bg-[#0F6B46] hover:bg-[#0B5638] text-white text-[14px] font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>원탭 3초 재주문 실행</span>
            </button>
          </div>
        </div>
      </section>

      {/* O2O Stamps & Coupons */}
      <section className="os-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1A1D1A] flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-[#4E6E2A]" />
              <span>단골 스탬프 & 쿠폰함</span>
            </h2>
            <p className="text-xs text-[#687064] mt-0.5">
              결제 시 가장 큰 할인 쿠폰이 자동으로 적용됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onEarnStamp}
            className="min-h-[38px] px-3.5 py-1.5 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs font-bold rounded-xl cursor-pointer"
          >
            QR 스탬프 +1 적립 ({stampCount}개)
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs tabular-nums">
            <span className="font-semibold text-[#3D5720]">
              단골 스탬프 달성률
            </span>
            <span className="font-mono font-bold text-[#4E6E2A]">
              {Math.min(stampCount, 5)} / 5개
            </span>
          </div>
          <div className="h-2 w-full bg-[#EAF1E2] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#82B440] rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.round((stampCount / 5) * 100))}%`,
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          {MOCK_COUPONS.filter((c) => c.code !== 'NONE').map((cp) => {
            const unlocked = !cp.requiresStamps || stampCount >= cp.requiresStamps;
            return (
              <div
                key={cp.id}
                className="p-3.5 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#1A1D1A] flex items-center gap-1.5">
                    <Ticket className="w-4 h-4 text-[#4E6E2A] shrink-0" />
                    <span className="truncate">{cp.label}</span>
                  </div>
                  <div className="text-xs text-[#687064] mt-0.5">
                    코드: {cp.code}
                    {cp.requiresStamps
                      ? ` · 스탬프 ${cp.requiresStamps}개 필요 (${
                          unlocked ? '사용 가능' : '미달'
                        })`
                      : ' · 즉시 사용 가능'}
                  </div>
                </div>
                <span
                  className={`font-mono tabular-nums text-sm font-bold shrink-0 ${
                    unlocked ? 'text-[#4E6E2A]' : 'text-[#687064]'
                  }`}
                >
                  -{formatWon(cp.discountAmount)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Baro Partner / Errand Rider Application Card */}
      <section className="os-card rounded-2xl overflow-hidden bg-[#FDF7EE] border-[#E8DFC8] p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4">
        <img
          src={BARO_PARTNER_KIT_SRC}
          alt="Baro 모자와 보온 배달 가방"
          className="w-full sm:w-44 h-28 rounded-2xl object-cover border border-[#E8DFC8] shrink-0"
        />
        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          <div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-xs font-bold">
              바로 배달 · 심부름 파트너
            </span>
            <h2 className="text-base font-extrabold text-[#1A1D1A] mt-1">
              바로 배달원 · 심부름 파트너 신청
            </h2>
            <p className="text-xs sm:text-sm text-[#555E52] mt-0.5 break-keep leading-relaxed">
              Baro 공식 모자와 보온 가방을 매고 우리 동네 배달·심부름 파트너로 활동해 보세요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChangeRole(DemoRole.PARTNER)}
            className="easy-compact min-h-[40px] px-4 py-2 rounded-xl bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold cursor-pointer transition-colors"
          >
            배달 파트너 · 심부름 신청하기
          </button>
        </div>
      </section>

      {/* Collapsible Demo Role Settings (Separated from Consumer Flow) */}
      <section className="os-card rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowOperatorSettings((prev) => !prev)}
          aria-expanded={showOperatorSettings}
          className="w-full min-h-[54px] px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#F7F8F5] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#434B40]">
            <UserCheck className="w-4 h-4 text-[#0F6B46]" />
            <span>고객 / 점주 관리자 / 배달 파트너 시연 설정</span>
          </div>
          {showOperatorSettings ? (
            <ChevronUp className="w-4 h-4 text-[#687064]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#687064]" />
          )}
        </button>

        {showOperatorSettings && (
          <div className="px-5 pb-5 pt-3 border-t border-[#E8ECE4]">
            <div className="grid grid-cols-3 gap-2 p-1.5 bg-[#EFF2F5] border border-[#E5E8EC] rounded-2xl">
              {(
                [
                  { id: DemoRole.CONSUMER, label: '고객' },
                  { id: DemoRole.OWNER, label: '점주 · 관리자' },
                  { id: DemoRole.PARTNER, label: '배달 파트너' },
                ] as const
              ).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onChangeRole(r.id)}
                  className={`min-h-[42px] px-2 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                    role === r.id
                      ? 'bg-[#0F6B46] text-white shadow-2xs'
                      : 'text-[#4B5563] hover:text-[#111827]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Final Confirmation Modal for allePay Top-Up */}
      {confirmTopupAmount !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-2xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="topup-confirm-title"
        >
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl border border-[#E8ECE4] p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-[#4E6E2A]">
                  충전 확인
                </span>
                <h2
                  id="topup-confirm-title"
                  className="text-lg font-bold text-[#1A1D1A] mt-1"
                >
                  Baro페이 {formatWon(confirmTopupAmount)} 충전
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirmTopupAmount(null)}
                aria-label="닫기"
                className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-[#F7F8F5] flex items-center justify-center text-[#687064] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl space-y-1.5 text-sm">
              <div className="flex justify-between text-[#555E52]">
                <span>현재 잔액</span>
                <span className="font-mono tabular-nums">
                  {formatWon(walletBalance)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-[#4E6E2A]">
                <span>충전 후 잔액</span>
                <span className="font-mono tabular-nums">
                  {formatWon(walletBalance + confirmTopupAmount)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmTopupAmount(null)}
                className="min-h-[46px] px-4 py-2.5 bg-[#F0F3EC] text-[#1A1D1A] text-sm font-bold rounded-2xl cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  onTopupWalletConfirmed(confirmTopupAmount);
                  setConfirmTopupAmount(null);
                }}
                className="min-h-[46px] px-4 py-2.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>충전 확정</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
