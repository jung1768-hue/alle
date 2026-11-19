import {
  ExcludedCandidate,
  MenuItem,
  ParsedCondition,
  RecommendationMatch,
  Store,
} from '../types/alle';

interface TagSynonymEntry {
  /** Substring or exact patterns (length >= 2) */
  patterns: string[];
  /** Exact-only patterns (matched against raw token or particle-stripped stem) */
  exactPatterns?: string[];
  /** Canonical tags emitted when matched (first tag is primary) */
  tags: string[];
}

const TAG_SYNONYMS: TagSynonymEntry[] = [
  // 1. 치킨
  {
    patterns: ['치킨', '후라이드', '양념치킨', '순살', '바베큐', '통닭', '치맥', '치밥', '간장마늘'],
    tags: ['치킨'],
  },
  // 2. 중식 / 마라
  {
    patterns: ['마라탕', '마라샹궈', '마라', '꿔바로우'],
    tags: ['마라', '중식'],
  },
  {
    patterns: ['간짜장', '유니짜장', '짜장면', '짜장', '자장면'],
    tags: ['짜장', '중식'],
  },
  {
    patterns: ['탕수육'],
    tags: ['탕수육', '중식'],
  },
  {
    patterns: ['차돌짬뽕', '짬뽕'],
    tags: ['짬뽕', '중식', '국물'],
  },
  {
    patterns: ['중식', '중국집', '중화요리'],
    tags: ['중식'],
  },
  // 3. 일식 / 돈가스 / 초밥 / 회
  {
    patterns: ['연어초밥', '초밥', '스시'],
    tags: ['초밥', '일식'],
  },
  {
    patterns: ['숙성회', '광어회', '연어회', '모둠회', '사시미', '활어회'],
    exactPatterns: ['회'],
    tags: ['회', '일식'],
  },
  {
    patterns: ['돈까스', '돈가스', '등심돈가스', '치즈돈가스', '카츠', '까스'],
    tags: ['돈까스', '일식'],
  },
  {
    patterns: ['규동', '소고기덮밥'],
    tags: ['덮밥', '일식'],
  },
  {
    patterns: ['일식', '우동'],
    tags: ['일식'],
  },
  // 4. 피자 / 버거 / 파스타 / 샐러드
  {
    patterns: ['피자', '불고기피자', '화덕피자'],
    tags: ['피자', '양식'],
  },
  {
    patterns: ['버거', '햄버거', '치즈버거', '수제버거', '트러플버거'],
    tags: ['버거', '양식'],
  },
  {
    patterns: ['파스타', '스파게티', '투움바', '크림파스타'],
    tags: ['파스타', '양식'],
  },
  {
    patterns: ['샐러드', '포케', '닭가슴살', '키토', '그린볼'],
    tags: ['샐러드', '포케', '다이어트'],
  },
  {
    patterns: ['다이어트', '저칼로리', '가볍게', '가벼운', '식단', '헬시', '건강식', '고단백'],
    tags: ['다이어트', '담백한'],
  },
  {
    patterns: ['양식'],
    tags: ['양식'],
  },
  // 5. 분식 / 야식 / 족발 / 전
  {
    patterns: ['떡볶이', '국물떡볶이', '납작만두', '로제떡볶이'],
    tags: ['떡볶이', '분식'],
  },
  {
    patterns: ['김밥', '참치김밥'],
    tags: ['김밥', '분식'],
  },
  {
    patterns: ['라면', '컵라면'],
    tags: ['라면', '분식'],
  },
  {
    patterns: ['분식', '만두', '튀김'],
    tags: ['분식'],
  },
  {
    patterns: ['족발', '불족발'],
    tags: ['족발', '야식'],
  },
  {
    patterns: ['보쌈', '마늘보쌈'],
    tags: ['보쌈', '야식'],
  },
  {
    patterns: ['야식', '안주', '밤참', '늦은밤'],
    tags: ['야식'],
  },
  {
    patterns: ['해물파전', '파전', '모둠전', '김치전', '부침개', '전집'],
    exactPatterns: ['전'],
    tags: ['전'],
  },
  // 6. 카페 / 디저트 / 커피 / 케이크 / 크로플
  {
    patterns: ['커피', '아메리카노', '아아', '카페라떼', '라떼', '말차라떼', '바닐라라떼', '디카페인'],
    tags: ['커피', '카페'],
  },
  {
    patterns: ['케이크', '쇼트케이크', '딸기케이크', '조각케이크', '케익'],
    tags: ['케이크', '디저트', '카페'],
  },
  {
    patterns: ['크로플', '와플', '브라운치즈'],
    tags: ['크로플', '디저트', '카페'],
  },
  {
    patterns: ['달달한', '달달', '달콤한', '달콤', '당충전', '디저트', '간식', '빵'],
    tags: ['달달한', '디저트'],
  },
  {
    patterns: ['카페', '음료'],
    tags: ['카페'],
  },
  // 7. 편의점 / 간편식 / 생필품
  {
    patterns: ['편의점', '스토어', '24시'],
    tags: ['편의점', '간편식'],
  },
  {
    patterns: ['도시락', '삼각김밥', '간편식', '간단히', '간단하게'],
    tags: ['도시락', '편의점', '간편식'],
  },
  {
    patterns: ['생필품', '생수', '물티슈', '휴지', '치약'],
    tags: ['생필품', '편의점'],
  },
  // 8. 한식 / 국밥 / 찜 / 찌개 / 덮밥
  {
    patterns: ['갈비탕', '수성갈비탕', '왕갈비탕'],
    tags: ['갈비탕', '국물', '한식'],
  },
  {
    patterns: ['찜갈비', '매운찜갈비', '갈비찜', '동인동'],
    tags: ['찜갈비', '한식'],
  },
  {
    patterns: ['사골국밥', '소고기국밥', '따로국밥', '국밥', '곰탕', '수육국밥'],
    tags: ['국밥', '국물', '한식'],
  },
  {
    patterns: ['김치찌개', '묵은지'],
    tags: ['김치찌개', '찌개', '국물'],
  },
  {
    patterns: ['순두부찌개', '순두부'],
    tags: ['순두부', '찌개', '국물'],
  },
  {
    patterns: ['제육덮밥', '제육볶음', '제육'],
    tags: ['제육', '덮밥', '한식'],
  },
  {
    patterns: ['낙지덮밥', '낙지'],
    tags: ['덮밥', '해물'],
  },
  {
    patterns: ['덮밥'],
    exactPatterns: ['밥'],
    tags: ['덮밥'],
  },
  {
    patterns: ['얼큰한', '얼큰', '칼칼한', '칼칼', '매콤한', '매콤', '매운', '맵게', '화끈한'],
    tags: ['얼큰한'],
  },
  {
    patterns: ['국물', '해장국', '전골', '뜨끈한', '따뜻한', '따끈한'],
    exactPatterns: ['탕'],
    tags: ['국물'],
  },
  {
    patterns: ['찌개'],
    tags: ['찌개', '국물'],
  },
  {
    patterns: ['담백한', '담백', '깔끔한', '속편한', '부담없는'],
    tags: ['담백한'],
  },
  {
    patterns: ['순한맛', '순한', '안매운', '안맵게', '순하게'],
    tags: ['순한맛'],
  },
  {
    patterns: ['바삭한', '바삭'],
    tags: ['바삭한'],
  },
  {
    patterns: ['국수', '면요리'],
    exactPatterns: ['면'],
    tags: ['면'],
  },
  {
    patterns: ['한식', '백반', '정식'],
    tags: ['한식'],
  },
  {
    patterns: ['해물', '해산물', '알곤이', '오징어', '새우'],
    tags: ['해물'],
  },
  {
    patterns: ['고기', '소고기', '돼지', '차돌', '갈비'],
    tags: ['고기'],
  },
  {
    patterns: ['해장', '숙취'],
    tags: ['해장', '국물'],
  },
];

