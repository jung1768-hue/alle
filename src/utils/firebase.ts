import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';
import {
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { INITIAL_STORES, resolveBundledImage } from '../data/seedData';
import {
  AllePersistedState,
  ErrandRequest,
  MenuItem,
  Order,
  PriceReport,
  ReviewReply,
  Store,
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
  updatedAt?: number;
}

export type FirebaseSyncStatus = 'connecting' | 'synced' | 'local-fallback';

const SHARED_DOC_REF = doc(db, 'alle_demo', 'shared_state_v7');

const seedStoreRegionMap = new Map(
  INITIAL_STORES.map((s) => [s.id, s.region])
);

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

  return {
    stores: raw.stores.map((s) => ({
      ...s,
      region: s.region ?? seedStoreRegionMap.get(s.id),
      image: resolveBundledImage(s.image) || s.image,
    })),
    menus: raw.menus.map((m) => ({
      ...m,
      image: resolveBundledImage(m.image) || m.image,
    })),
    orders: raw.orders,
    errands: Array.isArray(raw.errands) ? raw.errands : [],
    reviewReplies: raw.reviewReplies ?? {},
    priceReports: Array.isArray(raw.priceReports) ? raw.priceReports : [],
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
