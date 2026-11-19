import {
  ExcludedCandidate,
  MenuItem,
  ParsedCondition,
  RecommendationMatch,
  Store,
} from '../types/alle';

const TAG_SYNONYMS: Array<{ patterns: string[]; tag: string }> = [
  { patterns: ['얼큰한', '얼큰', '칼칼한', '칼칼', '매콤한', '매콤', '매운'], tag: '얼큰한' },
  { patterns: ['국물', '탕', '찌개', '해장국', '국밥', '소고기국밥', '따로국밥', '전골'], tag: '국물' },
  { patterns: ['담백한', '담백', '깔끔한', '곰탕'], tag: '담백한' },
  { patterns: ['순한맛', '순한', '안매운', '안맵게', '순하게'], tag: '순한맛' },
  { patterns: ['바삭한', '바삭', '튀김'], tag: '바삭한' },
  { patterns: ['돈까스', '돈가스', '카츠', '까스'], tag: '돈까스' },
  { patterns: ['덮밥', '밥'], tag: '덮밥' },
  { patterns: ['면', '짬뽕', '짜장', '짜장면', '국수', '우동'], tag: '면' },
  { patterns: ['한식'], tag: '한식' },
  { patterns: ['중식'], tag: '중식' },
  { patterns: ['일식'], tag: '일식' },
  { patterns: ['해물', '해산물', '낙지', '알곤이'], tag: '해물' },
  { patterns: ['고기', '소고기', '돼지', '제육', '차돌', '갈비', '찜갈비'], tag: '고기' },
  { patterns: ['찌개', '순두부', '순두부찌개', '김치찌개'], tag: '찌개' },
  { patterns: ['해장', '해장국', '국밥'], tag: '해장' },
];

const STOPWORDS = new Set([
  '성인',
  '어른',
  '총액',
  '예산',
  '가격',
  '금액',
  '이하',
  '이내',
  '까지',
  '안',
  '안에',
  '정도',
  '시간',
  '배달',
  '음식',
  '메뉴',
  '추천',
  '추천해줘',
  '해줘',
  '찾아줘',
  '보여줘',
  '먹고',
  '싶어요',
  '원',
  '분',
  '명',
  '인분',
  '인',
]);

export function parseConditionInput(rawInput: string): ParsedCondition {
  const normalized = rawInput.trim();
  let working = normalized;

  // 1. Parse headcount / servings
  let servings = 2;
  const countMatch = working.match(/(\d+)\s*(명|인분|인)/);
  if (countMatch) {
    const parsedCount = parseInt(countMatch[1], 10);
    if (Number.isInteger(parsedCount) && parsedCount > 0) {
      servings = parsedCount;
    }
    working = working.replace(countMatch[0], ' ');
  } else if (/(혼자|혼밥|1인)/.test(working)) {
    servings = 1;
    working = working.replace(/(혼자|혼밥|1인)/g, ' ');
  } else if (/(둘이|커플)/.test(working)) {
    servings = 2;
    working = working.replace(/(둘이|커플)/g, ' ');
  }

  // 2. Parse budget (Korean Won)
  let maxBudget: number | null = null;
  const manWonMatch = working.match(/(\d+(?:\.\d+)?)\s*만\s*원(?:\s*(?:이하|이내|까지))?/);
  const wonMatch = working.match(/([\d,]+)\s*원(?:\s*(?:이하|이내|까지))?/);
  if (manWonMatch) {
    maxBudget = Math.round(parseFloat(manWonMatch[1]) * 10000);
    working = working.replace(manWonMatch[0], ' ');
  } else if (wonMatch) {
    const num = parseInt(wonMatch[1].replace(/,/g, ''), 10);
    if (Number.isInteger(num) && num > 0) {
      maxBudget = num;
    }
    working = working.replace(wonMatch[0], ' ');
  }

  // 3. Parse estimated time (minutes)
  let maxMinutes: number | null = null;
  const minMatch = working.match(/(\d+)\s*분(?:\s*(?:이내|이하|까지|안))?/);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    if (Number.isInteger(mins) && mins > 0) {
      maxMinutes = mins;
    }
    working = working.replace(minMatch[0], ' ');
  }

  // 4. Match known tags from synonym dictionary
  const matchedTags: string[] = [];
  const rawTokens = working
    .split(/[,\s/·+]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const unknownTokens: string[] = [];

  for (const token of rawTokens) {
    if (STOPWORDS.has(token)) {
      continue;
    }

    let tokenMatched = false;
    for (const entry of TAG_SYNONYMS) {
      if (
        entry.patterns.some(
          (p) => token === p || (token.length >= 2 && token.includes(p))
        )
      ) {
        if (!matchedTags.includes(entry.tag)) {
          matchedTags.push(entry.tag);
        }
        tokenMatched = true;
      }
    }

    if (!tokenMatched) {
      unknownTokens.push(token);
    }
  }

  return {
    rawInput: normalized,
    servings,
    tags: matchedTags,
    maxBudget,
    maxMinutes,
    unknownTokens,
    needsConfirmation: unknownTokens.length > 0,
  };
}

