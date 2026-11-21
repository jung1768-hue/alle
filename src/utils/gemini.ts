import { GoogleGenAI } from '@google/genai';
import { AVAILABLE_TAGS } from '../data/seedData';
import { ParsedCondition, PaymentMethod, Review } from '../types/alle';
import { parseConditionInput } from './parser';

const GEMINI_KEY_STORAGE = 'alle_gemini_api_key';
const MODEL_NAME = 'gemini-3.8-flash';

let serverProxyAvailable: boolean | null = null;
let serverProxyCheckPromise: Promise<boolean> | null = null;

export async function checkServerGeminiAvailable(): Promise<boolean> {
  if (serverProxyAvailable !== null) return serverProxyAvailable;
  if (serverProxyCheckPromise) return serverProxyCheckPromise;

  serverProxyCheckPromise = fetch('/api/gemini', { method: 'GET' })
    .then(async (res) => {
      if (!res.ok) {
        serverProxyAvailable = false;
        return false;
      }
      const json = (await res.json().catch(() => null)) as {
        available?: boolean;
      } | null;
      serverProxyAvailable = Boolean(json?.available);
      return serverProxyAvailable;
    })
    .catch(() => {
      serverProxyAvailable = false;
      return false;
    });

  return serverProxyCheckPromise;
}

export function getGeminiApiKey(): string {
  const envKey = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env?.VITE_GEMINI_API_KEY;
  if (envKey && envKey.trim() && envKey !== 'MY_GEMINI_API_KEY') {
    return envKey.trim();
  }
  try {
    return window.localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setGeminiApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      window.localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
    } else {
      window.localStorage.removeItem(GEMINI_KEY_STORAGE);
    }
  } catch {
    // ignore storage errors
  }
}

export function isServerProxyAvailable(): boolean {
  return serverProxyAvailable === true;
}

export function hasGeminiApiKey(): boolean {
  return getGeminiApiKey().length > 0 || serverProxyAvailable === true;
}

async function generateGeminiText(params: {
  prompt: string;
  inlineData?: { data: string; mimeType: string };
  temperature?: number;
}): Promise<string | null> {
  const clientKey = getGeminiApiKey();
  if (clientKey) {
    const client = new GoogleGenAI({ apiKey: clientKey });
    const contents = params.inlineData
      ? [{ inlineData: params.inlineData }, params.prompt]
      : params.prompt;
    const response = await client.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: {
        responseMimeType: 'application/json',
        temperature: params.temperature ?? 0.2,
      },
    });
    return response.text ?? null;
  }

  const available = await checkServerGeminiAvailable();
  if (!available) return null;

  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`서버 AI 프록시 오류 (${res.status})`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text ?? null;
}

function extractJsonObject<T>(text: string | undefined): T | null {
  if (!text) return null;
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]) as T;
    } catch {
      return null;
    }
  }
}

export interface AiConditionResult {
  condition: ParsedCondition;
  conversationalReply?: string;
  source: 'gemini' | 'rule';
}