// High-specificity dish/category tags get stronger ranking weight than broad traits
const SPECIFIC_TAGS = new Set([
  '치킨',
  '마라',
  '짜장',
  '탕수육',
  '짬뽕',
  '초밥',
  '회',
  '돈까스',
  '피자',
  '버거',
  '파스타',
  '샐러드',
  '포케',
  '다이어트',
  '떡볶이',
  '김밥',
  '라면',
  '족발',
  '보쌈',
  '전',
  '커피',
  '케이크',
  '크로플',
  '편의점',
  '도시락',
  '생필품',
  '갈비탕',
  '찜갈비',
  '국밥',
  '김치찌개',
  '순두부',
  '제육',
]);

const MEDIUM_TAGS = new Set([
  '국물',
  '덮밥',
  '찌개',
  '카페',
  '디저트',
  '달달한',
  '분식',
  '야식',
  '간편식',
  '해장',
  '중식',
  '일식',
  '양식',
]);

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
  '배달되는',
  '배달해줘',
  '음식',
  '메뉴',
  '추천',
  '추천해줘',
  '추천해요',
  '해줘',
  '해주세요',
  '시켜줘',
  '시켜',
  '주문',
  '주문해줘',
  '찾아줘',
  '보여줘',
  '알려줘',
  '골라줘',
  '먹고',
  '먹을',
  '먹을래',
  '먹을까',
  '먹자',
  '먹지',
  '먹기',
  '싶어',
  '싶어요',
  '싶다',
  '땡기네',
  '땡겨',
  '땡긴다',
  '땡기는데',
  '끌리네',
  '끌려',
  '좋겠어',
  '어때',
  '지금',
  '오늘',
  '저녁',
  '점심',
  '아침',
  '빠르게',
  '빨리',
  '바로',
  '같이',
  '함께',
  '뭐',
  '좀',
  '하나',
  '곳',
  '집',
  '비',
  '오는데',
  '오는',
  '오는날',
  '날씨',
  '날',
  '반반',
  '반반으로',
  '세트',
  '세트로',
  '원',
  '분',
  '명',
  '인분',
  '인',
]);

