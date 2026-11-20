import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  AudioLines,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Heart,
  MessageSquare,
  Mic,
  MicOff,
  RotateCcw,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Ticket,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { MOCK_COUPONS, VOICE_TRANSCRIPT_SAMPLES } from '../data/seedData';
import {
  MenuItem,
  OrderLineItem,
  ParsedCondition,
  PaymentMethod,
  Review,
  SavedLocation,
  Store,
  SuperAppTab,
} from '../types/alle';
import {
  buildRuleReviewSummary,
  checkServerGeminiAvailable,
  hasGeminiApiKey,
  parseConditionWithAI,
} from '../utils/gemini';
import {
  DISH_CATEGORY_TAGS,
  evaluateRecommendations,
  formatWon,
  getEffectiveMenuPrice,
  isStoreDeliverableToLocation,
  parseConditionInput,
} from '../utils/parser';
import {
  estimateCompetitorSavings,
  getBestCoupon,
  getLocalCurrencyLabel,
} from '../utils/pricing';
import {
  getSpeechRecognitionConstructor,
  isSpeechSynthesisSupported,
  speakKoreanText,
  startKoreanVoiceInput,
  stopSpeaking,
} from '../utils/voice';
import { AlleBotIllustration } from './AlleBrand';
import { FoodImage } from './FoodImage';

interface IntentChip {
  id: string;
  label: string;
  tone: 'primary' | 'secondary' | 'accent';
}

function buildIntentChips(
  condition: ParsedCondition,
  hasWishlistOrRegular: boolean
): IntentChip[] {
  const chips: IntentChip[] = [];

  const remainingTags = [...condition.tags];
  if (remainingTags.includes('얼큰한') && remainingTags.includes('국물')) {
    chips.push({ id: 'tag-spicy-soup', label: '#얼큰한국물', tone: 'primary' });
    remainingTags.splice(remainingTags.indexOf('얼큰한'), 1);
    remainingTags.splice(remainingTags.indexOf('국물'), 1);
  } else if (remainingTags.includes('담백한') && remainingTags.includes('국물')) {
    chips.push({ id: 'tag-mild-soup', label: '#담백한국물', tone: 'primary' });
    remainingTags.splice(remainingTags.indexOf('담백한'), 1);
    remainingTags.splice(remainingTags.indexOf('국물'), 1);
  } else if (remainingTags.includes('커피') && remainingTags.includes('케이크')) {
    chips.push({ id: 'tag-coffee-cake', label: '#커피·케이크', tone: 'primary' });
    remainingTags.splice(remainingTags.indexOf('커피'), 1);
    remainingTags.splice(remainingTags.indexOf('케이크'), 1);
  } else if (remainingTags.includes('다이어트') && remainingTags.includes('샐러드')) {
    chips.push({ id: 'tag-diet-salad', label: '#다이어트샐러드', tone: 'primary' });
    remainingTags.splice(remainingTags.indexOf('다이어트'), 1);
    remainingTags.splice(remainingTags.indexOf('샐러드'), 1);
  } else if (remainingTags.includes('전') && remainingTags.includes('국물')) {
    chips.push({ id: 'tag-rainy-jeon', label: '#비오는날전·국물', tone: 'primary' });
    remainingTags.splice(remainingTags.indexOf('전'), 1);
    remainingTags.splice(remainingTags.indexOf('국물'), 1);
  } else if (remainingTags.includes('바삭한') && remainingTags.includes('돈까스')) {
    chips.push({ id: 'tag-crispy-katsu', label: '#바삭돈가스', tone: 'primary' });
    remainingTags.splice(remainingTags.indexOf('바삭한'), 1);
    remainingTags.splice(remainingTags.indexOf('돈까스'), 1);
  }

  for (const tag of remainingTags.slice(0, 3)) {
    chips.push({ id: `tag-${tag}`, label: `#${tag}`, tone: 'primary' });
  }

  for (const exTag of condition.excludeTags ?? []) {
    chips.push({ id: `ex-${exTag}`, label: `#제외:${exTag}`, tone: 'accent' });
  }

  if (condition.maxMinutes !== null) {
    chips.push({
      id: `min-${condition.maxMinutes}`,
      label: `#${condition.maxMinutes}분이내`,
      tone: 'accent',
    });
  }

  if (condition.maxBudget !== null) {
    chips.push({
      id: `budget-${condition.maxBudget}`,
      label: `#${condition.maxBudget.toLocaleString('ko-KR')}원이하`,
      tone: 'secondary',
    });
  }

  chips.push({
    id: `servings-${condition.servings}`,
    label: condition.servings === 1 ? '#혼밥1인' : `#성인${condition.servings}명`,
    tone: 'secondary',
  });

  if (hasWishlistOrRegular) {
    chips.push({
      id: 'ctx-regular-store',
      label: '#단골매장',
      tone: 'accent',
    });
  }

  return chips;
}

interface VoiceCheckoutDraft {
  menuId: string;
  servings: number;
  selectedOptionIds: string[];
  paymentMethod: PaymentMethod;
  customerNote: string;
}

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  spokenText?: string;
  parsed?: ParsedCondition;
  matchedMenuIds?: string[];
  servings?: number;
  isEmptyRelaxPrompt?: boolean;
  stagedMenuId?: string;
  checkoutDraftSnapshot?: VoiceCheckoutDraft;
  aiSource?: 'gemini' | 'rule';
  actionLink?: {
    label: string;
    tab?: SuperAppTab;
    relayMenuId?: string;
  };
}

interface RecommendedSpotlightState {
  msgId: string;
  menuIds: string[];
  activeIndex: number;
  explanation: string;
  servings: number;
}

interface AiChatOrderViewProps {
  stores: Store[];
  menus: MenuItem[];
  reviews?: Review[];
  wishlistIds: string[];
  activeLocation?: SavedLocation;
  initialPrompt?: string;
  walletBalance?: number;
  stampCount?: number;
  defaultNote?: string;
  onToggleWishlist: (menuId: string) => void;
  onBackToHome: () => void;
  onOpenAiSettings?: () => void;
  onOpenSuperApp?: (tab: SuperAppTab) => void;
  onUseRelayCoupon?: (menuId: string) => void;
  onAddToCart?: (
    menuId: string,
    quantity?: number,
    selectedOptionIds?: string[]
  ) => void;
  onOpenRecommendationWithCondition: (
    condition: ParsedCondition,
    selectedMenuId?: string
  ) => void;
  onProceedToConfirm: (payload: {
    menuId: string;
    servings: number;
    selectedOptionIds: string[];
    couponCode: string;
  }) => void;
  onCompleteVoiceOrder?: (payload: {
    menuId: string;
    servings: number;
    selectedOptionIds: string[];
    items: OrderLineItem[];
    couponCode: string;
    couponDiscount: number;
    sharedDeliveryApplied: boolean;
    reservationSlot: string | null;
    customerAlias: string;
    addressAlias: string;
    customerNote: string;
    paymentMethod: PaymentMethod;
    paymentMethodLabel: string;
    estimatedSavings: number;
  }) => { ok: boolean; error?: string };
}

function detectPaymentMethodFromSpeech(rawText: string): PaymentMethod | null {
  const t = rawText.toLowerCase().trim();
  if (/카카오/.test(t)) return 'kakaopay';
  if (/토스/.test(t)) return 'tosspay';
  if (/네이버/.test(t)) return 'naverpay';
  if (/(alle\s*페이|알레\s*페이|올레\s*페이|페이\s*잔액|지갑\s*잔액|예치금)/.test(t)) {
    return 'alle_pay';
  }
  if (/(지역\s*화폐|사랑\s*상품권|동백전|대구로페이|이음|상생카드)/.test(t)) {
    return 'local_currency';
  }
  if (/(기업\s*식대|복지\s*식대|식대\s*포인트|식대|법인)/.test(t)) {
    return 'b2b_meal_point';
  }
  if (/(등록\s*카드|원클릭\s*카드|신용카드|카드)/.test(t)) {
    return 'card_oneclick';
  }
  return null;
}

function extractExplicitQuantity(rawText: string): number | null {
  const trimmed = rawText.trim();
  const numeric = trimmed.match(/(\d+)\s*(?:인분|개|명|잔|그릇|마리)/);
  if (numeric) {
    const n = parseInt(numeric[1], 10);
    if (n >= 1 && n <= 20) return n;
  }
  if (/(?:^|\s)(?:한\s*(?:개|인분|명|잔|그릇|마리)|하나(?:만)?)(?:\s|$|[,.!?])/.test(trimmed)) {
    return 1;
  }
  if (/(?:^|\s)(?:두\s*(?:개|인분|명|잔|그릇|마리)|둘)(?:\s|$|[,.!?])/.test(trimmed)) {
    return 2;
  }
  if (/(?:^|\s)(?:세\s*(?:개|인분|명|잔|그릇|마리)|셋)(?:\s|$|[,.!?])/.test(trimmed)) {
    return 3;
  }
  if (/(?:^|\s)(?:네\s*(?:개|인분|명|잔|그릇|마리)|넷)(?:\s|$|[,.!?])/.test(trimmed)) {
    return 4;
  }
  return null;
}

function getVoicePaymentOptions(
  areaName: string,
  walletBalance: number
): Array<{ id: PaymentMethod; shortLabel: string; label: string }> {
  const localCur = getLocalCurrencyLabel(areaName);
  return [
    { id: 'kakaopay', shortLabel: '카카오페이', label: '카카오페이' },
    { id: 'tosspay', shortLabel: '토스페이', label: '토스페이' },
    { id: 'naverpay', shortLabel: '네이버페이', label: '네이버페이' },
    { id: 'card_oneclick', shortLabel: '등록카드', label: '등록카드 1초결제' },
    {
      id: 'alle_pay',
      shortLabel: `alle페이 (${formatWon(walletBalance)})`,
      label: 'alle페이 잔액',
    },
    {
      id: 'local_currency',
      shortLabel: localCur.shortLabel,
      label: localCur.fullLabel,
    },
    {
      id: 'b2b_meal_point',
      shortLabel: '기업 식대',
      label: '기업 식대 포인트',
    },
  ];
}

function isLikelyAmbientNoise(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const compact = trimmed.replace(/[^가-힣a-zA-Z0-9]/g, '');
  if (!compact) return true;
  if (compact.length === 1 && !/^(네|예|응|어)$/.test(compact)) {
    return true;
  }
  if (/^(음+|어+|아+|그+|저+|에+|음\s*그|아\s*저|하+|휴+)$/.test(compact)) {
    return true;
  }
  return false;
}

function isLikelyBotEcho(
  heardText: string,
  botSpeech: string,
  isSpeakingNow: boolean,
  lastBotEndedAt: number
): boolean {
  const trimmed = heardText.trim();
  if (!trimmed || !botSpeech.trim()) return false;
  if (!isSpeakingNow && Date.now() - lastBotEndedAt > 1100) return false;
  if (
    /(잠깐|아니|그만|취소|바꿔|말고|다른|결제|결재|주문|다시|싼|빠른|리뷰|인기|배달비|마이크\s*꺼|조용히|다음\s*메뉴|닫아)/.test(
      trimmed
    )
  ) {
    return false;
  }
  const cleanHeard = trimmed.toLowerCase().replace(/[^가-힣a-z0-9\s]/g, ' ');
  const cleanBot = botSpeech.toLowerCase().replace(/[^가-힣a-z0-9\s]/g, ' ');
  const compactHeard = cleanHeard.replace(/\s+/g, '');
  const compactBot = cleanBot.replace(/\s+/g, '');
  if (compactHeard.length >= 4 && compactBot.includes(compactHeard)) {
    return true;
  }
  const heardTokens = cleanHeard.split(/\s+/).filter((t) => t.length >= 1);
  const botTokens = new Set(cleanBot.split(/\s+/).filter((t) => t.length >= 1));
  if (heardTokens.length >= 2) {
    const overlapCount = heardTokens.filter((t) => botTokens.has(t)).length;
    if (overlapCount / heardTokens.length >= 0.42) {
      return true;
    }
  }
  return false;
}

const COUNSELOR_QUICK_STARTERS = [
  {
    label: '🔥 마감 30% 특가',
    prompt: '오늘 마감 특가 뭐 있어?',
  },
  {
    label: '🧺 전통시장·골목 묶음',
    prompt: '전통시장 여러 가게 한 바구니로 묶어 시켜줘',
  },
  {
    label: '🎁 옆집 릴레이 쿠폰',
    prompt: '옆집 릴레이 쿠폰 쓸 수 있는 곳 알려줘',
  },
  {
    label: '치킨 시켜줘',
    prompt: '치킨 시켜줘',
  },
  {
    label: '마라탕 땡기네',
    prompt: '마라탕 땡기네',
  },
  {
    label: '비 오는데 전이나 국물',
    prompt: '비 오는데 전이나 국물',
  },
];

function mergeConversationalCondition(
  prev: ParsedCondition,
  rawText: string
): ParsedCondition {
  const next = parseConditionInput(rawText);
  const trimmed = rawText.trim();

  if (/초기화|처음부터|새로/.test(trimmed)) {
    return parseConditionInput('성인 2명, 얼큰한 국물, 총액 25,000원 이하, 30분 이내');
  }

  const hasExplicitServings =
    /(\d+\s*(?:명|인분|인)|혼자|혼밥|1인|둘이|커플|셋이|넷이)/.test(trimmed);
  const hasExplicitBudget = /(\d[\d,]*)\s*만?\s*원/.test(trimmed);
  const hasExplicitMinutes = /(\d+)\s*분/.test(trimmed);

  const hasNewDishCategory = next.tags.some((t) => DISH_CATEGORY_TAGS.has(t));
  const nextExcludes = next.excludeTags ?? [];

  // When user asks for a brand-new dish/category, replace previous category and reset stale filters unless explicit
  if (hasNewDishCategory) {
    return {
      rawInput: trimmed,
      servings: hasExplicitServings ? next.servings : 1,
      tags: next.tags,
      excludeTags: nextExcludes,
      maxBudget: hasExplicitBudget ? next.maxBudget : null,
      maxMinutes: hasExplicitMinutes ? next.maxMinutes : null,
      unknownTokens: next.unknownTokens,
      needsConfirmation: next.needsConfirmation,
    };
  }

  // Follow-up refinement with traits/exclusions/budget/time preserves previous dish category tags
  if (/전체|아무거나|상관없/.test(trimmed)) {
    return {
      rawInput: trimmed,
      servings: hasExplicitServings ? next.servings : prev.servings,
      tags: [],
      excludeTags: nextExcludes,
      maxBudget: hasExplicitBudget ? next.maxBudget : prev.maxBudget,
      maxMinutes: hasExplicitMinutes ? next.maxMinutes : prev.maxMinutes,
      unknownTokens: next.unknownTokens,
      needsConfirmation: false,
    };
  }

  const mergedExcludes = Array.from(
    new Set([...(prev.excludeTags ?? []), ...nextExcludes])
  );
  // Remove conflicts between '얼큰한' and '순한맛' when refining taste
  let baseTags = [...prev.tags];
  if (next.tags.includes('순한맛') || mergedExcludes.includes('얼큰한')) {
    baseTags = baseTags.filter((t) => t !== '얼큰한');
  }
  if (next.tags.includes('얼큰한')) {
    baseTags = baseTags.filter((t) => t !== '순한맛');
  }

  const mergedTags = Array.from(new Set([...baseTags, ...next.tags])).filter(
    (t) => !mergedExcludes.includes(t)
  );

  return {
    rawInput: trimmed,
    servings: hasExplicitServings ? next.servings : prev.servings,
    tags: mergedTags,
    excludeTags: mergedExcludes,
    maxBudget: hasExplicitBudget ? next.maxBudget : prev.maxBudget,
    maxMinutes: hasExplicitMinutes ? next.maxMinutes : prev.maxMinutes,
    unknownTokens: next.unknownTokens,
    needsConfirmation:
      mergedTags.length === 0 &&
      mergedExcludes.length === 0 &&
      next.needsConfirmation,
  };
}