export async function parseConditionWithAI(
  rawInput: string,
  previousCondition?: ParsedCondition
): Promise<AiConditionResult> {
  const ruleFallback = parseConditionInput(rawInput);
  if (!hasGeminiApiKey() && !(await checkServerGeminiAvailable())) {
    return { condition: ruleFallback, source: 'rule' };
  }

  try {
    const prompt = `당신은 전국 매장 동일가 배달앱 'alle'의 AI 주문 파서입니다.
사용자의 자연어 주문 요청을 분석해 아래 JSON 형식으로만 응답하세요.

사용 가능한 표준 태그 목록:
${AVAILABLE_TAGS.join(', ')}

이전 대화 조건(참고용):
${
  previousCondition
    ? JSON.stringify({
        servings: previousCondition.servings,
        tags: previousCondition.tags,
        excludeTags: previousCondition.excludeTags ?? [],
        maxBudget: previousCondition.maxBudget,
        maxMinutes: previousCondition.maxMinutes,
      })
    : '없음'
}

사용자 입력: "${rawInput}"

응답 JSON 스키마:
{
  "servings": number (기본 1, 인원 언급 없으면 이전 조건 또는 1),
  "tags": string[] (반드시 위 표준 태그 목록 중에서 의미상 가장 잘 맞는 태그 1~4개 선택. 예: "어제 회식해서 속 쓰린데 안 맵고 따뜻한 거" -> ["해장", "국물", "순한맛", "담백한"]),
  "excludeTags": string[] (제외해야 할 표준 태그 목록. 예: "안 매운", "매운거 빼고" -> ["얼큰한"], 없으면 빈 배열),
  "maxBudget": number | null (총액 예산 원 단위, 언급 없으면 null),
  "maxMinutes": number | null (도착 제한 시간 분 단위, 언급 없으면 null),
  "conversationalReply": string (사용자의 상황과 컨디션에 공감하며 메뉴를 제안하는 1~2문장의 자연스러운 한국어 안내)
}`;

    const text = await generateGeminiText({ prompt, temperature: 0.2 });

    const data = extractJsonObject<{
      servings?: number;
      tags?: string[];
      excludeTags?: string[];
      maxBudget?: number | null;
      maxMinutes?: number | null;
      conversationalReply?: string;
    }>(text ?? undefined);

    if (!data) {
      return { condition: ruleFallback, source: 'rule' };
    }

    const validTags = Array.isArray(data.tags)
      ? data.tags.filter((t) => (AVAILABLE_TAGS as readonly string[]).includes(t))
      : ruleFallback.tags;

    const validExcludeTags = Array.isArray(data.excludeTags)
      ? data.excludeTags.filter((t) =>
          (AVAILABLE_TAGS as readonly string[]).includes(t)
        )
      : ruleFallback.excludeTags ?? [];

    const mergedExcludeTags = Array.from(
      new Set([...(ruleFallback.excludeTags ?? []), ...validExcludeTags])
    );

    const condition: ParsedCondition = {
      rawInput: rawInput.trim(),
      servings:
        typeof data.servings === 'number' && data.servings >= 1
          ? Math.round(data.servings)
          : ruleFallback.servings,
      tags: (validTags.length > 0 ? validTags : ruleFallback.tags).filter(
        (t) => !mergedExcludeTags.includes(t)
      ),
      excludeTags: mergedExcludeTags,
      maxBudget:
        typeof data.maxBudget === 'number' && data.maxBudget > 0
          ? Math.round(data.maxBudget)
          : data.maxBudget === null
          ? null
          : ruleFallback.maxBudget,
      maxMinutes:
        typeof data.maxMinutes === 'number' && data.maxMinutes > 0
          ? Math.round(data.maxMinutes)
          : data.maxMinutes === null
          ? null
          : ruleFallback.maxMinutes,
      unknownTokens: [],
      needsConfirmation:
        validTags.length === 0 &&
        mergedExcludeTags.length === 0 &&
        ruleFallback.needsConfirmation,
    };

    return {
      condition,
      conversationalReply: data.conversationalReply?.trim() || undefined,
      source: 'gemini',
    };
  } catch {
    return { condition: ruleFallback, source: 'rule' };
  }
}

export interface ReviewAiSummary {
  headline: string;
  pros: string[];
  cons: string[];
  recommendationTip: string;
  source: 'gemini' | 'rule';
}

export function buildRuleReviewSummary(reviews: Review[]): ReviewAiSummary {
  const prosMap = new Map<string, number>();
  const consMap = new Map<string, number>();
  let totalRating = 0;

  for (const r of reviews) {
    totalRating += r.rating;
    for (const p of r.prosTags) prosMap.set(p, (prosMap.get(p) ?? 0) + 1);
    for (const c of r.consTags) consMap.set(c, (consMap.get(c) ?? 0) + 1);
  }

  const topPros = Array.from(prosMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, cnt]) => `${tag} (${cnt}건)`);

  const topCons = Array.from(consMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([tag, cnt]) => `${tag} (${cnt}건)`);

  const avg = reviews.length > 0 ? (totalRating / reviews.length).toFixed(1) : '0.0';

  return {
    headline:
      reviews.length > 0
        ? `리뷰 ${reviews.length}건 평균 ${avg}점 · 실주문 검증 요약`
        : '아직 등록된 리뷰가 없습니다.',
    pros: topPros.length > 0 ? topPros : ['전반적으로 무난한 평가'],
    cons: topCons,
    recommendationTip:
      topCons.length > 0
        ? `주문 시 요청 메모에 '${topCons[0].split(' (')[0]}' 관련 취향을 남겨보세요.`
        : '호불호가 거의 없는 안정적인 인기 메뉴입니다.',
    source: 'rule',
  };
}

