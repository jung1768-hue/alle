import {
  EXAMPLE_CONDITION_QUERY,
  INITIAL_ERRANDS,
  INITIAL_MENUS,
  INITIAL_ORDERS,
  INITIAL_PREFERENCES,
  INITIAL_SAVED_LOCATIONS,
  INITIAL_STORES,
  resolveBundledImage,
} from '../data/seedData';
import { AllePersistedState, MenuItem, Store } from '../types/alle';

const STORAGE_KEY = 'alle_mvp_demo_state_v6_full_catalog';

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
    lastConditionInput: EXAMPLE_CONDITION_QUERY,
    reviewReplies: {
      r2: {
        text: '[시연 점주 답글] 간이 조금 세게 느껴지셨다니 죄송합니다. 다음 주문 시 메모 남겨주시면 육수를 따로 챙겨드리겠습니다.',
        updatedAt: '2026-11-04',
      },
    },
    priceReports: [],
    savedLocations: structuredClone(INITIAL_SAVED_LOCATIONS),
    selectedLocationId: INITIAL_SAVED_LOCATIONS[0].id,
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

    const migratedStores: Store[] = parsed.stores.map((store) => {
      const seedStore = storeSeedById.get(store.id);
      return {
        ...seedStore,
        ...store,
        categoryGroup: store.categoryGroup ?? seedStore?.categoryGroup,
        minOrderAmount: store.minOrderAmount ?? seedStore?.minOrderAmount,
        rating: store.rating ?? seedStore?.rating,
        reviewCount: store.reviewCount ?? seedStore?.reviewCount,
        image:
          resolveBundledImage(store.image) ||
          seedStore?.image ||
          store.image,
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
      };
    });

    const existingMenuIds = new Set(migratedMenus.map((m) => m.id));
    for (const seedMenu of INITIAL_MENUS) {
      if (!existingMenuIds.has(seedMenu.id)) {
        migratedMenus.push(structuredClone(seedMenu));
      }
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
        lastConditionInput:
          typeof parsed.lastConditionInput === 'string'
            ? parsed.lastConditionInput
            : EXAMPLE_CONDITION_QUERY,
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
