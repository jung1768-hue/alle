import {
  INITIAL_CONDITION_INPUT,
  INITIAL_ERRANDS,
  INITIAL_MENUS,
  INITIAL_ORDERS,
  INITIAL_PREFERENCES,
  INITIAL_REVIEWS,
  INITIAL_SAVED_LOCATIONS,
  INITIAL_STORE_COUPONS,
  INITIAL_STORE_PROMOTIONS,
  INITIAL_STORES,
  INITIAL_ZERO_CLICK_ROUTINE,
  resolveBundledImage,
} from '../data/seedData';
import {
  AllePersistedState,
  MenuItem,
  Review,
  Store,
  StoreCoupon,
  StorePromotion,
} from '../types/alle';

const STORAGE_KEY = 'alle_mvp_nationwide_v8';

export type StorageMode = 'localStorage' | 'memory';

export function getDefaultState(): AllePersistedState {
  return {
    stores: structuredClone(INITIAL_STORES),
    menus: structuredClone(INITIAL_MENUS),
    orders: structuredClone(INITIAL_ORDERS),
    errands: structuredClone(INITIAL_ERRANDS),
    stampCount: 3,
    walletBalance: 35000,
    wishlistIds: ['m1', 'm15', 'm32'],
    preferences: structuredClone(INITIAL_PREFERENCES),
    zeroClickRoutine: structuredClone(INITIAL_ZERO_CLICK_ROUTINE),
    lastConditionInput: INITIAL_CONDITION_INPUT,
    reviews: structuredClone(INITIAL_REVIEWS),
    reviewReplies: {
      r2: {
        text: '[점주 답글] 간이 조금 세게 느껴지셨다니 죄송합니다. 다음 주문 시 메모 남겨주시면 육수를 따로 챙겨드리겠습니다.',
        updatedAt: '2026-11-04',
      },
    },
    priceReports: [],
    savedLocations: structuredClone(INITIAL_SAVED_LOCATIONS),
    selectedLocationId: INITIAL_SAVED_LOCATIONS[0].id,
    storePromotions: structuredClone(INITIAL_STORE_PROMOTIONS),
    storeCoupons: structuredClone(INITIAL_STORE_COUPONS),
    easyMode: true,
  };
}