export async function summarizeReviewsWithAI(
  menuName: string,
  storeName: string,
  reviews: Review[]
): Promise<ReviewAiSummary> {
  const fallback = buildRuleReviewSummary(reviews);
  if (reviews.length === 0) return fallback;

  if (!hasGeminiApiKey() && !(await checkServerGeminiAvailable())) {
    return fallback;
  }

  try {
    const compactReviews = reviews
      .slice(0, 12)
      .map(
        (r) =>
          `[${r.rating}점] ${r.content} (장점: ${r.prosTags.join(', ') || '없음'}, 아쉬운점: ${
            r.consTags.join(', ') || '없음'
          })`
      )
      .join('\n');

    const prompt = `다음은 "${storeName}"의 "${menuName}" 메뉴에 대한 실제 주문자 리뷰입니다.
리뷰를 객관적으로 요약하여 JSON으로 응답하세요.

리뷰 목록:
${compactReviews}

응답 JSON 스키마:
{
  "headline": "한 줄 핵심 요약 (25자 이내)",
  "pros": ["핵심 장점 1", "핵심 장점 2"],
  "cons": ["아쉬운 점이나 주의할 점 (없으면 빈 배열)"],
  "recommendationTip": "주문자 맞춤 팁 한 문장"
}`;

    const text = await generateGeminiText({ prompt, temperature: 0.2 });

    const data = extractJsonObject<{
      headline?: string;
      pros?: string[];
      cons?: string[];
      recommendationTip?: string;
    }>(text ?? undefined);

    if (!data || !data.headline) return fallback;

    return {
      headline: data.headline,
      pros: Array.isArray(data.pros) && data.pros.length > 0 ? data.pros : fallback.pros,
      cons: Array.isArray(data.cons) ? data.cons : fallback.cons,
      recommendationTip: data.recommendationTip || fallback.recommendationTip,
      source: 'gemini',
    };
  } catch {
    return fallback;
  }
}

export interface ExtractedMenuCandidate {
  name: string;
  price: number;
  tags: string[];
  description: string;
}

export async function extractMenusFromImageWithAI(
  base64Data: string,
  mimeType: string
): Promise<ExtractedMenuCandidate[]> {
  if (!hasGeminiApiKey() && !(await checkServerGeminiAvailable())) {
    throw new Error('GEMINI_API_KEY가 설정되어 있지 않습니다.');
  }

  const prompt = `첨부된 음식점 메뉴판/전단지 이미지에서 메뉴명과 가격을 모두 추출해 JSON 배열로 반환하세요.
각 항목 스키마:
{
  "name": "메뉴 이름",
  "price": 숫자(원 단위 정수, 불명확하면 10000),
  "tags": [${AVAILABLE_TAGS.slice(0, 20).map((t) => `"${t}"`).join(', ')} 중에서 어울리는 태그 1~3개],
  "description": "메뉴 한 줄 설명 (20자 이내)"
}
반드시 JSON 배열([...])만 출력하세요.`;

  const text = await generateGeminiText({
    prompt,
    inlineData: { data: base64Data, mimeType },
    temperature: 0.1,
  });

  const parsed = extractJsonObject<ExtractedMenuCandidate[]>(text ?? undefined);
  if (!Array.isArray(parsed)) {
    throw new Error('메뉴판 이미지에서 메뉴를 추출하지 못했습니다.');
  }

  return parsed
    .filter((item) => item && typeof item.name === 'string' && item.name.trim())
    .map((item) => ({
      name: item.name.trim(),
      price:
        typeof item.price === 'number' && item.price >= 1000
          ? Math.round(item.price)
          : 10000,
      tags: Array.isArray(item.tags) && item.tags.length > 0 ? item.tags : ['한식'],
      description:
        typeof item.description === 'string' && item.description.trim()
          ? item.description.trim()
          : '메뉴판 사진 인식으로 등록된 메뉴입니다.',
    }));
}

export interface ParsedOwnerCommand {
  action:
    | 'accept_order'
    | 'start_cooking'
    | 'pickup_order'
    | 'complete_order'
    | 'sold_out'
    | 'restock'
    | 'add_prep_minutes'
    | 'toggle_store'
    | 'unknown';
  targetName?: string;
  value?: number;
  dispatchMode?: 'neighbor_walk' | 'agency_rider';
  summary: string;
}