const DIRECT_SEARCH_CATEGORIES = [
  '전체',
  '한식',
  '치킨',
  '중식',
  '일식',
  '양식',
  '분식',
  '카페',
  '전통시장',
] as const;

export function AiChatOrderView({
  stores,
  menus,
  reviews = [],
  wishlistIds,
  activeLocation,
  initialPrompt,
  walletBalance = 0,
  stampCount = 0,
  defaultNote = '',
  onToggleWishlist,
  onBackToHome,
  onOpenAiSettings: _onOpenAiSettings,
  onOpenSuperApp,
  onUseRelayCoupon,
  onAddToCart,
  onOpenRecommendationWithCondition,
  onProceedToConfirm,
  onCompleteVoiceOrder,
}: AiChatOrderViewProps) {
  const [viewMode, setViewMode] = useState<'chat' | 'search'>('chat');
  const [directSearchText, setDirectSearchText] = useState('');
  const [directCategory, setDirectCategory] =
    useState<(typeof DIRECT_SEARCH_CATEGORIES)[number]>('전체');
  const [input, setInput] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceAutoplayBlocked, setVoiceAutoplayBlocked] = useState(false);
  const [voiceCheckoutDraft, setVoiceCheckoutDraft] =
    useState<VoiceCheckoutDraft | null>(null);
  const [voiceCheckoutCompleted, setVoiceCheckoutCompleted] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReady, setAiReady] = useState(() => hasGeminiApiKey());
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem('alle_voice_reply_enabled');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [showVoiceTips, setShowVoiceTips] = useState(false);

  useEffect(() => {
    void checkServerGeminiAvailable().then((ok) => {
      if (ok || hasGeminiApiKey()) setAiReady(true);
    });
  }, []);

  const [stagedServings, setStagedServings] = useState<Record<string, number>>({});
  const [stagedOptions, setStagedOptions] = useState<Record<string, string[]>>({});
  const [recommendedSpotlight, setRecommendedSpotlight] =
    useState<RecommendedSpotlightState | null>(null);
  const stopVoiceRef = useRef<(() => void) | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const lastSpokenMsgIdRef = useRef<string | null>(null);
  const lastSpotlightMsgIdRef = useRef<string | null>(null);
  const didInitialGreetRef = useRef(false);
  const keepSpeechOnUnmountRef = useRef(false);
  const autoListenTimerRef = useRef<number | null>(null);
  const restartListenTimerRef = useRef<number | null>(null);
  const voiceReplyEnabledRef = useRef(voiceReplyEnabled);
  const viewModeRef = useRef(viewMode);
  const isListeningRef = useRef(isListening);
  const isSpeakingRef = useRef(isSpeaking);
  const currentSpokenTextRef = useRef('');
  const lastBotSpeechEndedAtRef = useRef(0);
  const lastTranscriptRef = useRef<{ text: string; at: number }>({
    text: '',
    at: 0,
  });
  const voiceDeniedRef = useRef(false);
  const shouldContinueListeningRef = useRef(true);
  const consecutiveEmptyListenRef = useRef(0);
  const voiceCheckoutCompletedRef = useRef(voiceCheckoutCompleted);
  const startListeningRef = useRef<() => void>(() => {});
  const runChatQueryRef = useRef<(rawText: string) => void>(() => {});

  voiceReplyEnabledRef.current = voiceReplyEnabled;
  viewModeRef.current = viewMode;
  isListeningRef.current = isListening;
  isSpeakingRef.current = isSpeaking;
  voiceCheckoutCompletedRef.current = voiceCheckoutCompleted;

  const [activeCondition, setActiveCondition] = useState<ParsedCondition>(() =>
    parseConditionInput(
      initialPrompt?.trim() ||
        '성인 2명, 얼큰한 국물, 총액 25,000원 이하, 30분 이내'
    )
  );

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const seedQuery = initialPrompt?.trim();
    if (seedQuery) {
      const parsed = parseConditionInput(seedQuery);
      const evaluated = evaluateRecommendations(parsed, stores, menus, activeLocation);
      const topMatches = evaluated.matches.slice(0, 3);
      let reply = '';
      let spokenText: string | undefined;
      if (parsed.needsConfirmation && parsed.unknownTokens.length > 0) {
        reply = `말씀하신 ‘${parsed.unknownTokens.join(
          ', '
        )}’ 느낌을 가장 잘 맞추기 위해 아래에서 원하시는 맛을 한 번만 골라주세요.`;
        spokenText = `말씀하신 ${parsed.unknownTokens.join(', ')} 느낌에 가장 가까운 맛을 화면에서 골라주세요.`;
      } else if (topMatches.length === 0) {
        reply =
          '말씀해 주신 조건에 모두 맞는 메뉴가 지금 바로 보이지 않아요. 예산이나 시간을 조금 넓혀서 다시 찾아볼까요?';
      } else {
        const best = topMatches[0];
        reply = `추천 메뉴 ${topMatches.length}곳을 찾았어요.`;
        spokenText = `${best.store.name}의 ${best.menu.name} 외 ${Math.max(0, topMatches.length - 1)}곳을 찾았어요. 1순위는 배달비 포함 ${formatWon(best.estimatedTotal)}, 약 ${best.effectiveMinutes}분 도착입니다. 이 메뉴로 주문할까요, 다른 메뉴도 들어보실래요?`;
      }
      return [
        {
          id: 'init-user',
          sender: 'user',
          text: seedQuery,
        },
        {
          id: 'init-bot',
          sender: 'bot',
          text: reply,
          spokenText,
          parsed,
          matchedMenuIds: topMatches.map((m) => m.menu.id),
          servings: parsed.servings,
          stagedMenuId:
            !parsed.needsConfirmation && topMatches.length > 0
              ? topMatches[0].menu.id
              : undefined,
          isEmptyRelaxPrompt:
            !parsed.needsConfirmation && topMatches.length === 0,
        },
      ];
    }

    const defaultParsed = parseConditionInput(
      '성인 2명, 얼큰한 국물, 총액 25,000원 이하, 30분 이내'
    );
    const defaultEval = evaluateRecommendations(defaultParsed, stores, menus, activeLocation);
    return [
      {
        id: 'welcome',
        sender: 'bot',
        text: '어떤 음식을 찾아드릴까요? 아래 빠른 버튼을 누르거나 직접 말씀해 보세요.',
        spokenText: '어떤 음식을 찾아드릴까요?',
        parsed: defaultParsed,
        matchedMenuIds: defaultEval.matches.slice(0, 3).map((m) => m.menu.id),
        servings: defaultParsed.servings,
      },
    ];
  });

  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const menuMap = useMemo(() => new Map(menus.map((m) => [m.id, m])), [menus]);
  const hasDeliverableInArea = useMemo(
    () =>
      Boolean(
        activeLocation &&
          stores.some((s) => isStoreDeliverableToLocation(s, activeLocation))
      ),
    [stores, activeLocation]
  );

  const paymentOptions = useMemo(
    () => getVoicePaymentOptions(activeLocation?.areaName ?? '', walletBalance),
    [activeLocation?.areaName, walletBalance]
  );

  const latestMatchedIds = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const ids = messages[i].matchedMenuIds;
      if (ids && ids.length > 0 && messages[i].id !== 'welcome') {
        return ids;
      }
    }
    return [];
  }, [messages]);

  const latestStagedMenuId = useMemo(() => {
    if (voiceCheckoutDraft?.menuId) return voiceCheckoutDraft.menuId;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].stagedMenuId) {
        return messages[i].stagedMenuId;
      }
    }
    return latestMatchedIds[0];
  }, [voiceCheckoutDraft?.menuId, messages, latestMatchedIds]);

  const latestCheckoutMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].checkoutDraftSnapshot) return messages[i].id;
    }
    return null;
  }, [messages]);

  const directSearchResults = useMemo(() => {
    const q = directSearchText.trim().toLowerCase();
    const filteredMenus = menus.filter((m) => {
      const st = storeMap.get(m.storeId);
      if (!st) return false;
      if (directCategory !== '전체') {
        const grp = st.categoryGroup ?? '';
        const catHit =
          grp.includes(directCategory) ||
          st.category.includes(directCategory) ||
          m.tags.includes(directCategory) ||
          (directCategory === '전통시장' && st.minOrderAmount === 0);
        if (!catHit) return false;
      }
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        st.name.toLowerCase().includes(q) ||
        st.category.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
      );
    });

    return evaluateRecommendations(
      {
        rawInput: directSearchText,
        servings: 1,
        tags: [],
        excludeTags: [],
        maxBudget: null,
        maxMinutes: null,
        unknownTokens: [],
        needsConfirmation: false,
      },
      stores,
      filteredMenus,
      activeLocation
    ).matches;
  }, [directSearchText, directCategory, menus, stores, storeMap, activeLocation]);

  // Live intent preview updates as the user types or speaks
  const liveIntentCondition = useMemo(() => {
    if (input.trim().length > 0) {
      return mergeConversationalCondition(activeCondition, input);
    }
    return activeCondition;
  }, [activeCondition, input]);

  const liveIntentChips = useMemo(
    () => buildIntentChips(liveIntentCondition, wishlistIds.length > 0),
    [liveIntentCondition, wishlistIds.length]
  );

  const clearAutoListenTimer = () => {
    if (autoListenTimerRef.current !== null) {
      window.clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }
  };

  const clearRestartListenTimer = () => {
    if (restartListenTimerRef.current !== null) {
      window.clearTimeout(restartListenTimerRef.current);
      restartListenTimerRef.current = null;
    }
  };

  const startListening = () => {
    clearAutoListenTimer();
    clearRestartListenTimer();
    if (
      viewModeRef.current !== 'chat' ||
      voiceCheckoutCompletedRef.current ||
      voiceDeniedRef.current
    ) {
      return;
    }
    if (!getSpeechRecognitionConstructor()) {
      setShowVoiceTips(true);
      return;
    }
    if (isListeningRef.current) {
      return;
    }

    shouldContinueListeningRef.current = true;
    setVoiceAutoplayBlocked(false);
    setShowVoiceTips(false);
    setInterimTranscript('');
    setIsListening(true);
    isListeningRef.current = true;

    const sessionStartedAt = Date.now();
    let heardSpeechInSession = false;
    let lastErrCode = '';
    stopVoiceRef.current = startKoreanVoiceInput({
      continuous: true,
      onInterim: (text) => {
        const cleaned = text.trim();
        if (!cleaned || isLikelyAmbientNoise(cleaned)) {
          setInterimTranscript('');
          return;
        }
        if (
          isLikelyBotEcho(
            cleaned,
            currentSpokenTextRef.current,
            isSpeakingRef.current,
            lastBotSpeechEndedAtRef.current
          )
        ) {
          return;
        }
        heardSpeechInSession = true;
        consecutiveEmptyListenRef.current = 0;
        setInterimTranscript(cleaned);
        if (isSpeakingRef.current && cleaned.length >= 4) {
          stopSpeaking();
          setIsSpeaking(false);
          isSpeakingRef.current = false;
        }
      },
      onTranscript: (text) => {
        const cleaned = text.trim();
        setInterimTranscript('');
        if (!cleaned || isLikelyAmbientNoise(cleaned)) return;
        if (
          isLikelyBotEcho(
            cleaned,
            currentSpokenTextRef.current,
            isSpeakingRef.current,
            lastBotSpeechEndedAtRef.current
          )
        ) {
          return;
        }
        heardSpeechInSession = true;
        consecutiveEmptyListenRef.current = 0;
        const now = Date.now();
        if (
          lastTranscriptRef.current.text === cleaned &&
          now - lastTranscriptRef.current.at < 1500
        ) {
          return;
        }
        lastTranscriptRef.current = { text: cleaned, at: now };

        if (isSpeakingRef.current) {
          stopSpeaking();
          setIsSpeaking(false);
          isSpeakingRef.current = false;
        }
        void runChatQueryRef.current(cleaned);
      },
      onErrorCode: (err) => {
        lastErrCode = err;
        if (
          err === 'not-allowed' ||
          err === 'service-not-allowed' ||
          err === 'not-supported'
        ) {
          voiceDeniedRef.current = true;
          shouldContinueListeningRef.current = false;
        } else if (
          err === 'network' ||
          err === 'audio-capture' ||
          err === 'aborted'
        ) {
          shouldContinueListeningRef.current = false;
        }
      },
      onUnavailableOrError: () => {
        setInterimTranscript('');
        if (
          lastErrCode === 'not-allowed' ||
          lastErrCode === 'service-not-allowed' ||
          lastErrCode === 'not-supported'
        ) {
          setIsListening(false);
          isListeningRef.current = false;
          setShowVoiceTips(true);
        }
      },
      onEnd: () => {
        setInterimTranscript('');
        setIsListening(false);
        isListeningRef.current = false;
        const elapsed = Date.now() - sessionStartedAt;
        if (!heardSpeechInSession) {
          consecutiveEmptyListenRef.current += 1;
        }
        const fatalOrLoopErr =
          lastErrCode === 'network' ||
          lastErrCode === 'audio-capture' ||
          lastErrCode === 'aborted' ||
          lastErrCode === 'not-allowed' ||
          lastErrCode === 'service-not-allowed' ||
          lastErrCode === 'not-supported';

        if (
          !fatalOrLoopErr &&
          elapsed >= 1500 &&
          consecutiveEmptyListenRef.current <= 1 &&
          shouldContinueListeningRef.current &&
          voiceReplyEnabledRef.current &&
          viewModeRef.current === 'chat' &&
          !voiceCheckoutCompletedRef.current &&
          !voiceDeniedRef.current &&
          getSpeechRecognitionConstructor()
        ) {
          restartListenTimerRef.current = window.setTimeout(() => {
            startListeningRef.current();
          }, 700);
        } else {
          shouldContinueListeningRef.current = false;
        }
      },
    });
  };
  startListeningRef.current = startListening;

  const speakBotReply = (spokenMessage: string, allowAutoListen: boolean) => {
    clearAutoListenTimer();
    clearRestartListenTimer();
    if (!voiceReplyEnabledRef.current || viewModeRef.current !== 'chat') return;
    currentSpokenTextRef.current = spokenMessage;
    shouldContinueListeningRef.current = allowAutoListen;
    consecutiveEmptyListenRef.current = 0;

    speakKoreanText(spokenMessage, {
      onStart: () => {
        setIsSpeaking(true);
        isSpeakingRef.current = true;
        setVoiceAutoplayBlocked(false);
        // Keep mic active while bot is speaking; echo filter blocks self-voice
        if (
          allowAutoListen &&
          voiceReplyEnabledRef.current &&
          viewModeRef.current === 'chat' &&
          !voiceCheckoutCompletedRef.current &&
          !voiceDeniedRef.current &&
          !isListeningRef.current &&
          getSpeechRecognitionConstructor()
        ) {
          autoListenTimerRef.current = window.setTimeout(() => {
            startListeningRef.current();
          }, 200);
        }
      },
      onEnd: () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        lastBotSpeechEndedAtRef.current = Date.now();
        if (
          allowAutoListen &&
          voiceReplyEnabledRef.current &&
          viewModeRef.current === 'chat' &&
          !voiceCheckoutCompletedRef.current &&
          !voiceDeniedRef.current &&
          !isListeningRef.current &&
          getSpeechRecognitionConstructor()
        ) {
          autoListenTimerRef.current = window.setTimeout(() => {
            startListeningRef.current();
          }, 350);
        }
      },
      onError: () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        setVoiceAutoplayBlocked(true);
      },
    });
  };

  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isListening, isSpeaking]);

  useEffect(() => {
    if (viewMode === 'search') {
      shouldContinueListeningRef.current = false;
      clearAutoListenTimer();
      clearRestartListenTimer();
      stopVoiceRef.current?.();
      stopSpeaking();
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setIsListening(false);
      isListeningRef.current = false;
      setInterimTranscript('');
      setRecommendedSpotlight(null);
    }
  }, [viewMode]);

  useEffect(() => {
    if (voiceCheckoutDraft) {
      setRecommendedSpotlight(null);
    }
  }, [voiceCheckoutDraft]);

  useEffect(() => {
    if (viewMode !== 'chat' || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (
      last.sender === 'bot' &&
      last.id !== 'welcome' &&
      !last.checkoutDraftSnapshot &&
      last.matchedMenuIds &&
      last.matchedMenuIds.length > 0 &&
      last.id !== lastSpotlightMsgIdRef.current
    ) {
      lastSpotlightMsgIdRef.current = last.id;
      setRecommendedSpotlight({
        msgId: last.id,
        menuIds: last.matchedMenuIds,
        activeIndex: 0,
        explanation: last.spokenText ?? last.text,
        servings: last.servings ?? activeCondition.servings ?? 1,
      });
    }
  }, [messages, viewMode, activeCondition.servings]);

  useEffect(() => {
    if (!voiceReplyEnabled || viewMode !== 'chat' || messages.length === 0) {
      return;
    }
    const last = messages[messages.length - 1];
    if (
      last.sender === 'bot' &&
      last.id !== 'welcome' &&
      last.id !== lastSpokenMsgIdRef.current
    ) {
      lastSpokenMsgIdRef.current = last.id;
      speakBotReply(
        last.spokenText ?? last.text,
        !voiceCheckoutCompletedRef.current
      );
    }
  }, [messages, voiceReplyEnabled, viewMode]);

  useEffect(() => {
    if (
      !didInitialGreetRef.current &&
      voiceReplyEnabledRef.current &&
      viewModeRef.current === 'chat'
    ) {
      didInitialGreetRef.current = true;
      const last = messages[messages.length - 1];
      if (last && last.sender === 'bot') {
        lastSpokenMsgIdRef.current = last.id;
        const textToSpeak =
          last.id === 'welcome'
            ? '어떤 음식을 찾아드릴까요?'
            : last.spokenText ?? last.text;
        speakBotReply(textToSpeak, true);
      }
    }

    return () => {
      shouldContinueListeningRef.current = false;
      clearAutoListenTimer();
      clearRestartListenTimer();
      stopVoiceRef.current?.();
      if (!keepSpeechOnUnmountRef.current) {
        stopSpeaking();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildVoiceCheckoutSummary = (draft: VoiceCheckoutDraft) => {
    const menu = menuMap.get(draft.menuId);
    const store = menu ? storeMap.get(menu.storeId) : undefined;
    if (!menu || !store) return null;

    const qty = Math.min(Math.max(1, draft.servings), Math.max(1, menu.stock));
    const unitPrice = getEffectiveMenuPrice(menu);
    const selectedOpts = menu.options.filter((o) =>
      draft.selectedOptionIds.includes(o.id)
    );
    const optionsSubtotal =
      selectedOpts.reduce((sum, o) => sum + o.priceDelta, 0) * qty;
    const menuSubtotal = unitPrice * qty;
    const originalMenuSubtotal = menu.pricePerPerson * qty;
    const deliveryFee = store.deliveryFee;
    const preCouponTotal = menuSubtotal + optionsSubtotal + deliveryFee;
    const bestCoupon = getBestCoupon(MOCK_COUPONS, {
      menuSubtotal,
      stampCount,
      paymentMethod: draft.paymentMethod,
    });
    const couponDiscount =
      bestCoupon.code !== 'NONE'
        ? Math.min(bestCoupon.discountAmount, preCouponTotal)
        : 0;
    const finalTotal = Math.max(0, preCouponTotal - couponDiscount);
    const savings = estimateCompetitorSavings({
      menuSubtotal,
      originalMenuSubtotal,
      deliveryFee,
      originalDeliveryFee: deliveryFee,
      couponDiscount,
      isSameStorePrice: menu.storePrice === menu.pricePerPerson,
    });
    const effectiveMinutes =
      menu.estimatedMinutes + (store.extraPrepMinutes ?? 0);
    const paymentOption =
      paymentOptions.find((p) => p.id === draft.paymentMethod) ??
      paymentOptions[0];

    return {
      menu,
      store,
      qty,
      selectedOpts,
      unitPrice,
      menuSubtotal,
      optionsSubtotal,
      deliveryFee,
      preCouponTotal,
      bestCoupon,
      couponDiscount,
      finalTotal,
      savings,
      effectiveMinutes,
      paymentOption,
    };
  };

  const openCheckoutDraftMessage = (
    draft: VoiceCheckoutDraft,
    leadPrefix?: string
  ) => {
    const summary = buildVoiceCheckoutSummary(draft);
    if (!summary) return;
    setVoiceCheckoutDraft(draft);
    const couponPart =
      summary.couponDiscount > 0 && summary.bestCoupon
        ? `${summary.bestCoupon.label} 쿠폰까지 자동 적용해 `
        : '';
    const notePart = draft.customerNote.trim()
      ? ` · 요청 "${draft.customerNote.trim()}"`
      : '';
    const spoken = `${leadPrefix ? `${leadPrefix} ` : ''}${summary.store.name} ${summary.menu.name} ${summary.qty}인분, ${couponPart}최종 결제 금액은 ${formatWon(summary.finalTotal)}입니다. ${summary.paymentOption.label}로 바로 결제할까요? 결제해줘 또는 취소라고 말씀해 주세요.`;

    setMessages((prev) => [
      ...prev,
      {
        id: `b-checkout-${Date.now() + 1}`,
        sender: 'bot',
        text: `${summary.store.name} · ${summary.menu.name} ${summary.qty}인분 최종 결제 금액 ${formatWon(summary.finalTotal)}${notePart}. 아래 카드에서 결제 수단을 확인하시거나 말씀으로 '결제해줘'라고 해주세요.`,
        spokenText: spoken,
        stagedMenuId: draft.menuId,
        checkoutDraftSnapshot: draft,
        aiSource: 'rule',
      },
    ]);
  };

  const executeVoiceOrder = (draft: VoiceCheckoutDraft) => {
    const summary = buildVoiceCheckoutSummary(draft);
    if (!summary) return;

    if (
      !summary.store.isOpen ||
      summary.menu.isSoldOut ||
      summary.menu.stock < summary.qty
    ) {
      const msgText =
        '죄송하지만 선택한 메뉴가 방금 품절되었거나 영업이 중단되었어요. 다른 메뉴를 찾아드릴까요?';
      setVoiceCheckoutDraft(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `b-soldout-${Date.now() + 1}`,
          sender: 'bot',
          text: msgText,
          spokenText: msgText,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    if (draft.paymentMethod === 'alle_pay' && walletBalance < summary.finalTotal) {
      const shortText = `alle페이 잔액(${formatWon(walletBalance)})이 결제 금액(${formatWon(summary.finalTotal)})보다 부족합니다. 카카오페이나 토스페이 등 다른 결제 수단을 말씀하거나 눌러 주세요.`;
      setMessages((prev) => [
        ...prev,
        {
          id: `b-payerr-${Date.now() + 1}`,
          sender: 'bot',
          text: shortText,
          spokenText: shortText,
          checkoutDraftSnapshot: draft,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    if (!onCompleteVoiceOrder) {
      onProceedToConfirm({
        menuId: summary.menu.id,
        servings: summary.qty,
        selectedOptionIds: summary.selectedOpts.map((o) => o.id),
        couponCode: summary.bestCoupon?.code ?? 'NONE',
      });
      return;
    }

    const orderLine: OrderLineItem = {
      menuId: summary.menu.id,
      menuName: summary.menu.name,
      unitPrice: summary.unitPrice,
      originalUnitPrice: summary.menu.pricePerPerson,
      quantity: summary.qty,
      selectedOptionIds: summary.selectedOpts.map((o) => o.id),
      selectedOptionNames: summary.selectedOpts.map((o) => o.name),
      optionsSubtotal: summary.optionsSubtotal,
      lineSubtotal: summary.menuSubtotal,
    };

    keepSpeechOnUnmountRef.current = true;
    clearAutoListenTimer();
    stopVoiceRef.current?.();
    setIsListening(false);
    isListeningRef.current = false;

    const result = onCompleteVoiceOrder({
      menuId: summary.menu.id,
      servings: summary.qty,
      selectedOptionIds: summary.selectedOpts.map((o) => o.id),
      items: [orderLine],
      couponCode: summary.bestCoupon?.code ?? 'NONE',
      couponDiscount: summary.couponDiscount,
      sharedDeliveryApplied: false,
      reservationSlot: null,
      customerAlias: '음성 주문 고객',
      addressAlias: activeLocation?.detailAddress ?? '문 앞 배달',
      customerNote: draft.customerNote || defaultNote || '',
      paymentMethod: draft.paymentMethod,
      paymentMethodLabel: summary.paymentOption.label,
      estimatedSavings: summary.savings.totalSaved,
    });

    if (result.ok) {
      setVoiceCheckoutCompleted(true);
      voiceCheckoutCompletedRef.current = true;
      setVoiceCheckoutDraft(null);
      if (voiceReplyEnabledRef.current) {
        speakKoreanText(
          `주문이 완료되었습니다! ${summary.store.name}에서 조리를 시작하면 약 ${summary.effectiveMinutes}분 뒤에 도착할 예정이에요.`
        );
      }
      return;
    }

    keepSpeechOnUnmountRef.current = false;
    const errText = result.error ?? '주문을 처리하지 못했어요. 다시 시도해 주세요.';
    setMessages((prev) => [
      ...prev,
      {
        id: `b-orderr-${Date.now() + 1}`,
        sender: 'bot',
        text: errText,
        spokenText: errText,
        checkoutDraftSnapshot: draft,
        aiSource: 'rule',
      },
    ]);
  };

  const switchSpotlightIndex = (
    nextIdx: number,
    spotlightOverride?: RecommendedSpotlightState | null
  ) => {
    const target = spotlightOverride ?? recommendedSpotlight;
    if (!target || target.menuIds.length === 0) return;
    const bounded =
      ((nextIdx % target.menuIds.length) + target.menuIds.length) %
      target.menuIds.length;
    const menuId = target.menuIds[bounded];
    const menu = menuMap.get(menuId);
    const store = menu ? storeMap.get(menu.storeId) : undefined;
    if (!menu || !store) return;

    const total =
      getEffectiveMenuPrice(menu) * target.servings + store.deliveryFee;
    const effectiveMin = menu.estimatedMinutes + (store.extraPrepMinutes ?? 0);
    const reasonText = menu.aiReason ? `${menu.aiReason} ` : '';
    const explanation = `${bounded + 1}순위 추천 ${store.name}의 ${menu.name}입니다. ${reasonText}배달비 포함 ${formatWon(total)}, 약 ${effectiveMin}분 안에 도착해요. 이 메뉴로 주문할까요?`;

    setStagedServings((prev) => ({
      ...prev,
      [menu.id]: Math.min(target.servings, Math.max(1, menu.stock)),
    }));
    setRecommendedSpotlight({
      ...target,
      activeIndex: bounded,
      explanation,
    });
    if (voiceReplyEnabledRef.current && viewModeRef.current === 'chat') {
      speakBotReply(explanation, !voiceCheckoutCompletedRef.current);
    }
  };

  const runChatQuery = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isAnalyzing) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: trimmed,
    };

    if (/^(초기화|처음부터|새로\s*시작|새\s*대화)/.test(trimmed)) {
      const defaultParsed = parseConditionInput(
        '성인 2명, 얼큰한 국물, 총액 25,000원 이하, 30분 이내'
      );
      const defaultEval = evaluateRecommendations(
        defaultParsed,
        stores,
        menus,
        activeLocation
      );
      setVoiceCheckoutDraft(null);
      setVoiceCheckoutCompleted(false);
      voiceCheckoutCompletedRef.current = false;
      setActiveCondition(defaultParsed);
      setInput('');
      setMessages([
        {
          id: `welcome-${Date.now()}`,
          sender: 'bot',
          text: '어떤 음식을 찾아드릴까요? 아래 빠른 버튼을 누르거나 직접 말씀해 보세요.',
          spokenText: '새 대화를 시작할게요. 어떤 음식을 찾아드릴까요?',
          parsed: defaultParsed,
          matchedMenuIds: defaultEval.matches.slice(0, 3).map((m) => m.menu.id),
          servings: defaultParsed.servings,
        },
      ]);
      return;
    }

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // Voice control commands (stop mic / repeat)
    if (/(마이크\s*꺼|그만\s*들|조용히\s*해|음성\s*꺼)/.test(trimmed)) {
      shouldContinueListeningRef.current = false;
      clearAutoListenTimer();
      clearRestartListenTimer();
      stopVoiceRef.current?.();
      stopSpeaking();
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setIsListening(false);
      isListeningRef.current = false;
      setVoiceReplyEnabled(false);
      voiceReplyEnabledRef.current = false;
      try {
        window.localStorage.setItem('alle_voice_reply_enabled', 'false');
      } catch {
        // ignore
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `b-voiceoff-${Date.now() + 1}`,
          sender: 'bot',
          text: '음성 대화를 잠시 끌게요. 필요할 때 마이크 버튼이나 음성 대화 버튼을 눌러 다시 말씀해 주세요.',
          aiSource: 'rule',
        },
      ]);
      return;
    }

    if (/(다시\s*말|뭐라고|못\s*들었|다시\s*들려)/.test(trimmed)) {
      const prevBot = [...messages].reverse().find((m) => m.sender === 'bot');
      const repeatText =
        prevBot?.spokenText ?? prevBot?.text ?? '어떤 음식을 찾아드릴까요?';
      setMessages((prev) => [
        ...prev,
        {
          id: `b-repeat-${Date.now() + 1}`,
          sender: 'bot',
          text: prevBot?.text ?? repeatText,
          spokenText: repeatText,
          matchedMenuIds: prevBot?.matchedMenuIds,
          stagedMenuId: prevBot?.stagedMenuId,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    if (
      recommendedSpotlight &&
      /(팝업\s*닫|창\s*닫|추천\s*닫|목록\s*닫|화면\s*닫|닫아\s*줘|^닫아$)/.test(
        trimmed
      )
    ) {
      setRecommendedSpotlight(null);
      const closeReply = '추천 창을 닫았어요. 채팅에서 다른 메뉴를 보거나 이어서 말씀해 주세요.';
      setMessages((prev) => [
        ...prev,
        {
          id: `b-close-spot-${Date.now() + 1}`,
          sender: 'bot',
          text: closeReply,
          spokenText: closeReply,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    if (
      recommendedSpotlight &&
      recommendedSpotlight.menuIds.length > 1 &&
      /(다음\s*메뉴|다음\s*거|넘겨\s*줘|옆에\s*거)/.test(trimmed)
    ) {
      switchSpotlightIndex(recommendedSpotlight.activeIndex + 1);
      return;
    }

    const parsedInline = parseConditionInput(trimmed);
    const activeMenu = latestStagedMenuId
      ? menuMap.get(latestStagedMenuId)
      : undefined;
    const activeStore = activeMenu
      ? storeMap.get(activeMenu.storeId)
      : undefined;
    const hasDishCategory = parsedInline.tags.some((t) =>
      DISH_CATEGORY_TAGS.has(t)
    );
    const hasFoodPreference =
      hasDishCategory ||
      parsedInline.tags.length > 0 ||
      (parsedInline.excludeTags?.length ?? 0) > 0;
    const matchesCurrentStagedDish =
      Boolean(activeMenu) &&
      parsedInline.tags.some(
        (t) =>
          DISH_CATEGORY_TAGS.has(t) &&
          (activeMenu!.tags.includes(t) ||
            activeMenu!.name.includes(t) ||
            (activeStore?.category ?? '').includes(t))
      );

    // Pivot intents (cheaper / faster / higher rating / lower delivery fee)
    const isCheaperPivot = /(더\s*싼|저렴|가성비|싸게|비싸|만원\s*이하)/.test(
      trimmed
    );
    const isFasterPivot = /(더\s*빠른|빨리\s*오|배달\s*빠른|급해)/.test(trimmed);
    const isTopRatedPivot = /(리뷰\s*좋은|평점\s*높은|인기\s*많은|별점)/.test(
      trimmed
    );
    const isLowFeePivot = /(배달비\s*싼|배달비\s*적은|배달비\s*무료|배달팁\s*싼)/.test(
      trimmed
    );

    if (
      (isCheaperPivot || isFasterPivot || isTopRatedPivot || isLowFeePivot) &&
      !hasDishCategory
    ) {
      setVoiceCheckoutDraft(null);
      const localEval = evaluateRecommendations(
        {
          rawInput: '',
          servings: Math.max(1, activeCondition.servings || 1),
          tags: [],
          excludeTags: activeCondition.excludeTags ?? [],
          maxBudget: /(만원\s*이하)/.test(trimmed) ? 10000 : null,
          maxMinutes: null,
          unknownTokens: [],
          needsConfirmation: false,
        },
        stores,
        menus,
        activeLocation
      );

      const sorted = [...localEval.matches];
      let pivotLabel = '';
      if (isCheaperPivot) {
        sorted.sort((a, b) => a.estimatedTotal - b.estimatedTotal);
        pivotLabel = '가성비 좋은 부담 적은';
      } else if (isLowFeePivot) {
        sorted.sort(
          (a, b) =>
            a.deliveryFee - b.deliveryFee || a.estimatedTotal - b.estimatedTotal
        );
        pivotLabel = '배달비가 가장 낮은';
      } else if (isFasterPivot) {
        sorted.sort((a, b) => a.effectiveMinutes - b.effectiveMinutes);
        pivotLabel = '가장 빨리 도착하는';
      } else {
        sorted.sort(
          (a, b) =>
            (b.store.rating ?? 4.8) - (a.store.rating ?? 4.8) ||
            (b.store.reviewCount ?? 0) - (a.store.reviewCount ?? 0)
        );
        pivotLabel = '리뷰와 평점이 가장 높은';
      }

      const topPicks = sorted.slice(0, 3);
      if (topPicks[0]) {
        setStagedServings((prev) => ({
          ...prev,
          [topPicks[0].menu.id]: Math.min(
            topPicks[0].servings,
            Math.max(1, topPicks[0].menu.stock)
          ),
        }));
      }
      const pivotSpoken = topPicks[0]
        ? `${activeLocation?.areaName ?? '내 주변'}에서 ${pivotLabel} 곳 1순위는 ${topPicks[0].store.name}의 ${topPicks[0].menu.name}, 배달비 포함 ${formatWon(topPicks[0].estimatedTotal)}, 약 ${topPicks[0].effectiveMinutes}분입니다. 이 메뉴로 주문할까요, 다른 후보도 들어보실래요?`
        : '현재 배달 가능한 매장 중에서 다시 조건을 맞춰 찾아볼까요?';

      setMessages((prev) => [
        ...prev,
        {
          id: `b-pivot-${Date.now() + 1}`,
          sender: 'bot',
          text: topPicks[0]
            ? `${activeLocation?.areaName ?? '내 주변'} ${pivotLabel} 배달 가능 메뉴 ${topPicks.length}곳을 다시 골라드렸어요.`
            : '현재 지역 배달 가능 매장 중 조건에 맞는 메뉴가 부족해요.',
          spokenText: pivotSpoken,
          matchedMenuIds: topPicks.map((m) => m.menu.id),
          servings: topPicks[0]?.servings ?? 1,
          stagedMenuId: topPicks[0]?.menu.id,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    // 1. Active checkout voice confirmation loop
    if (voiceCheckoutDraft) {
      const currentSummary = buildVoiceCheckoutSummary(voiceCheckoutDraft);
      const isCancel =
        /(결제\s*취소|주문\s*취소|취소|그만|잠깐|안\s*할|다른\s*거|아니)/.test(
          trimmed
        );
      if (isCancel) {
        setVoiceCheckoutDraft(null);
        if (hasDishCategory && !matchesCurrentStagedDish) {
          // fall through to search the new dish right below
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `b-cancel-${Date.now() + 1}`,
              sender: 'bot',
              text: '네, 결제를 취소했어요. 다른 어떤 음식을 찾아드릴까요?',
              spokenText: '네, 결제를 취소했어요. 다른 어떤 음식을 찾아드릴까요?',
              aiSource: 'rule',
            },
          ]);
          return;
        }
      } else {
        const spokenPay = detectPaymentMethodFromSpeech(trimmed);
        const spokenQty = extractExplicitQuantity(trimmed);
        const isConfirm =
          /^(네|예|응|어|좋아|오케이|ok|확인|진행|결제|결재|주문)/.test(
            trimmed.toLowerCase()
          ) ||
          /(결제\s*해|결재\s*해|주문\s*해|진행\s*해|바로\s*결제|그렇게\s*해|해\s*줘|할게)/.test(
            trimmed
          );
        const isNoteEdit = /(문\s*앞|벨|노크|조심히|전화|요청|적어)/.test(
          trimmed
        );

        // If user pivots back to browsing food tags/exclusions instead of confirming checkout, release checkout gracefully
        if (
          hasFoodPreference &&
          !matchesCurrentStagedDish &&
          !spokenPay &&
          !isConfirm
        ) {
          setVoiceCheckoutDraft(null);
        } else {
          let updatedDraft: VoiceCheckoutDraft = { ...voiceCheckoutDraft };
          if (spokenPay) {
            updatedDraft = { ...updatedDraft, paymentMethod: spokenPay };
          }
          if (spokenQty && currentSummary) {
            updatedDraft = {
              ...updatedDraft,
              servings: Math.min(
                spokenQty,
                Math.max(1, currentSummary.menu.stock)
              ),
            };
          }
          if (isNoteEdit) {
            updatedDraft = { ...updatedDraft, customerNote: trimmed };
          }

          if (isConfirm && !spokenQty && !isNoteEdit) {
            executeVoiceOrder(updatedDraft);
            return;
          }

          if (spokenPay || spokenQty || isNoteEdit) {
            openCheckoutDraftMessage(
              updatedDraft,
              spokenPay ? '결제 수단을 반영했어요.' : '주문 내용을 수정했어요.'
            );
            return;
          }

          if (currentSummary) {
            const rePrompt = `${currentSummary.paymentOption.label}로 최종 ${formatWon(currentSummary.finalTotal)} 결제할까요? 다른 음식을 원하시면 메뉴명을, 결제를 진행하려면 결제해줘라고 말씀해 주세요.`;
            setMessages((prev) => [
              ...prev,
              {
                id: `b-reask-${Date.now() + 1}`,
                sender: 'bot',
                text: rePrompt,
                spokenText: rePrompt,
                checkoutDraftSnapshot: voiceCheckoutDraft,
                aiSource: 'rule',
              },
            ]);
            return;
          }
        }
      }
    }

    // 2. Ask about other recommended choices in the current list
    if (
      latestMatchedIds.length > 1 &&
      /(다른\s*메뉴|나머지|2번\s*뭐|두\s*번째\s*뭐|3번\s*뭐|세\s*번째\s*뭐|다른\s*건\s*뭐)/.test(
        trimmed
      )
    ) {
      const descriptions = latestMatchedIds
        .map((id, idx) => {
          const m = menuMap.get(id);
          const s = m ? storeMap.get(m.storeId) : undefined;
          if (!m || !s) return null;
          return `${idx + 1}번째 ${s.name}의 ${m.name} ${formatWon(getEffectiveMenuPrice(m))}`;
        })
        .filter((x): x is string => Boolean(x));

      const replyText = `현재 추천 목록은 ${descriptions.join(', ')}입니다. 몇 번째 메뉴로 선택할까요?`;
      setMessages((prev) => [
        ...prev,
        {
          id: `b-list-${Date.now() + 1}`,
          sender: 'bot',
          text: replyText,
          spokenText: replyText,
          matchedMenuIds: latestMatchedIds,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    // 3. Pick by ordinal (1st / 2nd / 3rd) or menu/store name match
    let pickedMenu: MenuItem | undefined;
    if (latestMatchedIds.length > 0 && /(첫\s*번째|1번|1순위|맨\s*앞)/.test(trimmed)) {
      pickedMenu = menuMap.get(latestMatchedIds[0]);
    } else if (
      latestMatchedIds.length > 1 &&
      /(두\s*번째|2번|2순위)/.test(trimmed)
    ) {
      pickedMenu = menuMap.get(latestMatchedIds[1]);
    } else if (
      latestMatchedIds.length > 2 &&
      /(세\s*번째|3번|3순위)/.test(trimmed)
    ) {
      pickedMenu = menuMap.get(latestMatchedIds[2]);
    } else if (latestMatchedIds.length > 0 && !hasDishCategory) {
      const compactInput = trimmed.replace(/\s+/g, '').toLowerCase();
      for (const id of latestMatchedIds) {
        const candidate = menuMap.get(id);
        const st = candidate ? storeMap.get(candidate.storeId) : undefined;
        if (!candidate || !st) continue;
        const mKey = candidate.name.replace(/\s+/g, '').toLowerCase();
        const sKey = st.name.replace(/\s+/g, '').toLowerCase();
        if (
          (mKey.length >= 2 && compactInput.includes(mKey)) ||
          (sKey.length >= 2 && compactInput.includes(sKey))
        ) {
          pickedMenu = candidate;
          break;
        }
      }
    }

    if (pickedMenu) {
      const pickedStore = storeMap.get(pickedMenu.storeId);
      const qty = Math.min(
        Math.max(1, stagedServings[pickedMenu.id] ?? activeCondition.servings ?? 1),
        Math.max(1, pickedMenu.stock)
      );
      setStagedServings((prev) => ({ ...prev, [pickedMenu!.id]: qty }));
      const totalEst =
        getEffectiveMenuPrice(pickedMenu) * qty +
        (pickedStore?.deliveryFee ?? 0);
      const msg = `${pickedStore?.name ?? ''} ${pickedMenu.name} ${qty}인분, 배달비 포함 ${formatWon(totalEst)}으로 골랐어요. 수량이나 옵션을 바꿀까요, 바로 결제할까요?`;
      setMessages((prev) => [
        ...prev,
        {
          id: `b-choose-${Date.now() + 1}`,
          sender: 'bot',
          text: msg,
          spokenText: msg,
          stagedMenuId: pickedMenu!.id,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    // 4. Query or toggle options on the active staged menu
    if (activeMenu && activeStore && (!hasDishCategory || matchesCurrentStagedDish)) {
      if (/(옵션\s*뭐|추가\s*뭐|토핑\s*뭐)/.test(trimmed)) {
        const optReply =
          activeMenu.options.length > 0
            ? `${activeMenu.name} 선택 가능 옵션은 ${activeMenu.options
                .map((o) => `${o.name} ${formatWon(o.priceDelta)}`)
                .join(', ')}입니다. 추가할 옵션을 말씀해 주세요.`
            : `${activeMenu.name}에는 별도 추가 옵션이 없어요. 바로 결제할까요?`;
        setMessages((prev) => [
          ...prev,
          {
            id: `b-opts-${Date.now() + 1}`,
            sender: 'bot',
            text: optReply,
            spokenText: optReply,
            stagedMenuId: activeMenu.id,
            aiSource: 'rule',
          },
        ]);
        return;
      }

      const compactInput = trimmed.replace(/\s+/g, '').toLowerCase();
      const matchedOpt = activeMenu.options.find((opt) => {
        const optKey = opt.name.replace(/\s+/g, '').toLowerCase();
        return optKey.length >= 2 && compactInput.includes(optKey);
      });
      if (matchedOpt) {
        const curOpts = stagedOptions[activeMenu.id] ?? [];
        const isRemoving = /(빼|제외|취소)/.test(trimmed);
        const nextOpts = isRemoving
          ? curOpts.filter((id) => id !== matchedOpt.id)
          : curOpts.includes(matchedOpt.id)
            ? curOpts
            : [...curOpts, matchedOpt.id];
        setStagedOptions((prev) => ({ ...prev, [activeMenu.id]: nextOpts }));
        const qty = stagedServings[activeMenu.id] ?? 1;
        const optSum =
          activeMenu.options
            .filter((o) => nextOpts.includes(o.id))
            .reduce((s, o) => s + o.priceDelta, 0) * qty;
        const est =
          getEffectiveMenuPrice(activeMenu) * qty +
          optSum +
          activeStore.deliveryFee;
        const optText = isRemoving
          ? `${matchedOpt.name} 옵션을 뺐어요. 예상 금액은 ${formatWon(est)}입니다. 바로 결제할까요?`
          : `${matchedOpt.name} 옵션을 추가했어요. 배달비 포함 ${formatWon(est)}입니다. 바로 결제할까요?`;
        setMessages((prev) => [
          ...prev,
          {
            id: `b-optset-${Date.now() + 1}`,
            sender: 'bot',
            text: optText,
            spokenText: optText,
            stagedMenuId: activeMenu.id,
            aiSource: 'rule',
          },
        ]);
        return;
      }
    }

    // 5. Modify quantity on active staged menu without switching dish
    const spokenQtyOnly = extractExplicitQuantity(trimmed);
    const wantsCheckoutNow =
      /(결제|결재|주문\s*해|시켜\s*줘|바로\s*주문|이걸로\s*할|그걸로\s*할|그거로\s*할|할게)/.test(
        trimmed
      ) || Boolean(detectPaymentMethodFromSpeech(trimmed));

    if (
      spokenQtyOnly &&
      !hasDishCategory &&
      !wantsCheckoutNow &&
      activeMenu &&
      activeStore
    ) {
      const nextQty = Math.min(spokenQtyOnly, Math.max(1, activeMenu.stock));
      setStagedServings((prev) => ({ ...prev, [activeMenu.id]: nextQty }));
      const curOpts = stagedOptions[activeMenu.id] ?? [];
      const optSum =
        activeMenu.options
          .filter((o) => curOpts.includes(o.id))
          .reduce((s, o) => s + o.priceDelta, 0) * nextQty;
      const newEst =
        getEffectiveMenuPrice(activeMenu) * nextQty +
        optSum +
        activeStore.deliveryFee;
      const qtyReply = `${activeMenu.name} ${nextQty}인분으로 변경했어요. 배달비 포함 ${formatWon(newEst)}입니다. 바로 결제할까요?`;
      setMessages((prev) => [
        ...prev,
        {
          id: `b-qty-${Date.now() + 1}`,
          sender: 'bot',
          text: qtyReply,
          spokenText: qtyReply,
          stagedMenuId: activeMenu.id,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    // 6. Add to cart by voice
    if (/(장바구니|담아\s*줘|담아\s*둘)/.test(trimmed) && activeMenu && activeStore) {
      const qty = stagedServings[activeMenu.id] ?? 1;
      const opts = stagedOptions[activeMenu.id] ?? [];
      onAddToCart?.(activeMenu.id, qty, opts);
      const cartMsg = `${activeMenu.name} ${qty}인분을 장바구니에 담았어요! 다른 메뉴를 더 보실까요, 바로 결제할까요?`;
      setMessages((prev) => [
        ...prev,
        {
          id: `b-cart-${Date.now() + 1}`,
          sender: 'bot',
          text: cartMsg,
          spokenText: cartMsg,
          stagedMenuId: activeMenu.id,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    // 7. Proceed to in-chat checkout confirmation for staged menu
    const lastBot = [...messages].reverse().find((m) => m.sender === 'bot');
    const canAffirmFromLastBot =
      Boolean(lastBot) &&
      lastBot!.id !== 'welcome' &&
      !lastBot!.id.startsWith('welcome-') &&
      !lastBot!.parsed?.needsConfirmation &&
      !lastBot!.isEmptyRelaxPrompt;

    const isProceedToCheckoutIntent =
      (!hasDishCategory || matchesCurrentStagedDish) &&
      Boolean(activeMenu && activeStore) &&
      (wantsCheckoutNow ||
        (canAffirmFromLastBot &&
          /^(네|예|응|어|좋아|오케이|ok)$/.test(trimmed.toLowerCase())));

    if (isProceedToCheckoutIntent && activeMenu && activeStore) {
      const baseQty =
        spokenQtyOnly ??
        stagedServings[activeMenu.id] ??
        Math.min(activeCondition.servings || 1, Math.max(1, activeMenu.stock));
      const qty = Math.min(Math.max(1, baseQty), Math.max(1, activeMenu.stock));
      const paymentMethod = detectPaymentMethodFromSpeech(trimmed) ?? 'kakaopay';
      openCheckoutDraftMessage({
        menuId: activeMenu.id,
        servings: qty,
        selectedOptionIds: stagedOptions[activeMenu.id] ?? [],
        paymentMethod,
        customerNote: defaultNote ?? '',
      });
      return;
    }

    // Greeting / open-ended handling
    if (
      /^(안녕|하이|헬로|뭐\s*먹|추천|배고파|도와줘)/.test(trimmed) &&
      trimmed.length <= 16
    ) {
      const openParsed: ParsedCondition = {
        ...activeCondition,
        tags: [],
        maxBudget: null,
        maxMinutes: null,
        unknownTokens: [],
        needsConfirmation: false,
      };
      const evaluated = evaluateRecommendations(openParsed, stores, menus, activeLocation);
      const topOpen = evaluated.matches.slice(0, 3);
      setActiveCondition(openParsed);
      if (topOpen[0]) {
        setStagedServings((prev) => ({
          ...prev,
          [topOpen[0].menu.id]: Math.min(openParsed.servings, Math.max(1, topOpen[0].menu.stock)),
        }));
      }
      const spokenOpen = topOpen[0]
        ? `반갑습니다! 지금 가장 빠른 추천 메뉴는 ${topOpen[0].store.name}의 ${topOpen[0].menu.name}, ${formatWon(topOpen[0].estimatedTotal)}입니다. 이 메뉴로 주문할까요, 다른 음식을 말씀해 주실래요?`
        : '반갑습니다! 어떤 음식을 드시고 싶으신가요?';
      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now() + 1}`,
          sender: 'bot',
          text: '반갑습니다! 지금 바로 주문할 수 있는 내 주변 인기 메뉴 3곳을 먼저 보여드릴게요. 치킨·마라탕·카페·야식처럼 원하시는 메뉴를 말씀해 주셔도 좋아요.',
          spokenText: spokenOpen,
          parsed: openParsed,
          matchedMenuIds: topOpen.map((m) => m.menu.id),
          servings: openParsed.servings,
          stagedMenuId: topOpen[0]?.menu.id,
        },
      ]);
      return;
    }

    // Special local-commerce intent routing (마감특가 / 시장묶음 / 공동구매 / B2B / 릴레이쿠폰)
    if (/(마감|타임세일|떨이|잔여\s*특가)/.test(trimmed)) {
      const closingMenus = menus
        .filter((m) => {
          const st = storeMap.get(m.storeId);
          return (
            Boolean(st?.isOpen) &&
            !m.isSoldOut &&
            m.stock > 0 &&
            (m.closingDiscountPercent ?? 0) > 0 &&
            (!hasDeliverableInArea ||
              (st ? isStoreDeliverableToLocation(st, activeLocation) : false))
          );
        })
        .slice(0, 3);

      const firstClosing = closingMenus[0];
      const firstClosingStore = firstClosing
        ? storeMap.get(firstClosing.storeId)
        : undefined;
      const closingSpoken =
        firstClosing && firstClosingStore
          ? `${activeLocation?.areaName ?? '동네'} 마감 특가 ${closingMenus.length}곳을 찾았어요. 1순위는 ${firstClosingStore.name} ${firstClosing.name} ${formatWon(getEffectiveMenuPrice(firstClosing))}입니다. 바로 결제할까요?`
          : '현재 지역 마감 특가가 잠시 소진되었어요. 다른 메뉴를 찾아드릴까요?';

      setMessages((prev) => [
        ...prev,
        {
          id: `b-closing-${Date.now() + 1}`,
          sender: 'bot',
          text:
            closingMenus.length > 0
              ? `지금 바로 배달 가능한 마감 특가(최대 30% 할인) 메뉴 ${closingMenus.length}곳을 찾았어요! 매장 동일가 기준에서 추가 할인되어 바로 결제하실 수 있어요.`
              : '현재 진행 중인 마감 특가 메뉴가 잠시 소진되었습니다. 대신 배달 가능한 일반 매장 동일가 인기 메뉴를 찾아드릴까요?',
          spokenText: closingSpoken,
          matchedMenuIds: closingMenus.map((m) => m.id),
          servings: 1,
          stagedMenuId: closingMenus[0]?.id,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    if (/(시장|한\s*바구니|여러\s*가게|합배송|골목\s*묶음)/.test(trimmed)) {
      const marketText =
        '전통시장과 골목 가게 여러 곳의 메뉴를 최소주문금액 없이 한 바구니에 담고, 이웃 도보 통합 배달비 1회(1,500원)로 한 번에 받아보실 수 있어요.';
      setMessages((prev) => [
        ...prev,
        {
          id: `b-market-${Date.now() + 1}`,
          sender: 'bot',
          text: marketText,
          spokenText: marketText,
          actionLink: onOpenSuperApp
            ? {
                label: '전통시장·골목 한 바구니 담으러 가기 →',
                tab: SuperAppTab.MARKET_BUNDLE,
              }
            : undefined,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    if (/(공동구매|배달비\s*아끼|배달비\s*절약|배달비\s*반값|1\/n)/.test(trimmed)) {
      const groupText =
        '반경 300m 이웃과 주문을 묶으면 배달비가 절반으로 줄어들어요! 지금 참여 가능한 동네 공동구매 목록을 바로 열어드릴까요?';
      setMessages((prev) => [
        ...prev,
        {
          id: `b-group-${Date.now() + 1}`,
          sender: 'bot',
          text: groupText,
          spokenText: groupText,
          actionLink: onOpenSuperApp
            ? {
                label: '이웃 공동구매 참여하기 →',
                tab: SuperAppTab.GROUP_BUY,
              }
            : undefined,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    if (/(단체|회의|오피스|법인|야근\s*식사)/.test(trimmed)) {
      const b2bText =
        '오피스·회의 단체 주문은 오프피크 15분 정밀 예약으로 딱 맞춰 받아보실 수 있어요. B2B 예약 화면으로 바로 연결해 드릴게요.';
      setMessages((prev) => [
        ...prev,
        {
          id: `b-b2b-${Date.now() + 1}`,
          sender: 'bot',
          text: b2bText,
          spokenText: b2bText,
          actionLink: onOpenSuperApp
            ? {
                label: '오피스 B2B 15분 예약 열기 →',
                tab: SuperAppTab.B2B,
              }
            : undefined,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    if (/(릴레이|옆집|쿠폰)/.test(trimmed)) {
      const relayCandidate =
        menus.find((m) => {
          const st = storeMap.get(m.storeId);
          return (
            Boolean(st?.isOpen) &&
            !m.isSoldOut &&
            m.stock > 0 &&
            (st?.categoryGroup === '카페·디저트' ||
              st?.categoryGroup === '카페/디저트' ||
              st?.categoryGroup === '분식·야식' ||
              st?.categoryGroup === '분식/야식') &&
            (!hasDeliverableInArea ||
              (st ? isStoreDeliverableToLocation(st, activeLocation) : false))
          );
        }) ??
        menus.find((m) => {
          const st = storeMap.get(m.storeId);
          return (
            Boolean(st?.isOpen) &&
            !m.isSoldOut &&
            m.stock > 0 &&
            (!hasDeliverableInArea ||
              (st ? isStoreDeliverableToLocation(st, activeLocation) : false))
          );
        });

      const relayStore = relayCandidate
        ? storeMap.get(relayCandidate.storeId)
        : undefined;

      const relayText =
        relayCandidate && relayStore
          ? `배달 가능한 이웃 매장 '${relayStore.name}'에서 옆집 릴레이 1,000원 할인 쿠폰을 바로 쓰실 수 있어요!`
          : '인근 골목상권 릴레이 쿠폰 적용 가능한 매장을 확인해 보세요.';

      setMessages((prev) => [
        ...prev,
        {
          id: `b-relay-${Date.now() + 1}`,
          sender: 'bot',
          text: relayText,
          spokenText: relayText,
          matchedMenuIds: relayCandidate ? [relayCandidate.id] : [],
          servings: 1,
          stagedMenuId: relayCandidate?.id,
          actionLink:
            relayCandidate && onUseRelayCoupon
              ? {
                  label: `${relayStore?.name ?? '옆집 매장'} 릴레이 1,000원 할인 주문 →`,
                  relayMenuId: relayCandidate.id,
                }
              : undefined,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    let merged = mergeConversationalCondition(activeCondition, trimmed);
    let aiSource: 'gemini' | 'rule' = 'rule';
    let aiConversationalReply: string | undefined;

    // On-device-first fast path: respond immediately (<5ms) when local parser understands clearly.
    // Only escalate to cloud AI when the request is complex or unrecognized.
    const needsCloudFallback =
      merged.needsConfirmation ||
      (merged.tags.length === 0 && trimmed.length >= 6);

    if (
      needsCloudFallback &&
      (aiReady || hasGeminiApiKey()) &&
      !/초기화|처음부터|새로/.test(trimmed)
    ) {
      setIsAnalyzing(true);
      const aiResult = await parseConditionWithAI(trimmed, activeCondition);
      setIsAnalyzing(false);
      if (aiResult.source === 'gemini') {
        merged = aiResult.condition;
        aiSource = 'gemini';
        aiConversationalReply = aiResult.conversationalReply;
      }
    }

    setActiveCondition(merged);
    const evaluated = evaluateRecommendations(merged, stores, menus, activeLocation);
    const topMatches = evaluated.matches.slice(0, 3);

    let botText = '';
    let spokenText: string | undefined;
    let isEmptyRelaxPrompt = false;

    if (merged.needsConfirmation && merged.unknownTokens.length > 0) {
      botText = `말씀하신 ‘${merged.unknownTokens.join(
        ', '
      )}’에 어울리는 맛을 아래에서 선택해 주시거나, 원하시는 메뉴 종류(국밥·치킨·돈까스 등)를 편하게 말씀해 주세요.`;
      spokenText = `${activeLocation?.areaName ?? '내 주변'}에서 찾으시는 음식 종류나 더 싼 거, 안 매운 거처럼 편하게 다시 말씀해 주세요.`;
    } else if (topMatches.length === 0) {
      isEmptyRelaxPrompt = true;
      botText = `${activeLocation?.areaName ?? '내 주변'} 배달 가능 매장 중 ${merged.servings}인${
        merged.maxBudget ? ` · ${formatWon(merged.maxBudget)} 이하` : ''
      }${
        merged.maxMinutes ? ` · ${merged.maxMinutes}분 이내` : ''
      } 조건을 모두 만족하는 메뉴를 찾지 못했어요. 조건을 조금 넓혀서 다시 찾아드릴까요?`;
      spokenText = `${activeLocation?.areaName ?? '내 주변'}에서 조건에 딱 맞는 메뉴를 못 찾았어요. 예산이나 시간을 조금 넓혀볼까요? 원하시는 다른 음식을 말씀하셔도 돼요.`;
    } else if (aiConversationalReply) {
      botText = aiConversationalReply;
      const top = topMatches[0];
      spokenText = `${aiConversationalReply} ${top.store.name} ${top.menu.name}, 배달비 포함 ${formatWon(top.estimatedTotal)}입니다. 이 메뉴로 주문할까요?`;
    } else {
      const tagPart =
        merged.tags.length > 0 ? ` (${merged.tags.slice(0, 3).join('·')})` : '';
      botText = `${tagPart ? `${tagPart.trim()} ` : ''}조건에 맞는 ${activeLocation?.areaName ?? '내 주변'} 배달 가능 추천 메뉴 ${topMatches.length}곳을 찾았어요. 1순위 메뉴는 아래에서 바로 담거나 결제하실 수 있어요.`;
      const top = topMatches[0];
      spokenText = `${top.store.name}의 ${top.menu.name} 외 ${Math.max(0, topMatches.length - 1)}곳을 찾았어요. 1순위는 배달비 포함 ${formatWon(top.estimatedTotal)}, 약 ${top.effectiveMinutes}분 도착입니다. 이 메뉴로 주문할까요, 다른 메뉴도 들어보실래요?`;
    }

    const autoStaged =
      !merged.needsConfirmation && topMatches.length > 0
        ? topMatches[0].menu
        : undefined;
    if (autoStaged) {
      setStagedServings((prev) => ({
        ...prev,
        [autoStaged.id]: Math.min(merged.servings, Math.max(1, autoStaged.stock)),
      }));
    }

    const botMsg: ChatMessage = {
      id: `b-${Date.now() + 1}`,
      sender: 'bot',
      text: botText,
      spokenText,
      parsed: merged,
      matchedMenuIds: topMatches.map((m) => m.menu.id),
      servings: merged.servings,
      stagedMenuId: autoStaged?.id,
      isEmptyRelaxPrompt,
      aiSource,
    };

    setMessages((prev) => [...prev, botMsg]);
  };

  runChatQueryRef.current = (rawText: string) => {
    void runChatQuery(rawText);
  };

  const handleConfirmTagInChat = (baseParsed: ParsedCondition, tag: string) => {
    const nextTags = baseParsed.tags.includes(tag)
      ? baseParsed.tags
      : [...baseParsed.tags, tag];
    const confirmed: ParsedCondition = {
      ...baseParsed,
      tags: nextTags,
      unknownTokens: [],
      needsConfirmation: false,
    };
    setActiveCondition(confirmed);
    const evaluated = evaluateRecommendations(confirmed, stores, menus, activeLocation);

    setMessages((prev) => [
      ...prev,
      {
        id: `u-confirm-${Date.now()}`,
        sender: 'user',
        text: `${tag} 스타일로 찾아주세요.`,
      },
      {
        id: `b-confirm-${Date.now() + 1}`,
        sender: 'bot',
        text:
          evaluated.matches.length > 0
            ? `좋아요! '${tag}' 취향에 맞는 ${evaluated.matches.length}개 메뉴를 준비했습니다.`
            : '선택하신 조건에 딱 맞는 메뉴가 아직 없어요. 예산이나 시간을 조금 넓혀볼까요?',
        parsed: confirmed,
        matchedMenuIds: evaluated.matches.map((m) => m.menu.id),
        servings: confirmed.servings,
        isEmptyRelaxPrompt: evaluated.matches.length === 0,
      },
    ]);
  };

  const handleRelaxInChat = (
    baseParsed: ParsedCondition,
    mode: 'budget' | 'minutes' | 'all'
  ) => {
    const relaxed: ParsedCondition =
      mode === 'budget'
        ? {
            ...baseParsed,
            maxBudget: (baseParsed.maxBudget ?? 20000) + 10000,
          }
        : mode === 'minutes'
          ? {
              ...baseParsed,
              maxMinutes: (baseParsed.maxMinutes ?? 25) + 15,
            }
          : {
              ...baseParsed,
              tags: [],
              maxBudget: null,
              maxMinutes: null,
              unknownTokens: [],
              needsConfirmation: false,
            };

    setActiveCondition(relaxed);
    const evaluated = evaluateRecommendations(relaxed, stores, menus, activeLocation);
    const label =
      mode === 'budget'
        ? '예산 10,000원 늘려서 다시 찾아주세요'
        : mode === 'minutes'
          ? '배달 시간 15분 여유 두고 찾아주세요'
          : '지금 주문 가능한 인기 메뉴 전체 보여주세요';

    setMessages((prev) => [
      ...prev,
      {
        id: `u-relax-${Date.now()}`,
        sender: 'user',
        text: label,
      },
      {
        id: `b-relax-${Date.now() + 1}`,
        sender: 'bot',
        text:
          evaluated.matches.length > 0
            ? `네, 조건을 조정해 ${evaluated.matches.length}개 메뉴를 다시 찾았습니다.`
            : '해당 조건에서도 맞는 메뉴가 없어 전체 메뉴를 확인해 보세요.',
        parsed: relaxed,
        matchedMenuIds: evaluated.matches.slice(0, 6).map((m) => m.menu.id),
        servings: relaxed.servings,
      },
    ]);
  };

  const handleStageMenuInChat = (item: MenuItem, servings: number) => {
    const safeServings = Math.min(Math.max(1, servings), Math.max(1, item.stock));
    setStagedServings((prev) => ({ ...prev, [item.id]: safeServings }));
    setStagedOptions((prev) => ({ ...prev, [item.id]: prev[item.id] ?? [] }));

    setMessages((prev) => [
      ...prev,
      {
        id: `u-pick-${Date.now()}`,
        sender: 'user',
        text: `${item.name} 선택할게요.`,
      },
      {
        id: `b-stage-${Date.now() + 1}`,
        sender: 'bot',
        text: `${item.name}, 정말 맛있죠! ${safeServings}인분으로 수량과 추가 옵션을 확인하신 뒤 바로 주문 확인으로 넘어가실 수 있어요.`,
        spokenText: `${item.name} ${safeServings}인분으로 골랐어요. 수량이나 옵션을 바꾸거나 바로 결제할까요?`,
        stagedMenuId: item.id,
      },
    ]);
  };

  const handleToggleVoiceReply = () => {
    const next = !voiceReplyEnabled;
    setVoiceReplyEnabled(next);
    voiceReplyEnabledRef.current = next;
    try {
      window.localStorage.setItem('alle_voice_reply_enabled', String(next));
    } catch {
      // ignore storage errors
    }
    if (!next) {
      shouldContinueListeningRef.current = false;
      clearAutoListenTimer();
      clearRestartListenTimer();
      stopVoiceRef.current?.();
      stopSpeaking();
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setIsListening(false);
      isListeningRef.current = false;
      setInterimTranscript('');
      setVoiceAutoplayBlocked(false);
    } else {
      voiceDeniedRef.current = false;
      shouldContinueListeningRef.current = true;
      const lastBot = [...messages].reverse().find((m) => m.sender === 'bot');
      if (lastBot) {
        lastSpokenMsgIdRef.current = lastBot.id;
        speakBotReply(
          lastBot.id === 'welcome'
            ? '어떤 음식을 찾아드릴까요?'
            : lastBot.spokenText ?? lastBot.text,
          true
        );
      } else {
        startListening();
      }
    }
  };

  const handleUnlockVoiceGreeting = () => {
    setVoiceAutoplayBlocked(false);
    voiceDeniedRef.current = false;
    shouldContinueListeningRef.current = true;
    setVoiceReplyEnabled(true);
    voiceReplyEnabledRef.current = true;
    try {
      window.localStorage.setItem('alle_voice_reply_enabled', 'true');
    } catch {
      // ignore storage errors
    }
    const lastBot = [...messages].reverse().find((m) => m.sender === 'bot');
    const textToSpeak =
      lastBot && lastBot.id !== 'welcome'
        ? lastBot.spokenText ?? lastBot.text
        : '어떤 음식을 찾아드릴까요?';
    if (lastBot) {
      lastSpokenMsgIdRef.current = lastBot.id;
    }
    speakBotReply(textToSpeak, true);
  };

  const handleInterruptToListen = () => {
    voiceDeniedRef.current = false;
    shouldContinueListeningRef.current = true;
    clearAutoListenTimer();
    clearRestartListenTimer();
    stopSpeaking();
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    startListening();
  };

  const handleMicToggle = () => {
    if (isListening) {
      shouldContinueListeningRef.current = false;
      clearAutoListenTimer();
      clearRestartListenTimer();
      stopVoiceRef.current?.();
      setIsListening(false);
      isListeningRef.current = false;
      setInterimTranscript('');
      return;
    }

    voiceDeniedRef.current = false;
    shouldContinueListeningRef.current = true;
    if (isSpeakingRef.current) {
      stopSpeaking();
      setIsSpeaking(false);
      isSpeakingRef.current = false;
    }
    startListening();
  };

  const isAiActive =
    isListening || isSpeaking || isInputFocused || input.trim().length > 0;

  return (
    <div className="max-w-3xl mx-auto os-card rounded-[32px] overflow-hidden flex flex-col min-h-[76vh]">
      {/* Calm AI Studio Header (2-row layout prevents mobile truncation) */}
      <div className="px-4 sm:px-6 py-3 bg-white border-b border-[#E8ECE4] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={onBackToHome}
              className="min-w-[38px] min-h-[38px] rounded-xl hover:bg-[#F7F8F5] flex items-center justify-center text-[#1A1D1A] cursor-pointer transition-colors shrink-0"
              aria-label="홈으로 돌아가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-[#1A1D1A] tracking-tight whitespace-nowrap">
                올이 주문
              </h1>
              <p className="text-xs text-[#687064] truncate">
                {activeLocation?.areaName ?? '전국'} 기준 · 대화부터 결제까지
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {viewMode === 'chat' && getSpeechRecognitionConstructor() && (
              <button
                type="button"
                onClick={handleMicToggle}
                aria-pressed={isListening}
                className={`min-h-[36px] px-2.5 py-1 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors border ${
                  isListening
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#687064] hover:bg-[#EAF1E2]'
                }`}
              >
                {isListening ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <Mic className="w-3.5 h-3.5 shrink-0" />
                    <span>마이크 ON</span>
                  </>
                ) : (
                  <>
                    <MicOff className="w-3.5 h-3.5 shrink-0" />
                    <span>마이크 OFF</span>
                  </>
                )}
              </button>
            )}
            {aiReady && (
              <span className="hidden lg:inline-flex min-h-[36px] px-2.5 py-1 bg-[#EAF1E2] border border-[#82B440] text-[#3D5720] text-xs font-semibold rounded-xl items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>alle 분석</span>
              </span>
            )}
            {viewMode === 'chat' && isSpeechSynthesisSupported() && (
              <button
                type="button"
                onClick={handleToggleVoiceReply}
                aria-pressed={voiceReplyEnabled}
                className={`min-h-[36px] px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors border ${
                  voiceReplyEnabled
                    ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                    : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#434B40] hover:bg-[#EAF1E2]'
                }`}
              >
                {voiceReplyEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{voiceReplyEnabled ? '음성 대화 ON' : '음성 꺼짐'}</span>
              </button>
            )}
            {viewMode === 'chat' && (
              <button
                type="button"
                onClick={() => runChatQuery('초기화')}
                aria-label="새 대화 시작"
                className="min-h-[36px] px-2.5 py-1 bg-[#F7F8F5] hover:bg-[#EAF1E2] text-[#687064] hover:text-[#4E6E2A] text-xs font-semibold rounded-xl inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">새 대화</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 p-1 bg-[#F0F3EC] border border-[#E8ECE4] rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode('chat')}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'chat'
                ? 'bg-[#4E6E2A] text-white shadow-2xs'
                : 'text-[#555E52] hover:text-[#1A1D1A]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>올이 대화 주문</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('search')}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              viewMode === 'search'
                ? 'bg-[#4E6E2A] text-white shadow-2xs'
                : 'text-[#555E52] hover:text-[#1A1D1A]'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>가게·메뉴 직접 검색</span>
          </button>
        </div>
      </div>

      {viewMode === 'search' ? (
        <div className="flex-1 bg-[#F7F8F5] p-5 sm:p-6 space-y-4 overflow-y-auto">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[#4E6E2A] absolute left-4 pointer-events-none" />
            <input
              type="text"
              value={directSearchText}
              onChange={(e) => setDirectSearchText(e.target.value)}
              placeholder="가게명, 메뉴명 또는 태그를 입력하세요 (예: 치킨, 광장시장, 국밥)"
              className="w-full min-h-[48px] pl-10 pr-4 bg-white border border-[#D4E1C5] rounded-2xl text-sm text-[#1A1D1A] placeholder:text-[#687064]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {DIRECT_SEARCH_CATEGORIES.map((cat) => {
              const active = directCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setDirectCategory(cat)}
                  className={`min-h-[34px] px-3 py-1 rounded-full border text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                      : 'bg-white border-[#E8ECE4] text-[#434B40]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="text-xs font-semibold text-[#687064]">
            검색 결과 {directSearchResults.length}건 ({activeLocation?.areaName ?? '전국'} 배달 가능 매장만 표시)
          </div>

          {directSearchResults.length === 0 ? (
            <div className="bg-white border border-[#E8ECE4] rounded-2xl p-8 text-center text-sm text-[#687064]">
              검색 조건에 맞는 메뉴가 없습니다. 검색어를 바꾸거나 올이 대화 주문을 이용해 보세요.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {directSearchResults.map((item) => {
                const effectivePrice = getEffectiveMenuPrice(item.menu);
                return (
                  <article
                    key={item.menu.id}
                    className="bg-white border border-[#E8ECE4] rounded-2xl p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden border border-[#E8ECE4] shrink-0">
                        <FoodImage
                          src={item.menu.image}
                          alt={item.menu.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[11px] text-[#687064]">
                          {item.isNearbyArea && (
                            <span className="px-1.5 py-0.5 rounded bg-[#EAF1E2] text-[#3D5720] font-bold">
                              내 주변
                            </span>
                          )}
                          <span className="truncate font-semibold text-[#4E6E2A]">
                            {item.store.name}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-[#1A1D1A] truncate">
                          {item.menu.name}
                        </h3>
                        <p className="text-xs font-mono font-bold text-[#1A1D1A] tabular-nums">
                          {formatWon(effectivePrice)}{' '}
                          <span className="font-sans font-normal text-[#687064]">
                            · 배달비 {formatWon(item.deliveryFee)} · 약 {item.effectiveMinutes}분
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenRecommendationWithCondition(activeCondition, item.menu.id)
                        }
                        className="min-h-[36px] px-2 py-1 bg-[#F7F8F5] hover:bg-[#EAF1E2] text-[#434B40] text-xs font-semibold rounded-xl cursor-pointer"
                      >
                        상세
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onAddToCart
                            ? onAddToCart(item.menu.id, 1, [])
                            : handleStageMenuInChat(item.menu, 1)
                        }
                        className="min-h-[36px] px-2 py-1 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs font-bold rounded-xl cursor-pointer"
                      >
                        담기
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onProceedToConfirm({
                            menuId: item.menu.id,
                            servings: 1,
                            selectedOptionIds: [],
                            couponCode: 'NONE',
                          })
                        }
                        className="min-h-[36px] px-2 py-1 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs font-bold rounded-xl cursor-pointer"
                      >
                        주문
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
      {/* Chat Stream */}
      <div className="flex-1 bg-[#F7F8F5] p-5 sm:p-7 space-y-6 overflow-y-auto">
        {messages.map((msg) => {
          if (msg.sender === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[82%] px-4 py-3 bg-[#4E6E2A] text-white text-sm font-medium rounded-2xl rounded-br-sm shadow-sm inline-flex items-start gap-2">
                  <AudioLines className="w-4 h-4 mt-0.5 text-[#EAF1E2] shrink-0" />
                  <span>{msg.text}</span>
                </div>
              </div>
            );
          }

          const matchedMenus = (msg.matchedMenuIds ?? [])
            .map((id) => menuMap.get(id))
            .filter((m): m is MenuItem => Boolean(m));

          const stagedMenu = msg.stagedMenuId
            ? menuMap.get(msg.stagedMenuId)
            : undefined;
          const stagedStore = stagedMenu
            ? storeMap.get(stagedMenu.storeId)
            : undefined;

          return (
            <div key={msg.id} className="space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-white border border-[#E8ECE4] shadow-2xs flex items-center justify-center shrink-0 overflow-hidden">
                  <AlleBotIllustration size="sm" />
                </div>
                <div className="max-w-[88%] bg-white border border-[#E8ECE4] rounded-2xl rounded-tl-xs px-4 py-3 text-sm text-[#1A1D1A] leading-relaxed shadow-sm space-y-2.5">
                  {msg.aiSource === 'gemini' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[10px] font-bold">
                      <Sparkles className="w-2.5 h-2.5" />
                      alle 분석
                    </span>
                  )}
                  <p>{msg.text}</p>

                  {msg.actionLink && (
                    <button
                      type="button"
                      onClick={() => {
                        if (msg.actionLink?.tab && onOpenSuperApp) {
                          onOpenSuperApp(msg.actionLink.tab);
                        } else if (
                          msg.actionLink?.relayMenuId &&
                          onUseRelayCoupon
                        ) {
                          onUseRelayCoupon(msg.actionLink.relayMenuId);
                        }
                      }}
                      className="min-h-[38px] px-3.5 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs font-bold rounded-xl cursor-pointer transition-colors"
                    >
                      {msg.actionLink.label}
                    </button>
                  )}

                  {msg.parsed?.needsConfirmation &&
                    msg.parsed.unknownTokens.length > 0 && (
                      <div className="p-3 bg-[#FFFBEF] border border-[#E8D595] rounded-xl space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>가장 가까운 맛을 선택해 주세요</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {['순한맛', '담백한', '국물', '바삭한', '얼큰한'].map(
                            (tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() =>
                                  handleConfirmTagInChat(msg.parsed!, tag)
                                }
                                className="min-h-[34px] px-3 py-1 bg-white border border-[#D4E1C5] hover:bg-[#EAF1E2] text-[#4E6E2A] text-xs font-bold rounded-lg cursor-pointer"
                              >
                                {tag}
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    )}

                  {msg.isEmptyRelaxPrompt && msg.parsed && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleRelaxInChat(msg.parsed!, 'budget')}
                        className="min-h-[34px] px-3 py-1 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs font-bold rounded-xl cursor-pointer"
                      >
                        예산 +10,000원
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRelaxInChat(msg.parsed!, 'minutes')}
                        className="min-h-[34px] px-3 py-1 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs font-bold rounded-xl cursor-pointer"
                      >
                        시간 +15분
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRelaxInChat(msg.parsed!, 'all')}
                        className="min-h-[34px] px-3 py-1 bg-[#4E6E2A] text-white text-xs font-bold rounded-xl cursor-pointer"
                      >
                        인기 메뉴 전체 보기
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {msg.id === 'welcome' && (
                <div className="flex flex-wrap gap-2 pl-12">
                  {COUNSELOR_QUICK_STARTERS.map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => runChatQuery(chip.prompt)}
                      className="min-h-[36px] px-3.5 py-1.5 bg-white hover:bg-[#EAF1E2] border border-[#E8ECE4] text-[#1A1D1A] text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Horizontal AI-Reason-First Recommended Cards */}
              {matchedMenus.length > 0 && (
                <div className="flex gap-3.5 overflow-x-auto pb-1 pl-1 sm:pl-12 no-scrollbar">
                  {matchedMenus.map((item, idx) => {
                    const store = storeMap.get(item.storeId);
                    if (!store) return null;
                    const wished = wishlistIds.includes(item.id);
                    const servings = msg.servings ?? 2;
                    const effectivePrice = getEffectiveMenuPrice(item);
                    const total = effectivePrice * servings + store.deliveryFee;
                    const isSameStore = item.storePrice === item.pricePerPerson;
                    const hasClosingDiscount = (item.closingDiscountPercent ?? 0) > 0;

                    return (
                      <div
                        key={item.id}
                        className="w-[268px] shrink-0 bg-white border border-[#E8ECE4] hover:border-[#82B440] rounded-2xl p-4 flex flex-col justify-between gap-3.5 shadow-sm transition-colors"
                      >
                        <div className="space-y-3">
                          {/* Soft Sage Green '✨ AI 추천' Badge + Same-Store Price + Closing Sale */}
                          <div className="p-2.5 rounded-xl bg-[#EAF1E2] border border-[#DCE7CF] space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <span className="inline-flex items-center text-[11px] font-bold text-[#3D5720]">
                                ✨ 올이 추천 {idx + 1}순위
                              </span>
                              <div className="flex items-center gap-1">
                                {isSameStore && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-white text-[#3D5720] text-[10px] font-bold">
                                    매장 동일가 ✓
                                  </span>
                                )}
                                {hasClosingDiscount && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-amber-600 text-white text-[10px] font-bold">
                                    마감 -{item.closingDiscountPercent}%
                                  </span>
                                )}
                              </div>
                            </div>
                            {item.aiReason && (
                              <p className="text-[11px] font-medium text-[#3D5720] leading-snug line-clamp-2">
                                {item.aiReason}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                switchSpotlightIndex(idx, {
                                  msgId: msg.id,
                                  menuIds: matchedMenus.map((m) => m.id),
                                  activeIndex: idx,
                                  explanation: msg.spokenText ?? msg.text,
                                  servings,
                                })
                              }
                              aria-label={`${item.name} 올이 설명 팝업 열기`}
                              className="w-15 h-15 rounded-xl overflow-hidden border border-[#E8ECE4] shrink-0 cursor-pointer hover:ring-2 hover:ring-[#82B440] transition-all"
                            >
                              <FoodImage
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-1">
                                <div className="flex items-center gap-1 text-[11px] font-medium text-[#687064] min-w-0">
                                  <span className="truncate">{store.name}</span>
                                  <span className="inline-flex items-center gap-0.5 text-[#1A1D1A] font-semibold shrink-0 tabular-nums">
                                    <Star className="w-3 h-3 fill-[#82B440] text-[#82B440]" />
                                    {(store.rating ?? 4.9).toFixed(1)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onToggleWishlist(item.id)}
                                  aria-label={`${item.name} 찜하기`}
                                  className="p-0.5 cursor-pointer shrink-0"
                                >
                                  <Heart
                                    className={`w-3.5 h-3.5 ${
                                      wished
                                        ? 'fill-red-500 text-red-500'
                                        : 'text-[#919A8D]'
                                    }`}
                                  />
                                </button>
                              </div>
                              <div className="text-sm font-bold text-[#1A1D1A] truncate mt-0.5">
                                {item.name}
                              </div>
                              <div className="text-xs font-bold text-[#4E6E2A] tabular-nums mt-1">
                                {formatWon(total)}{' '}
                                <span className="font-normal text-[#687064]">
                                  · 약 {item.estimatedMinutes + (store.extraPrepMinutes ?? 0)}분
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenRecommendationWithCondition(
                                msg.parsed ?? activeCondition,
                                item.id
                              )
                            }
                            className="min-h-[38px] px-2.5 py-1.5 bg-[#F7F8F5] hover:bg-[#F0F3EC] text-[#687064] text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                          >
                            상세 · 리뷰
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (onAddToCart) {
                                onAddToCart(item.id, servings, []);
                              } else {
                                handleStageMenuInChat(item, servings);
                              }
                            }}
                            className="min-h-[38px] px-2.5 py-1.5 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>담기</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Conversational In-Chat Order Staging Card */}
              {stagedMenu && stagedStore && (
                <div className="pl-1 sm:pl-12">
                  <div className="max-w-md bg-white border border-[#D4E1C5] rounded-2xl p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-[#E8ECE4]">
                          <FoodImage
                            src={stagedMenu.image}
                            alt={stagedMenu.name}
                            className="w-full h-full"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#4E6E2A]">
                            {stagedStore.name}
                          </div>
                          <div className="text-sm font-bold text-[#1A1D1A] truncate">
                            {stagedMenu.name}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setStagedServings((prev) => ({
                              ...prev,
                              [stagedMenu.id]: Math.max(
                                1,
                                (prev[stagedMenu.id] ?? 1) - 1
                              ),
                            }))
                          }
                          aria-label="수량 감소"
                          className="w-8 h-8 rounded-lg border border-[#E8ECE4] bg-[#F7F8F5] font-bold text-sm cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-mono tabular-nums text-sm font-bold">
                          {stagedServings[stagedMenu.id] ?? 1}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setStagedServings((prev) => ({
                              ...prev,
                              [stagedMenu.id]: Math.min(
                                Math.max(1, stagedMenu.stock),
                                (prev[stagedMenu.id] ?? 1) + 1
                              ),
                            }))
                          }
                          aria-label="수량 증가"
                          className="w-8 h-8 rounded-lg border border-[#E8ECE4] bg-[#F7F8F5] font-bold text-sm cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {stagedMenu.options.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-[#E8ECE4]">
                        <div className="text-[11px] font-bold text-[#687064]">
                          추가 옵션 (원하실 때만 선택)
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {stagedMenu.options.map((opt) => {
                            const selected = (
                              stagedOptions[stagedMenu.id] ?? []
                            ).includes(opt.id);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() =>
                                  setStagedOptions((prev) => {
                                    const cur = prev[stagedMenu.id] ?? [];
                                    return {
                                      ...prev,
                                      [stagedMenu.id]: selected
                                        ? cur.filter((id) => id !== opt.id)
                                        : [...cur, opt.id],
                                    };
                                  })
                                }
                                className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                                  selected
                                    ? 'bg-[#EAF1E2] border-[#82B440] text-[#3D5720]'
                                    : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#555E52]'
                                }`}
                              >
                                {opt.name} +{formatWon(opt.priceDelta)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(() => {
                      const qty = stagedServings[stagedMenu.id] ?? 1;
                      const optIds = stagedOptions[stagedMenu.id] ?? [];
                      const optSum =
                        stagedMenu.options
                          .filter((o) => optIds.includes(o.id))
                          .reduce((s, o) => s + o.priceDelta, 0) * qty;
                      const effectiveUnit = getEffectiveMenuPrice(stagedMenu);
                      const estTotal =
                        effectiveUnit * qty + optSum + stagedStore.deliveryFee;

                      return (
                        <div className="pt-3 border-t border-[#E8ECE4] space-y-3">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs text-[#687064]">
                              배달비 포함 최종 예상 금액
                              {(stagedMenu.closingDiscountPercent ?? 0) > 0 && (
                                <strong className="ml-1 text-amber-800">
                                  (마감 -{stagedMenu.closingDiscountPercent}%)
                                </strong>
                              )}
                            </span>
                            <span className="text-lg font-bold font-mono tabular-nums text-[#4E6E2A]">
                              {formatWon(estTotal)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                onAddToCart
                                  ? onAddToCart(stagedMenu.id, qty, optIds)
                                  : onOpenRecommendationWithCondition(
                                      activeCondition,
                                      stagedMenu.id
                                    )
                              }
                              className="min-h-[42px] px-3 py-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs sm:text-sm font-bold rounded-xl cursor-pointer transition-colors"
                            >
                              {onAddToCart ? '장바구니 담기' : '다른 메뉴 보기'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onProceedToConfirm({
                                  menuId: stagedMenu.id,
                                  servings: qty,
                                  selectedOptionIds: optIds,
                                  couponCode: 'NONE',
                                })
                              }
                              className="min-h-[42px] px-3 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <Zap className="w-4 h-4" />
                              <span>바로 결제하기</span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Conversational Voice Checkout Confirmation Card */}
              {msg.checkoutDraftSnapshot && (() => {
                const isLiveCard =
                  Boolean(voiceCheckoutDraft) && msg.id === latestCheckoutMsgId;
                const activeDraft =
                  isLiveCard && voiceCheckoutDraft
                    ? voiceCheckoutDraft
                    : msg.checkoutDraftSnapshot;
                const summary = buildVoiceCheckoutSummary(activeDraft);
                if (!summary) return null;

                return (
                  <div className="pl-1 sm:pl-12">
                    {isLiveCard ? (
                      <div className="max-w-md bg-white border-2 border-[#4E6E2A] rounded-2xl p-4 space-y-3 shadow-md">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[11px] font-bold">
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>음성·대화 간편 결제 확인</span>
                          </span>
                          <span className="text-[11px] font-semibold text-[#687064] truncate">
                            {summary.store.name}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2 font-bold text-[#1A1D1A]">
                            <span className="truncate">
                              {summary.menu.name} · {summary.qty}인분
                            </span>
                            <span className="font-mono tabular-nums shrink-0">
                              {formatWon(
                                summary.menuSubtotal + summary.optionsSubtotal
                              )}
                            </span>
                          </div>
                          {summary.selectedOpts.length > 0 && (
                            <p className="text-[11px] text-[#687064]">
                              옵션:{' '}
                              {summary.selectedOpts.map((o) => o.name).join(', ')}
                            </p>
                          )}
                          <p className="text-[11px] text-[#687064] truncate">
                            배달: {activeLocation?.areaName ?? ''}{' '}
                            {activeLocation?.detailAddress ?? '문 앞 배달'} · 약{' '}
                            {summary.effectiveMinutes}분
                          </p>
                        </div>

                        <div className="space-y-1 text-xs">
                          <div className="flex items-center justify-between text-[#687064]">
                            <span>배달비</span>
                            <span className="font-mono tabular-nums">
                              +{formatWon(summary.deliveryFee)}
                            </span>
                          </div>
                          {summary.bestCoupon && summary.couponDiscount > 0 && (
                            <div className="flex items-center justify-between text-[#4E6E2A] font-semibold">
                              <span className="inline-flex items-center gap-1">
                                <Ticket className="w-3.5 h-3.5" />
                                <span>{summary.bestCoupon.label} (자동 적용)</span>
                              </span>
                              <span className="font-mono tabular-nums">
                                -{formatWon(summary.couponDiscount)}
                              </span>
                            </div>
                          )}
                          {summary.savings.totalSaved > 0 && (
                            <div className="text-[11px] font-semibold text-[#3D5720] bg-[#EAF1E2]/70 rounded-lg px-2.5 py-1">
                              타 배달앱 대비 약{' '}
                              {formatWon(summary.savings.totalSaved)} 절약
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5 pt-2 border-t border-[#E8ECE4]">
                          <div className="text-[11px] font-bold text-[#687064]">
                            결제 수단 (말씀하시거나 눌러서 변경)
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {paymentOptions.map((opt) => {
                              const active =
                                activeDraft.paymentMethod === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    setVoiceCheckoutDraft((prev) =>
                                      prev
                                        ? { ...prev, paymentMethod: opt.id }
                                        : prev
                                    )
                                  }
                                  className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                                    active
                                      ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                                      : 'bg-white border-[#E8ECE4] text-[#434B40] hover:bg-[#EAF1E2]'
                                  }`}
                                >
                                  {opt.shortLabel}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {activeDraft.customerNote && (
                          <p className="text-[11px] text-[#687064]">
                            요청사항: {activeDraft.customerNote}
                          </p>
                        )}

                        <div className="pt-2 border-t border-[#E8ECE4] flex items-baseline justify-between">
                          <span className="text-xs font-bold text-[#1A1D1A]">
                            최종 결제 금액
                          </span>
                          <span className="text-lg font-extrabold font-mono tabular-nums text-[#4E6E2A]">
                            {formatWon(summary.finalTotal)}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setVoiceCheckoutDraft(null);
                              setMessages((prev) => [
                                ...prev,
                                {
                                  id: `b-cancelbtn-${Date.now()}`,
                                  sender: 'bot',
                                  text: '결제를 취소했어요. 다른 어떤 음식을 찾아드릴까요?',
                                  spokenText:
                                    '결제를 취소했어요. 다른 어떤 음식을 찾아드릴까요?',
                                  aiSource: 'rule',
                                },
                              ]);
                            }}
                            className="min-h-[42px] px-3 py-2 bg-[#F7F8F5] hover:bg-[#E8ECE4] text-[#1A1D1A] text-xs font-bold rounded-xl cursor-pointer"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => executeVoiceOrder(activeDraft)}
                            className="col-span-2 min-h-[42px] px-3 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>지금 바로 결제 완료</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-md px-3.5 py-2.5 rounded-xl bg-white border border-[#E8ECE4] text-xs text-[#687064]">
                        {summary.store.name} · {summary.menu.name} 결제 안내 (종료됨)
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}

        {voiceAutoplayBlocked && voiceReplyEnabled && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleUnlockVoiceGreeting}
              className="min-h-[42px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold rounded-2xl shadow-md inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Volume2 className="w-4 h-4 shrink-0" />
              <span>터치해서 올이 음성 주문 시작하기 (&quot;어떤 음식을 찾아드릴까요?&quot;)</span>
            </button>
          </div>
        )}

        {isSpeaking && (
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#EAF1E2] border border-[#82B440] text-[#3D5720] text-xs font-bold rounded-2xl">
            <span className="inline-flex items-center gap-2">
              <Volume2 className="w-4 h-4 animate-pulse shrink-0" />
              <span>올이가 말씀드리고 있어요 · 지금 바로 말씀하셔도 듣고 있어요</span>
            </span>
            <button
              type="button"
              onClick={handleInterruptToListen}
              className="px-2.5 py-1 rounded-lg bg-white border border-[#D4E1C5] text-[#1A1D1A] text-[11px] font-bold hover:bg-[#F7F8F5] cursor-pointer shrink-0"
            >
              말 끊고 내가 말하기
            </button>
          </div>
        )}

        {isListening && (
          <div className="flex justify-end">
            <div className="max-w-[85%] px-4 py-2.5 bg-red-50 border border-red-200 text-red-800 text-xs font-bold rounded-2xl space-y-1">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 animate-pulse shrink-0" />
                <span>상시 듣기 ON · 말씀해 주세요</span>
              </div>
              {interimTranscript && (
                <p className="text-[11px] font-medium text-red-900">
                  “{interimTranscript}”
                </p>
              )}
            </div>
          </div>
        )}

        {showVoiceTips && (
          <div className="bg-white border border-[#D4E1C5] rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#1A1D1A]">
              <span>음성 입력 예시 문장을 눌러 바로 상담해보세요</span>
              <button
                type="button"
                onClick={() => setShowVoiceTips(false)}
                className="text-[#687064] cursor-pointer"
              >
                닫기
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {VOICE_TRANSCRIPT_SAMPLES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setShowVoiceTips(false);
                    runChatQuery(s.text);
                  }}
                  className="px-3 py-1.5 bg-[#F7F8F5] hover:bg-[#EAF1E2] border border-[#E8ECE4] rounded-xl text-xs font-semibold text-[#1A1D1A] cursor-pointer"
                >
                  “{s.text}”
                </button>
              ))}
            </div>
          </div>
        )}

        {isAnalyzing && (
          <div className="flex items-start gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white border border-[#E8ECE4] shadow-2xs flex items-center justify-center shrink-0 overflow-hidden">
              <AlleBotIllustration size="sm" />
            </div>
            <div className="bg-white border border-[#D4E1C5] rounded-2xl rounded-tl-xs px-4 py-3 text-xs font-semibold text-[#3D5720] shadow-sm inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#4E6E2A] animate-pulse" />
              <span>alle 분석이 컨디션과 조건에 맞는 매장을 찾고 있어요...</span>
            </div>
          </div>
        )}

        <div ref={bottomAnchorRef} />
      </div>

      {/* Ambient Zero-UI Intent Recognition & Input Dock */}
      <div className="bg-white border-t border-[#E8ECE4] px-4 sm:px-6 pt-3.5 pb-4 space-y-3">
        {/* Live AI Waveform + Translucent Pill Intent Chips */}
        <div aria-live="polite" className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="inline-flex items-center gap-2 font-semibold text-[#4E6E2A]">
              {/* Soft Animated 5-Bar AI Understanding Waveform */}
              <span className="inline-flex items-center gap-[2.5px] h-3.5" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((bar) => (
                  <motion.span
                    key={bar}
                    className={`w-[2.5px] rounded-full ${
                      isListening ? 'bg-red-500' : 'bg-[#4E6E2A]'
                    }`}
                    animate={
                      isAiActive
                        ? {
                            height: [
                              '4px',
                              `${9 + ((bar * 3) % 7)}px`,
                              '5px',
                              `${12 - (bar % 4)}px`,
                              '4px',
                            ],
                            opacity: [0.55, 1, 0.7, 1, 0.55],
                          }
                        : {
                            height: ['4px', '7px', '4px'],
                            opacity: [0.35, 0.7, 0.35],
                          }
                    }
                    transition={{
                      duration: isAiActive ? 0.9 + bar * 0.12 : 2.2 + bar * 0.2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </span>
              <span>
                {isListening
                  ? '음성 의도를 실시간으로 이해하고 있어요...'
                  : input.trim().length > 0
                    ? '입력 문장에서 조건을 실시간 추출 중'
                    : '실시간 추출 의도'}
              </span>
            </div>
            <span className="font-mono tabular-nums text-[#687064]">
              {liveIntentChips.length}개 인식
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 min-h-[30px]">
            <AnimatePresence mode="popLayout">
              {liveIntentChips.map((chip) => (
                <motion.span
                  key={chip.id}
                  layout
                  initial={{ opacity: 0, scale: 0.86, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.86, y: -4 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold tracking-tight whitespace-nowrap tabular-nums backdrop-blur-xs border ${
                    chip.tone === 'primary'
                      ? 'bg-[#4E6E2A]/12 text-[#3D5720] border-[#4E6E2A]/25'
                      : chip.tone === 'accent'
                        ? 'bg-[#EAF1E2]/90 text-[#4E6E2A] border-[#D4E1C5]/80'
                        : 'bg-[#F0F3EC] text-[#687064] border-[#E8ECE4]'
                  }`}
                >
                  {chip.label}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Soft Glowing Input Bar */}
        <motion.form
          onSubmit={(e) => {
            e.preventDefault();
            runChatQuery(input);
          }}
          animate={
            isListening
              ? {
                  boxShadow: [
                    '0 0 0 2px rgba(239,68,68,0.22), 0 8px 24px -6px rgba(239,68,68,0.28)',
                    '0 0 0 5px rgba(239,68,68,0.14), 0 10px 30px -4px rgba(239,68,68,0.34)',
                    '0 0 0 2px rgba(239,68,68,0.22), 0 8px 24px -6px rgba(239,68,68,0.28)',
                  ],
                }
              : isAiActive
                ? {
                    boxShadow: [
                      '0 0 0 2px rgba(78,110,42,0.16), 0 8px 24px -6px rgba(78,110,42,0.20)',
                      '0 0 0 4px rgba(130,180,64,0.14), 0 10px 28px -4px rgba(78,110,42,0.28)',
                      '0 0 0 2px rgba(78,110,42,0.16), 0 8px 24px -6px rgba(78,110,42,0.20)',
                    ],
                  }
                : {
                    boxShadow: '0 2px 10px rgba(26,29,26,0.04)',
                  }
          }
          transition={{ duration: 1.8, repeat: isAiActive ? Infinity : 0, ease: 'easeInOut' }}
          className={`min-w-0 w-full p-1.5 rounded-2xl bg-[#F7F8F5] border transition-colors flex items-center gap-1.5 sm:gap-2 ${
            isListening
              ? 'border-red-300'
              : isAiActive
                ? 'border-[#82B440]'
                : 'border-[#E8ECE4]'
          }`}
        >
          <button
            type="button"
            onClick={handleMicToggle}
            aria-label={isListening ? '음성 중지' : '음성으로 말하기'}
            className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
              isListening
                ? 'bg-red-600 text-white'
                : 'bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#4E6E2A]'
            }`}
          >
            {isListening ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>

          <input
            type="text"
            value={input}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            onChange={(e) => setInput(e.target.value)}
            placeholder="원하는 맛, 인원, 시간을 말씀해 주세요"
            className="flex-1 min-w-0 w-full min-h-[44px] px-2 bg-transparent text-sm text-[#1A1D1A] placeholder:text-[#687064] focus:outline-none"
          />

          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="전송"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#E8ECE4] disabled:text-[#919A8D] text-white flex items-center justify-center shrink-0 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </motion.form>
      </div>
        </>
      )}

      {/* AI Recommended Menu Spotlight Popup (shows menu while AI explains it) */}
      <AnimatePresence>
        {recommendedSpotlight &&
          (() => {
            const spotMenuId =
              recommendedSpotlight.menuIds[recommendedSpotlight.activeIndex];
            const spotMenu = spotMenuId ? menuMap.get(spotMenuId) : undefined;
            const spotStore = spotMenu
              ? storeMap.get(spotMenu.storeId)
              : undefined;
            if (!spotMenu || !spotStore) return null;

            const spotServings = Math.min(
              Math.max(1, recommendedSpotlight.servings),
              Math.max(1, spotMenu.stock)
            );
            const effectivePrice = getEffectiveMenuPrice(spotMenu);
            const totalWithFee =
              effectivePrice * spotServings + spotStore.deliveryFee;
            const effectiveMin =
              spotMenu.estimatedMinutes + (spotStore.extraPrepMinutes ?? 0);
            const isSameStore = spotMenu.storePrice === spotMenu.pricePerPerson;
            const hasClosingDiscount =
              (spotMenu.closingDiscountPercent ?? 0) > 0;
            const wished = wishlistIds.includes(spotMenu.id);
            const spotReviews = reviews.filter((r) => r.menuId === spotMenu.id);
            const reviewSummary = buildRuleReviewSummary(spotReviews);

            return (
              <motion.div
                key="ai-recommended-spotlight"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setRecommendedSpotlight(null)}
                role="dialog"
                aria-modal="true"
                aria-label={`${spotMenu.name} 올이 추천 설명`}
                className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
              >
                <motion.div
                  initial={{ y: 28, opacity: 0, scale: 0.97 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: 20, opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full sm:max-w-lg max-h-[88vh] bg-white rounded-t-3xl sm:rounded-3xl border border-[#DCE7CF] shadow-2xl overflow-hidden flex flex-col"
                >
                  {/* Top Visual Image */}
                  <div className="relative h-44 sm:h-48 w-full shrink-0 overflow-hidden bg-[#F7F8F5]">
                    <FoodImage
                      src={spotMenu.image}
                      alt={spotMenu.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/25" />

                    {/* Top Badges */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2.5 py-1 rounded-full bg-[#3D5720] text-white text-xs font-bold inline-flex items-center gap-1 shadow-sm">
                          <Sparkles className="w-3.5 h-3.5" />
                          올이 추천 {recommendedSpotlight.activeIndex + 1}순위
                        </span>
                        {isSpeaking && (
                          <span className="px-2.5 py-1 rounded-full bg-white/95 text-[#3D5720] text-xs font-bold inline-flex items-center gap-1 shadow-sm animate-pulse">
                            <AudioLines className="w-3.5 h-3.5 text-[#82B440]" />
                            올이 설명 중
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onToggleWishlist(spotMenu.id)}
                          aria-label={`${spotMenu.name} 찜하기`}
                          className="w-9 h-9 rounded-full bg-white/90 hover:bg-white text-[#1A1D1A] flex items-center justify-center shadow-sm cursor-pointer"
                        >
                          <Heart
                            className={`w-4 h-4 ${
                              wished
                                ? 'fill-red-500 text-red-500'
                                : 'text-[#687064]'
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecommendedSpotlight(null)}
                          aria-label="추천 메뉴 팝업 닫기"
                          className="w-9 h-9 rounded-full bg-white/90 hover:bg-white text-[#1A1D1A] flex items-center justify-center shadow-sm cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Bottom-Right Price/Discount Pills Only (keeps photo uncluttered) */}
                    {(isSameStore || hasClosingDiscount) && (
                      <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                        {isSameStore && (
                          <span className="px-2.5 py-0.5 rounded-md bg-white/95 text-[#3D5720] text-[11px] font-bold shadow-sm">
                            매장 동일가 ✓
                          </span>
                        )}
                        {hasClosingDiscount && (
                          <span className="px-2.5 py-0.5 rounded-md bg-amber-600 text-white text-[11px] font-bold shadow-sm">
                            마감 -{spotMenu.closingDiscountPercent}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Scrollable Body */}
                  <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
                    {/* Clear Store & Menu Title Below Image */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#687064] font-medium">
                        <span className="truncate font-semibold text-[#4E6E2A]">
                          {spotStore.name}
                        </span>
                        <span className="inline-flex items-center gap-1 font-bold text-[#1A1D1A] shrink-0">
                          <Star className="w-3.5 h-3.5 fill-[#82B440] text-[#82B440]" />
                          {(spotStore.rating ?? 4.9).toFixed(1)}
                        </span>
                      </div>
                      <h2 className="text-lg sm:text-xl font-extrabold text-[#1A1D1A] leading-snug">
                        {spotMenu.name}
                      </h2>
                    </div>

                    {/* Price & Delivery Conditions Card */}
                    <div className="p-3.5 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs text-[#687064]">
                            1인분 {formatWon(effectivePrice)} · 배달비{' '}
                            {spotStore.deliveryFee === 0
                              ? '무료'
                              : formatWon(spotStore.deliveryFee)}
                          </div>
                          <div className="text-base font-extrabold text-[#3D5720] tabular-nums mt-0.5">
                            {spotServings}인분 합계 {formatWon(totalWithFee)}
                          </div>
                        </div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#DCE7CF] text-xs font-bold text-[#1A1D1A] tabular-nums">
                          <Clock className="w-3.5 h-3.5 text-[#4E6E2A]" />
                          약 {effectiveMin}분 도착
                        </div>
                      </div>
                      {spotMenu.aiReason && (
                        <p className="text-xs text-[#3D5720] font-semibold pt-1.5 border-t border-[#E8ECE4]">
                          ✓ {spotMenu.aiReason}
                        </p>
                      )}
                      {(spotMenu.description || spotMenu.tags.length > 0) && (
                        <div className="space-y-1.5 pt-1">
                          {spotMenu.description && (
                            <p className="text-xs text-[#4A5048] leading-relaxed">
                              {spotMenu.description}
                            </p>
                          )}
                          {spotMenu.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {spotMenu.tags.slice(0, 5).map((tag) => (
                                <span
                                  key={tag}
                                  className="px-2 py-0.5 rounded-full bg-white border border-[#E8ECE4] text-[11px] font-medium text-[#687064]"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Real Customer Reviews (Prominent & Readable) */}
                    <div className="p-3.5 rounded-2xl bg-[#FAFCF8] border border-[#DCE7CF] space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold text-[#1A1D1A] inline-flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-[#4E6E2A]" />
                          실제 고객 리뷰 ({spotReviews.length}건)
                        </span>
                        {spotReviews.length > 0 && (
                          <span className="font-bold text-[#3D5720]">
                            ★{' '}
                            {(
                              spotReviews.reduce((sum, r) => sum + r.rating, 0) /
                              spotReviews.length
                            ).toFixed(1)}
                          </span>
                        )}
                      </div>
                      {spotReviews.length === 0 ? (
                        <p className="text-xs text-[#687064]">
                          아직 등록된 상세 리뷰가 없습니다.
                        </p>
                      ) : (
                        <>
                          <p className="text-xs text-[#4E6E2A] font-semibold">
                            {reviewSummary.headline}
                          </p>
                          <div className="space-y-2">
                            {spotReviews.slice(0, 3).map((rev) => (
                              <div
                                key={rev.id}
                                className="p-2.5 rounded-xl bg-white border border-[#E8ECE4] space-y-1 text-xs"
                              >
                                <div className="flex items-center justify-between text-[#687064]">
                                  <span className="font-bold text-[#1A1D1A]">
                                    {rev.author}
                                  </span>
                                  <span className="font-mono font-semibold text-[#4E6E2A]">
                                    ★ {rev.rating.toFixed(1)} · {rev.date}
                                  </span>
                                </div>
                                <p className="text-[#1A1D1A] leading-relaxed">
                                  {rev.content}
                                </p>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Switch Between Top Recommendations */}
                    {recommendedSpotlight.menuIds.length > 1 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-bold text-[#687064]">
                          <span>다른 추천 메뉴도 바로 비교해 보세요</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                switchSpotlightIndex(
                                  recommendedSpotlight.activeIndex - 1
                                )
                              }
                              aria-label="이전 추천 메뉴"
                              className="w-7 h-7 rounded-lg border border-[#E8ECE4] bg-white hover:bg-[#F7F8F5] flex items-center justify-center cursor-pointer"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                switchSpotlightIndex(
                                  recommendedSpotlight.activeIndex + 1
                                )
                              }
                              aria-label="다음 추천 메뉴"
                              className="w-7 h-7 rounded-lg border border-[#E8ECE4] bg-white hover:bg-[#F7F8F5] flex items-center justify-center cursor-pointer"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                          {recommendedSpotlight.menuIds.map((mId, idx) => {
                            const m = menuMap.get(mId);
                            if (!m) return null;
                            const isActive =
                              idx === recommendedSpotlight.activeIndex;
                            return (
                              <button
                                key={mId}
                                type="button"
                                onClick={() => switchSpotlightIndex(idx)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-colors ${
                                  isActive
                                    ? 'bg-[#3D5720] text-white'
                                    : 'bg-[#F7F8F5] text-[#4A5048] hover:bg-[#EAF1E2]'
                                }`}
                              >
                                {idx + 1}순위 · {m.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sticky Bottom Actions + Always-Visible Mic Status */}
                  <div className="p-4 bg-[#FAFCF8] border-t border-[#E8ECE4] space-y-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleMicToggle}
                      className={`w-full px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors border ${
                        isListening
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : 'bg-[#F0F3EC] border-[#E8ECE4] text-[#687064] hover:bg-[#EAF1E2]'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5 truncate">
                        {isListening ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                            <Mic className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              {interimTranscript
                                ? `마이크 켜짐 · “${interimTranscript}”`
                                : '마이크 켜짐 · “이거로 주문해”, “다음 메뉴”, “닫아”'}
                            </span>
                          </>
                        ) : (
                          <>
                            <MicOff className="w-3.5 h-3.5 shrink-0" />
                            <span>마이크 꺼짐 · 눌러서 켜기</span>
                          </>
                        )}
                      </span>
                      <span className="shrink-0 text-[10px] underline">
                        {isListening ? '끄기' : '켜기'}
                      </span>
                    </button>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (onAddToCart) {
                            onAddToCart(spotMenu.id, spotServings, []);
                          } else {
                            handleStageMenuInChat(spotMenu, spotServings);
                          }
                          setRecommendedSpotlight(null);
                        }}
                        className="min-h-[44px] px-3 py-2.5 rounded-xl border border-[#DCE7CF] bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <ShoppingBag className="w-4 h-4" />
                        장바구니 담기
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRecommendedSpotlight(null);
                          openCheckoutDraftMessage({
                            menuId: spotMenu.id,
                            servings: spotServings,
                            selectedOptionIds: stagedOptions[spotMenu.id] ?? [],
                            paymentMethod: 'kakaopay',
                            customerNote: defaultNote ?? '',
                          });
                        }}
                        className="min-h-[44px] px-3 py-2.5 rounded-xl bg-[#3D5720] hover:bg-[#2F4418] text-white text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Zap className="w-4 h-4" />
                        이 메뉴 바로 주문
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
      </AnimatePresence>
    </div>
  );
}