export function checkLocalStorageAvailable(): boolean {
  try {
    const testKey = '__alle_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function loadDemoState(): {
  state: AllePersistedState;
  storageMode: StorageMode;
} {
  if (!checkLocalStorageAvailable()) {
    return {
      state: getDefaultState(),
      storageMode: 'memory',
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const defaults = getDefaultState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
      return {
        state: defaults,
        storageMode: 'localStorage',
      };
    }

    const parsed = JSON.parse(raw) as Partial<AllePersistedState>;
    if (
      !Array.isArray(parsed.stores) ||
      !Array.isArray(parsed.menus) ||
      !Array.isArray(parsed.orders) ||
      !parsed.preferences
    ) {
      const defaults = getDefaultState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
      return {
        state: defaults,
        storageMode: 'localStorage',
      };
    }

    const storeSeedById = new Map(INITIAL_STORES.map((s) => [s.id, s]));
    const menuSeedById = new Map(INITIAL_MENUS.map((m) => [m.id, m]));

    const migratedStores: Store[] = parsed.stores.map((rawStore) => {
      const legacyStore = rawStore as Store & { minOrderAmount?: number };
      const { minOrderAmount: _removedMinOrder, ...storeRest } = legacyStore;
      const seedStore = storeSeedById.get(rawStore.id);
      return {
        ...seedStore,
        ...storeRest,
        categoryGroup: storeRest.categoryGroup ?? seedStore?.categoryGroup,
        region: storeRest.region ?? seedStore?.region,
        deliveryFeeTiers:
          storeRest.deliveryFeeTiers ?? seedStore?.deliveryFeeTiers,
        rating: storeRest.rating ?? seedStore?.rating,
        reviewCount: storeRest.reviewCount ?? seedStore?.reviewCount,
        image:
          resolveBundledImage(storeRest.image) ||
          seedStore?.image ||
          storeRest.image,
      };
    });

    const existingStoreIds = new Set(migratedStores.map((s) => s.id));
    for (const seedStore of INITIAL_STORES) {
      if (!existingStoreIds.has(seedStore.id)) {
        migratedStores.push(structuredClone(seedStore));
      }
    }

    const migratedMenus: MenuItem[] = parsed.menus.map((menu) => {
      const seedMenu = menuSeedById.get(menu.id);
      return {
        ...menu,
        image:
          resolveBundledImage(menu.image) ||
          seedMenu?.image ||
          storeSeedById.get(menu.storeId)?.image ||
          menu.image,
        aiReason: menu.aiReason ?? seedMenu?.aiReason,
        isSideMenu: menu.isSideMenu ?? seedMenu?.isSideMenu,
      };
    });

    const existingMenuIds = new Set(migratedMenus.map((m) => m.id));
    for (const seedMenu of INITIAL_MENUS) {
      if (!existingMenuIds.has(seedMenu.id)) {
        migratedMenus.push(structuredClone(seedMenu));
      }
    }

    let mergedReviews: Review[];
    if (Array.isArray(parsed.reviews)) {
      const existingReviewIds = new Set(parsed.reviews.map((r) => r.id));
      mergedReviews = [...parsed.reviews];
      for (const seedRev of INITIAL_REVIEWS) {
        if (!existingReviewIds.has(seedRev.id)) {
          mergedReviews.push(structuredClone(seedRev));
        }
      }
    } else {
      mergedReviews = structuredClone(INITIAL_REVIEWS);
    }

    return {
      state: {
        stores: migratedStores,
        menus: migratedMenus,
        orders: parsed.orders,
        errands: Array.isArray(parsed.errands) ? parsed.errands : structuredClone(INITIAL_ERRANDS),
        stampCount: typeof parsed.stampCount === 'number' ? parsed.stampCount : 3,
        walletBalance: typeof parsed.walletBalance === 'number' ? parsed.walletBalance : 35000,
        wishlistIds: Array.isArray(parsed.wishlistIds) ? parsed.wishlistIds : ['m1', 'm9'],
        preferences: parsed.preferences,
        zeroClickRoutine:
          parsed.zeroClickRoutine ?? structuredClone(INITIAL_ZERO_CLICK_ROUTINE),
        ownerSaasSubscribed: parsed.ownerSaasSubscribed,
        ownerSaasPlan: parsed.ownerSaasPlan,
        lastConditionInput:
          typeof parsed.lastConditionInput === 'string'
            ? parsed.lastConditionInput
            : INITIAL_CONDITION_INPUT,
        reviews: mergedReviews,
        reviewReplies: parsed.reviewReplies ?? {},
        priceReports: Array.isArray(parsed.priceReports) ? parsed.priceReports : [],
        savedLocations:
          Array.isArray(parsed.savedLocations) && parsed.savedLocations.length > 0
            ? parsed.savedLocations
            : structuredClone(INITIAL_SAVED_LOCATIONS),
        selectedLocationId:
          typeof parsed.selectedLocationId === 'string' &&
          (Array.isArray(parsed.savedLocations) && parsed.savedLocations.length > 0
            ? parsed.savedLocations
            : INITIAL_SAVED_LOCATIONS
          ).some((loc) => loc.id === parsed.selectedLocationId)
            ? parsed.selectedLocationId
            : INITIAL_SAVED_LOCATIONS[0].id,
        storePromotions: Array.isArray(parsed.storePromotions)
          ? (parsed.storePromotions as StorePromotion[])
          : structuredClone(INITIAL_STORE_PROMOTIONS),
        storeCoupons: Array.isArray(parsed.storeCoupons)
          ? (parsed.storeCoupons as StoreCoupon[])
          : structuredClone(INITIAL_STORE_COUPONS),
        easyMode: true,
      },
      storageMode: 'localStorage',
    };
  } catch {
    return {
      state: getDefaultState(),
      storageMode: 'memory',
    };
  }
}

export function saveDemoState(state: AllePersistedState): StorageMode {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return 'localStorage';
  } catch {
    return 'memory';
  }
}

export function resetDemoStorage(): {
  state: AllePersistedState;
  storageMode: StorageMode;
} {
  const defaults = getDefaultState();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    return { state: defaults, storageMode: 'localStorage' };
  } catch {
    return { state: defaults, storageMode: 'memory' };
  }
}
