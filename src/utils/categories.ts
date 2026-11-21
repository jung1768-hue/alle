import { MenuItem, Store } from '../types/alle';

export type PlatformCategoryId =
  | 'all'
  | 'korean'
  | 'chicken'
  | 'chinese'
  | 'japanese'
  | 'western'
  | 'snack'
  | 'cafe'
  | 'market'
  | 'convenience'
  | 'closing';

export interface PlatformCategoryDef {
  id: PlatformCategoryId;
  label: string;
  shortLabel: string;
  emoji: string;
  description: string;
}

export const PLATFORM_CATEGORIES: PlatformCategoryDef[] = [
  {
    id: 'all',
    label: '전체',
    shortLabel: '전체',
    emoji: '🍽️',
    description: '배달 가능한 모든 동네 맛집',
  },
  {
    id: 'korean',
    label: '한식·국밥',
    shortLabel: '한식·국밥',
    emoji: '🍲',
    description: '국밥·찌개·찜갈비·덮밥',
  },
  {
    id: 'chicken',
    label: '치킨',
    shortLabel: '치킨',
    emoji: '🍗',
    description: '후라이드·양념·순살·통닭',
  },
  {
    id: 'chinese',
    label: '중식·마라',
    shortLabel: '중식·마라',
    emoji: '🥟',
    description: '짜장·짬뽕·마라탕·아시안',
  },
  {
    id: 'japanese',
    label: '일식·돈까스',
    shortLabel: '일식·돈까스',
    emoji: '🍱',
    description: '초밥·돈카츠·규동·우동',
  },
  {
    id: 'western',
    label: '피자·양식',
    shortLabel: '피자·양식',
    emoji: '🍕',
    description: '피자·수제버거·파스타·샐러드',
  },
  {
    id: 'snack',
    label: '분식·야식',
    shortLabel: '분식·야식',
    emoji: '🌶️',
    description: '떡볶이·족발·보쌈·곱창',
  },
  {
    id: 'cafe',
    label: '카페·디저트',
    shortLabel: '카페·디저트',
    emoji: '☕',
    description: '커피·케이크·베이커리·크로플',
  },
  {
    id: 'market',
    label: '전통시장',
    shortLabel: '전통시장',
    emoji: '🧺',
    description: '최소주문 0원 · 시장 골목 점포',
  },
  {
    id: 'convenience',
    label: '편의점·간편식',
    shortLabel: '편의점',
    emoji: '🏪',
    description: '도시락·생필품·컵라면',
  },
  {
    id: 'closing',
    label: '마감특가',
    shortLabel: '마감특가',
    emoji: '🔥',
    description: '잔여 수량 최대 30% 즉시 할인',
  },
];

export const POPULAR_SEARCH_KEYWORDS = [
  '국밥',
  '치킨',
  '짜장면',
  '돈까스',
  '떡볶이',
  '마라탕',
  '카페',
  '족발',
  '피자',
  '김치찌개',
] as const;

