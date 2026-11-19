import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Heart,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { VOICE_TRANSCRIPT_SAMPLES } from '../data/seedData';
import { MenuItem, ParsedCondition, Store } from '../types/alle';
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

  // Combine taste + dish tags naturally (e.g. 얼큰한 + 국물 -> #얼큰한국물)
  const remainingTags = [...condition.tags];
  if (remainingTags.includes('얼큰한') && remainingTags.includes('국물')) {
    chips.push({ id: 'tag-spicy-soup', label: '#얼큰한국물', tone: 'primary' });
    remainingTags.splice(remainingTags.indexOf('얼큰한'), 1);
    remainingTags.splice(remainingTags.indexOf('국물'), 1);
  } else if (remainingTags.includes('담백한') && remainingTags.includes('국물')) {
    chips.push({ id: 'tag-mild-soup', label: '#담백한국물', tone: 'primary' });
    remainingTags.splice(remainingTags.indexOf('담백한'), 1);
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
}

interface AiChatOrderViewProps {
  stores: Store[];
  menus: MenuItem[];
  wishlistIds: string[];
  initialPrompt?: string;
  onToggleWishlist: (menuId: string) => void;
  onBackToHome: () => void;
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
    label: '얼큰한 국물 2인분 추천해줘',
    prompt: '성인 2명, 얼큰한 국물, 총액 25,000원 이하, 30분 이내',
  },
  {
    label: '속 편하고 담백한 메뉴 찾아요',
    prompt: '성인 2명, 담백한 순한맛, 총액 28,000원 이하, 30분 이내',
  },
  {
    label: '혼자 빠르게 먹을 덮밥',
    prompt: '1명, 덮밥, 총액 13,000원 이하, 25분 이내',
  },
  {
    label: '아이와 함께 먹을 덜 자극적인 음식',
    prompt: '아이랑 같이, 덜 자극적인 국물, 총액 24,000원 이하, 30분 이내',
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

  const hasExplicitServings = /(\d+|한|두|세|네|혼자|1인)\s*(명|인|분)?/.test(
    trimmed
  );
  const hasExplicitBudget = /(\d[\d,]*)\s*만?\s*원/.test(trimmed);
  const hasExplicitMinutes = /(\d+)\s*분/.test(trimmed);

  // If follow-up only adjusts budget/time/servings without mentioning tags, preserve previous tags
  const mergedTags =
    next.tags.length > 0
      ? next.tags
      : /전체|아무거나|상관없/.test(trimmed)
        ? []
        : prev.tags;

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
  onOpenRecommendationWithCondition,
  onProceedToConfirm,
}: AiChatOrderViewProps) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
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
      let reply = '';
      if (parsed.needsConfirmation && parsed.unknownTokens.length > 0) {
        reply = `말씀하신 ‘${parsed.unknownTokens.join(
          ', '
        )}’ 느낌을 가장 잘 맞추기 위해 아래에서 원하시는 맛을 한 번만 골라주세요.`;
      } else if (evaluated.matches.length === 0) {
        reply =
          '말씀해 주신 조건에 모두 맞는 메뉴가 지금 바로 보이지 않아요. 예산이나 시간을 조금 넓혀서 다시 찾아볼까요?';
      } else {
        reply = `${parsed.servings}인 기준으로 바로 주문 가능한 ${evaluated.matches.length}곳을 찾았어요. 마음에 드는 메뉴를 선택해 보세요.`;
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
          matchedMenuIds: evaluated.matches.map((m) => m.menu.id),
          servings: parsed.servings,
          isEmptyRelaxPrompt:
            !parsed.needsConfirmation && evaluated.matches.length === 0,
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
        text: '안녕하세요! 오늘 어떤 음식이 끌리시나요? 인원이나 예산, 원하시는 맛을 말이나 글로 편하게 말씀해 주시면 딱 맞는 메뉴를 골라드릴게요.',
        parsed: defaultParsed,
        matchedMenuIds: defaultEval.matches.map((m) => m.menu.id),
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

  const runChatQuery = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;

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
      setActiveCondition(openParsed);
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: `b-${Date.now() + 1}`,
          sender: 'bot',
          text: '반갑습니다! 지금 바로 주문할 수 있는 인기 메뉴들을 먼저 보여드릴게요. 매운맛이나 국물, 예산 조건을 추가로 말씀해 주셔도 좋아요.',
          parsed: openParsed,
          matchedMenuIds: evaluated.matches.slice(0, 5).map((m) => m.menu.id),
          servings: openParsed.servings,
        },
      ]);
      setInput('');
      return;
    }

    const merged = mergeConversationalCondition(activeCondition, trimmed);
    setActiveCondition(merged);
    const evaluated = evaluateRecommendations(merged, stores, menus);

    let botText = '';
    let isEmptyRelaxPrompt = false;

    if (merged.needsConfirmation && merged.unknownTokens.length > 0) {
      botText = `말씀하신 ‘${merged.unknownTokens.join(
        ', '
      )}’에 어울리는 맛을 아래에서 선택해 주시면 바로 정확한 메뉴를 찾아드릴게요.`;
    } else if (evaluated.matches.length === 0) {
      isEmptyRelaxPrompt = true;
      botText = `${merged.servings}인${
        merged.maxBudget ? ` · ${formatWon(merged.maxBudget)} 이하` : ''
      }${
        merged.maxMinutes ? ` · ${merged.maxMinutes}분 이내` : ''
      } 조건을 모두 만족하는 메뉴를 찾지 못했어요. 조건을 조금 넓혀서 다시 찾아드릴까요?`;
    } else {
      const tagPart =
        merged.tags.length > 0 ? ` (${merged.tags.join('·')})` : '';
      botText = `${merged.servings}인${tagPart} 기준으로 총 ${evaluated.matches.length}개 메뉴를 찾았어요. 원하시는 메뉴를 골라주시면 주문까지 바로 도와드릴게요.`;
    }

    const botMsg: ChatMessage = {
      id: `b-${Date.now() + 1}`,
      sender: 'bot',
      text: botText,
      parsed: merged,
      matchedMenuIds: evaluated.matches.map((m) => m.menu.id),
      servings: merged.servings,
      isEmptyRelaxPrompt,
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput('');
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

  return (
    <div className="max-w-3xl mx-auto bg-white border border-[#DDE3D7] rounded-3xl overflow-hidden shadow-[0_4px_20px_rgba(20,24,18,0.05)] flex flex-col min-h-[75vh]">
      {/* Counselor Header */}
      <div className="px-4 sm:px-6 py-3.5 bg-white border-b border-[#E6EBE1] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToHome}
            className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-[#F4F6F1] flex items-center justify-center text-[#141812] cursor-pointer"
            aria-label="홈으로 돌아가기"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-[#141812]">
              올이 AI 주문 상담사
            </h1>
            <p className="text-xs text-[#4A5246]">
              음성이나 문장으로 편하게 말씀하시면 맞춤 메뉴를 안내해 드려요
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => runChatQuery('초기화')}
          className="min-h-[36px] px-3 py-1 bg-[#F4F6F1] hover:bg-[#E7EFE1] text-[#374033] text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>새 대화</span>
        </button>
      </div>

      {/* Chat Stream */}
      <div className="flex-1 bg-[#F4F6F1] p-4 sm:p-5 space-y-4 overflow-y-auto">
        {messages.map((msg) => {
          if (msg.sender === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] px-4 py-2.5 bg-[#2E531A] text-white text-sm font-medium rounded-2xl rounded-br-xs shadow-2xs">
                  {msg.text}
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
                <AlleBotIllustration size="sm" />
                <div className="max-w-[88%] bg-white border border-[#DDE3D7] rounded-2xl rounded-tl-xs px-4 py-3 text-sm text-[#141812] leading-relaxed shadow-2xs space-y-2.5">
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
                                className="min-h-[34px] px-3 py-1 bg-white border border-[#C5D8B5] hover:bg-[#E7EFE1] text-[#2E531A] text-xs font-bold rounded-lg cursor-pointer"
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
                        className="min-h-[34px] px-3 py-1 bg-[#E7EFE1] hover:bg-[#D8E6CD] text-[#1F3A11] text-xs font-bold rounded-xl cursor-pointer"
                      >
                        예산 +10,000원
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRelaxInChat(msg.parsed!, 'minutes')}
                        className="min-h-[34px] px-3 py-1 bg-[#E7EFE1] hover:bg-[#D8E6CD] text-[#1F3A11] text-xs font-bold rounded-xl cursor-pointer"
                      >
                        시간 +15분
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRelaxInChat(msg.parsed!, 'all')}
                        className="min-h-[34px] px-3 py-1 bg-[#2E531A] text-white text-xs font-bold rounded-xl cursor-pointer"
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
                      className="min-h-[36px] px-3.5 py-1.5 bg-white hover:bg-[#E7EFE1] border border-[#DDE3D7] text-[#141812] text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Horizontal Recommended Menu Cards */}
              {matchedMenus.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-1 pl-1 sm:pl-12 no-scrollbar">
                  {matchedMenus.map((item, idx) => {
                    const store = storeMap.get(item.storeId);
                    if (!store) return null;
                    const wished = wishlistIds.includes(item.id);
                    const servings = msg.servings ?? 2;
                    const total = item.pricePerPerson * servings + store.deliveryFee;

                    return (
                      <div
                        key={item.id}
                        className="w-[210px] shrink-0 bg-white border border-[#DDE3D7] rounded-2xl p-3 flex flex-col justify-between shadow-2xs"
                      >
                        <div>
                          <div className="relative rounded-xl overflow-hidden aspect-4/3 border border-[#E6EBE1]">
                            <FoodImage
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full"
                            />
                            <button
                              type="button"
                              onClick={() => onToggleWishlist(item.id)}
                              aria-label={`${item.name} 찜하기`}
                              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/95 border border-black/10 flex items-center justify-center shadow-2xs cursor-pointer"
                            >
                              <Heart
                                className={`w-4 h-4 ${
                                  wished
                                    ? 'fill-red-500 text-red-500'
                                    : 'text-[#4A5246]'
                                }`}
                              />
                            </button>
                          </div>

                          <div className="mt-2.5 space-y-0.5">
                            <div className="text-[11px] font-semibold text-[#2E531A] flex items-center gap-1">
                              {idx === 0 && <Sparkles className="w-3 h-3" />}
                              <span>{store.name}</span>
                            </div>
                            <div className="text-sm font-bold text-[#141812] truncate">
                              {item.name}
                            </div>
                            <div className="text-xs text-[#4A5246] tabular-nums">
                              {servings}인 총 {formatWon(total)} · 약{' '}
                              {item.estimatedMinutes + (store.extraPrepMinutes ?? 0)}분
                            </div>
                            {item.aiReason && (
                              <p className="text-[11px] font-medium text-[#2E531A] leading-snug line-clamp-2 pt-1">
                                {item.aiReason}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenRecommendationWithCondition(
                                msg.parsed ?? activeCondition,
                                item.id
                              )
                            }
                            className="min-h-[38px] px-2 py-1.5 bg-[#F4F6F1] hover:bg-[#E7EFE1] text-[#141812] text-xs font-bold rounded-xl cursor-pointer"
                          >
                            가격·리뷰
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStageMenuInChat(item, servings)}
                            className="min-h-[38px] px-2 py-1.5 bg-[#2E531A] hover:bg-[#234113] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>선택하기</span>
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
                  <div className="max-w-md bg-white border border-[#C5D8B5] rounded-2xl p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-[#EBEFEB]">
                          <FoodImage
                            src={stagedMenu.image}
                            alt={stagedMenu.name}
                            className="w-full h-full"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#2E531A]">
                            {stagedStore.name}
                          </div>
                          <div className="text-sm font-bold text-[#141812] truncate">
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
                          className="w-8 h-8 rounded-lg border border-[#CBDCC0] bg-[#F4F6F1] font-bold text-sm cursor-pointer"
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
                          className="w-8 h-8 rounded-lg border border-[#CBDCC0] bg-[#F4F6F1] font-bold text-sm cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {stagedMenu.options.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-[#EBEFEB]">
                        <div className="text-[11px] font-bold text-[#4A5246]">
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
                                    ? 'bg-[#E7EFE1] border-[#6FA33A] text-[#1F3A11]'
                                    : 'bg-[#F4F6F1] border-[#DDE3D7] text-[#374033]'
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
                        <div className="pt-2 border-t border-[#EBEFEB] flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] text-[#4A5246]">
                              배달비 포함 예상 금액
                            </div>
                            <div className="text-base font-bold font-mono tabular-nums text-[#2E531A]">
                              {formatWon(estTotal)}
                            </div>
                          </div>
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
                            className="min-h-[42px] px-4 py-2 bg-[#2E531A] hover:bg-[#234113] text-white text-xs sm:text-sm font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                          >
                            <Zap className="w-4 h-4" />
                            <span>주문 확인하기</span>
                          </button>
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
          <div className="bg-white border border-[#C5D8B5] rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#141812]">
              <span>음성 입력 예시 문장을 눌러 바로 상담해보세요</span>
              <button
                type="button"
                onClick={() => setShowVoiceTips(false)}
                className="text-[#4A5246] cursor-pointer"
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
                  className="px-3 py-1.5 bg-[#F4F6F1] hover:bg-[#E7EFE1] border border-[#DDE3D7] rounded-xl text-xs font-semibold text-[#141812] cursor-pointer"
                >
                  “{s.text}”
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomAnchorRef} />
      </div>

      {/* Real-Time AI Intent Extraction Chip Bar */}
      <div
        aria-live="polite"
        className="px-4 sm:px-5 py-2.5 bg-[#F4F8F0] border-t border-[#D7E4CC] space-y-1.5"
      >
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-bold text-[#2E531A] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isListening
                ? '음성 의도 실시간 분석 중...'
                : input.trim().length > 0
                  ? '입력 문장에서 AI 의도 키워드 추출 중'
                  : 'AI 실시간 추출 의도 키워드'}
            </span>
          </span>
          <span className="font-mono tabular-nums font-semibold text-[#4A5246]">
            {liveIntentChips.length}개 조건 인식
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
          <AnimatePresence mode="popLayout">
            {liveIntentChips.map((chip) => (
              <motion.span
                key={chip.id}
                layout
                initial={{ opacity: 0, scale: 0.85, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: -4 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold tracking-tight whitespace-nowrap tabular-nums ${
                  chip.tone === 'primary'
                    ? 'bg-[#2E531A] text-white'
                    : chip.tone === 'accent'
                      ? 'bg-[#DCE9C8] text-[#1F3A11] border border-[#BED4A2]'
                      : 'bg-white text-[#141812] border border-[#D4E2C4]'
                }`}
              >
                {chip.label}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Counselor Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runChatQuery(input);
        }}
        className="p-3.5 bg-white border-t border-[#E6EBE1] flex items-center gap-2"
      >
        <button
          type="button"
          onClick={handleMicToggle}
          aria-label={isListening ? '음성 중지' : '음성으로 말하기'}
          className={`min-w-[46px] min-h-[46px] rounded-2xl flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
            isListening
              ? 'bg-red-600 text-white'
              : 'bg-[#E7EFE1] hover:bg-[#D8E7CE] text-[#2E531A]'
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
          placeholder="원하는 메뉴, 인원, 예산, 시간을 편하게 말씀해 주세요"
          className="flex-1 min-h-[46px] px-4 bg-[#F4F6F1] border border-[#DDE3D7] rounded-2xl text-sm text-[#141812] placeholder:text-[#5C6657]"
        />

        <button
          type="submit"
          disabled={!input.trim()}
          aria-label="전송"
          className="min-w-[46px] min-h-[46px] rounded-2xl bg-[#2E531A] hover:bg-[#234113] disabled:bg-[#DDE3D7] disabled:text-[#8E968A] text-white flex items-center justify-center shrink-0 cursor-pointer disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
