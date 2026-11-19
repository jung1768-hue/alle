import { GoogleGenAI } from '@google/genai';
import { AVAILABLE_TAGS } from '../data/seedData';
import { ParsedCondition, Review } from '../types/alle';
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
    const prompt = `당신은 한국 로컬 배달앱 'alle'의 AI 주문 파서입니다.
사용자의 자연어 주문 요청을 분석해 아래 JSON 형식으로만 응답하세요.

사용 가능한 표준 태그 목록:
${AVAILABLE_TAGS.join(', ')}

이전 대화 조건(참고용):
${
  previousCondition
    ? JSON.stringify({
        servings: previousCondition.servings,
        tags: previousCondition.tags,
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
  "maxBudget": number | null (총액 예산 원 단위, 언급 없으면 null),
  "maxMinutes": number | null (도착 제한 시간 분 단위, 언급 없으면 null),
  "conversationalReply": string (사용자의 상황과 컨디션에 공감하며 메뉴를 제안하는 1~2문장의 자연스러운 한국어 안내)
}`;

    const text = await generateGeminiText({ prompt, temperature: 0.2 });

    const data = extractJsonObject<{
      servings?: number;
      tags?: string[];
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

    const condition: ParsedCondition = {
      rawInput: rawInput.trim(),
      servings:
        typeof data.servings === 'number' && data.servings >= 1
          ? Math.round(data.servings)
          : ruleFallback.servings,
      tags: validTags.length > 0 ? validTags : ruleFallback.tags,
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
      needsConfirmation: validTags.length === 0 && ruleFallback.needsConfirmation,
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