export async function parseOwnerVoiceCommandWithAI(
  transcript: string,
  storeNames: string[],
  menuNames: string[]
): Promise<ParsedOwnerCommand | null> {
  if (!hasGeminiApiKey() && !(await checkServerGeminiAvailable())) {
    return null;
  }

  try {
    const prompt = `당신은 음식점 주방 핸즈프리 음성 비서입니다.
점주의 음성 명령을 아래 JSON 중 하나로 분류하세요.

가게 목록: ${storeNames.join(', ')}
메뉴 목록: ${menuNames.slice(0, 40).join(', ')}

음성 입력: "${transcript}"

응답 JSON:
{
  "action": "accept_order" | "start_cooking" | "pickup_order" | "complete_order" | "sold_out" | "restock" | "add_prep_minutes" | "toggle_store" | "unknown",
  "targetName": "해당하는 메뉴명 또는 가게명 (없으면 생략)",
  "value": 숫자 (재고 추가 수량 또는 조리 지연 추가 분, 없으면 생략),
  "dispatchMode": "neighbor_walk" | "agency_rider" (pickup_order일 때만),
  "summary": "수행할 작업 한 줄 설명"
}`;

    const text = await generateGeminiText({ prompt, temperature: 0.1 });

    return extractJsonObject<ParsedOwnerCommand>(text ?? undefined);
  } catch {
    return null;
  }
}

export type ChatActionIntent =
  | 'search_food'
  | 'pick_recommended'
  | 'order_current'
  | 'toggle_option'
  | 'change_quantity'
  | 'add_to_cart'
  | 'confirm_checkout'
  | 'cancel_checkout'
  | 'ask_menu_info'
  | 'switch_next'
  | 'chitchat';

export interface ChatTurnUnderstanding {
  action: ChatActionIntent;
  pickedIndex?: number;
  optionIdsToAdd?: string[];
  optionIdsToRemove?: string[];
  servings?: number | null;
  paymentMethod?: PaymentMethod | null;
  customerNote?: string | null;
  searchCondition?: {
    servings?: number;
    tags?: string[];
    excludeTags?: string[];
    maxBudget?: number | null;
    maxMinutes?: number | null;
  };
  replyText: string;
}

export interface ChatTurnContext {
  userInput: string;
  recentMessages: Array<{ sender: 'user' | 'bot'; text: string }>;
  activeAreaName?: string;
  inCheckoutConfirm: boolean;
  activeCondition: ParsedCondition;
  focusedMenu?: {
    id: string;
    name: string;
    storeName: string;
    pricePerPerson: number;
    deliveryFee: number;
    estimatedMinutes: number;
    servings: number;
    selectedOptionIds: string[];
    options: Array<{ id: string; name: string; priceDelta: number }>;
    rating: number;
    reviewSnippet?: string;
  };
  recommendedList?: Array<{
    index: number;
    id: string;
    name: string;
    storeName: string;
    totalEstimate: number;
  }>;
}