function matchesStoreGroupForCategory(
  categoryId: Exclude<PlatformCategoryId, 'all' | 'closing'>,
  store: Store,
  menu?: MenuItem
): boolean {
  const grp = store.categoryGroup ?? '';
  const storeText = `${store.name} ${store.category} ${grp}`.toLowerCase();
  const menuText = menu ? `${menu.name} ${menu.tags.join(' ')}`.toLowerCase() : '';

  switch (categoryId) {
    case 'korean':
      return (
        grp.includes('한식') ||
        (menu ? menu.tags.includes('한식') : false)
      );
    case 'chicken': {
      if (grp === '치킨') return true;
      if (grp === '치킨/피자/버거') {
        const looksPizzaBurgerOnly =
          /(피자|버거|햄버거|파스타)/.test(storeText) &&
          !/(치킨|통닭|닭|후라이드|양념|순살|치맥|윙)/.test(storeText);
        if (looksPizzaBurgerOnly) return false;
        return (
          /(치킨|통닭|닭|후라이드|양념|순살|윙|바베큐)/.test(storeText) ||
          (menu ? menu.tags.includes('치킨') || /치킨|통닭|닭/.test(menuText) : true)
        );
      }
      return menu ? menu.tags.includes('치킨') : false;
    }
    case 'chinese':
      return (
        grp.includes('중식') ||
        grp.includes('아시안') ||
        (menu ? menu.tags.includes('중식') || menu.tags.includes('마라') : false)
      );
    case 'japanese':
      return (
        grp.includes('일식') ||
        grp.includes('돈까스') ||
        grp.includes('돈가스') ||
        (menu
          ? menu.tags.includes('일식') ||
            menu.tags.includes('돈까스') ||
            menu.tags.includes('초밥')
          : false)
      );
    case 'western': {
      if (grp.includes('피자') || grp.includes('양식') || grp.includes('버거')) {
        if (grp === '치킨/피자/버거') {
          const looksChickenOnly =
            /(치킨|통닭|닭|후라이드|양념|순살|찜닭)/.test(storeText) &&
            !/(피자|버거|햄버거|파스타|스테이크)/.test(storeText);
          if (looksChickenOnly && !(menu && (menu.tags.includes('피자') || menu.tags.includes('버거') || menu.tags.includes('양식')))) {
            return false;
          }
          return (
            /(피자|버거|햄버거|파스타|양식|샐러드|스테이크)/.test(storeText) ||
            (menu
              ? menu.tags.includes('피자') ||
                menu.tags.includes('버거') ||
                menu.tags.includes('양식') ||
                menu.tags.includes('파스타') ||
                menu.tags.includes('샐러드')
              : false)
          );
        }
        return true;
      }
      return menu
        ? menu.tags.includes('양식') ||
            menu.tags.includes('피자') ||
            menu.tags.includes('버거') ||
            menu.tags.includes('파스타') ||
            menu.tags.includes('샐러드')
        : false;
    }
    case 'snack':
      return (
        grp.includes('분식') ||
        grp.includes('야식') ||
        (menu
          ? menu.tags.includes('분식') ||
            menu.tags.includes('야식') ||
            menu.tags.includes('떡볶이') ||
            menu.tags.includes('족발')
          : false)
      );
    case 'cafe':
      return (
        grp.includes('카페') ||
        grp.includes('디저트') ||
        (menu
          ? menu.tags.includes('카페') ||
            menu.tags.includes('디저트') ||
            menu.tags.includes('커피') ||
            menu.tags.includes('케이크')
          : false)
      );
    case 'market':
      return (
        grp.includes('전통시장') ||
        store.name.includes('시장') ||
        store.minOrderAmount === 0
      );
    case 'convenience':
      return (
        grp.includes('편의점') ||
        grp.includes('간편식') ||
        (menu ? menu.tags.includes('편의점') || menu.tags.includes('생필품') : false)
      );
  }
}

export function matchesMenuPlatformCategory(
  categoryId: PlatformCategoryId,
  store: Store,
  menu: MenuItem
): boolean {
  if (categoryId === 'all') return true;
  if (categoryId === 'closing') return (menu.closingDiscountPercent ?? 0) > 0;
  return matchesStoreGroupForCategory(categoryId, store, menu);
}

export function matchesStorePlatformCategory(
  categoryId: PlatformCategoryId,
  store: Store,
  storeMenus: MenuItem[]
): boolean {
  if (categoryId === 'all') return true;
  if (categoryId === 'closing') {
    return storeMenus.some((m) => (m.closingDiscountPercent ?? 0) > 0 && !m.isSoldOut && m.stock > 0);
  }
  if (matchesStoreGroupForCategory(categoryId, store)) return true;
  return storeMenus.some((m) => matchesStoreGroupForCategory(categoryId, store, m));
}
