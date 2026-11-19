import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  AudioLines,
  Heart,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { VOICE_TRANSCRIPT_SAMPLES } from '../data/seedData';
import { MenuItem, ParsedCondition, Store } from '../types/alle';
import { hasGeminiApiKey, parseConditionWithAI } from '../utils/gemini';
import {
  evaluateRecommendations,
  formatWon,
  parseConditionInput,
} from '../utils/parser';
import { startKoreanVoiceInput } from '../utils/voice';
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

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  parsed?: ParsedCondition;
  matchedMenuIds?: string[];
  servings?: number;
  isEmptyRelaxPrompt?: boolean;
  stagedMenuId?: string;
  aiSource?: 'gemini' | 'rule';
}

interface AiChatOrderViewProps {
  stores: Store[];
  menus: MenuItem[];
  wishlistIds: string[];
  initialPrompt?: string;
  onToggleWishlist: (menuId: string) => void;
  onBackToHome: () => void;
  onOpenAiSettings?: () => void;
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
}

const COUNSELOR_QUICK_STARTERS = [
  {
    label: '치킨 시켜줘',
    prompt: '치킨 시켜줘',
  },
  {
    label: '마라탕 땡기네',
    prompt: '마라탕 땡기네',
  },
  {
    label: '달달한 커피랑 케이크',
    prompt: '달달한 커피랑 케이크',
  },
  {
    label: '다이어트 샐러드',
    prompt: '다이어트 샐러드',
  },
  {
    label: '야식으로 족발이나 떡볶이',
    prompt: '야식으로 족발이나 떡볶이',
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

  // When the user asks for a brand-new dish/category, reset stale budget/time/servings
  // unless they explicitly included them in the new message.
  if (next.tags.length > 0) {
    return {
      rawInput: trimmed,
      servings: hasExplicitServings ? next.servings : 1,
      tags: next.tags,
      maxBudget: hasExplicitBudget ? next.maxBudget : null,
      maxMinutes: hasExplicitMinutes ? next.maxMinutes : null,
      unknownTokens: next.unknownTokens,
      needsConfirmation: next.needsConfirmation,
    };
  }

  // Follow-up refinement (e.g. "2만원 이하로", "20분 이내", "3명") preserves previous tags
  const mergedTags = /전체|아무거나|상관없/.test(trimmed) ? [] : prev.tags;

  return {
    rawInput: trimmed,
    servings: hasExplicitServings ? next.servings : prev.servings,
    tags: mergedTags,
    maxBudget: hasExplicitBudget ? next.maxBudget : prev.maxBudget,
    maxMinutes: hasExplicitMinutes ? next.maxMinutes : prev.maxMinutes,
    unknownTokens: next.unknownTokens,
    needsConfirmation: next.needsConfirmation,
  };
}

export function AiChatOrderView({
  stores,
  menus,
  wishlistIds,
  initialPrompt,
  onToggleWishlist,
  onBackToHome,
  onOpenAiSettings,
  onOpenRecommendationWithCondition,
  onProceedToConfirm,
}: AiChatOrderViewProps) {
  const [input, setInput] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showVoiceTips, setShowVoiceTips] = useState(false);
  const [stagedServings, setStagedServings] = useState<Record<string, number>>({});
  const [stagedOptions, setStagedOptions] = useState<Record<string, string[]>>({});
  const stopVoiceRef = useRef<(() => void) | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

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
      const evaluated = evaluateRecommendations(parsed, stores, menus);
      const topMatches = evaluated.matches.slice(0, 3);
      let reply = '';
      if (parsed.needsConfirmation && parsed.unknownTokens.length > 0) {
        reply = `말씀하신 ‘${parsed.unknownTokens.join(
          ', '
        )}’ 느낌을 가장 잘 맞추기 위해 아래에서 원하시는 맛을 한 번만 골라주세요.`;
      } else if (topMatches.length === 0) {
        reply =
          '말씀해 주신 조건에 모두 맞는 메뉴가 지금 바로 보이지 않아요. 예산이나 시간을 조금 넓혀서 다시 찾아볼까요?';
      } else {
        reply = `지금 바로 주문 가능한 인기 메뉴 ${topMatches.length}곳을 엄선했어요. 1순위 추천 메뉴는 아래에서 바로 결제하거나 다른 카드를 눌러 변경할 수 있어요.`;
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
    const defaultEval = evaluateRecommendations(defaultParsed, stores, menus);
    return [
      {
        id: 'welcome',
        sender: 'bot',
        text: '안녕하세요! 치킨·마라탕·카페·샐러드·야식까지 대구 인기 맛집 26곳이 입점해 있어요. 오늘 끌리는 음식을 말이나 글로 편하게 말씀해 주시면 최적의 3곳을 바로 골라드릴게요.',
        parsed: defaultParsed,
        matchedMenuIds: defaultEval.matches.slice(0, 3).map((m) => m.menu.id),
        servings: defaultParsed.servings,
      },
    ];
  });

  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const menuMap = useMemo(() => new Map(menus.map((m) => [m.id, m])), [menus]);

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

  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      stopVoiceRef.current?.();
    };
  }, []);

  const runChatQuery = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isAnalyzing) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: trimmed,
    };

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
      const evaluated = evaluateRecommendations(openParsed, stores, menus);
      const topOpen = evaluated.matches.slice(0, 3);
      setActiveCondition(openParsed);
      if (topOpen[0]) {
        setStagedServings((prev) => ({
          ...prev,
          [topOpen[0].menu.id]: Math.min(openParsed.servings, Math.max(1, topOpen[0].menu.stock)),
        }));
      }
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: `b-${Date.now() + 1}`,
          sender: 'bot',
          text: '반갑습니다! 지금 바로 주문할 수 있는 대구 인기 메뉴 3곳을 먼저 보여드릴게요. 치킨·마라탕·카페·야식처럼 원하시는 메뉴를 말씀해 주셔도 좋아요.',
          parsed: openParsed,
          matchedMenuIds: topOpen.map((m) => m.menu.id),
          servings: openParsed.servings,
          stagedMenuId: topOpen[0]?.menu.id,
        },
      ]);
      setInput('');
      return;
    }

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    let merged = mergeConversationalCondition(activeCondition, trimmed);
    let aiSource: 'gemini' | 'rule' = 'rule';
    let aiConversationalReply: string | undefined;

    if (hasGeminiApiKey() && !/초기화|처음부터|새로/.test(trimmed)) {
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
    const evaluated = evaluateRecommendations(merged, stores, menus);
    const topMatches = evaluated.matches.slice(0, 3);

    let botText = '';
    let isEmptyRelaxPrompt = false;

    if (merged.needsConfirmation && merged.unknownTokens.length > 0) {
      botText = `말씀하신 ‘${merged.unknownTokens.join(
        ', '
      )}’에 어울리는 맛을 아래에서 선택해 주시면 바로 정확한 메뉴를 찾아드릴게요.`;
    } else if (topMatches.length === 0) {
      isEmptyRelaxPrompt = true;
      botText = `${merged.servings}인${
        merged.maxBudget ? ` · ${formatWon(merged.maxBudget)} 이하` : ''
      }${
        merged.maxMinutes ? ` · ${merged.maxMinutes}분 이내` : ''
      } 조건을 모두 만족하는 메뉴를 찾지 못했어요. 조건을 조금 넓혀서 다시 찾아드릴까요?`;
    } else if (aiConversationalReply) {
      botText = aiConversationalReply;
    } else {
      const tagPart =
        merged.tags.length > 0 ? ` (${merged.tags.slice(0, 3).join('·')})` : '';
      botText = `${tagPart ? `${tagPart.trim()} ` : ''}조건에 딱 맞는 대구 인기 메뉴 ${topMatches.length}곳을 찾았어요. 1순위 메뉴는 아래에서 바로 결제하실 수 있어요.`;
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
      parsed: merged,
      matchedMenuIds: topMatches.map((m) => m.menu.id),
      servings: merged.servings,
      stagedMenuId: autoStaged?.id,
      isEmptyRelaxPrompt,
      aiSource,
    };

    setMessages((prev) => [...prev, botMsg]);
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
    const evaluated = evaluateRecommendations(confirmed, stores, menus);

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
    const evaluated = evaluateRecommendations(relaxed, stores, menus);
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
        stagedMenuId: item.id,
      },
    ]);
  };

  const handleMicToggle = () => {
    if (isListening) {
      stopVoiceRef.current?.();
      setIsListening(false);
      return;
    }

    setShowVoiceTips(false);
    setIsListening(true);
    stopVoiceRef.current = startKoreanVoiceInput({
      onTranscript: (text) => {
        setIsListening(false);
        runChatQuery(text);
      },
      onUnavailableOrError: () => {
        setIsListening(false);
        setShowVoiceTips(true);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });
  };

  const isAiActive = isListening || isInputFocused || input.trim().length > 0;

  return (
    <div className="max-w-3xl mx-auto os-card rounded-[32px] overflow-hidden flex flex-col min-h-[76vh]">
      {/* Calm AI Studio Header */}
      <div className="px-5 sm:px-7 py-4 bg-white border-b border-[#E8ECE4] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToHome}
            className="min-w-[38px] min-h-[38px] rounded-xl hover:bg-[#F7F8F5] flex items-center justify-center text-[#1A1D1A] cursor-pointer transition-colors"
            aria-label="홈으로 돌아가기"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-[#1A1D1A] tracking-tight">
              AI 컨디션 주문
            </h1>
            <p className="text-xs text-[#687064]">
              자연스럽게 말씀하시면 실시간으로 의도를 파악해 추천해 드립니다
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAiSettings && (
            <button
              type="button"
              onClick={onOpenAiSettings}
              className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors border ${
                hasGeminiApiKey()
                  ? 'bg-[#EAF1E2] border-[#82B440] text-[#3D5720]'
                  : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#687064] hover:text-[#1A1D1A]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{hasGeminiApiKey() ? 'Gemini AI 연결됨' : 'AI 키 설정'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => runChatQuery('초기화')}
            className="min-h-[36px] px-3 py-1 bg-[#F7F8F5] hover:bg-[#EAF1E2] text-[#687064] hover:text-[#4E6E2A] text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>새 대화</span>
          </button>
        </div>
      </div>

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
                      Gemini AI 분석
                    </span>
                  )}
                  <p>{msg.text}</p>

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
                  {matchedMenus.map((item) => {
                    const store = storeMap.get(item.storeId);
                    if (!store) return null;
                    const wished = wishlistIds.includes(item.id);
                    const servings = msg.servings ?? 2;
                    const total = item.pricePerPerson * servings + store.deliveryFee;

                    return (
                      <div
                        key={item.id}
                        className="w-[268px] shrink-0 bg-white border border-[#E8ECE4] hover:border-[#82B440] rounded-2xl p-4 flex flex-col justify-between gap-3.5 shadow-sm transition-colors"
                      >
                        <div className="space-y-3">
                          {/* Soft Sage Green '✨ AI 추천' Badge + aiReason */}
                          <div className="p-2.5 rounded-xl bg-[#EAF1E2] border border-[#DCE7CF] space-y-1">
                            <span className="inline-flex items-center text-[11px] font-bold text-[#3D5720]">
                              ✨ AI 추천
                            </span>
                            {item.aiReason && (
                              <p className="text-[11px] font-medium text-[#3D5720] leading-snug line-clamp-2">
                                {item.aiReason}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="w-15 h-15 rounded-xl overflow-hidden border border-[#E8ECE4] shrink-0">
                              <FoodImage
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
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
                            상세 보기
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStageMenuInChat(item, servings)}
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
                      const optSum = stagedMenu.options
                        .filter((o) => optIds.includes(o.id))
                        .reduce((s, o) => s + o.priceDelta, 0);
                      const estTotal =
                        stagedMenu.pricePerPerson * qty +
                        optSum +
                        stagedStore.deliveryFee;

                      return (
                        <div className="pt-3 border-t border-[#E8ECE4] space-y-3">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs text-[#687064]">
                              배달비 포함 최종 예상 금액
                            </span>
                            <span className="text-lg font-bold font-mono tabular-nums text-[#4E6E2A]">
                              {formatWon(estTotal)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenRecommendationWithCondition(
                                  activeCondition,
                                  stagedMenu.id
                                )
                              }
                              className="min-h-[42px] px-3 py-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs sm:text-sm font-bold rounded-xl cursor-pointer transition-colors"
                            >
                              다른 메뉴 보기
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
            </div>
          );
        })}

        {isListening && (
          <div className="flex justify-end">
            <div className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-800 text-xs font-bold rounded-2xl flex items-center gap-2">
              <Mic className="w-4 h-4" />
              <span>듣고 있어요... 말씀해 주세요</span>
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
              <span>Gemini AI가 컨디션과 조건에 맞는 매장을 분석하고 있어요...</span>
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
                    : 'AI 실시간 추출 의도'}
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
          className={`p-1.5 rounded-2xl bg-[#F7F8F5] border transition-colors flex items-center gap-2 ${
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
            placeholder="원하는 맛, 인원, 도착 시간을 편하게 말씀해 주세요"
            className="flex-1 min-h-[44px] px-2 bg-transparent text-sm text-[#1A1D1A] placeholder:text-[#687064] focus:outline-none"
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
    </div>
  );
}