export async function understandChatTurnWithAI(
  ctx: ChatTurnContext
): Promise<ChatTurnUnderstanding | null> {
  if (!hasGeminiApiKey() && !(await checkServerGeminiAvailable())) {
    return null;
  }

  try {
    const historyText = ctx.recentMessages
      .slice(-6)
      .map((m) => `${m.sender === 'user' ? '사용자' : '올레'}: ${m.text}`)
      .join('\n');

    const prompt = `당신은 AI 생활주문 플랫폼 'alle(올레)'의 한국어 대화형 주문 어시스턴트입니다.
사용자의 마지막 발화와 직전 대화 맥락, 현재 보고 있는 메뉴/결제 상태를 정확히 이해해 다음에 수행할 액션과 자연스러운 응답을 JSON으로만 반환하세요.

[현재 상태]
- 배달 지역: ${ctx.activeAreaName ?? '대구 수성구 범어동'}
- 결제 확인창 열림 여부(inCheckoutConfirm): ${ctx.inCheckoutConfirm}
- 현재 선택/포커스된 메뉴: ${ctx.focusedMenu ? JSON.stringify(ctx.focusedMenu) : '없음'}
- 직전 추천 메뉴 목록: ${ctx.recommendedList && ctx.recommendedList.length > 0 ? JSON.stringify(ctx.recommendedList) : '없음'}
- 현재 검색 조건: ${JSON.stringify({
      servings: ctx.activeCondition.servings,
      tags: ctx.activeCondition.tags,
      excludeTags: ctx.activeCondition.excludeTags ?? [],
      maxBudget: ctx.activeCondition.maxBudget,
      maxMinutes: ctx.activeCondition.maxMinutes,
    })}
- 사용 가능한 표준 음식 태그: ${AVAILABLE_TAGS.join(', ')}

[최근 대화 기록]
${historyText || '없음'}

[사용자 마지막 발화]
"${ctx.userInput}"

[분류 규칙]
1. order_current: 현재 포커스/추천된 메뉴를 주문하려는 의도 ("이거 주문해줘", "이걸로 할게", "응 시켜줘").
2. confirm_checkout: 결제 확인창(inCheckoutConfirm=true)에서 결제를 승인하거나 결제수단을 말할 때 ("네 결제해줘", "그대로 결제", "카카오페이로 해줘").
3. cancel_checkout: 결제/주문을 취소하거나 보류할 때 ("취소해줘", "잠깐만 그만").
4. toggle_option: 현재 메뉴의 추가 옵션을 넣거나 빼거나, 옵션이 뭐 있는지 물을 때. optionIdsToAdd / optionIdsToRemove에 focusedMenu.options의 정확한 id를 넣으세요.
5. change_quantity: 현재 메뉴 수량(인분)을 바꿀 때 (예: "2인분으로 바꿔줘").
6. pick_recommended: 추천 목록(recommendedList) 중 특정 번호(0부터 시작)나 매장/메뉴를 고를 때.
7. switch_next: 현재 메뉴 말고 다른 추천/다음 메뉴를 보여달라고 할 때 ("다른 거", "이거 말고", "더 싼 거").
8. ask_menu_info: 현재 메뉴의 배달시간, 가격, 배달비, 리뷰 등에 대해 질문할 때. replyText에 현재 상태 숫자로 정확히 답하세요.
9. add_to_cart: 장바구니에 담아달라고 할 때.
10. search_food: 새로운 음식/맛/상황/예산/시간 조건으로 메뉴를 찾을 때 ("매운 떡볶이 먹고 싶어", "만 원 이하 따뜻한 국물"). searchCondition.tags는 반드시 표준 태그 목록에서만 고르세요.
11. chitchat: 인사, 감사, 음식 주문과 무관한 대화.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "action": "search_food" | "pick_recommended" | "order_current" | "toggle_option" | "change_quantity" | "add_to_cart" | "confirm_checkout" | "cancel_checkout" | "ask_menu_info" | "switch_next" | "chitchat",
  "pickedIndex": number | null,
  "optionIdsToAdd": string[],
  "optionIdsToRemove": string[],
  "servings": number | null,
  "paymentMethod": "kakaopay" | "tosspay" | "naverpay" | "card" | "alle_pay" | "daeguro_pay" | "openbanking" | "corporate_meal" | null,
  "customerNote": string | null,
  "searchCondition": {
    "servings": number,
    "tags": string[],
    "excludeTags": string[],
    "maxBudget": number | null,
    "maxMinutes": number | null
  },
  "replyText": string (사용자의 말에 찰떡같이 공감하고 다음 행동을 자연스럽게 안내하는 1~2문장의 한국어 응답)
}`;

    const text = await generateGeminiText({ prompt, temperature: 0.2 });
    const parsed = extractJsonObject<ChatTurnUnderstanding>(text ?? undefined);
    if (!parsed || !parsed.action || !parsed.replyText) {
      return null;
    }
    if (parsed.searchCondition?.tags) {
      parsed.searchCondition.tags = parsed.searchCondition.tags.filter((t) =>
        (AVAILABLE_TAGS as readonly string[]).includes(t)
      );
    }
    if (parsed.searchCondition?.excludeTags) {
      parsed.searchCondition.excludeTags =
        parsed.searchCondition.excludeTags.filter((t) =>
          (AVAILABLE_TAGS as readonly string[]).includes(t)
        );
    }
    return parsed;
  } catch {
    return null;
  }
}
