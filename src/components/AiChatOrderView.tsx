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
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Store as StoreIcon,
  Ticket,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { MOCK_COUPONS, VOICE_TRANSCRIPT_SAMPLES } from '../data/seedData';
import {
  CartLineItem,
  DeliveryMethod,
  MenuItem,
  OrderLineItem,
  ParsedCondition,
  PaymentMethod,
  Review,
  SavedLocation,
  Store,
  StoreCoupon,
  StorePromotion,
} from '../types/alle';
import { PlatformCategoryId } from '../utils/categories';
import {
  buildRuleReviewSummary,
  checkServerGeminiAvailable,
  hasGeminiApiKey,
  parseConditionWithAI,
  understandChatTurnWithAI,
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
  calculateStoreDeliveryFee,
  DELIVERY_METHOD_OPTIONS,
  estimateCompetitorSavings,
  getAvailableCouponsForStore,
  getBestCoupon,
  getDeliveryMethodMeta,
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

interface VoiceCheckoutDraft {
  menuId: string;
  servings: number;
  selectedOptionIds: string[];
  extraItems?: CartLineItem[];
  deliveryMethod?: DeliveryMethod;
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
    target?: 'b2b' | 'errand';
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
  hasOverlayOpen?: boolean;
  storePromotions?: StorePromotion[];
  storeCoupons?: StoreCoupon[];
  onToggleWishlist: (menuId: string) => void;
  onBackToHome: () => void;
  onOpenB2BMeal?: () => void;
  onOpenErrand?: () => void;
  onUseRelayCoupon?: (menuId: string) => void;
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
  onOpenBrowse?: (options?: {
    category?: PlatformCategoryId;
    query?: string;
  }) => void;
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
    deliveryMethod?: DeliveryMethod;
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
  if (/(baro\s*페이|바로\s*페이|alle\s*페이|알레\s*페이|올레\s*페이|페이\s*잔액|지갑\s*잔액|예치금)/.test(t)) {
    return 'alle_pay';
  }
  if (/(지역\s*화폐|사랑\s*상품권|동백전|대구로페이|이음|상생카드)/.test(t)) {
    return 'local_currency';
  }
  if (/(기업\s*식대|복지\s*식대|식대\s*포인트|식대|법인)/.test(t)) {
    return 'b2b_meal_point';
  }
  if (/(오픈\s*뱅킹|계좌\s*이체|계좌\s*결제|무통장)/.test(t)) {
    return 'openbanking';
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
      id: 'openbanking',
      shortLabel: '오픈뱅킹',
      label: '오픈뱅킹 1초 계좌이체',
    },
    {
      id: 'alle_pay',
      shortLabel: `Baro페이 (${formatWon(walletBalance)})`,
      label: 'Baro페이 잔액',
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
    label: '🍲 따뜻한 국밥 추천',
    prompt: '따뜻한 국밥 추천해줘',
  },
  {
    label: '🍗 바삭한 치킨',
    prompt: '치킨 시켜줘',
  },
  {
    label: '🎉 이벤트·할인 맛집',
    prompt: '오늘 이벤트나 할인되는 메뉴 뭐 있어?',
  },
  {
    label: '☕ 커피·디저트 1개',
    prompt: '달달한 커피랑 케이크 찾아줘',
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
  hasOverlayOpen = false,
  storePromotions = [],
  storeCoupons = [],
  onToggleWishlist,
  onBackToHome,
  onOpenB2BMeal,
  onOpenErrand,
  onUseRelayCoupon,
  onAddToCart,
  onAddMultipleToCart,
  onOpenStoreMenu,
  onProceedToConfirmWithItems,
  onOpenBrowse,
  onOpenRecommendationWithCondition,
  onProceedToConfirm,
  onCompleteVoiceOrder,
}: AiChatOrderViewProps) {
  const [input, setInput] = useState('');
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
  const [extraItemsByStore, setExtraItemsByStore] = useState<
    Record<string, CartLineItem[]>
  >({});
  const [showCheckoutExtraMenus, setShowCheckoutExtraMenus] = useState(false);
  const [recommendedSpotlight, setRecommendedSpotlight] =
    useState<RecommendedSpotlightState | null>(null);
  const spotlightPillRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stopVoiceRef = useRef<(() => void) | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const latestTurnStartRef = useRef<HTMLDivElement | null>(null);
  const lastSpokenMsgIdRef = useRef<string | null>(null);
  const lastSpotlightMsgIdRef = useRef<string | null>(null);
  const didInitialGreetRef = useRef(false);
  const keepSpeechOnUnmountRef = useRef(false);
  const autoListenTimerRef = useRef<number | null>(null);
  const restartListenTimerRef = useRef<number | null>(null);
  const voiceReplyEnabledRef = useRef(voiceReplyEnabled);
  const isListeningRef = useRef(isListening);
  const isSpeakingRef = useRef(isSpeaking);
  const isNearSpeechEndRef = useRef(false);
  const pendingVoiceQueryRef = useRef<string | null>(null);
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

  const adjustStoreExtraItem = (
    storeId: string,
    menu: MenuItem,
    delta: number
  ) => {
    setExtraItemsByStore((prev) => {
      const list = prev[storeId] ?? [];
      const idx = list.findIndex((it) => it.menuId === menu.id);
      if (idx === -1) {
        if (delta <= 0 || menu.isSoldOut || menu.stock < 1) return prev;
        return {
          ...prev,
          [storeId]: [
            ...list,
            {
              menuId: menu.id,
              quantity: Math.min(delta, menu.stock),
              selectedOptionIds: [],
            },
          ],
        };
      }
      const nextQty = list[idx].quantity + delta;
      const updatedList =
        nextQty <= 0
          ? list.filter((_, i) => i !== idx)
          : list.map((it, i) =>
              i === idx
                ? { ...it, quantity: Math.min(menu.stock, nextQty) }
                : it
            );
      return {
        ...prev,
        [storeId]: updatedList,
      };
    });
  };
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
    if (voiceCheckoutCompletedRef.current || voiceDeniedRef.current) {
      return;
    }
    if (!getSpeechRecognitionConstructor()) {
      setShowVoiceTips(true);
      return;
    }
    if (isSpeakingRef.current || isListeningRef.current) {
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
        if (!isSpeakingRef.current || isNearSpeechEndRef.current) {
          setInterimTranscript(cleaned);
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

        // Do NOT cut off AI speech mid-sentence unless user explicitly presses a button.
        // If spoken right near the end of AI speech, queue it to execute right when AI finishes.
        if (isSpeakingRef.current) {
          if (isNearSpeechEndRef.current) {
            pendingVoiceQueryRef.current = cleaned;
          }
          return;
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
          !isSpeakingRef.current &&
          shouldContinueListeningRef.current &&
          voiceReplyEnabledRef.current &&
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
    if (!voiceReplyEnabledRef.current) return;
    currentSpokenTextRef.current = spokenMessage;
    shouldContinueListeningRef.current = false;
    consecutiveEmptyListenRef.current = 0;
    isNearSpeechEndRef.current = false;
    pendingVoiceQueryRef.current = null;

    // Turn OFF mic while AI speaks; auto-turns ON when AI finishes (or via "말 끊고 내가 말하기")
    stopVoiceRef.current?.();
    setIsListening(false);
    isListeningRef.current = false;
    setInterimTranscript('');

    speakKoreanText(spokenMessage, {
      onStart: () => {
        setIsSpeaking(true);
        isSpeakingRef.current = true;
        isNearSpeechEndRef.current = false;
        setVoiceAutoplayBlocked(false);
      },
      onNearEnd: () => {
        isNearSpeechEndRef.current = true;
      },
      onEnd: () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        isNearSpeechEndRef.current = false;
        lastBotSpeechEndedAtRef.current = Date.now();
        shouldContinueListeningRef.current = allowAutoListen;
        const queuedCommand = pendingVoiceQueryRef.current;
        pendingVoiceQueryRef.current = null;
        if (queuedCommand) {
          void runChatQueryRef.current(queuedCommand);
          return;
        }
        if (
          allowAutoListen &&
          voiceReplyEnabledRef.current &&
          !voiceCheckoutCompletedRef.current &&
          !voiceDeniedRef.current &&
          !isListeningRef.current &&
          getSpeechRecognitionConstructor()
        ) {
          autoListenTimerRef.current = window.setTimeout(() => {
            startListeningRef.current();
          }, 300);
        }
      },
      onError: () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        setVoiceAutoplayBlocked(true);
      },
    });
  };

  const lastUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].sender === 'user') return messages[i].id;
    }
    return null;
  }, [messages]);

  const latestBotMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].sender === 'bot') return messages[i];
    }
    return null;
  }, [messages]);

  const latestBotMessageId = latestBotMessage?.id ?? null;
  const latestBotHasMatchedMenus = Boolean(
    latestBotMessage?.matchedMenuIds &&
      latestBotMessage.matchedMenuIds.length > 0
  );

  useEffect(() => {
    if (voiceCheckoutDraft || (isListening && !latestBotHasMatchedMenus)) {
      bottomAnchorRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
      return;
    }
    if (lastUserMessageId && latestTurnStartRef.current) {
      latestTurnStartRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [
    messages.length,
    lastUserMessageId,
    isListening,
    voiceCheckoutDraft,
    latestBotHasMatchedMenus,
  ]);

  const selectRecommendedMenuForMessage = (
    msgId: string,
    item: MenuItem,
    servings: number
  ) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, stagedMenuId: item.id } : m))
    );
    setStagedServings((prev) =>
      prev[item.id] ? prev : { ...prev, [item.id]: Math.max(1, servings) }
    );
  };

  useEffect(() => {
    if (voiceCheckoutDraft) {
      setRecommendedSpotlight(null);
    }
  }, [voiceCheckoutDraft]);

  useEffect(() => {
    if (!recommendedSpotlight) return;
    const activePill =
      spotlightPillRefs.current[recommendedSpotlight.activeIndex];
    if (activePill) {
      activePill.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [recommendedSpotlight?.activeIndex, recommendedSpotlight?.msgId]);

  useEffect(() => {
    if (!recommendedSpotlight || typeof document === 'undefined') return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
    };
  }, [recommendedSpotlight]);

  useEffect(() => {
    if (!voiceReplyEnabled || messages.length === 0) {
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
  }, [messages, voiceReplyEnabled]);

  useEffect(() => {
    if (!didInitialGreetRef.current && voiceReplyEnabledRef.current) {
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
    const primaryOptionsSubtotal =
      selectedOpts.reduce((sum, o) => sum + o.priceDelta, 0) * qty;
    const primaryMenuSubtotal = unitPrice * qty;

    const resolvedLines: OrderLineItem[] = [
      {
        menuId: menu.id,
        menuName: menu.name,
        unitPrice,
        originalUnitPrice: menu.pricePerPerson,
        quantity: qty,
        selectedOptionIds: selectedOpts.map((o) => o.id),
        selectedOptionNames: selectedOpts.map((o) => o.name),
        optionsSubtotal: primaryOptionsSubtotal,
        lineSubtotal: primaryMenuSubtotal,
      },
    ];

    let extraMenuSubtotal = 0;
    let extraOriginalSubtotal = 0;
    let extraOptionsSubtotal = 0;
    let totalQty = qty;
    let allSameStore = menu.storePrice === menu.pricePerPerson;

    for (const extra of draft.extraItems ?? []) {
      const extraMenu = menuMap.get(extra.menuId);
      if (!extraMenu || extraMenu.storeId !== store.id || extra.quantity <= 0) {
        continue;
      }
      const extraQty = Math.min(extra.quantity, Math.max(1, extraMenu.stock));
      const extraUnit = getEffectiveMenuPrice(extraMenu);
      const extraOpts = extraMenu.options.filter((o) =>
        extra.selectedOptionIds.includes(o.id)
      );
      const extraOptSum =
        extraOpts.reduce((sum, o) => sum + o.priceDelta, 0) * extraQty;
      const lineSub = extraUnit * extraQty;

      extraMenuSubtotal += lineSub;
      extraOriginalSubtotal += extraMenu.pricePerPerson * extraQty;
      extraOptionsSubtotal += extraOptSum;
      totalQty += extraQty;
      if (extraMenu.storePrice !== extraMenu.pricePerPerson) {
        allSameStore = false;
      }

      resolvedLines.push({
        menuId: extraMenu.id,
        menuName: extraMenu.name,
        unitPrice: extraUnit,
        originalUnitPrice: extraMenu.pricePerPerson,
        quantity: extraQty,
        selectedOptionIds: extraOpts.map((o) => o.id),
        selectedOptionNames: extraOpts.map((o) => o.name),
        optionsSubtotal: extraOptSum,
        lineSubtotal: lineSub,
      });
    }

    const menuSubtotal = primaryMenuSubtotal + extraMenuSubtotal;
    const optionsSubtotal = primaryOptionsSubtotal + extraOptionsSubtotal;
    const originalMenuSubtotal =
      menu.pricePerPerson * qty + extraOriginalSubtotal;
    const deliveryMethod: DeliveryMethod =
      draft.deliveryMethod ?? 'partner_direct';
    const deliveryFeeCalc = calculateStoreDeliveryFee(
      store,
      menuSubtotal,
      deliveryMethod
    );
    const deliveryFee = deliveryFeeCalc.finalDeliveryFee;
    const preCouponTotal = menuSubtotal + optionsSubtotal + deliveryFee;
    const storeCouponPool = getAvailableCouponsForStore(
      MOCK_COUPONS,
      storeCoupons,
      store.id,
      menuSubtotal
    );
    const bestCoupon = getBestCoupon(storeCouponPool, {
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
      originalDeliveryFee: deliveryFeeCalc.baseFee,
      couponDiscount,
      isSameStorePrice: allSameStore,
    });
    const effectiveMinutes = Math.max(
      10,
      menu.estimatedMinutes +
        (store.extraPrepMinutes ?? 0) +
        deliveryFeeCalc.etaDeltaMinutes
    );
    const paymentOption =
      paymentOptions.find((p) => p.id === draft.paymentMethod) ??
      paymentOptions[0];

    return {
      menu,
      store,
      qty,
      totalQty,
      resolvedLines,
      selectedOpts,
      unitPrice,
      menuSubtotal,
      optionsSubtotal,
      deliveryMethod,
      deliveryFee,
      deliveryFeeCalc,
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
    const feeText =
      summary.deliveryFee === 0
        ? '배달비 무료'
        : `배달비 ${formatWon(summary.deliveryFee)}`;
    const discountText =
      summary.couponDiscount > 0 && summary.bestCoupon
        ? ` · ${summary.bestCoupon.label} -${formatWon(summary.couponDiscount)}`
        : '';
    const notePart = draft.customerNote.trim()
      ? ` · 요청 "${draft.customerNote.trim()}"`
      : '';

    const availableOpts = summary.menu.options ?? [];
    const selectedOpts = summary.selectedOpts ?? [];
    let optionQuestionText = '';
    let optionQuestionSpoken = '';

    if (availableOpts.length > 0 && selectedOpts.length === 0) {
      const previewOpts = availableOpts
        .slice(0, 3)
        .map((o) => `${o.name}(+${formatWon(o.priceDelta)})`)
        .join(', ');
      optionQuestionText = `추가 옵션(${previewOpts})을 넣으실래요, 아니면 그대로 ${summary.paymentOption.label}로 결제할까요?`;
      optionQuestionSpoken = `추가 옵션으로 ${availableOpts
        .slice(0, 3)
        .map((o) => `${o.name} ${formatWon(o.priceDelta)}`)
        .join(', ')} 선택할 수 있어요. 추가할 옵션이 있나요, 아니면 그대로 ${summary.paymentOption.label}로 결제할까요?`;
    } else if (selectedOpts.length > 0) {
      const selectedNames = selectedOpts.map((o) => o.name).join(', ');
      optionQuestionText = `선택 옵션(${selectedNames}) 반영 완료. 더 바꾸실 옵션이 있나요, 바로 ${summary.paymentOption.label}로 결제할까요?`;
      optionQuestionSpoken = `${selectedNames} 옵션 포함입니다. 더 바꾸실 옵션이 있나요, 바로 ${summary.paymentOption.label}로 결제할까요?`;
    } else {
      optionQuestionText = `추가 옵션은 없고, 바로 ${summary.paymentOption.label}로 결제할까요?`;
      optionQuestionSpoken = `추가 옵션은 없고, 바로 ${summary.paymentOption.label}로 결제할까요?`;
    }

    const priceHeadline = `${
      summary.resolvedLines.length > 1
        ? `${summary.resolvedLines.length}종 ${summary.totalQty}개`
        : `${summary.qty}인분`
    } 핵심 가격: 총 ${formatWon(summary.finalTotal)} (메뉴 ${formatWon(summary.menuSubtotal)} · ${feeText}${discountText}${notePart})`;
    const spoken = `${leadPrefix ? `${leadPrefix} ` : ''}${
      summary.resolvedLines.length > 1
        ? `${summary.resolvedLines.length}종 총 ${formatWon(summary.finalTotal)}`
        : `${summary.qty}인분 총 ${formatWon(summary.finalTotal)}`
    }입니다. ${optionQuestionSpoken}`;

    setMessages((prev) => [
      ...prev,
      {
        id: `b-checkout-${Date.now() + 1}`,
        sender: 'bot',
        text: `${leadPrefix ? `${leadPrefix} ` : ''}${priceHeadline}. ${optionQuestionText}`,
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

    const qtyByMenuId = new Map<string, number>();
    for (const line of summary.resolvedLines) {
      qtyByMenuId.set(
        line.menuId,
        (qtyByMenuId.get(line.menuId) ?? 0) + line.quantity
      );
    }

    const hasStockProblem = Array.from(qtyByMenuId.entries()).some(
      ([mId, needed]) => {
        const m = menuMap.get(mId);
        return !m || m.isSoldOut || m.stock < needed;
      }
    );

    if (!summary.store.isOpen || hasStockProblem) {
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
      const shortText = `Baro페이 잔액(${formatWon(walletBalance)})이 결제 금액(${formatWon(summary.finalTotal)})보다 부족합니다. 카카오페이나 토스페이 등 다른 결제 수단을 말씀하거나 눌러 주세요.`;
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
      if (summary.resolvedLines.length > 1 && onProceedToConfirmWithItems) {
        onProceedToConfirmWithItems({
          storeId: summary.store.id,
          items: summary.resolvedLines.map((l) => ({
            menuId: l.menuId,
            quantity: l.quantity,
            selectedOptionIds: l.selectedOptionIds,
          })),
          couponCode: summary.bestCoupon?.code ?? 'NONE',
        });
      } else {
        onProceedToConfirm({
          menuId: summary.menu.id,
          servings: summary.qty,
          selectedOptionIds: summary.selectedOpts.map((o) => o.id),
          couponCode: summary.bestCoupon?.code ?? 'NONE',
        });
      }
      return;
    }

    keepSpeechOnUnmountRef.current = true;
    clearAutoListenTimer();
    stopVoiceRef.current?.();
    setIsListening(false);
    isListeningRef.current = false;

    const result = onCompleteVoiceOrder({
      menuId: summary.menu.id,
      servings: summary.totalQty,
      selectedOptionIds: summary.selectedOpts.map((o) => o.id),
      items: summary.resolvedLines,
      couponCode: summary.bestCoupon?.code ?? 'NONE',
      couponDiscount: summary.couponDiscount,
      deliveryMethod: summary.deliveryMethod,
      sharedDeliveryApplied: summary.deliveryMethod === 'auto_bundle',
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
    const reasonText = menu.aiReason
      ? `${menu.aiReason.replace(/추천/g, '인기')} `
      : '';
    const explanation = `${bounded + 1}순위 ${store.name}의 ${menu.name}입니다. ${reasonText}배달비 포함 ${formatWon(total)}, 약 ${effectiveMin}분 안에 도착해요. 이 메뉴로 주문할까요?`;

    setStagedServings((prev) => ({
      ...prev,
      [menu.id]: Math.min(target.servings, Math.max(1, menu.stock)),
    }));
    setRecommendedSpotlight({
      ...target,
      activeIndex: bounded,
      explanation,
    });
    if (voiceReplyEnabledRef.current) {
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
    const spotlightActiveMenuId = recommendedSpotlight
      ? recommendedSpotlight.menuIds[recommendedSpotlight.activeIndex]
      : undefined;
    const focusedMenuId = spotlightActiveMenuId ?? latestStagedMenuId;
    const activeMenu = focusedMenuId
      ? menuMap.get(focusedMenuId)
      : undefined;
    const activeStore = activeMenu
      ? storeMap.get(activeMenu.storeId)
      : undefined;

    // Gemini-first conversational intent understanding (understands context & replies naturally; falls back to local rules if unavailable)
    if (
      (aiReady || hasGeminiApiKey()) &&
      trimmed.length >= 1 &&
      !/초기화|처음부터|새로\s*시작/.test(trimmed)
    ) {
      const recMenuIds =
        recommendedSpotlight?.menuIds ?? latestMatchedIds ?? [];
      const recommendedList = recMenuIds
        .slice(0, 3)
        .map((id, idx) => {
          const m = menuMap.get(id);
          const st = m ? storeMap.get(m.storeId) : undefined;
          if (!m || !st) return null;
          const qty = stagedServings[m.id] ?? activeCondition.servings ?? 1;
          return {
            index: idx,
            id: m.id,
            name: m.name,
            storeName: st.name,
            totalEstimate: getEffectiveMenuPrice(m) * qty + st.deliveryFee,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      const focusedReviews = activeMenu
        ? reviews.filter((r) => r.menuId === activeMenu.id)
        : [];

      setIsAnalyzing(true);
      const aiTurn = await understandChatTurnWithAI({
        userInput: trimmed,
        recentMessages: messages.slice(-6).map((m) => ({
          sender: m.sender,
          text: m.text,
        })),
        activeAreaName: activeLocation?.areaName,
        inCheckoutConfirm: Boolean(voiceCheckoutDraft),
        activeCondition,
        focusedMenu:
          activeMenu && activeStore
            ? {
                id: activeMenu.id,
                name: activeMenu.name,
                storeName: activeStore.name,
                pricePerPerson: getEffectiveMenuPrice(activeMenu),
                deliveryFee: activeStore.deliveryFee,
                estimatedMinutes:
                  activeMenu.estimatedMinutes +
                  (activeStore.extraPrepMinutes ?? 0),
                servings:
                  voiceCheckoutDraft?.servings ??
                  stagedServings[activeMenu.id] ??
                  activeCondition.servings ??
                  1,
                selectedOptionIds:
                  voiceCheckoutDraft?.selectedOptionIds ??
                  stagedOptions[activeMenu.id] ??
                  [],
                options: activeMenu.options,
                rating: activeStore.rating ?? 4.9,
                reviewSnippet: focusedReviews[0]?.content.slice(0, 50),
              }
            : undefined,
        recommendedList,
      });
      setIsAnalyzing(false);

      if (aiTurn) {
        if (aiTurn.action === 'cancel_checkout') {
          setVoiceCheckoutDraft(null);
          setMessages((prev) => [
            ...prev,
            {
              id: `b-ai-cancel-${Date.now() + 1}`,
              sender: 'bot',
              text: aiTurn.replyText,
              spokenText: aiTurn.replyText,
              aiSource: 'gemini',
            },
          ]);
          return;
        }

        if (aiTurn.action === 'confirm_checkout') {
          if (voiceCheckoutDraft) {
            const updated: VoiceCheckoutDraft = {
              ...voiceCheckoutDraft,
              paymentMethod:
                aiTurn.paymentMethod ?? voiceCheckoutDraft.paymentMethod,
              servings:
                aiTurn.servings && aiTurn.servings > 0
                  ? aiTurn.servings
                  : voiceCheckoutDraft.servings,
              customerNote:
                aiTurn.customerNote ?? voiceCheckoutDraft.customerNote,
            };
            executeVoiceOrder(updated);
            return;
          }
          if (activeMenu && activeStore) {
            const qty = Math.min(
              Math.max(
                1,
                aiTurn.servings ??
                  stagedServings[activeMenu.id] ??
                  activeCondition.servings ??
                  1
              ),
              Math.max(1, activeMenu.stock)
            );
            openCheckoutDraftMessage({
              menuId: activeMenu.id,
              servings: qty,
              selectedOptionIds: stagedOptions[activeMenu.id] ?? [],
              paymentMethod: aiTurn.paymentMethod ?? 'kakaopay',
              customerNote: aiTurn.customerNote ?? defaultNote ?? '',
            });
            return;
          }
        }

        if (aiTurn.action === 'order_current' && activeMenu && activeStore) {
          const qty = Math.min(
            Math.max(
              1,
              aiTurn.servings ??
                stagedServings[activeMenu.id] ??
                activeCondition.servings ??
                1
            ),
            Math.max(1, activeMenu.stock)
          );
          openCheckoutDraftMessage({
            menuId: activeMenu.id,
            servings: qty,
            selectedOptionIds: stagedOptions[activeMenu.id] ?? [],
            paymentMethod: aiTurn.paymentMethod ?? 'kakaopay',
            customerNote: aiTurn.customerNote ?? defaultNote ?? '',
          });
          return;
        }

        if (aiTurn.action === 'toggle_option' && activeMenu && activeStore) {
          const validIds = new Set(activeMenu.options.map((o) => o.id));
          const curOpts =
            voiceCheckoutDraft?.selectedOptionIds ??
            stagedOptions[activeMenu.id] ??
            [];
          const toAdd = (aiTurn.optionIdsToAdd ?? []).filter((id) =>
            validIds.has(id)
          );
          const toRemove = new Set(aiTurn.optionIdsToRemove ?? []);
          const nextOpts = Array.from(
            new Set([...curOpts.filter((id) => !toRemove.has(id)), ...toAdd])
          );
          setStagedOptions((prev) => ({ ...prev, [activeMenu.id]: nextOpts }));
          if (voiceCheckoutDraft) {
            const updated: VoiceCheckoutDraft = {
              ...voiceCheckoutDraft,
              selectedOptionIds: nextOpts,
            };
            openCheckoutDraftMessage(updated, aiTurn.replyText);
            return;
          }
          setMessages((prev) => [
            ...prev,
            {
              id: `b-ai-opt-${Date.now() + 1}`,
              sender: 'bot',
              text: aiTurn.replyText,
              spokenText: aiTurn.replyText,
              stagedMenuId: activeMenu.id,
              aiSource: 'gemini',
            },
          ]);
          return;
        }

        if (aiTurn.action === 'change_quantity' && activeMenu && activeStore) {
          const nextQty = Math.min(
            Math.max(1, aiTurn.servings ?? 1),
            Math.max(1, activeMenu.stock)
          );
          setStagedServings((prev) => ({ ...prev, [activeMenu.id]: nextQty }));
          if (voiceCheckoutDraft) {
            openCheckoutDraftMessage(
              { ...voiceCheckoutDraft, servings: nextQty },
              aiTurn.replyText
            );
            return;
          }
          setMessages((prev) => [
            ...prev,
            {
              id: `b-ai-qty-${Date.now() + 1}`,
              sender: 'bot',
              text: aiTurn.replyText,
              spokenText: aiTurn.replyText,
              stagedMenuId: activeMenu.id,
              aiSource: 'gemini',
            },
          ]);
          return;
        }

        if (
          aiTurn.action === 'pick_recommended' &&
          recommendedList.length > 0
        ) {
          const idx = Math.min(
            Math.max(0, aiTurn.pickedIndex ?? 0),
            recommendedList.length - 1
          );
          const picked = menuMap.get(recommendedList[idx].id);
          if (picked) {
            const qty = Math.min(
              Math.max(
                1,
                aiTurn.servings ??
                  stagedServings[picked.id] ??
                  activeCondition.servings ??
                  1
              ),
              Math.max(1, picked.stock)
            );
            setStagedServings((prev) => ({ ...prev, [picked.id]: qty }));
            openCheckoutDraftMessage({
              menuId: picked.id,
              servings: qty,
              selectedOptionIds: stagedOptions[picked.id] ?? [],
              paymentMethod: aiTurn.paymentMethod ?? 'kakaopay',
              customerNote: aiTurn.customerNote ?? defaultNote ?? '',
            });
            return;
          }
        }

        if (aiTurn.action === 'switch_next') {
          if (recommendedSpotlight && recommendedSpotlight.menuIds.length > 1) {
            switchSpotlightIndex(recommendedSpotlight.activeIndex + 1);
            return;
          }
          const currentRecIdx = latestMatchedIds.findIndex(
            (id) => id === activeMenu?.id
          );
          const nextId =
            latestMatchedIds.length > 1
              ? latestMatchedIds[
                  (currentRecIdx + 1) % latestMatchedIds.length
                ]
              : undefined;
          const nextMenu = nextId ? menuMap.get(nextId) : undefined;
          if (nextMenu) {
            setMessages((prev) => [
              ...prev,
              {
                id: `b-ai-next-${Date.now() + 1}`,
                sender: 'bot',
                text: aiTurn.replyText,
                spokenText: aiTurn.replyText,
                stagedMenuId: nextMenu.id,
                aiSource: 'gemini',
              },
            ]);
            return;
          }
        }

        if (aiTurn.action === 'add_to_cart' && activeMenu) {
          const qty = stagedServings[activeMenu.id] ?? 1;
          const opts = stagedOptions[activeMenu.id] ?? [];
          onAddToCart?.(activeMenu.id, qty, opts);
          setMessages((prev) => [
            ...prev,
            {
              id: `b-ai-cart-${Date.now() + 1}`,
              sender: 'bot',
              text: aiTurn.replyText,
              spokenText: aiTurn.replyText,
              stagedMenuId: activeMenu.id,
              aiSource: 'gemini',
            },
          ]);
          return;
        }

        if (aiTurn.action === 'ask_menu_info' && activeMenu) {
          setMessages((prev) => [
            ...prev,
            {
              id: `b-ai-info-${Date.now() + 1}`,
              sender: 'bot',
              text: aiTurn.replyText,
              spokenText: aiTurn.replyText,
              stagedMenuId: activeMenu.id,
              aiSource: 'gemini',
            },
          ]);
          return;
        }

        if (aiTurn.action === 'chitchat') {
          setMessages((prev) => [
            ...prev,
            {
              id: `b-ai-chat-${Date.now() + 1}`,
              sender: 'bot',
              text: aiTurn.replyText,
              spokenText: aiTurn.replyText,
              aiSource: 'gemini',
            },
          ]);
          return;
        }

        if (aiTurn.action === 'search_food' && aiTurn.searchCondition) {
          setVoiceCheckoutDraft(null);
          const nextCond: ParsedCondition = {
            rawInput: trimmed,
            servings: Math.max(
              1,
              aiTurn.searchCondition.servings ?? activeCondition.servings ?? 1
            ),
            tags: aiTurn.searchCondition.tags ?? [],
            excludeTags: aiTurn.searchCondition.excludeTags ?? [],
            maxBudget:
              aiTurn.searchCondition.maxBudget !== undefined
                ? aiTurn.searchCondition.maxBudget
                : null,
            maxMinutes:
              aiTurn.searchCondition.maxMinutes !== undefined
                ? aiTurn.searchCondition.maxMinutes
                : null,
            unknownTokens: [],
            needsConfirmation: false,
          };
          setActiveCondition(nextCond);
          const evaluated = evaluateRecommendations(
            nextCond,
            stores,
            menus,
            activeLocation
          );
          const topMatches = evaluated.matches.slice(0, 3);
          const topIds = topMatches.map((m) => m.menu.id);
          if (topMatches[0]) {
            setStagedServings((prev) => ({
              ...prev,
              [topMatches[0].menu.id]: Math.min(
                nextCond.servings,
                Math.max(1, topMatches[0].menu.stock)
              ),
            }));
          }
          setMessages((prev) => [
            ...prev,
            {
              id: `b-ai-search-${Date.now() + 1}`,
              sender: 'bot',
              text: aiTurn.replyText,
              spokenText: topMatches[0]
                ? `${aiTurn.replyText} ${topMatches[0].store.name} ${topMatches[0].menu.name}, 배달비 포함 ${formatWon(topMatches[0].estimatedTotal)}입니다. 이 메뉴로 주문할까요?`
                : aiTurn.replyText,
              parsed: nextCond,
              matchedMenuIds: topIds,
              servings: nextCond.servings,
              stagedMenuId: topIds[0],
              aiSource: 'gemini',
            },
          ]);
          return;
        }
      }
    }
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
        const compactDraftInput = trimmed.replace(/\s+/g, '').toLowerCase();
        const matchedDraftOpt = currentSummary?.menu.options.find((opt) => {
          const optKey = opt.name.replace(/\s+/g, '').toLowerCase();
          return optKey.length >= 2 && compactDraftInput.includes(optKey);
        });
        const isConfirm =
          /^(네|예|응|어|좋아|오케이|ok|확인|진행|결제|결재|주문|그대로)/.test(
            trimmed.toLowerCase()
          ) ||
          /(결제\s*해|결재\s*해|주문\s*해|진행\s*해|바로\s*결제|그대로\s*결제|그렇게\s*해|해\s*줘|할게)/.test(
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
          !matchedDraftOpt &&
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
          if (matchedDraftOpt) {
            const curOpts = updatedDraft.selectedOptionIds ?? [];
            const isRemoving = /(빼|제외|취소)/.test(trimmed);
            const nextOpts = isRemoving
              ? curOpts.filter((id) => id !== matchedDraftOpt.id)
              : curOpts.includes(matchedDraftOpt.id)
                ? curOpts
                : [...curOpts, matchedDraftOpt.id];
            updatedDraft = { ...updatedDraft, selectedOptionIds: nextOpts };
            setStagedOptions((prev) => ({
              ...prev,
              [updatedDraft.menuId]: nextOpts,
            }));
          }
          if (isNoteEdit) {
            updatedDraft = { ...updatedDraft, customerNote: trimmed };
          }

          if (isConfirm && !spokenQty && !isNoteEdit && !matchedDraftOpt) {
            executeVoiceOrder(updatedDraft);
            return;
          }

          if (spokenPay || spokenQty || matchedDraftOpt || isNoteEdit) {
            openCheckoutDraftMessage(
              updatedDraft,
              matchedDraftOpt
                ? `${matchedDraftOpt.name} 옵션을 반영했어요.`
                : spokenPay
                  ? '결제 수단을 반영했어요.'
                  : '주문 내용을 수정했어요.'
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

    // 1-2. Ask about other menus inside the currently active store
    if (
      activeStore &&
      /(이\s*가게|여기|해당\s*가게|상점)\s*(?:의\s*)?(?:다른\s*메뉴|전체\s*메뉴|메뉴\s*(?:뭐|보여|알려)|사이드)/.test(
        trimmed
      )
    ) {
      const storeOtherMenus = (menusByStore.get(activeStore.id) ?? []).filter(
        (m) => !m.isSoldOut && m.stock > 0
      );
      if (storeOtherMenus.length > 0) {
        const previewText = storeOtherMenus
          .slice(0, 4)
          .map((m) => `${m.name}(${formatWon(getEffectiveMenuPrice(m))})`)
          .join(', ');
        const replyText = `${activeStore.name}에는 총 ${storeOtherMenus.length}개 메뉴가 있어요: ${previewText}. 아래 카드나 '가게 메뉴' 버튼으로 함께 담아보세요!`;
        setMessages((prev) => [
          ...prev,
          {
            id: `b-storemenus-${Date.now() + 1}`,
            sender: 'bot',
            text: replyText,
            spokenText: replyText,
            matchedMenuIds: storeOtherMenus.slice(0, 4).map((m) => m.id),
            stagedMenuId: activeMenu?.id ?? storeOtherMenus[0].id,
            servings: 1,
            aiSource: 'rule',
          },
        ]);
        return;
      }
    }

    // 2. Ask about other recommended choices or reject current choice
    if (
      !hasDishCategory &&
      /(이거\s*말고|그거\s*말고|다른\s*거|딴\s*거|다른\s*음식|다른\s*메뉴|별로|싫어|나머지|2번\s*뭐|두\s*번째\s*뭐|3번\s*뭐|세\s*번째\s*뭐|다른\s*건\s*뭐)/.test(
        trimmed
      )
    ) {
      if (latestMatchedIds.length > 1) {
        const currentFocusId = recommendedSpotlight
          ? recommendedSpotlight.menuIds[recommendedSpotlight.activeIndex]
          : activeMenu?.id;
        const curIdx = currentFocusId
          ? latestMatchedIds.indexOf(currentFocusId)
          : 0;
        const nextIdx =
          /(세\s*번째|3번)/.test(trimmed) && latestMatchedIds.length > 2
            ? 2
            : (Math.max(0, curIdx) + 1) % latestMatchedIds.length;
        const nextMenu = menuMap.get(latestMatchedIds[nextIdx]);
        const nextStore = nextMenu ? storeMap.get(nextMenu.storeId) : undefined;

        if (nextMenu && nextStore) {
          const servings =
            recommendedSpotlight?.servings ??
            Math.max(1, activeCondition.servings || 1);
          const total =
            getEffectiveMenuPrice(nextMenu) * servings + nextStore.deliveryFee;
          const eta = nextMenu.estimatedMinutes + (nextStore.extraPrepMinutes ?? 0);
          const reasonPart = nextMenu.aiReason ? `${nextMenu.aiReason} ` : '';
          const replyText = `${nextIdx + 1}순위 추천 ${nextStore.name}의 ${nextMenu.name}은 어떠세요? ${reasonPart}배달비 포함 ${formatWon(total)}, 약 ${eta}분 도착입니다. 이 메뉴로 주문할까요?`;

          setStagedServings((prev) => ({
            ...prev,
            [nextMenu.id]: Math.min(servings, Math.max(1, nextMenu.stock)),
          }));
          if (recommendedSpotlight) {
            setRecommendedSpotlight({
              msgId: `b-next-${Date.now() + 1}`,
              menuIds: latestMatchedIds,
              activeIndex: nextIdx,
              explanation: replyText,
              servings,
            });
          }
          setMessages((prev) => [
            ...prev,
            {
              id: `b-next-${Date.now() + 1}`,
              sender: 'bot',
              text: replyText,
              spokenText: replyText,
              matchedMenuIds: latestMatchedIds,
              stagedMenuId: nextMenu.id,
              servings,
              aiSource: 'rule',
            },
          ]);
          return;
        }
      }

      // Fallback: find brand-new deliverable alternatives excluding current activeMenu
      const freshEval = evaluateRecommendations(
        {
          rawInput: '',
          servings: Math.max(1, activeCondition.servings || 1),
          tags: [],
          excludeTags: activeCondition.excludeTags ?? [],
          maxBudget: activeCondition.maxBudget,
          maxMinutes: activeCondition.maxMinutes,
          unknownTokens: [],
          needsConfirmation: false,
        },
        stores,
        menus,
        activeLocation
      );
      const freshPicks = freshEval.matches
        .filter((m) => m.menu.id !== activeMenu?.id)
        .slice(0, 3);
      if (freshPicks.length > 0) {
        const pick = freshPicks[0];
        const freshIds = freshPicks.map((p) => p.menu.id);
        const replyText = `그럼 다른 메뉴로 ${pick.store.name}의 ${pick.menu.name} 추천드릴게요. 배달비 포함 ${formatWon(pick.estimatedTotal)}, 약 ${pick.effectiveMinutes}분 도착입니다. 이건 어떠세요?`;
        setStagedServings((prev) => ({
          ...prev,
          [pick.menu.id]: Math.min(
            Math.max(1, activeCondition.servings || 1),
            Math.max(1, pick.menu.stock)
          ),
        }));
        setMessages((prev) => [
          ...prev,
          {
            id: `b-alt-${Date.now() + 1}`,
            sender: 'bot',
            text: replyText,
            spokenText: replyText,
            matchedMenuIds: freshIds,
            stagedMenuId: pick.menu.id,
            servings: Math.max(1, activeCondition.servings || 1),
            aiSource: 'rule',
          },
        ]);
        return;
      }
    }

    // 2-1. Direct Q&A about the currently focused/staged menu (ETA / price / reviews)
    if (activeMenu && activeStore && !hasDishCategory) {
      const qty =
        stagedServings[activeMenu.id] ??
        Math.max(1, activeCondition.servings || 1);
      const effectivePrice = getEffectiveMenuPrice(activeMenu);
      const total = effectivePrice * qty + activeStore.deliveryFee;
      const eta =
        activeMenu.estimatedMinutes + (activeStore.extraPrepMinutes ?? 0);

      if (/(몇\s*분|언제\s*와|오래\s*걸려|도착\s*시간|배달\s*시간)/.test(trimmed)) {
        const etaReply = `${activeStore.name} ${activeMenu.name}은 지금 주문하시면 약 ${eta}분 안에 도착 예정입니다. 바로 주문할까요?`;
        setMessages((prev) => [
          ...prev,
          {
            id: `b-eta-${Date.now() + 1}`,
            sender: 'bot',
            text: etaReply,
            spokenText: etaReply,
            stagedMenuId: activeMenu.id,
            aiSource: 'rule',
          },
        ]);
        return;
      }

      if (/(배달비\s*얼마|배달팁\s*얼마|얼마야|가격이?\s*어떻)/.test(trimmed)) {
        const feeText =
          activeStore.deliveryFee === 0
            ? '무료'
            : formatWon(activeStore.deliveryFee);
        const priceReply = `${activeMenu.name}은 1인분 ${formatWon(effectivePrice)}이고 배달비는 ${feeText}예요. ${qty}인분 합계 ${formatWon(total)}입니다. 주문 진행할까요?`;
        setMessages((prev) => [
          ...prev,
          {
            id: `b-price-${Date.now() + 1}`,
            sender: 'bot',
            text: priceReply,
            spokenText: priceReply,
            stagedMenuId: activeMenu.id,
            aiSource: 'rule',
          },
        ]);
        return;
      }

      if (/(리뷰\s*어때|후기\s*어때|평점\s*몇|맛있어|괜찮아)/.test(trimmed)) {
        const menuReviews = reviews.filter((r) => r.menuId === activeMenu.id);
        const topRev = menuReviews[0];
        const revSnippet = topRev
          ? ` 최근 후기에는 "${topRev.content.slice(0, 42)}"라고 적혀 있어요.`
          : '';
        const revReply = `${activeStore.name} 평점은 ${(activeStore.rating ?? 4.9).toFixed(1)}점이고 리뷰는 ${menuReviews.length}건입니다.${revSnippet} 이 메뉴로 주문할까요?`;
        setMessages((prev) => [
          ...prev,
          {
            id: `b-rev-${Date.now() + 1}`,
            sender: 'bot',
            text: revReply,
            spokenText: revReply,
            stagedMenuId: activeMenu.id,
            aiSource: 'rule',
          },
        ]);
        return;
      }
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
      /(결제|결재|주문|시켜|바로\s*주문|바로\s*할|이걸로|이거로|그걸로|그거로|이거\s*해|그거\s*해|이거\s*주|그거\s*주|할게|먹을래|배달\s*해)/.test(
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
      !hasFoodPreference &&
      Boolean(activeMenu && activeStore) &&
      (wantsCheckoutNow ||
        (canAffirmFromLastBot &&
          /(?:^|\s)(네|예|응|어|좋아|좋아요|오케이|ok|그래|그래요|알겠어|부탁해|해\s*줘|주세요)(?:\s|$|[,.!])/.test(
            trimmed.toLowerCase()
          )));

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

    // Event / coupon / closing-sale routing
    if (/(이벤트|행사|혜택|할인\s*맛집|할인되)/.test(trimmed)) {
      const eventStoreIds = new Set([
        ...Array.from(activePromoByStore.keys()),
        ...Array.from(activeCouponByStore.keys()),
      ]);
      const candidateEventMenus = menus.filter((m) => {
        const st = storeMap.get(m.storeId);
        if (!st || !st.isOpen || m.isSoldOut || m.stock <= 0) return false;
        const hasOffer =
          eventStoreIds.has(st.id) || (m.closingDiscountPercent ?? 0) > 0;
        if (!hasOffer) return false;
        return (
          !hasDeliverableInArea ||
          isStoreDeliverableToLocation(st, activeLocation)
        );
      });
      const fallbackEventMenus =
        candidateEventMenus.length > 0
          ? candidateEventMenus
          : menus.filter((m) => {
              const st = storeMap.get(m.storeId);
              return (
                Boolean(st?.isOpen) &&
                !m.isSoldOut &&
                m.stock > 0 &&
                (eventStoreIds.has(m.storeId) ||
                  (m.closingDiscountPercent ?? 0) > 0)
              );
            });
      const topEventMenus = fallbackEventMenus.slice(0, 3);
      if (topEventMenus.length > 0) {
        const firstM = topEventMenus[0];
        const firstSt = storeMap.get(firstM.storeId);
        const evSpoken = `${firstSt?.name ?? '인기 매장'} 등 가게 이벤트·쿠폰 혜택이 적용되는 메뉴 ${topEventMenus.length}곳을 찾았어요. 바로 주문할까요?`;
        setMessages((prev) => [
          ...prev,
          {
            id: `b-event-${Date.now() + 1}`,
            sender: 'bot',
            text: `점주 자체 이벤트·쿠폰 또는 마감 할인이 진행 중인 가게 ${topEventMenus.length}곳을 찾았어요! 착한가격(매장 동일가)에 추가 혜택까지 받으실 수 있습니다.`,
            spokenText: evSpoken,
            matchedMenuIds: topEventMenus.map((m) => m.id),
            servings: 1,
            stagedMenuId: topEventMenus[0].id,
            aiSource: 'rule',
          },
        ]);
        return;
      }
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

    if (/(심부름|장보기|세탁소|픽업\s*대행)/.test(trimmed)) {
      const errandText =
        '동네 장보기·편의점 생필품·세탁소 수령 등 생활 심부름을 요청하시면 가까운 파트너와 바로 매칭해 드려요.';
      setMessages((prev) => [
        ...prev,
        {
          id: `b-errand-${Date.now() + 1}`,
          sender: 'bot',
          text: errandText,
          spokenText: errandText,
          actionLink: onOpenErrand
            ? {
                label: '생활 심부름 요청하러 가기 →',
                target: 'errand',
              }
            : undefined,
          aiSource: 'rule',
        },
      ]);
      return;
    }

    if (/(단체|회의|오피스|법인|야근\s*식사)/.test(trimmed)) {
      const b2bText =
        '오피스·회의 단체 주문은 원하는 시간 예약과 법인/개인카드·계좌이체 즉시 결제, 거래명세표 발급까지 한 번에 가능합니다.';
      setMessages((prev) => [
        ...prev,
        {
          id: `b-b2b-${Date.now() + 1}`,
          sender: 'bot',
          text: b2bText,
          spokenText: b2bText,
          actionLink: onOpenB2BMeal
            ? {
                label: 'B2B 기업 단체 선주문 열기 →',
                target: 'b2b',
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
    // Escalate to cloud AI whenever the new utterance itself has no recognized local tags/constraints.
    const localUnderstoodNewInput =
      parsedInline.tags.length > 0 ||
      (parsedInline.excludeTags?.length ?? 0) > 0 ||
      parsedInline.maxBudget !== null ||
      parsedInline.maxMinutes !== null;
    const needsCloudFallback =
      merged.needsConfirmation ||
      (!localUnderstoodNewInput && trimmed.length >= 2);

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

    // Anti-repeat guard: never repeat the exact same menu recommendation script twice in a row
    let finalStaged = autoStaged;
    let finalMatchedIds = topMatches.map((m) => m.menu.id);
    if (
      lastBot &&
      finalStaged &&
      lastBot.stagedMenuId === finalStaged.id &&
      spokenText &&
      lastBot.spokenText === spokenText
    ) {
      if (topMatches.length > 1) {
        const second = topMatches[1];
        finalStaged = second.menu;
        finalMatchedIds = [
          second.menu.id,
          ...topMatches.filter((m) => m.menu.id !== second.menu.id).map((m) => m.menu.id),
        ];
        botText = `조금 다른 후보로 ${second.store.name}의 ${second.menu.name}을 보여드릴게요. 배달비 포함 ${formatWon(second.estimatedTotal)}, 약 ${second.effectiveMinutes}분 도착입니다.`;
        spokenText = `${second.store.name}의 ${second.menu.name}은 어떠세요? 배달비 포함 ${formatWon(second.estimatedTotal)}입니다. 이 메뉴로 주문할까요?`;
      } else {
        botText = `말씀하신 "${trimmed}" 내용을 반영해 ${topMatches[0].store.name} ${topMatches[0].menu.name}을 준비해 두었어요. 바로 주문하거나 원하시는 다른 음식 종류를 말씀해 주세요.`;
        spokenText = `${topMatches[0].store.name} ${topMatches[0].menu.name}으로 바로 주문해 드릴까요, 아니면 다른 음식을 찾아드릴까요?`;
      }
    }

    if (finalStaged) {
      setStagedServings((prev) => ({
        ...prev,
        [finalStaged.id]: Math.min(merged.servings, Math.max(1, finalStaged.stock)),
      }));
    }

    const botMsg: ChatMessage = {
      id: `b-${Date.now() + 1}`,
      sender: 'bot',
      text: botText,
      spokenText,
      parsed: merged,
      matchedMenuIds: finalMatchedIds,
      servings: merged.servings,
      stagedMenuId: finalStaged?.id,
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
    isNearSpeechEndRef.current = false;
    pendingVoiceQueryRef.current = null;
    lastBotSpeechEndedAtRef.current = Date.now();
    clearAutoListenTimer();
    clearRestartListenTimer();
    stopSpeaking();
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    // Brief 180ms decay prevents residual speaker audio from leaking into mic
    autoListenTimerRef.current = window.setTimeout(() => {
      startListeningRef.current();
    }, 180);
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

  const renderPinnedVoiceTurnBar = () => {
    const isPopupOpen = Boolean(recommendedSpotlight || hasOverlayOpen);
    const positionClass = isPopupOpen
      ? 'top-2.5 sm:top-3'
      : 'top-[70px] sm:top-[76px]';

    let containerStyle =
      'bg-white/95 border-[#0F6B46]/50 text-[#111827] shadow-[0_10px_28px_-8px_rgba(15,23,42,0.18)]';
    let badgeText = '내 차례';
    let badgeClass = 'bg-[#EAF6F0] text-[#0B4F34]';
    let headline = '지금 말씀하셔도 돼요';
    let subline = '대답하거나 메뉴를 골라주세요';

    if (isListening) {
      containerStyle =
        'bg-[#FEF2F2]/95 border-[#DC2626] text-[#7F1D1D] shadow-[0_10px_28px_-8px_rgba(220,38,38,0.25)]';
      badgeText = '듣는 중';
      badgeClass = 'bg-[#DC2626] text-white';
      headline = '지금 말씀해 주세요';
      subline = interimTranscript
        ? `“${interimTranscript}”`
        : '원하시는 메뉴나 조건을 편하게 말씀하세요';
    } else if (isSpeaking) {
      containerStyle =
        'bg-[#EAF6F0]/95 border-[#0F6B46] text-[#0B4F34] shadow-[0_10px_28px_-8px_rgba(15,107,70,0.2)]';
      badgeText = '바로 설명 중';
      badgeClass = 'bg-[#0F6B46] text-white';
      headline = '바로가 말하고 있어요';
      subline = '끝나면 바로 말할 차례가 돼요';
    } else if (isAnalyzing) {
      containerStyle =
        'bg-[#FFFBEB]/95 border-[#D97706] text-[#92400E] shadow-[0_10px_28px_-8px_rgba(217,119,6,0.18)]';
      badgeText = '찾는 중';
      badgeClass = 'bg-[#FEF3C7] text-[#92400E]';
      headline = '잠시만요, 메뉴를 찾고 있어요';
      subline = '금방 결과를 읽어드릴게요';
    }

    return (
      <div
        role="status"
        aria-live="polite"
        className={`fixed ${positionClass} left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-24px)] max-w-3xl transition-all`}
      >
        <div
          className={`backdrop-blur-md border-2 rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2.5 ${containerStyle}`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isListening
                  ? 'bg-[#DC2626] text-white baro-voice-pulse'
                  : isSpeaking
                    ? 'bg-[#0F6B46] text-white'
                    : isAnalyzing
                      ? 'bg-[#F59E0B] text-white'
                      : 'bg-[#EAF6F0] text-[#0F6B46]'
              }`}
            >
              {isListening ? (
                <Mic className="w-4.5 h-4.5" />
              ) : isSpeaking ? (
                <Volume2 className="w-4.5 h-4.5 animate-pulse" />
              ) : isAnalyzing ? (
                <Loader2 className="w-4.5 h-4.5 animate-spin" />
              ) : (
                <Mic className="w-4.5 h-4.5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold shrink-0 ${badgeClass}`}
                >
                  {badgeText}
                </span>
                <span className="text-[14.5px] sm:text-[15.5px] font-extrabold truncate">
                  {headline}
                </span>
              </div>
              <p className="text-[12.5px] sm:text-[13px] font-medium opacity-90 truncate mt-0.5">
                {subline}
              </p>
            </div>
          </div>

          {isSpeaking ? (
            <button
              type="button"
              onClick={handleInterruptToListen}
              className="easy-compact min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-[#F3FBF7] border border-[#0F6B46] text-[#0B4F34] text-[13.5px] font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              끊고 말하기
            </button>
          ) : isListening ? (
            <button
              type="button"
              onClick={handleMicToggle}
              className="easy-compact min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-red-50 border border-[#DC2626] text-[#B91C1C] text-[13.5px] font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              마이크 끄기
            </button>
          ) : !isAnalyzing ? (
            <button
              type="button"
              onClick={handleMicToggle}
              className="easy-compact min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#0F6B46] hover:bg-[#0B5638] text-white text-[13.5px] font-extrabold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              마이크 켜기
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      {renderPinnedVoiceTurnBar()}
      <div className="max-w-3xl mx-auto mt-[66px] sm:mt-[72px] os-card rounded-2xl overflow-hidden flex flex-col min-h-[72vh]">
      {/* Simple 1-Row Easy AI Header */}
      <div className="px-4 sm:px-6 py-3.5 bg-white border-b border-[#E8ECE4] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBackToHome}
            className="easy-compact min-w-[38px] min-h-[38px] rounded-xl hover:bg-[#F7F8F5] flex items-center justify-center text-[#1A1D1A] cursor-pointer transition-colors shrink-0"
            aria-label="홈으로 돌아가기"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-[#1A1D1A] tracking-tight whitespace-nowrap">
              바로 대화 주문
            </h1>
            <p className="text-xs text-[#687064] truncate">
              {activeLocation?.areaName ?? '전국'} · 착한가격 · 1개도 배달
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenBrowse && (
            <button
              type="button"
              onClick={() => onOpenBrowse()}
              className="easy-compact min-h-[36px] px-2.5 py-1 bg-[#F7F8F5] hover:bg-[#EAF1E2] border border-[#E8ECE4] text-[#3D5720] text-xs font-bold rounded-xl inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">카테고리 찾기</span>
            </button>
          )}
          {isSpeechSynthesisSupported() && (
            <button
              type="button"
              onClick={handleToggleVoiceReply}
              aria-pressed={voiceReplyEnabled}
              className={`easy-compact min-h-[36px] px-2.5 py-1 text-xs font-bold rounded-xl inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors border ${
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
              <span>{voiceReplyEnabled ? '음성 ON' : '음성 OFF'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => runChatQuery('초기화')}
            aria-label="새 대화 시작"
            className="easy-compact min-h-[36px] px-2.5 py-1 bg-[#F7F8F5] hover:bg-[#EAF1E2] border border-[#E8ECE4] text-[#555E52] hover:text-[#3D5720] text-xs font-bold rounded-xl inline-flex items-center gap-1 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">새 대화</span>
          </button>
        </div>
      </div>

      {/* Chat Stream */}
      <div className="flex-1 bg-[#F7F8F5] p-5 sm:p-7 space-y-6 overflow-y-auto">
        {messages.map((msg) => {
          if (msg.sender === 'user') {
            return (
              <div
                key={msg.id}
                ref={msg.id === lastUserMessageId ? latestTurnStartRef : undefined}
                className="flex justify-end scroll-mt-20"
              >
                <div className="max-w-[84%] px-4 py-3.5 bg-[#4E6E2A] text-white text-base sm:text-[17px] font-semibold rounded-2xl rounded-br-sm shadow-sm inline-flex items-start gap-2.5">
                  <AudioLines className="w-5 h-5 mt-0.5 text-[#EAF1E2] shrink-0" />
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
                <div className="max-w-[90%] bg-white border border-[#E8ECE4] rounded-2xl rounded-tl-xs px-4 py-3.5 text-base sm:text-[17px] text-[#1A1D1A] leading-relaxed shadow-sm space-y-2.5">
                  {msg.aiSource === 'gemini' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[10px] font-bold">
                      <Sparkles className="w-2.5 h-2.5" />
                      바로 추천
                    </span>
                  )}
                  <p>{msg.text}</p>

                  {msg.actionLink && (
                    <button
                      type="button"
                      onClick={() => {
                        if (msg.actionLink?.target === 'b2b' && onOpenB2BMeal) {
                          onOpenB2BMeal();
                        } else if (
                          msg.actionLink?.target === 'errand' &&
                          onOpenErrand
                        ) {
                          onOpenErrand();
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
                <div className="flex gap-3.5 overflow-x-auto pb-1.5 pl-1 sm:pl-12 no-scrollbar">
                  {matchedMenus.map((item, idx) => {
                    const store = storeMap.get(item.storeId);
                    if (!store) return null;
                    const wished = wishlistIds.includes(item.id);
                    const servings = msg.servings ?? 2;
                    const effectivePrice = getEffectiveMenuPrice(item);
                    const total = effectivePrice * servings + store.deliveryFee;
                    const isSameStore = item.storePrice === item.pricePerPerson;
                    const hasClosingDiscount = (item.closingDiscountPercent ?? 0) > 0;
                    const isSelectedCard = stagedMenu?.id === item.id;

                    const storeOtherCount = (
                      menusByStore.get(store.id) ?? []
                    ).filter(
                      (m) =>
                        m.id !== item.id && !m.isSoldOut && m.stock >= 1
                    ).length;

                    const storePromo = activePromoByStore.get(store.id);
                    const storeCoupon = activeCouponByStore.get(store.id);

                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelectedCard}
                        onClick={() =>
                          selectRecommendedMenuForMessage(msg.id, item, servings)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectRecommendedMenuForMessage(msg.id, item, servings);
                          }
                        }}
                        className={`w-[304px] sm:w-[320px] shrink-0 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-3.5 transition-all cursor-pointer ${
                          isSelectedCard
                            ? 'bg-[#F7FAF3] border border-[#4E6E2A] ring-1 ring-[#4E6E2A] shadow-sm'
                            : 'bg-white border border-[#E8ECE4] hover:border-[#82B440] shadow-xs'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                                isSelectedCard
                                  ? 'bg-[#4E6E2A] text-white'
                                  : 'bg-[#EAF1E2] text-[#3D5720]'
                              }`}
                            >
                              <Sparkles className="w-3 h-3 shrink-0" />
                              <span>
                                {idx + 1}순위{isSelectedCard ? ' · 선택됨' : ''}
                              </span>
                            </span>
                            <div className="flex items-center gap-1">
                              {isSameStore && (
                                <span className="px-2 py-0.5 rounded-full bg-[#F7F8F5] border border-[#D4E1C5] text-[#3D5720] text-xs font-semibold">
                                  착한가격
                                </span>
                              )}
                              {hasClosingDiscount && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-xs font-semibold">
                                  -{item.closingDiscountPercent}%
                                </span>
                              )}
                            </div>
                          </div>

                          {(storePromo || storeCoupon) && (
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5 truncate">
                              <Ticket className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">
                                {storeCoupon ? storeCoupon.label : storePromo?.title}
                              </span>
                            </p>
                          )}

                          <div className="flex items-center gap-3.5">
                            <div className="w-16 h-16 rounded-xl overflow-hidden border border-[#E8ECE4] shrink-0">
                              <FoodImage
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#4E6E2A] min-w-0">
                                  <span className="truncate">{store.name}</span>
                                  <span className="inline-flex items-center gap-0.5 text-[#1A1D1A] font-semibold shrink-0 tabular-nums">
                                    <Star className="w-3.5 h-3.5 fill-[#82B440] text-[#82B440]" />
                                    {(store.rating ?? 4.9).toFixed(1)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleWishlist(item.id);
                                  }}
                                  aria-label={`${item.name} 찜하기`}
                                  className="easy-compact p-1 cursor-pointer shrink-0"
                                >
                                  <Heart
                                    className={`w-4 h-4 ${
                                      wished
                                        ? 'fill-red-500 text-red-500'
                                        : 'text-[#919A8D]'
                                    }`}
                                  />
                                </button>
                              </div>
                              <div className="text-base sm:text-lg font-bold text-[#1A1D1A] truncate mt-0.5">
                                {item.name}
                              </div>
                              <div className="text-sm sm:text-base font-bold text-[#4E6E2A] tabular-nums mt-0.5">
                                {formatWon(total)}{' '}
                                <span className="font-medium text-xs sm:text-sm text-[#687064]">
                                  · 약 {item.estimatedMinutes + (store.extraPrepMinutes ?? 0)}분
                                </span>
                              </div>
                            </div>
                          </div>

                          {item.aiReason && (
                            <p className="text-xs sm:text-sm text-[#4B5548] leading-snug line-clamp-1">
                              {item.aiReason}
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectRecommendedMenuForMessage(msg.id, item, servings);
                              if (onOpenStoreMenu) {
                                onOpenStoreMenu(store.id, {
                                  highlightMenuId: item.id,
                                  initialServings: servings,
                                  initialOptionIds: stagedOptions[item.id] ?? [],
                                  preselectHighlight: true,
                                });
                              } else {
                                switchSpotlightIndex(idx, {
                                  msgId: msg.id,
                                  menuIds: matchedMenus.map((m) => m.id),
                                  activeIndex: idx,
                                  explanation: msg.spokenText ?? msg.text,
                                  servings,
                                });
                              }
                            }}
                            className="easy-compact min-h-[44px] px-3 py-2 bg-[#F7F8F5] hover:bg-[#EAF1E2] border border-[#D4E1C5] text-[#3D5720] text-sm font-semibold rounded-xl cursor-pointer transition-colors whitespace-nowrap"
                          >
                            {onOpenStoreMenu && storeOtherCount > 0
                              ? `다른 메뉴 (+${storeOtherCount})`
                              : onOpenStoreMenu
                                ? '가게 메뉴'
                                : '상세 · 리뷰'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openCheckoutDraftMessage({
                                menuId: item.id,
                                servings,
                                selectedOptionIds: stagedOptions[item.id] ?? [],
                                paymentMethod: 'kakaopay',
                                customerNote: defaultNote ?? '',
                              });
                            }}
                            className="easy-compact min-h-[44px] px-3 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                          >
                            <Zap className="w-4 h-4 shrink-0" />
                            <span>바로 주문</span>
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
                  <div className="max-w-lg os-card rounded-2xl p-5 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-[#E8ECE4]">
                          <FoodImage
                            src={stagedMenu.image}
                            alt={stagedMenu.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-[#4E6E2A] truncate">
                            {stagedStore.name}
                          </div>
                          <div className="text-base sm:text-lg font-bold text-[#1A1D1A] truncate">
                            {stagedMenu.name}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
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
                          className="w-10 h-10 rounded-xl border border-[#E8ECE4] bg-[#F7F8F5] hover:bg-[#EAF1E2] font-bold text-base cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-7 text-center font-mono tabular-nums text-base font-bold">
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
                          className="w-10 h-10 rounded-xl border border-[#E8ECE4] bg-[#F7F8F5] hover:bg-[#EAF1E2] font-bold text-base cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {stagedMenu.options.length > 0 && (
                      <div className="space-y-2 pt-3 border-t border-[#E8ECE4]">
                        <div className="text-sm font-bold text-[#3D5720]">
                          추가 옵션 (원하실 때만 선택)
                        </div>
                        <div className="flex flex-wrap gap-2">
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
                                className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-sm font-bold cursor-pointer transition-colors ${
                                  selected
                                    ? 'bg-[#EAF1E2] border-[#4E6E2A] text-[#3D5720]'
                                    : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#3F473D] hover:border-[#82B440]'
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

                      const storeOtherMenus = (
                        menusByStore.get(stagedStore.id) ?? []
                      ).filter(
                        (m) =>
                          m.id !== stagedMenu.id && !m.isSoldOut && m.stock >= 1
                      );
                      const storeExtras = (
                        extraItemsByStore[stagedStore.id] ?? []
                      ).filter((it) => it.menuId !== stagedMenu.id);
                      const extrasSubtotal = storeExtras.reduce((sum, it) => {
                        const m = menuMap.get(it.menuId);
                        return m
                          ? sum + getEffectiveMenuPrice(m) * it.quantity
                          : sum;
                      }, 0);

                      const estTotal =
                        effectiveUnit * qty +
                        optSum +
                        extrasSubtotal +
                        stagedStore.deliveryFee;

                      const combinedItems: CartLineItem[] = [
                        {
                          menuId: stagedMenu.id,
                          quantity: qty,
                          selectedOptionIds: optIds,
                        },
                        ...storeExtras,
                      ];

                      return (
                        <div className="pt-3 border-t border-[#E8ECE4] space-y-3.5">
                          {storeOtherMenus.length > 0 && (
                            <div className="p-3.5 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-2.5">
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <span className="font-bold text-[#1A1D1A] inline-flex items-center gap-1.5">
                                  <StoreIcon className="w-4 h-4 text-[#4E6E2A] shrink-0" />
                                  <span>이 가게 다른 메뉴 추가 ({storeOtherMenus.length}개)</span>
                                </span>
                                {onOpenStoreMenu && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenStoreMenu(stagedStore.id, {
                                        highlightMenuId: stagedMenu.id,
                                        initialServings: qty,
                                        initialOptionIds: optIds,
                                        preselectHighlight: true,
                                      })
                                    }
                                    className="easy-compact text-[#4E6E2A] font-semibold hover:underline cursor-pointer"
                                  >
                                    전체 메뉴 →
                                  </button>
                                )}
                              </div>
                              <div className="space-y-2">
                                {storeOtherMenus.slice(0, 3).map((other) => {
                                  const extraQty =
                                    storeExtras.find(
                                      (it) => it.menuId === other.id
                                    )?.quantity ?? 0;
                                  return (
                                    <div
                                      key={other.id}
                                      className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl bg-white border border-[#E8ECE4]"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-[#1A1D1A] truncate">
                                          {other.name}
                                        </p>
                                        <p className="text-xs sm:text-sm font-mono font-semibold text-[#4E6E2A]">
                                          {formatWon(getEffectiveMenuPrice(other))}
                                        </p>
                                      </div>
                                      {extraQty === 0 ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            adjustStoreExtraItem(
                                              stagedStore.id,
                                              other,
                                              1
                                            )
                                          }
                                          className="easy-compact min-h-[36px] px-3 py-1.5 rounded-xl bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs sm:text-sm font-semibold shrink-0 cursor-pointer"
                                        >
                                          + 추가
                                        </button>
                                      ) : (
                                        <div className="inline-flex items-center gap-1.5 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              adjustStoreExtraItem(
                                                stagedStore.id,
                                                other,
                                                -1
                                              )
                                            }
                                            aria-label={`${other.name} 수량 감소`}
                                            className="easy-compact w-8 h-8 rounded-lg border border-[#D4E1C5] bg-[#F7F8F5] text-sm font-bold cursor-pointer"
                                          >
                                            -
                                          </button>
                                          <span className="w-5 text-center font-mono text-sm font-bold">
                                            {extraQty}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              adjustStoreExtraItem(
                                                stagedStore.id,
                                                other,
                                                1
                                              )
                                            }
                                            aria-label={`${other.name} 수량 증가`}
                                            className="easy-compact w-8 h-8 rounded-lg bg-[#4E6E2A] text-white text-sm font-bold cursor-pointer"
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

                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm sm:text-base font-medium text-[#555E52]">
                              배달비 포함 예상 금액
                              {storeExtras.length > 0 && (
                                <strong className="ml-1 text-[#3D5720]">
                                  ({combinedItems.length}종)
                                </strong>
                              )}
                              {(stagedMenu.closingDiscountPercent ?? 0) > 0 && (
                                <strong className="ml-1 text-amber-800">
                                  (마감 -{stagedMenu.closingDiscountPercent}%)
                                </strong>
                              )}
                            </span>
                            <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-[#4E6E2A]">
                              {formatWon(estTotal)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (storeExtras.length > 0 && onAddMultipleToCart) {
                                  onAddMultipleToCart(stagedStore.id, combinedItems);
                                } else if (onAddToCart) {
                                  onAddToCart(stagedMenu.id, qty, optIds);
                                } else {
                                  onOpenRecommendationWithCondition(
                                    activeCondition,
                                    stagedMenu.id
                                  );
                                }
                              }}
                              className="min-h-[48px] px-3.5 py-2.5 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-sm sm:text-base font-semibold rounded-xl cursor-pointer transition-colors"
                            >
                              {onAddToCart
                                ? storeExtras.length > 0
                                  ? `장바구니 (${combinedItems.length}종)`
                                  : '장바구니 담기'
                                : '다른 메뉴 보기'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  storeExtras.length > 0 &&
                                  onProceedToConfirmWithItems
                                ) {
                                  onProceedToConfirmWithItems({
                                    storeId: stagedStore.id,
                                    items: combinedItems,
                                    couponCode: 'NONE',
                                  });
                                } else {
                                  onProceedToConfirm({
                                    menuId: stagedMenu.id,
                                    servings: qty,
                                    selectedOptionIds: optIds,
                                    couponCode: 'NONE',
                                  });
                                }
                              }}
                              className="min-h-[48px] px-3.5 py-2.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-sm sm:text-base font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
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
                      <div className="max-w-md bg-white border border-[#4E6E2A] ring-1 ring-[#4E6E2A]/20 rounded-2xl p-4 space-y-3 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[11px] font-bold">
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>음성·대화 간편 결제 확인</span>
                          </span>
                          <span className="text-[11px] font-semibold text-[#687064] truncate">
                            {summary.store.name}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-1.5 text-xs">
                          {summary.resolvedLines.map((line, lIdx) => (
                            <div
                              key={`${line.menuId}-${lIdx}`}
                              className="flex items-center justify-between gap-2 font-bold text-[#1A1D1A]"
                            >
                              <span className="truncate">
                                {line.menuName} · {line.quantity}개
                              </span>
                              <span className="font-mono tabular-nums shrink-0">
                                {formatWon(
                                  line.lineSubtotal + line.optionsSubtotal
                                )}
                              </span>
                            </div>
                          ))}
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

                        {(() => {
                          const otherStoreMenus = (
                            menusByStore.get(summary.store.id) ?? []
                          ).filter(
                            (m) =>
                              m.id !== summary.menu.id &&
                              !m.isSoldOut &&
                              m.stock >= 1
                          );
                          if (otherStoreMenus.length === 0) return null;
                          const curExtras = activeDraft.extraItems ?? [];
                          return (
                            <div className="space-y-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setShowCheckoutExtraMenus((prev) => !prev)
                                }
                                className="easy-compact text-[11px] font-bold text-[#4E6E2A] hover:underline inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>
                                  {showCheckoutExtraMenus
                                    ? '이 가게 추가 메뉴 접기'
                                    : `${summary.store.name} 다른 메뉴 함께 추가 (${otherStoreMenus.length}개)`}
                                </span>
                              </button>
                              {showCheckoutExtraMenus && (
                                <div className="space-y-1.5 p-2 rounded-xl bg-[#FAFCF8] border border-[#E8ECE4]">
                                  {otherStoreMenus.slice(0, 4).map((extraM) => {
                                    const exQty =
                                      curExtras.find(
                                        (it) => it.menuId === extraM.id
                                      )?.quantity ?? 0;
                                    const updateDraftExtra = (delta: number) => {
                                      setVoiceCheckoutDraft((prev) => {
                                        if (!prev) return prev;
                                        const list = prev.extraItems ?? [];
                                        const idx = list.findIndex(
                                          (it) => it.menuId === extraM.id
                                        );
                                        let nextList: CartLineItem[];
                                        if (idx === -1) {
                                          if (delta <= 0) return prev;
                                          nextList = [
                                            ...list,
                                            {
                                              menuId: extraM.id,
                                              quantity: 1,
                                              selectedOptionIds: [],
                                            },
                                          ];
                                        } else {
                                          const nq = list[idx].quantity + delta;
                                          nextList =
                                            nq <= 0
                                              ? list.filter((_, i) => i !== idx)
                                              : list.map((it, i) =>
                                                  i === idx
                                                    ? {
                                                        ...it,
                                                        quantity: Math.min(
                                                          extraM.stock,
                                                          nq
                                                        ),
                                                      }
                                                    : it
                                                );
                                        }
                                        return { ...prev, extraItems: nextList };
                                      });
                                    };
                                    return (
                                      <div
                                        key={extraM.id}
                                        className="flex items-center justify-between gap-2 text-xs bg-white px-2.5 py-1.5 rounded-lg border border-[#E8ECE4]"
                                      >
                                        <div className="min-w-0">
                                          <p className="font-semibold text-[#1A1D1A] truncate">
                                            {extraM.name}
                                          </p>
                                          <p className="text-[11px] font-mono text-[#4E6E2A]">
                                            {formatWon(
                                              getEffectiveMenuPrice(extraM)
                                            )}
                                          </p>
                                        </div>
                                        {exQty === 0 ? (
                                          <button
                                            type="button"
                                            onClick={() => updateDraftExtra(1)}
                                            className="easy-compact px-2 py-1 rounded bg-[#EAF1E2] text-[#3D5720] text-[11px] font-bold shrink-0 cursor-pointer"
                                          >
                                            + 추가
                                          </button>
                                        ) : (
                                          <div className="inline-flex items-center gap-1 shrink-0">
                                            <button
                                              type="button"
                                              onClick={() => updateDraftExtra(-1)}
                                              aria-label={`${extraM.name} 수량 감소`}
                                              className="easy-compact w-6 h-6 rounded border border-[#D4E1C5] bg-white text-xs font-bold cursor-pointer"
                                            >
                                              -
                                            </button>
                                            <span className="w-4 text-center font-mono text-xs font-bold">
                                              {exQty}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => updateDraftExtra(1)}
                                              aria-label={`${extraM.name} 수량 증가`}
                                              className="easy-compact w-6 h-6 rounded bg-[#4E6E2A] text-white text-xs font-bold cursor-pointer"
                                            >
                                              +
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div className="space-y-2 text-xs">
                          {/* Compact 3 Delivery Method Pills */}
                          <div className="space-y-1">
                            <span className="text-[11px] font-bold text-[#687064]">
                              배송 방식 (최소주문 없음)
                            </span>
                            <div className="grid grid-cols-3 gap-1.5">
                              {DELIVERY_METHOD_OPTIONS.map((opt) => {
                                const active =
                                  (activeDraft.deliveryMethod ?? 'partner_direct') ===
                                  opt.id;
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() =>
                                      setVoiceCheckoutDraft((prev) =>
                                        prev ? { ...prev, deliveryMethod: opt.id } : prev
                                      )
                                    }
                                    className={`easy-compact px-2 py-1.5 rounded-xl border text-center cursor-pointer transition-colors ${
                                      active
                                        ? 'bg-[#EAF1E2] border-[#4E6E2A] text-[#3D5720]'
                                        : 'bg-white border-[#E8ECE4] text-[#555E52] hover:border-[#82B440]'
                                    }`}
                                  >
                                    <div className="text-[11px] font-bold truncate">
                                      {opt.shortLabel}
                                    </div>
                                    <div className="text-[10px] opacity-80 truncate">
                                      {opt.badge}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[#687064]">
                            <span>
                              배달비 ({getDeliveryMethodMeta(summary.deliveryMethod).label})
                            </span>
                            <span className="font-mono tabular-nums font-bold text-[#1A1D1A]">
                              {summary.deliveryFee === 0
                                ? '무료 (0원)'
                                : `+${formatWon(summary.deliveryFee)}`}
                            </span>
                          </div>
                          {summary.deliveryFeeCalc.nextTierLabel && (
                            <p className="text-[11px] font-semibold text-[#4E6E2A] bg-[#F7F8F5] px-2.5 py-1 rounded-lg">
                              {summary.deliveryFeeCalc.nextTierLabel}
                            </p>
                          )}
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
                              착한가격으로 약 {formatWon(summary.savings.totalSaved)} 절약
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
                          <span className="text-lg font-bold font-mono tabular-nums text-[#4E6E2A]">
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
              <span>터치해서 바로 음성 주문 시작하기 (&quot;어떤 음식을 찾아드릴까요?&quot;)</span>
            </button>
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
              <span>Baro 분석이 컨디션과 조건에 맞는 매장을 찾고 있어요...</span>
            </div>
          </div>
        )}

        <div ref={bottomAnchorRef} />
      </div>

      {/* Simple Easy-Mode Input Bar */}
      <div className="bg-white border-t border-[#E8ECE4] px-4 sm:px-6 py-3.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runChatQuery(input);
          }}
          className={`min-w-0 w-full p-1.5 rounded-2xl bg-[#F7F8F5] border transition-colors flex items-center gap-2 ${
            isListening
              ? 'border-red-400 ring-1 ring-red-400/30'
              : 'border-[#D4E1C5] focus-within:border-[#4E6E2A] focus-within:ring-1 focus-within:ring-[#4E6E2A]/20'
          }`}
        >
          <button
            type="button"
            onClick={handleMicToggle}
            aria-label={isListening ? '음성 중지' : '음성으로 말하기'}
            className={`easy-compact min-w-[48px] min-h-[48px] rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
              isListening
                ? 'bg-red-600 text-white'
                : 'bg-[#4E6E2A] hover:bg-[#3F5A21] text-white'
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
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 따뜻한 국밥 1그릇, 바삭한 치킨 추천해줘"
            className="flex-1 min-w-0 w-full min-h-[48px] px-2 bg-transparent text-base text-[#1A1D1A] placeholder:text-[#687064] focus:outline-none"
          />

          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="전송"
            className="easy-compact min-w-[48px] min-h-[48px] px-4 rounded-xl bg-[#1A1D1A] hover:bg-[#2F352F] disabled:bg-[#E8ECE4] disabled:text-[#919A8D] text-white font-bold flex items-center justify-center shrink-0 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

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
                aria-label={`${spotMenu.name} 바로 추천 설명`}
                className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center pt-16 sm:pt-20 px-0 sm:px-4 pb-0 sm:pb-4 overscroll-none touch-none"
              >
                <motion.div
                  initial={{ y: 28, opacity: 0, scale: 0.97 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: 20, opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full sm:max-w-lg max-h-[78vh] bg-white rounded-t-3xl sm:rounded-3xl border border-[#DCE7CF] shadow-2xl overflow-hidden flex flex-col touch-pan-y"
                >
                  {/* Top Switcher Bar: Switch Between Top Recommendations */}
                  {recommendedSpotlight.menuIds.length > 1 && (
                    <div className="px-4 py-2.5 bg-[#FAFCF8] border-b border-[#E8ECE4] space-y-1.5 shrink-0">
                      <div className="flex items-center justify-between text-xs font-bold text-[#687064]">
                        <span>다른 추천 메뉴 바로 비교</span>
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
                              ref={(el) => {
                                spotlightPillRefs.current[idx] = el;
                              }}
                              type="button"
                              onClick={() => switchSpotlightIndex(idx)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer transition-colors ${
                                isActive
                                  ? 'bg-[#3D5720] text-white'
                                  : 'bg-[#F0F3EC] text-[#4A5048] hover:bg-[#EAF1E2]'
                              }`}
                            >
                              {idx + 1}순위 · {m.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
                          바로 추천 {recommendedSpotlight.activeIndex + 1}순위
                        </span>
                        {isSpeaking && (
                          <span className="px-2.5 py-1 rounded-full bg-white/95 text-[#3D5720] text-xs font-bold inline-flex items-center gap-1 shadow-sm animate-pulse">
                            <AudioLines className="w-3.5 h-3.5 text-[#82B440]" />
                            바로 설명 중
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
                  <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto overscroll-contain touch-pan-y flex-1">
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
                      <h2 className="text-lg sm:text-xl font-bold text-[#1A1D1A] leading-snug">
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
                          <div className="text-base font-bold text-[#3D5720] tabular-nums mt-0.5">
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

                    {/* Same-Store Other Menus Picker inside Spotlight */}
                    {(() => {
                      const spotOtherMenus = (
                        menusByStore.get(spotStore.id) ?? []
                      ).filter(
                        (m) =>
                          m.id !== spotMenu.id && !m.isSoldOut && m.stock >= 1
                      );
                      if (spotOtherMenus.length === 0) return null;
                      const spotExtras = (
                        extraItemsByStore[spotStore.id] ?? []
                      ).filter((it) => it.menuId !== spotMenu.id);
                      return (
                        <div className="p-3.5 rounded-2xl bg-[#FAFCF8] border border-[#DCE7CF] space-y-2.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-[#1A1D1A] inline-flex items-center gap-1.5">
                              <StoreIcon className="w-3.5 h-3.5 text-[#4E6E2A]" />
                              {spotStore.name} 다른 메뉴 함께 추가 (
                              {spotOtherMenus.length}개)
                            </span>
                            {onOpenStoreMenu && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRecommendedSpotlight(null);
                                  onOpenStoreMenu(spotStore.id, {
                                    highlightMenuId: spotMenu.id,
                                    initialServings: spotServings,
                                    initialOptionIds:
                                      stagedOptions[spotMenu.id] ?? [],
                                    preselectHighlight: true,
                                  });
                                }}
                                className="easy-compact text-[11px] font-bold text-[#4E6E2A] hover:underline shrink-0 cursor-pointer"
                              >
                                가게 전체 메뉴 보기 →
                              </button>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            {spotOtherMenus.slice(0, 4).map((other) => {
                              const exQty =
                                spotExtras.find((it) => it.menuId === other.id)
                                  ?.quantity ?? 0;
                              return (
                                <div
                                  key={other.id}
                                  className={`p-2 rounded-xl border flex items-center justify-between gap-2.5 ${
                                    exQty > 0
                                      ? 'bg-[#EAF1E2]/70 border-[#82B440]'
                                      : 'bg-white border-[#E8ECE4]'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-[#E8ECE4] shrink-0">
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
                                      <p className="text-[11px] font-mono font-semibold text-[#4E6E2A] tabular-nums">
                                        {formatWon(getEffectiveMenuPrice(other))}
                                      </p>
                                    </div>
                                  </div>
                                  {exQty === 0 ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        adjustStoreExtraItem(
                                          spotStore.id,
                                          other,
                                          1
                                        )
                                      }
                                      className="easy-compact px-2.5 py-1.5 rounded-lg bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-[11px] font-bold shrink-0 cursor-pointer"
                                    >
                                      + 추가
                                    </button>
                                  ) : (
                                    <div className="inline-flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          adjustStoreExtraItem(
                                            spotStore.id,
                                            other,
                                            -1
                                          )
                                        }
                                        aria-label={`${other.name} 수량 감소`}
                                        className="easy-compact w-7 h-7 rounded-lg bg-white border border-[#D4E1C5] text-xs font-bold cursor-pointer"
                                      >
                                        -
                                      </button>
                                      <span className="w-4 text-center font-mono text-xs font-bold text-[#3D5720]">
                                        {exQty}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          adjustStoreExtraItem(
                                            spotStore.id,
                                            other,
                                            1
                                          )
                                        }
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
                      );
                    })()}

                    {/* Real Customer Reviews (Prominent & Readable) */}
                    <div className="p-3.5 rounded-2xl bg-[#FAFCF8] border border-[#DCE7CF] space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#1A1D1A] inline-flex items-center gap-1.5">
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
                  </div>

                  {/* Sticky Bottom Actions + Always-Visible Mic Status */}
                  <div className="p-4 bg-[#FAFCF8] border-t border-[#E8ECE4] space-y-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={isSpeaking ? handleInterruptToListen : handleMicToggle}
                      className={`w-full px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors border ${
                        isSpeaking
                          ? 'bg-[#EAF1E2] border-[#82B440] text-[#3D5720]'
                          : isListening
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : 'bg-[#F0F3EC] border-[#E8ECE4] text-[#687064] hover:bg-[#EAF1E2]'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5 truncate">
                        {isSpeaking ? (
                          <>
                            <Volume2 className="w-3.5 h-3.5 animate-pulse shrink-0" />
                            <span className="truncate">
                              바로 설명 중 (마이크 꺼짐) · 다 말하면 자동 켜짐
                            </span>
                          </>
                        ) : isListening ? (
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
                        {isSpeaking
                          ? '정지하고 말하기'
                          : isListening
                            ? '끄기'
                            : '켜기'}
                      </span>
                    </button>
                    {(() => {
                      const spotExtras = (
                        extraItemsByStore[spotStore.id] ?? []
                      ).filter((it) => it.menuId !== spotMenu.id);
                      const spotExtrasSubtotal = spotExtras.reduce(
                        (sum, it) => {
                          const m = menuMap.get(it.menuId);
                          return m
                            ? sum + getEffectiveMenuPrice(m) * it.quantity
                            : sum;
                        },
                        0
                      );
                      const combinedSpotTotal = totalWithFee + spotExtrasSubtotal;
                      const combinedSpotItems: CartLineItem[] = [
                        {
                          menuId: spotMenu.id,
                          quantity: spotServings,
                          selectedOptionIds: stagedOptions[spotMenu.id] ?? [],
                        },
                        ...spotExtras,
                      ];

                      return (
                        <div className="space-y-2">
                          {spotExtras.length > 0 && (
                            <div className="flex items-center justify-between text-xs px-1">
                              <span className="font-semibold text-[#3D5720]">
                                기본 + 추가 메뉴 ({combinedSpotItems.length}종)
                              </span>
                              <span className="font-mono font-bold text-[#3D5720] tabular-nums">
                                합계 {formatWon(combinedSpotTotal)}
                              </span>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  spotExtras.length > 0 &&
                                  onAddMultipleToCart
                                ) {
                                  onAddMultipleToCart(
                                    spotStore.id,
                                    combinedSpotItems
                                  );
                                } else if (onAddToCart) {
                                  onAddToCart(spotMenu.id, spotServings, []);
                                } else {
                                  handleStageMenuInChat(spotMenu, spotServings);
                                }
                                setRecommendedSpotlight(null);
                              }}
                              className="min-h-[44px] px-3 py-2.5 rounded-xl border border-[#DCE7CF] bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <ShoppingBag className="w-4 h-4" />
                              <span>
                                {spotExtras.length > 0
                                  ? `장바구니 (${combinedSpotItems.length}종)`
                                  : '장바구니 담기'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRecommendedSpotlight(null);
                                openCheckoutDraftMessage({
                                  menuId: spotMenu.id,
                                  servings: spotServings,
                                  selectedOptionIds:
                                    stagedOptions[spotMenu.id] ?? [],
                                  extraItems: spotExtras,
                                  paymentMethod: 'kakaopay',
                                  customerNote: defaultNote ?? '',
                                });
                              }}
                              className="min-h-[44px] px-3 py-2.5 rounded-xl bg-[#3D5720] hover:bg-[#2F4418] text-white text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <Zap className="w-4 h-4" />
                              <span>
                                {spotExtras.length > 0
                                  ? `${formatWon(combinedSpotTotal)} 바로 주문`
                                  : '이 메뉴 바로 주문'}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
      </AnimatePresence>
    </div>
    </>
  );
}