export function evaluateRecommendations(
  condition: ParsedCondition,
  stores: Store[],
  menus: MenuItem[]
): {
  matches: RecommendationMatch[];
  excluded: ExcludedCandidate[];
} {
  const storeMap = new Map(stores.map((s) => [s.id, s]));
  const matches: RecommendationMatch[] = [];
  const excluded: ExcludedCandidate[] = [];

  const validServings = Math.max(1, Math.floor(condition.servings || 1));

  for (const menu of menus) {
    const store = storeMap.get(menu.storeId);
    if (!store) continue;

    const reasons: string[] = [];
    const effectiveMinutes = menu.estimatedMinutes + (store.extraPrepMinutes ?? 0);

    if (!store.isOpen) {
      reasons.push('영업 중단 상태');
    }
    if (menu.isSoldOut || menu.stock <= 0) {
      reasons.push('품절');
    } else if (menu.stock < validServings) {
      reasons.push(`재고 부족 (남은 수량 ${menu.stock}개 < 요청 ${validServings}인분)`);
    }

    const menuSubtotal = menu.pricePerPerson * validServings;
    const estimatedTotal = menuSubtotal + store.deliveryFee;

    if (condition.maxBudget !== null && estimatedTotal > condition.maxBudget) {
      reasons.push(
        `예산 초과 (${estimatedTotal.toLocaleString('ko-KR')}원 > ${condition.maxBudget.toLocaleString('ko-KR')}원)`
      );
    }

    if (condition.maxMinutes !== null && effectiveMinutes > condition.maxMinutes) {
      reasons.push(`예상시간 초과 (${effectiveMinutes}분 > ${condition.maxMinutes}분)`);
    }

    const searchableTags = new Set([
      ...menu.tags,
      ...menu.name.split(/\s+/),
    ]);

    const matchedTags = condition.tags.filter((tag) => {
      if (menu.tags.includes(tag)) return true;
      for (const sTag of searchableTags) {
        if (sTag.includes(tag) || tag.includes(sTag)) return true;
      }
      return false;
    });

    if (condition.tags.length > 0 && matchedTags.length === 0) {
      reasons.push(`요청 태그(${condition.tags.join(', ')}) 미일치`);
    }

    if (condition.unknownTokens.length > 0) {
      const directMatch = condition.unknownTokens.some(
        (tok) =>
          menu.name.includes(tok) ||
          menu.description.includes(tok) ||
          menu.tags.some((t) => t.includes(tok))
      );
      if (!directMatch && matchedTags.length === 0) {
        reasons.push(`미확인 키워드('${condition.unknownTokens.join(', ')}') 미일치`);
      }
    }

    if (reasons.length > 0) {
      excluded.push({ menu, store, reasons });
      continue;
    }

    const isSameStorePrice =
      menu.storePrice !== null &&
      menu.comparisonDate !== null &&
      menu.storePrice === menu.pricePerPerson;

    const aiReason =
      menu.aiReason ||
      `${store.areaLabel.split(' · ')[0]} 실시간 조리 가능 + 약 ${effectiveMinutes}분 빠른 도착${
        isSameStorePrice ? ' + 매장 동일가 검증' : ''
      }`;

    matches.push({
      menu,
      store,
      servings: validServings,
      menuSubtotal,
      deliveryFee: store.deliveryFee,
      estimatedTotal,
      effectiveMinutes,
      matchedTags,
      isSameStorePrice,
      aiReason,
    });
  }

  matches.sort((a, b) => {
    if (b.matchedTags.length !== a.matchedTags.length) {
      return b.matchedTags.length - a.matchedTags.length;
    }
    if (a.estimatedTotal !== b.estimatedTotal) {
      return a.estimatedTotal - b.estimatedTotal;
    }
    return a.effectiveMinutes - b.effectiveMinutes;
  });

  return {
    matches: matches.slice(0, 6),
    excluded,
  };
}

export function formatWon(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${safeAmount.toLocaleString('ko-KR')}원`;
}
