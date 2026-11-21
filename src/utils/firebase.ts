import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import {
  INITIAL_MENUS,
  INITIAL_STORE_COUPONS,
  INITIAL_STORE_PROMOTIONS,
  INITIAL_STORES,
  resolveBundledImage,
} from '../data/seedData';
import {
  AllePersistedState,
  ErrandRequest,
  MenuItem,
  Order,
  PriceReport,
  ReviewReply,
  Store,
  StoreCoupon,
  StorePromotion,
} from '../types/alle';

const firebaseConfig = {
  apiKey: 'AIzaSyAuhRLegu_AccuNTqendZznYnPAXk7nLdg',
  authDomain: 'alle-ff80c.firebaseapp.com',
  projectId: 'alle-ff80c',
  storageBucket: 'alle-ff80c.firebasestorage.app',
  messagingSenderId: '90789999311',
  appId: '1:90789999311:web:aeaca9369411f232137dba',
  measurementId: 'G-N84593TMD0',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);

if (typeof window !== 'undefined') {
  void isAnalyticsSupported().then((supported) => {
    if (supported) {
      getAnalytics(firebaseApp);
    }
  });
}

export interface SharedOperationalState {
  stores: Store[];
  menus: MenuItem[];
  orders: Order[];
  errands: ErrandRequest[];
  reviewReplies: Record<string, ReviewReply>;
  priceReports: PriceReport[];
  storePromotions: StorePromotion[];
  storeCoupons: StoreCoupon[];
  updatedAt?: number;
}

export type FirebaseSyncStatus = 'connecting' | 'synced' | 'local-fallback';

const SHARED_DOC_REF = doc(db, 'alle_demo', 'shared_state_v8');

const seedStoreById = new Map(INITIAL_STORES.map((s) => [s.id, s]));

export function extractSharedState(
  state: AllePersistedState
): SharedOperationalState {
  return {
    stores: state.stores,
    menus: state.menus,
    orders: state.orders,
    errands: state.errands,
    reviewReplies: state.reviewReplies,
    priceReports: state.priceReports,
    storePromotions: state.storePromotions,
    storeCoupons: state.storeCoupons,
  };
}

function normalizeRemoteSharedState(
  raw: Partial<SharedOperationalState>
): SharedOperationalState | null {
  if (
    !Array.isArray(raw.stores) ||
    !Array.isArray(raw.menus) ||
    !Array.isArray(raw.orders)
  ) {
    return null;
  }

  const mergedStores: Store[] = raw.stores.map((rawS) => {
    const legacyStore = rawS as Store & { minOrderAmount?: number };
    const { minOrderAmount: _removedMinOrder, ...s } = legacyStore;
    const seedStore = seedStoreById.get(rawS.id);
    return {
      ...seedStore,
      ...s,
      region: s.region ?? seedStore?.region,
      deliveryFeeTiers: s.deliveryFeeTiers ?? seedStore?.deliveryFeeTiers,
      image: resolveBundledImage(s.image) || seedStore?.image || s.image,
    };
  });
  const remoteStoreIds = new Set(mergedStores.map((s) => s.id));
  for (const seedStore of INITIAL_STORES) {
    if (!remoteStoreIds.has(seedStore.id)) {
      mergedStores.push(structuredClone(seedStore));
    }
  }

  const seedMenuById = new Map(INITIAL_MENUS.map((m) => [m.id, m]));
  const mergedMenus: MenuItem[] = raw.menus.map((m) => {
    const seedMenu = seedMenuById.get(m.id);
    return {
      ...m,
      image: resolveBundledImage(m.image) || seedMenu?.image || m.image,
      isSideMenu: m.isSideMenu ?? seedMenu?.isSideMenu,
    };
  });
  const remoteMenuIds = new Set(mergedMenus.map((m) => m.id));
  for (const seedMenu of INITIAL_MENUS) {
    if (!remoteMenuIds.has(seedMenu.id)) {
      mergedMenus.push(structuredClone(seedMenu));
    }
  }

  return {
    stores: mergedStores,
    menus: mergedMenus,
    orders: raw.orders,
    errands: Array.isArray(raw.errands) ? raw.errands : [],
    reviewReplies: raw.reviewReplies ?? {},
    priceReports: Array.isArray(raw.priceReports) ? raw.priceReports : [],
    storePromotions: Array.isArray(raw.storePromotions)
      ? raw.storePromotions
      : structuredClone(INITIAL_STORE_PROMOTIONS),
    storeCoupons: Array.isArray(raw.storeCoupons)
      ? raw.storeCoupons
      : structuredClone(INITIAL_STORE_COUPONS),
    updatedAt: raw.updatedAt,
  };
}

export function subscribeSharedState(
  seedState: SharedOperationalState,
  onRemoteState: (remote: SharedOperationalState) => void,
  onStatusChange?: (status: FirebaseSyncStatus, detail?: string) => void
): () => void {
  onStatusChange?.('connecting');

  return onSnapshot(
    SHARED_DOC_REF,
    (snapshot) => {
      if (!snapshot.exists()) {
        void setDoc(SHARED_DOC_REF, {
          ...seedState,
          updatedAt: Date.now(),
        })
          .then(() => onStatusChange?.('synced'))
          .catch((err) =>
            onStatusChange?.(
              'local-fallback',
              err instanceof Error ? err.message : 'Firestore write error'
            )
          );
        return;
      }

      const normalized = normalizeRemoteSharedState(
        snapshot.data() as Partial<SharedOperationalState>
      );
      if (normalized) {
        onRemoteState(normalized);
      }
      onStatusChange?.('synced');
    },
    (error) => {
      onStatusChange?.('local-fallback', error.message);
    }
  );
}

export async function pushSharedState(
  shared: SharedOperationalState
): Promise<boolean> {
  try {
    await setDoc(SHARED_DOC_REF, {
      ...shared,
      updatedAt: Date.now(),
    });
    return true;
  } catch {
    return false;
  }
}