const MULTI_CHAR_PARTICLES =
  /(이랑|이나|으로|에서|하고|까지|부터|처럼|보다|인데|는데|은데|이요|해요)$/;

const SINGLE_CHAR_PARTICLES = /[랑나로을를이가은는도만에의와과]$/;

function stripKoreanParticle(token: string): string {
  const multiStripped = token.replace(MULTI_CHAR_PARTICLES, '');
  if (multiStripped.length >= 1 && multiStripped !== token) {
    return multiStripped;
  }
  if (token.length >= 3 && SINGLE_CHAR_PARTICLES.test(token)) {
    return token.slice(0, -1);
  }
  if (
    token.length === 2 &&
    /[랑나로을를이가은는도만]$/.test(token) &&
    !['마라', '피자', '라떼', '보쌈', '김밥', '국밥', '우동', '규동', '포케', '초밥', '파전', '만두', '라면', '치킨', '짜장', '짬뽕', '고기', '국물', '한식', '중식', '일식', '양식', '분식', '야식', '카페', '버거', '덮밥', '제육', '족발', '커피', '생수', '간식'].includes(
      token
    )
  ) {
    return token.slice(0, -1);
  }
  return token;
}

export function parseConditionInput(rawInput: string): ParsedCondition {
  const normalized = rawInput.trim();
  let working = normalized;

  // 1. Parse headcount / servings (default to 1 for natural everyday queries)
  let servings = 1;
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
  } else if (/(셋이)/.test(working)) {
    servings = 3;
    working = working.replace(/(셋이)/g, ' ');
  } else if (/(넷이)/.test(working)) {
    servings = 4;
    working = working.replace(/(넷이)/g, ' ');
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

  // 4. Contextual weather phrase detection (e.g. "비 오는데", "비오는 날")
  const hasRainyContext = /비\s*오(?:는|는데|네|니까|면)?|비오는/.test(working);
  if (hasRainyContext) {
    working = working.replace(/비\s*오(?:는|는데|네|니까|면)?|비오는/g, ' ');
  }

  // 5. Tokenize & match synonym dictionary
  const matchedTags: string[] = [];
  const addTags = (tags: string[]) => {
    for (const tag of tags) {
      if (!matchedTags.includes(tag)) {
        matchedTags.push(tag);
      }
    }
  };

  const cleanedWorking = working.replace(/[.,!?~"'()[\]]+/g, ' ');
  const rawTokens = cleanedWorking
    .split(/[\s,/·+&]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const unknownTokens: string[] = [];

  for (const rawToken of rawTokens) {
    const stem = stripKoreanParticle(rawToken);
    if (STOPWORDS.has(rawToken) || STOPWORDS.has(stem)) {
      continue;
    }

    let tokenMatched = false;
    for (const entry of TAG_SYNONYMS) {
      const exactHit =
        entry.exactPatterns?.some((p) => rawToken === p || stem === p) ?? false;
      const patternHit = entry.patterns.some(
        (p) =>
          rawToken === p ||
          stem === p ||
          (p.length >= 2 && (rawToken.includes(p) || stem.includes(p)))
      );

      if (exactHit || patternHit) {
        addTags(entry.tags);
        tokenMatched = true;
      }
    }

    if (!tokenMatched && stem.length >= 2) {
      unknownTokens.push(rawToken);
    }
  }

  // If user only mentioned rainy weather with no specific dish, default to 전 + 국물
  if (hasRainyContext && matchedTags.length === 0) {
    addTags(['전', '국물']);
  }

  // Only ask for confirmation if we couldn't recognize ANY known food/taste tag
  const needsConfirmation = matchedTags.length === 0 && unknownTokens.length > 0;

  return {
    rawInput: normalized,
    servings,
    tags: matchedTags,
    maxBudget,
    maxMinutes,
    unknownTokens: needsConfirmation ? unknownTokens : [],
    needsConfirmation,
  };
}

function getTagWeight(tag: string): number {
  if (SPECIFIC_TAGS.has(tag)) return 8;
  if (MEDIUM_TAGS.has(tag)) return 3;
  return 2;
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
  const scoredMatches: Array<{ match: RecommendationMatch; score: number }> = [];
  const excluded: ExcludedCandidate[] = [];

  const validServings = Math.max(1, Math.floor(condition.servings || 1));
  const rawLower = condition.rawInput.toLowerCase();

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

    const effectiveUnitPrice = getEffectiveMenuPrice(menu);
    const menuSubtotal = effectiveUnitPrice * validServings;
    const estimatedTotal = menuSubtotal + store.deliveryFee;

    if (condition.maxBudget !== null && estimatedTotal > condition.maxBudget) {
      reasons.push(
        `예산 초과 (${estimatedTotal.toLocaleString('ko-KR')}원 > ${condition.maxBudget.toLocaleString('ko-KR')}원)`
      );
    }

    if (condition.maxMinutes !== null && effectiveMinutes > condition.maxMinutes) {
      reasons.push(`예상시간 초과 (${effectiveMinutes}분 > ${condition.maxMinutes}분)`);
    }

    const searchableMenuName = menu.name.toLowerCase();
    const searchableTagSet = new Set(menu.tags);

    const matchedTags = condition.tags.filter((tag) => {
      if (searchableTagSet.has(tag)) return true;
      if (tag.length >= 2 && searchableMenuName.includes(tag.toLowerCase())) return true;
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
          store.name.includes(tok) ||
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

    // Weighted relevance score: specific dish tags + exact menu/store mentions + store quality
    let score = matchedTags.reduce((sum, tag) => sum + getTagWeight(tag), 0);

    // Bonus when menu name words appear directly in raw input (e.g., "마라탕", "케이크", "족발", "떡볶이")
    for (const token of menu.name.split(/[\s·&/()]+/)) {
      if (token.length >= 2 && rawLower.includes(token.toLowerCase())) {
        score += 6;
      }
    }

    // Small boost for higher rating & faster delivery
    score += ((store.rating ?? 4.8) - 4.5) * 2;
    score += Math.max(0, 35 - effectiveMinutes) * 0.05;

    scoredMatches.push({
      score,
      match: {
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
      },
    });
  }

  scoredMatches.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.01) {
      return b.score - a.score;
    }
    const ratingDiff = (b.match.store.rating ?? 4.8) - (a.match.store.rating ?? 4.8);
    if (Math.abs(ratingDiff) > 0.01) {
      return ratingDiff;
    }
    const reviewDiff = (b.match.store.reviewCount ?? 0) - (a.match.store.reviewCount ?? 0);
    if (reviewDiff !== 0) {
      return reviewDiff;
    }
    return a.match.effectiveMinutes - b.match.effectiveMinutes;
  });

  return {
    matches: scoredMatches.slice(0, 6).map((item) => item.match),
    excluded,
  };
}

export function getEffectiveMenuPrice(menu: Pick<MenuItem, 'pricePerPerson' | 'closingDiscountPercent'>): number {
  const discount = menu.closingDiscountPercent ?? 0;
  if (discount <= 0 || discount >= 100) return menu.pricePerPerson;
  return Math.round((menu.pricePerPerson * (100 - discount)) / 100);
}

export function formatWon(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `${safeAmount.toLocaleString('ko-KR')}원`;
}
