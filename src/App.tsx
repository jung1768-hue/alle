import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ClipboardList,
  Eye,
  Heart,
  HelpCircle,
  Home,
  MapPin,
  Navigation,
  Presentation,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Store as StoreIcon,
  Truck,
  User,
  X,
} from 'lucide-react';
import { AiChatOrderView } from './components/AiChatOrderView';
import { AlleLogo } from './components/AlleBrand';
import { CategoryBrowseView } from './components/CategoryBrowseView';
import { ConditionHome } from './components/ConditionHome';
import { FutureScopeModal } from './components/FutureScopeModal';
import { GeminiKeyModal } from './components/GeminiKeyModal';
import { LocationPickerModal } from './components/LocationPickerModal';
import { MyHubView } from './components/MyHubView';
import { OrderConfirmationView } from './components/OrderConfirmationView';
import { OrderStatusView } from './components/OrderStatusView';
import { OwnerDashboardView } from './components/OwnerDashboardView';
import { PartnerDashboardView } from './components/PartnerDashboardView';
import {
  QuickPayBottomSheet,
  QuickPayResolvedItem,
} from './components/QuickPayBottomSheet';
import { RecommendationView } from './components/RecommendationView';
import { StoreMenuModal } from './components/StoreMenuModal';
import { SuperAppHubView } from './components/SuperAppHubView';
import { WishlistView } from './components/WishlistView';
import { INITIAL_REVIEWS, PROHIBITED_ERRAND_KEYWORDS } from './data/seedData';
import {
  AllePersistedState,
  CartLineItem,
  CartState,
  ConsumerStep,
  DeliveryNotification,
  DeliveryProgressStage,
  DemoRole,
  DispatchMode,
  ErrandRequest,
  ErrandStatus,
  EvidenceRecord,
  MenuItem,
  Order,
  OrderLineItem,
  OrderStatus,
  ParsedCondition,
  PartnerPlanTier,
  PaymentMethod,
  PriceReport,
  SavedLocation,
  SuperAppTab,
  UserPreferences,
} from './types/alle';
import {
  evaluateRecommendations,
  formatWon,
  getEffectiveMenuPrice,
  parseConditionInput,
} from './utils/parser';
import {
  estimateCompetitorSavings,
  getLocalCurrencyLabel,
} from './utils/pricing';
import { PlatformCategoryId } from './utils/categories';
import { checkServerGeminiAvailable } from './utils/gemini';
import {
  extractSharedState,
  pushSharedState,
  subscribeSharedState,
} from './utils/firebase';
import {
  loadDemoState,
  resetDemoStorage,
  saveDemoState,
  StorageMode,
} from './utils/storage';

const AGENCY_RIDER_NAMES = [
  '김도현 전문 라이더',
  '이준호 전문 라이더',
  '박민수 전문 라이더',
  '정우성 전문 라이더',
  '최지훈 전문 라이더',
  '강태오 전문 라이더',
  '윤성민 전문 라이더',
  '한재현 전문 라이더',
];

const NEIGHBOR_WALKER_NAMES = [
  '박서연 이웃 배달 파트너',
  '김지민 이웃 배달 파트너',
  '이하은 이웃 배달 파트너',
  '최수빈 이웃 배달 파트너',
  '정다은 이웃 배달 파트너',
  '조유진 이웃 배달 파트너',
];

function pickRandomRiderName(mode: DispatchMode): string {
  const pool =
    mode === DispatchMode.AGENCY_RIDER
      ? AGENCY_RIDER_NAMES
      : NEIGHBOR_WALKER_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function formatNowTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

const ALLOWED_NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  [OrderStatus.PENDING]: OrderStatus.ACCEPTED,
  [OrderStatus.ACCEPTED]: OrderStatus.COOKING,
  [OrderStatus.COOKING]: OrderStatus.PICKUP,
  [OrderStatus.PICKUP]: OrderStatus.COMPLETED,
};

function buildMenuFromRawLine(
  storeId: string,
  storeImage: string,
  basePrepMinutes: number,
  rawLine: string,
  idxOffset = 0
): MenuItem {
  const trimmed = rawLine.trim();
  const priceMatch = trimmed.match(/([\d,]+)\s*원/);
  const price = priceMatch
    ? parseInt(priceMatch[1].replace(/,/g, ''), 10)
    : 10000;
  const validPrice = Number.isInteger(price) && price >= 1000 ? price : 10000;

  const parsed = parseConditionInput(trimmed);
  const cleanedName = trimmed
    .replace(/([\d,]+)\s*원/, '')
    .replace(
      /(얼큰한|국물|담백한|순한맛|바삭한|덮밥|면|한식|중식|일식|해물|고기|찌개|해장|돈까스)/g,
      ''
    )
    .trim();

  const menuName = cleanedName || '매장 추가 메뉴';
  return {
    id: `m-custom-${Date.now()}-${idxOffset}`,
    storeId,
    name: menuName,
    description: '매장에서 새로 등록한 메뉴입니다.',
    servingSpec: '1인분 (표준 규격)',
    tags: parsed.tags.length > 0 ? parsed.tags : ['한식'],
    pricePerPerson: validPrice,
    options: [],
    stock: 5,
    isSoldOut: false,
    storePrice: validPrice,
    comparisonDate: formatNowTime().slice(0, 10),
    estimatedMinutes: basePrepMinutes + 8,
    image: storeImage,
    aiReason: `매장 신규 등록 메뉴 · 약 ${basePrepMinutes + 8}분 내 빠른 조리 + 매장 동일가 검증`,
  };
}

export default function App() {
  const initialLoad = useMemo(() => loadDemoState(), []);
  const [appState, setAppState] = useState<AllePersistedState>(initialLoad.state);
  const [storageMode, setStorageMode] = useState<StorageMode>(
    initialLoad.storageMode
  );

  const [role, setRole] = useState<DemoRole>(DemoRole.CONSUMER);
  const [step, setStep] = useState<ConsumerStep>(ConsumerStep.HOME);
  const [superAppTab, setSuperAppTab] = useState<SuperAppTab>(
    SuperAppTab.GROUP_BUY
  );

  const [rawInput, setRawInput] = useState<string>(
    initialLoad.state.lastConditionInput
  );
  const [parsedCondition, setParsedCondition] = useState<ParsedCondition>(() =>
    parseConditionInput(initialLoad.state.lastConditionInput)
  );
  const [activeCondition, setActiveCondition] = useState<ParsedCondition>(() =>
    parseConditionInput(initialLoad.state.lastConditionInput)
  );

  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [confirmDraft, setConfirmDraft] = useState<{
    draftId: string;
    storeId: string;
    items: CartLineItem[];
    couponCode: string;
    sharedDeliveryApplied?: boolean;
    reservationSlot?: string;
    paymentMethod?: PaymentMethod;
  } | null>(null);

  const [cart, setCart] = useState<CartState | null>(null);
  const [pendingCartSwitch, setPendingCartSwitch] = useState<{
    storeId: string;
    storeName: string;
    summaryLabel: string;
    items: CartLineItem[];
  } | null>(null);

  const [browseInitialCategory, setBrowseInitialCategory] =
    useState<PlatformCategoryId>('all');
  const [browseInitialQuery, setBrowseInitialQuery] = useState<string>('');
  const [prevStepBeforeConfirm, setPrevStepBeforeConfirm] =
    useState<ConsumerStep>(ConsumerStep.HOME);
  const [storeMenuModal, setStoreMenuModal] = useState<{
    storeId: string;
    highlightMenuId?: string;
    initialServings?: number;
    initialOptionIds?: string[];
    preselectHighlight?: boolean;
  } | null>(null);

  const [quickPayDraft, setQuickPayDraft] = useState<{
    storeId: string;
    items: CartLineItem[];
    paymentMethod?: PaymentMethod;
    couponCode?: string;
    customerNote?: string;
  } | null>(null);

  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(
    null
  );
  const [aiChatInitialPrompt, setAiChatInitialPrompt] = useState<
    string | undefined
  >(undefined);
  const [showPresenterMode, setShowPresenterMode] = useState<boolean>(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('demo') === '1'
      );
    } catch {
      return false;
    }
  });
  const [showFutureModal, setShowFutureModal] = useState<boolean>(false);
  const [showGeminiModal, setShowGeminiModal] = useState<boolean>(false);
  const [showLocationPicker, setShowLocationPicker] = useState<boolean>(false);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showDemoSwitcher, setShowDemoSwitcher] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deliveryNotifications, setDeliveryNotifications] = useState<
    DeliveryNotification[]
  >([]);
  const [activeDeliveryAlert, setActiveDeliveryAlert] =
    useState<DeliveryNotification | null>(null);
  const [mapFocusRequest, setMapFocusRequest] = useState<{
    orderId: string;
    seq: number;
  } | null>(null);

  const orderSubmitLockRef = useRef<boolean>(false);
  const deliveryTimersRef = useRef<Map<string, number[]>>(new Map());
  const alertDismissTimerRef = useRef<number | null>(null);
  const emittedNotifKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timersMap = deliveryTimersRef.current;
    return () => {
      for (const list of timersMap.values()) {
        for (const id of list) window.clearTimeout(id);
      }
      timersMap.clear();
      if (alertDismissTimerRef.current !== null) {
        window.clearTimeout(alertDismissTimerRef.current);
      }
    };
  }, []);
  const skipNextFirestorePushRef = useRef<boolean>(false);
  const isPopstateNavRef = useRef<boolean>(false);
  const lastHistoryKeyRef = useRef<string>(
    `${DemoRole.CONSUMER}:${ConsumerStep.HOME}:${SuperAppTab.GROUP_BUY}`
  );
  const lastSharedJsonRef = useRef<string>(
    JSON.stringify(extractSharedState(initialLoad.state))
  );

  useEffect(() => {
    window.history.replaceState(
      {
        role: DemoRole.CONSUMER,
        step: ConsumerStep.HOME,
        superAppTab: SuperAppTab.GROUP_BUY,
      },
      '',
      window.location.href
    );

    const handlePopState = (event: PopStateEvent) => {
      const navState = event.state as {
        role?: DemoRole;
        step?: ConsumerStep;
        superAppTab?: SuperAppTab;
      } | null;

      setShowFutureModal(false);
      setShowGeminiModal(false);
      setShowLocationPicker(false);
      setShowNotifications(false);
      setShowDemoSwitcher(false);
      setStoreMenuModal(null);

      if (navState?.role && navState?.step) {
        isPopstateNavRef.current = true;
        lastHistoryKeyRef.current = `${navState.role}:${navState.step}:${
          navState.superAppTab ?? SuperAppTab.GROUP_BUY
        }`;
        setRole(navState.role);
        setStep(navState.step);
        if (navState.superAppTab) {
          setSuperAppTab(navState.superAppTab);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const nextKey = `${role}:${step}:${superAppTab}`;
    if (isPopstateNavRef.current) {
      isPopstateNavRef.current = false;
      lastHistoryKeyRef.current = nextKey;
      return;
    }
    if (nextKey !== lastHistoryKeyRef.current) {
      lastHistoryKeyRef.current = nextKey;
      window.history.pushState(
        { role, step, superAppTab },
        '',
        window.location.href
      );
    }
  }, [role, step, superAppTab]);

  useEffect(() => {
    void checkServerGeminiAvailable();
  }, []);

  useEffect(() => {
    const seedShared = extractSharedState(initialLoad.state);
    const unsubscribe = subscribeSharedState(
      seedShared,
      (remote) => {
        const remoteJson = JSON.stringify(
          extractSharedState({ ...initialLoad.state, ...remote })
        );
        if (remoteJson === lastSharedJsonRef.current) return;
        lastSharedJsonRef.current = remoteJson;
        skipNextFirestorePushRef.current = true;
        setAppState((prev) => ({
          ...prev,
          stores: remote.stores,
          menus: remote.menus,
          orders: remote.orders,
          errands: remote.errands,
          reviewReplies: remote.reviewReplies,
          priceReports: remote.priceReports,
        }));
      }
    );
    return () => unsubscribe();
  }, [initialLoad.state]);

  useEffect(() => {
    const mode = saveDemoState({
      ...appState,
      lastConditionInput: rawInput,
    });
    setStorageMode(mode);

    const shared = extractSharedState(appState);
    const sharedJson = JSON.stringify(shared);
    if (skipNextFirestorePushRef.current) {
      skipNextFirestorePushRef.current = false;
      lastSharedJsonRef.current = sharedJson;
      return;
    }

    if (sharedJson !== lastSharedJsonRef.current) {
      lastSharedJsonRef.current = sharedJson;
      void pushSharedState(shared);
    }
  }, [appState, rawInput]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const activeLocation: SavedLocation = useMemo(() => {
    return (
      appState.savedLocations.find(
        (loc) => loc.id === appState.selectedLocationId
      ) ??
      appState.savedLocations[0] ?? {
        id: 'loc-home',
        label: '우리집',
        areaName: '서울 강남구 역삼동',
        detailAddress: '강남구 역삼동 수령지 A',
        tag: 'home',
      }
    );
  }, [appState.savedLocations, appState.selectedLocationId]);

  const handleSelectLocation = (locationId: string) => {
    const target = appState.savedLocations.find((loc) => loc.id === locationId);
    if (!target) return;
    setAppState((prev) => ({
      ...prev,
      selectedLocationId: target.id,
    }));
    showToast(`위치가 '${target.label} (${target.areaName})'으로 변경되었습니다.`);
  };

  const handleAddLocation = (payload: Omit<SavedLocation, 'id'>) => {
    const newLoc: SavedLocation = {
      ...payload,
      id: `loc-${Date.now()}`,
    };
    setAppState((prev) => ({
      ...prev,
      savedLocations: [newLoc, ...prev.savedLocations],
      selectedLocationId: newLoc.id,
    }));
    showToast(`'${newLoc.label} (${newLoc.areaName})' 위치가 등록 및 적용되었습니다.`);
  };

  const handleDeleteLocation = (locationId: string) => {
    setAppState((prev) => {
      if (prev.savedLocations.length <= 1) return prev;
      const remaining = prev.savedLocations.filter((loc) => loc.id !== locationId);
      const nextSelectedId =
        prev.selectedLocationId === locationId
          ? remaining[0].id
          : prev.selectedLocationId;
      return {
        ...prev,
        savedLocations: remaining,
        selectedLocationId: nextSelectedId,
      };
    });
    showToast('등록된 위치가 삭제되었습니다.');
  };

  const recommendationResult = useMemo(() => {
    const evaluated = evaluateRecommendations(
      activeCondition,
      appState.stores,
      appState.menus,
      activeLocation
    );
    if (
      selectedMenuId &&
      !evaluated.matches.some((m) => m.menu.id === selectedMenuId)
    ) {
      const targetMenu = appState.menus.find((m) => m.id === selectedMenuId);
      const targetStore = targetMenu
        ? appState.stores.find((s) => s.id === targetMenu.storeId)
        : undefined;
      if (targetMenu && targetStore) {
        const servings = Math.max(1, Math.floor(activeCondition.servings || 1));
        const unitPrice = getEffectiveMenuPrice(targetMenu);
        const menuSubtotal = unitPrice * servings;
        const effectiveMinutes =
          targetMenu.estimatedMinutes + (targetStore.extraPrepMinutes ?? 0);
        const isSameStorePrice =
          targetMenu.storePrice !== null &&
          targetMenu.comparisonDate !== null &&
          targetMenu.storePrice === targetMenu.pricePerPerson;
        const savings = estimateCompetitorSavings({
          menuSubtotal,
          originalMenuSubtotal: targetMenu.pricePerPerson * servings,
          deliveryFee: targetStore.deliveryFee,
          originalDeliveryFee: targetStore.deliveryFee,
          couponDiscount: 0,
          isSameStorePrice,
        });

        return {
          matches: [
            {
              menu: targetMenu,
              store: targetStore,
              servings,
              menuSubtotal,
              deliveryFee: targetStore.deliveryFee,
              estimatedTotal: menuSubtotal + targetStore.deliveryFee,
              effectiveMinutes,
              matchedTags: targetMenu.tags.slice(0, 3),
              isSameStorePrice,
              isNearbyArea: true,
              estimatedSavingsVsCompetitor: savings.totalSaved,
              aiReason: targetMenu.aiReason,
            },
            ...evaluated.matches.slice(0, 5),
          ],
          excluded: evaluated.excluded.filter(
            (e) => e.menu.id !== selectedMenuId
          ),
        };
      }
    }
    return evaluated;
  }, [activeCondition, appState.stores, appState.menus, selectedMenuId, activeLocation]);

  const handleRawInputChange = (next: string) => {
    setRawInput(next);
    setParsedCondition(parseConditionInput(next));
  };

  const handleSubmitSearch = (confirmed: ParsedCondition) => {
    setParsedCondition(confirmed);
    setActiveCondition(confirmed);
    const evaluated = evaluateRecommendations(
      confirmed,
      appState.stores,
      appState.menus,
      activeLocation
    );
    setSelectedMenuId(evaluated.matches[0]?.menu.id ?? null);
    setRole(DemoRole.CONSUMER);
    setStep(ConsumerStep.RECOMMEND);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenRecommendationWithCondition = (
    condition: ParsedCondition,
    selectedMenuIdArg?: string
  ) => {
    setParsedCondition(condition);
    setActiveCondition(condition);
    const evaluated = evaluateRecommendations(
      condition,
      appState.stores,
      appState.menus,
      activeLocation
    );
    setSelectedMenuId(selectedMenuIdArg ?? evaluated.matches[0]?.menu.id ?? null);
    setRole(DemoRole.CONSUMER);
    setStep(ConsumerStep.RECOMMEND);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQuickSelectMenu = (menuId: string) => {
    const targetMenu = appState.menus.find((m) => m.id === menuId);
    if (!targetMenu) return;
    const wideCondition: ParsedCondition = {
      rawInput: targetMenu.name,
      servings: Math.min(
        parsedCondition.servings || 1,
        Math.max(1, targetMenu.stock)
      ),
      tags: [],
      excludeTags: [],
      maxBudget: null,
      maxMinutes: null,
      unknownTokens: [],
      needsConfirmation: false,
    };
    setActiveCondition(wideCondition);
    setSelectedMenuId(menuId);
    setRole(DemoRole.CONSUMER);
    setStep(ConsumerStep.RECOMMEND);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleEasyMode = () => {
    setAppState((prev) => {
      const nextEasy = !prev.easyMode;
      showToast(
        nextEasy
          ? '큰 글씨 · 쉬운 모드가 켜졌습니다.'
          : '기본 화면으로 전환되었습니다.'
      );
      return { ...prev, easyMode: nextEasy };
    });
  };

  const mergeCartItems = (
    existing: CartLineItem[],
    incoming: CartLineItem,
    maxStock: number
  ): CartLineItem[] => {
    const sortedIncoming = [...incoming.selectedOptionIds].sort().join(',');
    const idx = existing.findIndex(
      (it) =>
        it.menuId === incoming.menuId &&
        [...it.selectedOptionIds].sort().join(',') === sortedIncoming
    );
    if (idx >= 0) {
      return existing.map((it, i) =>
        i === idx
          ? {
              ...it,
              quantity: Math.min(maxStock, it.quantity + incoming.quantity),
            }
          : it
      );
    }
    return [
      ...existing,
      {
        menuId: incoming.menuId,
        quantity: Math.min(maxStock, Math.max(1, incoming.quantity)),
        selectedOptionIds: [...incoming.selectedOptionIds],
      },
    ];
  };

  const handleOpenBrowse = (options?: {
    category?: PlatformCategoryId;
    query?: string;
  }) => {
    setBrowseInitialCategory(options?.category ?? 'all');
    setBrowseInitialQuery(options?.query ?? '');
    setRole(DemoRole.CONSUMER);
    setStep(ConsumerStep.BROWSE);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenStoreMenu = (
    storeId: string,
    options?: {
      highlightMenuId?: string;
      initialServings?: number;
      initialOptionIds?: string[];
      preselectHighlight?: boolean;
    }
  ) => {
    setStoreMenuModal({
      storeId,
      highlightMenuId: options?.highlightMenuId,
      initialServings: options?.initialServings,
      initialOptionIds: options?.initialOptionIds,
      preselectHighlight: options?.preselectHighlight,
    });
  };

  const handleAddMultipleToCart = (
    storeId: string,
    incomingItems: CartLineItem[],
    options?: { replaceSameStore?: boolean }
  ) => {
    const targetStore = appState.stores.find((s) => s.id === storeId);
    if (!targetStore || !targetStore.isOpen) {
      showToast('해당 매장이 현재 영업 중단 상태입니다.');
      return;
    }
    const menuMap = new Map(appState.menus.map((m) => [m.id, m]));
    const validIncoming = incomingItems.filter((line) => {
      const m = menuMap.get(line.menuId);
      return Boolean(
        m && m.storeId === storeId && !m.isSoldOut && m.stock >= 1 && line.quantity > 0
      );
    });
    if (validIncoming.length === 0) {
      showToast('장바구니에 담을 수 있는 메뉴가 없습니다.');
      return;
    }

    const firstMenu = menuMap.get(validIncoming[0].menuId);
    const summaryLabel =
      validIncoming.length > 1
        ? `${firstMenu?.name ?? '메뉴'} 외 ${validIncoming.length - 1}종`
        : firstMenu?.name ?? '메뉴';

    if (cart && cart.storeId !== targetStore.id && cart.items.length > 0) {
      setPendingCartSwitch({
        storeId: targetStore.id,
        storeName: targetStore.name,
        summaryLabel,
        items: validIncoming.map((it) => {
          const m = menuMap.get(it.menuId)!;
          return {
            menuId: it.menuId,
            quantity: Math.min(Math.max(1, it.quantity), m.stock),
            selectedOptionIds: [...it.selectedOptionIds],
          };
        }),
      });
      return;
    }

    setCart((prev) => {
      if (options?.replaceSameStore && prev?.storeId === targetStore.id) {
        return {
          storeId: targetStore.id,
          items: validIncoming.map((it) => {
            const m = menuMap.get(it.menuId)!;
            return {
              menuId: it.menuId,
              quantity: Math.min(Math.max(1, it.quantity), m.stock),
              selectedOptionIds: [...it.selectedOptionIds],
            };
          }),
        };
      }
      let items = prev && prev.storeId === targetStore.id ? [...prev.items] : [];
      for (const line of validIncoming) {
        const m = menuMap.get(line.menuId);
        if (!m) continue;
        items = mergeCartItems(items, line, m.stock);
      }
      return {
        storeId: targetStore.id,
        items,
      };
    });
    showToast(
      validIncoming.length > 1
        ? `${targetStore.name} ${summaryLabel}이(가) 장바구니에 담겼습니다.`
        : `'${summaryLabel}'이(가) 장바구니에 담겼습니다.`
    );
  };

  const handleAddToCart = (
    menuId: string,
    quantity = 1,
    selectedOptionIds: string[] = []
  ) => {
    const targetMenu = appState.menus.find((m) => m.id === menuId);
    const targetStore = targetMenu
      ? appState.stores.find((s) => s.id === targetMenu.storeId)
      : undefined;
    if (
      !targetMenu ||
      !targetStore ||
      !targetStore.isOpen ||
      targetMenu.isSoldOut ||
      targetMenu.stock < 1
    ) {
      showToast('해당 메뉴가 현재 품절이거나 영업 중단 상태입니다.');
      return;
    }

    if (cart && cart.storeId !== targetStore.id && cart.items.length > 0) {
      setPendingCartSwitch({
        storeId: targetStore.id,
        storeName: targetStore.name,
        summaryLabel: targetMenu.name,
        items: [
          {
            menuId: targetMenu.id,
            quantity: Math.min(Math.max(1, quantity), targetMenu.stock),
            selectedOptionIds: [...selectedOptionIds],
          },
        ],
      });
      return;
    }

    setCart((prev) => {
      const baseItems =
        prev && prev.storeId === targetStore.id ? prev.items : [];
      return {
        storeId: targetStore.id,
        items: mergeCartItems(
          baseItems,
          { menuId: targetMenu.id, quantity, selectedOptionIds },
          targetMenu.stock
        ),
      };
    });
    showToast(`'${targetMenu.name}'이(가) 장바구니에 담겼습니다.`);
  };

  const handleOpenQuickPay = (payload: {
    menuId: string;
    servings: number;
    selectedOptionIds?: string[];
    paymentMethod?: PaymentMethod;
    customerNote?: string;
    couponCode?: string;
  }) => {
    const targetMenu = appState.menus.find((m) => m.id === payload.menuId);
    const targetStore = targetMenu
      ? appState.stores.find((s) => s.id === targetMenu.storeId)
      : undefined;
    if (
      !targetMenu ||
      !targetStore ||
      !targetStore.isOpen ||
      targetMenu.isSoldOut ||
      targetMenu.stock < 1
    ) {
      showToast('해당 메뉴가 현재 품절이거나 영업 중단 상태입니다.');
      return;
    }
    setQuickPayDraft({
      storeId: targetStore.id,
      items: [
        {
          menuId: targetMenu.id,
          quantity: Math.min(Math.max(1, payload.servings), targetMenu.stock),
          selectedOptionIds: payload.selectedOptionIds ?? [],
        },
      ],
      paymentMethod: payload.paymentMethod ?? 'kakaopay',
      couponCode: payload.couponCode,
      customerNote: payload.customerNote ?? appState.preferences.memoNote,
    });
  };

  const handleOpenQuickPayFromOrder = (order: Order) => {
    const targetStore = appState.stores.find((s) => s.id === order.storeId);
    if (!targetStore || !targetStore.isOpen) {
      showToast('해당 매장이 현재 영업 중단 상태입니다.');
      return;
    }
    const rawLines: CartLineItem[] =
      order.items && order.items.length > 0
        ? order.items.map((it) => ({
            menuId: it.menuId,
            quantity: it.quantity,
            selectedOptionIds: [...it.selectedOptionIds],
          }))
        : [
            {
              menuId: order.menuId,
              quantity: order.servings,
              selectedOptionIds: [...order.selectedOptionIds],
            },
          ];

    const validLines = rawLines
      .map((line) => {
        const m = appState.menus.find((item) => item.id === line.menuId);
        if (!m || m.isSoldOut || m.stock < 1) return null;
        return {
          ...line,
          quantity: Math.min(Math.max(1, line.quantity), m.stock),
        };
      })
      .filter((x): x is CartLineItem => x !== null);

    if (validLines.length === 0) {
      showToast('이전 주문 메뉴가 현재 품절 상태입니다.');
      return;
    }

    setQuickPayDraft({
      storeId: targetStore.id,
      items: validLines,
      paymentMethod: order.paymentMethod ?? 'kakaopay',
      couponCode: order.couponCode ?? undefined,
      customerNote: order.customerNote || appState.preferences.memoNote,
    });
  };

  const handleQuickReorderToConfirm = (
    menuId: string,
    servings: number,
    options?: {
      sharedDeliveryApplied?: boolean;
      reservationSlot?: string;
      couponCode?: string;
      selectedOptionIds?: string[];
      paymentMethod?: PaymentMethod;
      customerNote?: string;
    }
  ) => {
    const targetMenu = appState.menus.find((m) => m.id === menuId);
    const targetStore = targetMenu
      ? appState.stores.find((s) => s.id === targetMenu.storeId)
      : undefined;
    if (
      !targetMenu ||
      !targetStore ||
      !targetStore.isOpen ||
      targetMenu.isSoldOut ||
      targetMenu.stock < 1
    ) {
      showToast('해당 메뉴가 현재 품절이거나 영업 중단 상태입니다.');
      return;
    }
    setPrevStepBeforeConfirm(step);
    setConfirmDraft({
      draftId: `draft-${Date.now()}`,
      storeId: targetStore.id,
      items: [
        {
          menuId,
          quantity: Math.min(Math.max(1, servings), targetMenu.stock),
          selectedOptionIds: options?.selectedOptionIds ?? [],
        },
      ],
      couponCode: options?.couponCode ?? 'NONE',
      sharedDeliveryApplied: options?.sharedDeliveryApplied ?? false,
      reservationSlot: options?.reservationSlot ?? 'now',
      paymentMethod: options?.paymentMethod,
    });
    setRole(DemoRole.CONSUMER);
    setStep(ConsumerStep.CONFIRM);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleWishlist = (menuId: string) => {
    setAppState((prev) => {
      const exists = prev.wishlistIds.includes(menuId);
      const nextIds = exists
        ? prev.wishlistIds.filter((id) => id !== menuId)
        : [menuId, ...prev.wishlistIds];
      showToast(
        exists ? '찜 목록에서 제외했습니다.' : '찜 목록에 추가했습니다.'
      );
      return { ...prev, wishlistIds: nextIds };
    });
  };

  const handleTopupWalletConfirmed = (amount: number) => {
    if (!Number.isInteger(amount) || amount <= 0) return;
    setAppState((prev) => ({
      ...prev,
      walletBalance: prev.walletBalance + amount,
    }));
    showToast(`${amount.toLocaleString('ko-KR')}원 충전이 완료되었습니다.`);
  };

  const handleShareDemoSummary = () => {
    const summaryText = `[alle 같은 브라우저 시연 요약] 주문 ${appState.orders.length}건 · 찜 ${appState.wishlistIds.length}개 · 스탬프 ${appState.stampCount}개 · 잔액 ${appState.walletBalance.toLocaleString('ko-KR')}원`;
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      navigator.clipboard.writeText(summaryText).then(
        () => showToast('내 요약 정보가 클립보드에 복사되었습니다.'),
        () => showToast(summaryText)
      );
    } else {
      showToast(summaryText);
    }
  };

  const handleEarnStamp = () => {
    setAppState((prev) => {
      const nextCount = prev.stampCount + 1;
      showToast(
        `단골 스탬프가 적립되었습니다! (${nextCount}개${
          nextCount >= 3 ? ' · 2,500원 쿠폰 사용 가능' : ''
        })`
      );
      return { ...prev, stampCount: nextCount };
    });
  };

  const handleOpenSuperApp = (tab: SuperAppTab) => {
    setRole(DemoRole.CONSUMER);
    setSuperAppTab(tab);
    setStep(ConsumerStep.SUPERAPP);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleJoinGroupBuy = (menuId: string) => {
    handleQuickReorderToConfirm(menuId, 1, { sharedDeliveryApplied: true });
    showToast('이웃 공동구매 배달비 할인이 적용되었습니다.');
  };

  const handleQuickRelaxCondition = (patch: Partial<ParsedCondition>) => {
    const next: ParsedCondition = {
      ...activeCondition,
      ...patch,
    };
    setParsedCondition(next);
    setActiveCondition(next);
    const evaluated = evaluateRecommendations(
      next,
      appState.stores,
      appState.menus,
      activeLocation
    );
    setSelectedMenuId(evaluated.matches[0]?.menu.id ?? null);
  };

  const handleSavePreferences = (nextPrefs: UserPreferences) => {
    setAppState((prev) => ({
      ...prev,
      preferences: nextPrefs,
    }));
  };

  const handleApplyPreferencesToInput = (prefs: UserPreferences) => {
    const tagsPart =
      prefs.favoriteTags.length > 0 ? `${prefs.favoriteTags.join(' ')}, ` : '';
    const generated = `성인 ${prefs.defaultServings}명, ${tagsPart}총액 ${prefs.defaultMaxBudget.toLocaleString(
      'ko-KR'
    )}원 이하, ${prefs.defaultMaxMinutes}분 이내`;
    setRawInput(generated);
    setParsedCondition(parseConditionInput(generated));
    showToast('내 맞춤 취향이 적용되었습니다.');
  };

  const handleProceedToConfirm = (payload: {
    menuId: string;
    servings: number;
    selectedOptionIds: string[];
    couponCode: string;
  }) => {
    const targetMenu = appState.menus.find((m) => m.id === payload.menuId);
    if (!targetMenu) return;
    setPrevStepBeforeConfirm(step);
    setConfirmDraft({
      draftId: `draft-${Date.now()}`,
      storeId: targetMenu.storeId,
      items: [
        {
          menuId: payload.menuId,
          quantity: Math.max(1, payload.servings),
          selectedOptionIds: payload.selectedOptionIds,
        },
      ],
      couponCode: payload.couponCode,
    });
    setStep(ConsumerStep.CONFIRM);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleProceedToConfirmWithItems = (payload: {
    storeId: string;
    items: CartLineItem[];
    couponCode?: string;
  }) => {
    const targetStore = appState.stores.find((s) => s.id === payload.storeId);
    if (!targetStore || !targetStore.isOpen) {
      showToast('해당 매장이 현재 영업 중단 상태입니다.');
      return;
    }
    const menuMap = new Map(appState.menus.map((m) => [m.id, m]));
    const validItems = payload.items.filter((it) => {
      const m = menuMap.get(it.menuId);
      return Boolean(
        m && m.storeId === payload.storeId && !m.isSoldOut && m.stock >= 1
      );
    });
    if (validItems.length === 0) {
      showToast('주문 가능한 메뉴가 없습니다.');
      return;
    }
    setPrevStepBeforeConfirm(step);
    setConfirmDraft({
      draftId: `draft-multi-${Date.now()}`,
      storeId: payload.storeId,
      items: validItems.map((it) => {
        const m = menuMap.get(it.menuId)!;
        return {
          menuId: it.menuId,
          quantity: Math.min(Math.max(1, it.quantity), m.stock),
          selectedOptionIds: [...it.selectedOptionIds],
        };
      }),
      couponCode: payload.couponCode ?? 'NONE',
      sharedDeliveryApplied: false,
      reservationSlot: 'now',
    });
    setRole(DemoRole.CONSUMER);
    setStep(ConsumerStep.CONFIRM);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearOrderDeliveryTimers = (orderId: string) => {
    const timers = deliveryTimersRef.current.get(orderId);
    if (timers) {
      for (const id of timers) window.clearTimeout(id);
      deliveryTimersRef.current.delete(orderId);
    }
  };

  const pushDeliveryNotification = (
    payload: Omit<DeliveryNotification, 'id' | 'createdAt' | 'read'>
  ) => {
    const dedupeKey = `${payload.orderId}:${payload.stage}`;
    if (emittedNotifKeysRef.current.has(dedupeKey)) return;
    emittedNotifKeysRef.current.add(dedupeKey);

    const notif: DeliveryNotification = {
      ...payload,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: formatNowTime(),
      read: false,
    };

    setDeliveryNotifications((prev) => [notif, ...prev].slice(0, 15));
    setActiveDeliveryAlert(notif);

    if (alertDismissTimerRef.current !== null) {
      window.clearTimeout(alertDismissTimerRef.current);
    }
    alertDismissTimerRef.current = window.setTimeout(() => {
      setActiveDeliveryAlert((curr) => (curr?.id === notif.id ? null : curr));
    }, 7000);

    try {
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        const sysNotif = new Notification(notif.title, { body: notif.body });
        sysNotif.onclick = () => {
          window.focus();
          openOrderTrackingFromNotification(notif);
        };
      }
    } catch {
      // ignore Notification runtime limitations
    }
  };

  const openOrderTrackingFromNotification = (notif: DeliveryNotification) => {
    setDeliveryNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
    );
    setActiveDeliveryAlert(null);
    setShowNotifications(false);
    setRole(DemoRole.CONSUMER);
    setStep(ConsumerStep.STATUS);
    setHighlightedOrderId(notif.orderId);
    setMapFocusRequest({ orderId: notif.orderId, seq: Date.now() });
  };

  const scheduleDeliveryLifecycleForOrder = (
    order: Order,
    estimatedMinutes: number
  ) => {
    clearOrderDeliveryTimers(order.id);
    const dispatchMode =
      order.sharedDeliveryApplied || order.deliveryFee <= 1800
        ? DispatchMode.NEIGHBOR_WALK
        : DispatchMode.AGENCY_RIDER;
    const riderLabel = order.riderName ?? pickRandomRiderName(dispatchMode);
    const departEta = Math.max(8, estimatedMinutes - 6);

    const tDepart = window.setTimeout(() => {
      setAppState((prev) => ({
        ...prev,
        orders: prev.orders.map((ord) =>
          ord.id === order.id && ord.status !== OrderStatus.CANCELLED
            ? {
                ...ord,
                status: OrderStatus.PICKUP,
                dispatchMode,
                deliveryStage: 'DEPARTED',
                riderName: riderLabel,
                remainingMinutes: departEta,
                updatedAt: formatNowTime(),
              }
            : ord
        ),
      }));
      pushDeliveryNotification({
        orderId: order.id,
        orderCode: order.orderCode,
        storeName: order.storeName,
        stage: 'DEPARTED',
        title: `${riderLabel} 배정 · 배달 출발`,
        body: `${order.storeName}에서 음식을 픽업해 출발했어요. 약 ${departEta}분 후 도착 예정입니다.`,
        riderLabel,
        dispatchMode,
      });
    }, 4000);

    const tFiveMin = window.setTimeout(() => {
      setAppState((prev) => ({
        ...prev,
        orders: prev.orders.map((ord) =>
          ord.id === order.id && ord.status !== OrderStatus.CANCELLED
            ? {
                ...ord,
                status: OrderStatus.PICKUP,
                dispatchMode,
                deliveryStage: 'FIVE_MIN_LEFT',
                riderName: riderLabel,
                remainingMinutes: 5,
                updatedAt: formatNowTime(),
              }
            : ord
        ),
      }));
      pushDeliveryNotification({
        orderId: order.id,
        orderCode: order.orderCode,
        storeName: order.storeName,
        stage: 'FIVE_MIN_LEFT',
        title: '도착 5분 전 알림',
        body: `${riderLabel}가 ${order.addressAlias} 인근에 곧 도착합니다 (약 5분 전).`,
        riderLabel,
        dispatchMode,
      });
    }, 12000);

    const tArrive = window.setTimeout(() => {
      setAppState((prev) => ({
        ...prev,
        orders: prev.orders.map((ord) =>
          ord.id === order.id && ord.status !== OrderStatus.CANCELLED
            ? {
                ...ord,
                status: OrderStatus.COMPLETED,
                dispatchMode,
                deliveryStage: 'ARRIVED',
                riderName: riderLabel,
                remainingMinutes: 0,
                updatedAt: formatNowTime(),
              }
            : ord
        ),
      }));
      pushDeliveryNotification({
        orderId: order.id,
        orderCode: order.orderCode,
        storeName: order.storeName,
        stage: 'ARRIVED',
        title: '배달 도착 완료',
        body: `${order.storeName} (${order.menuName}) 주문이 안전하게 도착했습니다!`,
        riderLabel,
        dispatchMode,
      });
      clearOrderDeliveryTimers(order.id);
    }, 20000);

    deliveryTimersRef.current.set(order.id, [tDepart, tFiveMin, tArrive]);
  };

  const handleConfirmOrder = (payload: {
    menuId: string;
    servings: number;
    selectedOptionIds: string[];
    items?: OrderLineItem[];
    couponCode: string;
    couponDiscount: number;
    sharedDeliveryApplied: boolean;
    reservationSlot: string | null;
    customerAlias: string;
    addressAlias: string;
    customerNote: string;
    paymentMethod?: PaymentMethod;
    paymentMethodLabel?: string;
    estimatedSavings?: number;
  }): { ok: boolean; error?: string } => {
    if (orderSubmitLockRef.current) {
      return { ok: false, error: '주문이 이미 처리 중입니다.' };
    }

    const menuMap = new Map(appState.menus.map((m) => [m.id, m]));
    const leadMenu = menuMap.get(payload.menuId);
    const targetStore = leadMenu
      ? appState.stores.find((s) => s.id === leadMenu.storeId)
      : undefined;

    if (!leadMenu || !targetStore) {
      return { ok: false, error: '선택한 메뉴 정보를 찾을 수 없습니다.' };
    }
    if (!targetStore.isOpen) {
      return { ok: false, error: '현재 영업 중단 상태인 가게입니다.' };
    }

    const orderLines: OrderLineItem[] =
      payload.items && payload.items.length > 0
        ? payload.items
        : (() => {
            const unitPrice = getEffectiveMenuPrice(leadMenu);
            const selectedOpts = leadMenu.options.filter((o) =>
              payload.selectedOptionIds.includes(o.id)
            );
            const optSum =
              selectedOpts.reduce((s, o) => s + o.priceDelta, 0) *
              payload.servings;
            return [
              {
                menuId: leadMenu.id,
                menuName: leadMenu.name,
                unitPrice,
                originalUnitPrice: leadMenu.pricePerPerson,
                quantity: payload.servings,
                selectedOptionIds: selectedOpts.map((o) => o.id),
                selectedOptionNames: selectedOpts.map((o) => o.name),
                optionsSubtotal: optSum,
                lineSubtotal: unitPrice * payload.servings,
              },
            ];
          })();

    const qtyByMenu = new Map<string, number>();
    for (const line of orderLines) {
      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        return { ok: false, error: '수량은 1 이상의 양의 정수여야 합니다.' };
      }
      qtyByMenu.set(line.menuId, (qtyByMenu.get(line.menuId) ?? 0) + line.quantity);
    }

    for (const [mId, totalQty] of qtyByMenu.entries()) {
      const m = menuMap.get(mId);
      if (!m || m.isSoldOut || m.stock <= 0) {
        return {
          ok: false,
          error: `'${m?.name ?? '선택 메뉴'}'가 품절되었습니다.`,
        };
      }
      if (m.stock < totalQty) {
        return {
          ok: false,
          error: `'${m.name}' 남은 재고(${m.stock}개)가 부족합니다.`,
        };
      }
    }

    const menuSubtotal = orderLines.reduce((sum, l) => sum + l.lineSubtotal, 0);
    const optionsSubtotal = orderLines.reduce(
      (sum, l) => sum + l.optionsSubtotal,
      0
    );
    const totalServings = orderLines.reduce((sum, l) => sum + l.quantity, 0);
    const effectiveDeliveryFee = payload.sharedDeliveryApplied
      ? Math.round(targetStore.deliveryFee / 2)
      : targetStore.deliveryFee;
    const cappedCoupon = Math.max(
      0,
      Math.min(payload.couponDiscount, menuSubtotal)
    );
    const totalAmount =
      menuSubtotal + optionsSubtotal + effectiveDeliveryFee - cappedCoupon;

    const chosenPayMethod = payload.paymentMethod ?? 'kakaopay';
    if (chosenPayMethod === 'alle_pay' && appState.walletBalance < totalAmount) {
      return {
        ok: false,
        error: `alle페이 잔액(${formatWon(appState.walletBalance)})이 부족합니다.`,
      };
    }

    orderSubmitLockRef.current = true;

    const nowStr = formatNowTime();
    const nextNumber = 101 + appState.orders.length;
    const newOrderId = `ord-${Date.now()}`;
    const firstLine = orderLines[0];
    const localCur = getLocalCurrencyLabel(activeLocation.areaName);

    const newOrder: Order = {
      id: newOrderId,
      orderCode: `ALLE-${nextNumber}`,
      storeId: targetStore.id,
      menuId: firstLine.menuId,
      menuName:
        orderLines.length > 1
          ? `${firstLine.menuName} 외 ${orderLines.length - 1}건`
          : firstLine.menuName,
      storeName: targetStore.name,
      customerAlias: payload.customerAlias,
      addressAlias: payload.addressAlias,
      servings: totalServings,
      selectedOptionIds: firstLine.selectedOptionIds,
      selectedOptionNames: firstLine.selectedOptionNames,
      items: orderLines,
      menuSubtotal,
      optionsSubtotal,
      deliveryFee: effectiveDeliveryFee,
      sharedDeliveryApplied: payload.sharedDeliveryApplied,
      reservationSlot: payload.reservationSlot,
      isB2B: chosenPayMethod === 'b2b_meal_point',
      paymentMethod: chosenPayMethod,
      paymentMethodLabel:
        payload.paymentMethodLabel ??
        (chosenPayMethod === 'local_currency'
          ? localCur.fullLabel
          : '간편결제'),
      couponCode: payload.couponCode === 'NONE' ? null : payload.couponCode,
      couponDiscount: cappedCoupon,
      totalAmount,
      estimatedSavings: payload.estimatedSavings,
      status: OrderStatus.PENDING,
      createdAt: nowStr,
      updatedAt: nowStr,
      stockDeducted: true,
      stockRestored: false,
      mockRefunded: false,
      cancelRequested: false,
      cancelRequestReason: null,
      cancelRequestedAt: null,
      customerNote: payload.customerNote,
    };

    setAppState((prev) => ({
      ...prev,
      walletBalance:
        chosenPayMethod === 'alle_pay'
          ? Math.max(0, prev.walletBalance - totalAmount)
          : prev.walletBalance,
      menus: prev.menus.map((m) => {
        const deduct = qtyByMenu.get(m.id);
        if (!deduct) return m;
        const nextStock = Math.max(0, m.stock - deduct);
        return {
          ...m,
          stock: nextStock,
          isSoldOut: nextStock === 0 ? true : m.isSoldOut,
        };
      }),
      orders: [newOrder, ...prev.orders],
    }));

    if (cart && cart.storeId === targetStore.id) {
      setCart(null);
    }

    setHighlightedOrderId(newOrderId);
    setConfirmDraft(null);
    setQuickPayDraft(null);
    setStep(ConsumerStep.STATUS);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`${newOrder.orderCode} 주문이 접수되었습니다.`);

    const estimatedMin =
      (leadMenu.estimatedMinutes ?? 20) + (targetStore.extraPrepMinutes ?? 0);
    scheduleDeliveryLifecycleForOrder(newOrder, estimatedMin);

    window.setTimeout(() => {
      orderSubmitLockRef.current = false;
    }, 300);

    return { ok: true };
  };

  const handleCreateB2BOrder = (payload: {
    menuId: string;
    servings: number;
    reservationSlot: string;
    customerNote: string;
  }): { ok: boolean; error?: string } => {
    if (orderSubmitLockRef.current) {
      return { ok: false, error: '주문이 이미 처리 중입니다.' };
    }
    const targetMenu = appState.menus.find((m) => m.id === payload.menuId);
    const targetStore = targetMenu
      ? appState.stores.find((s) => s.id === targetMenu.storeId)
      : undefined;

    if (!targetMenu || !targetStore) {
      return { ok: false, error: '선택한 메뉴 정보를 찾을 수 없습니다.' };
    }
    if (!targetStore.isOpen || targetMenu.isSoldOut || targetMenu.stock <= 0) {
      return { ok: false, error: '현재 영업 중단 또는 품절된 메뉴입니다.' };
    }
    if (!Number.isInteger(payload.servings) || payload.servings < 1) {
      return { ok: false, error: '단체 수량은 1 이상의 양의 정수여야 합니다.' };
    }
    if (payload.servings > targetMenu.stock) {
      return {
        ok: false,
        error: `남은 재고(${targetMenu.stock}개) 이하로 입력해 주세요.`,
      };
    }

    orderSubmitLockRef.current = true;
    const effectiveUnitPrice = getEffectiveMenuPrice(targetMenu);
    const menuSubtotal = effectiveUnitPrice * payload.servings;
    const totalAmount = menuSubtotal + targetStore.deliveryFee;
    const nowStr = formatNowTime();
    const nextNumber = 101 + appState.orders.length;
    const newOrderId = `ord-b2b-${Date.now()}`;

    const b2bOrder: Order = {
      id: newOrderId,
      orderCode: `B2B-${nextNumber}`,
      storeId: targetStore.id,
      menuId: targetMenu.id,
      menuName: targetMenu.name,
      storeName: targetStore.name,
      customerAlias: '오피스 A',
      addressAlias: '오피스 구역 A',
      servings: payload.servings,
      selectedOptionIds: [],
      selectedOptionNames: [],
      menuSubtotal,
      optionsSubtotal: 0,
      deliveryFee: targetStore.deliveryFee,
      reservationSlot: payload.reservationSlot,
      isB2B: true,
      couponCode: null,
      couponDiscount: 0,
      totalAmount,
      status: OrderStatus.PENDING,
      createdAt: nowStr,
      updatedAt: nowStr,
      stockDeducted: true,
      stockRestored: false,
      mockRefunded: false,
      cancelRequested: false,
      cancelRequestReason: null,
      cancelRequestedAt: null,
      customerNote: payload.customerNote,
    };

    setAppState((prev) => ({
      ...prev,
      menus: prev.menus.map((m) => {
        if (m.id !== targetMenu.id) return m;
        const nextStock = Math.max(0, m.stock - payload.servings);
        return {
          ...m,
          stock: nextStock,
          isSoldOut: nextStock === 0 ? true : m.isSoldOut,
        };
      }),
      orders: [b2bOrder, ...prev.orders],
    }));

    setHighlightedOrderId(newOrderId);
    setStep(ConsumerStep.STATUS);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`${b2bOrder.orderCode} 단체 예약 주문이 접수되었습니다.`);

    window.setTimeout(() => {
      orderSubmitLockRef.current = false;
    }, 300);

    return { ok: true };
  };

  const handleCreateErrand = (payload: {
    title: string;
    category: string;
    pickupAlias: string;
    dropoffAlias: string;
    estimatedItemCost: number;
    errandFee: number;
  }): { ok: boolean; error?: string } => {
    const blocked = PROHIBITED_ERRAND_KEYWORDS.filter((kw) =>
      payload.title.includes(kw)
    );
    if (blocked.length > 0) {
      return {
        ok: false,
        error: `금지 품목(${blocked.join(', ')})이 포함되어 접수할 수 없습니다.`,
      };
    }

    const newErrand: ErrandRequest = {
      id: `err-${Date.now()}`,
      title: payload.title,
      category: payload.category,
      pickupAlias: payload.pickupAlias,
      dropoffAlias: payload.dropoffAlias,
      estimatedItemCost: payload.estimatedItemCost,
      errandFee: payload.errandFee,
      escrowTotal: payload.estimatedItemCost + payload.errandFee,
      actualReceiptCost: null,
      refundDifference: null,
      status: ErrandStatus.OPEN,
      createdAt: formatNowTime(),
    };

    setAppState((prev) => ({
      ...prev,
      errands: [newErrand, ...prev.errands],
    }));
    showToast('생활 심부름이 등록되었습니다.');
    return { ok: true };
  };

  const handleAdvanceErrand = (
    errandId: string,
    nextStatus: ErrandStatus,
    actualReceiptCost?: number,
    receiptPhoto?: NonNullable<ErrandRequest['receiptPhoto']>
  ) => {
    setAppState((prev) => ({
      ...prev,
      errands: prev.errands.map((err) => {
        if (err.id !== errandId) return err;
        if (
          nextStatus === ErrandStatus.RECEIPT_CHECKED &&
          typeof actualReceiptCost === 'number'
        ) {
          return {
            ...err,
            status: nextStatus,
            actualReceiptCost,
            refundDifference: err.estimatedItemCost - actualReceiptCost,
            receiptPhoto: receiptPhoto ?? err.receiptPhoto,
          };
        }
        return {
          ...err,
          status: nextStatus,
          receiptPhoto: receiptPhoto ?? err.receiptPhoto,
        };
      }),
    }));
    showToast('심부름 상태가 업데이트되었습니다.');
  };

  const handleAdvanceOrderStatus = (
    orderId: string,
    nextStatus: OrderStatus,
    dispatchMode?: DispatchMode
  ) => {
    const currentOrder = appState.orders.find((o) => o.id === orderId);
    const chosenMode =
      dispatchMode ?? currentOrder?.dispatchMode ?? DispatchMode.AGENCY_RIDER;
    const riderLabel =
      currentOrder?.riderName ?? pickRandomRiderName(chosenMode);
    const nextStage: DeliveryProgressStage | undefined =
      nextStatus === OrderStatus.PICKUP
        ? 'DEPARTED'
        : nextStatus === OrderStatus.COMPLETED
          ? 'ARRIVED'
          : currentOrder?.deliveryStage;

    setAppState((prev) => ({
      ...prev,
      orders: prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const expectedNext = ALLOWED_NEXT_STATUS[ord.status];
        if (expectedNext !== nextStatus) {
          return ord;
        }
        return {
          ...ord,
          status: nextStatus,
          dispatchMode:
            nextStatus === OrderStatus.PICKUP && dispatchMode
              ? dispatchMode
              : ord.dispatchMode,
          deliveryStage: nextStage,
          riderName:
            nextStatus === OrderStatus.PICKUP ||
            nextStatus === OrderStatus.COMPLETED
              ? riderLabel
              : ord.riderName,
          remainingMinutes:
            nextStatus === OrderStatus.COMPLETED
              ? 0
              : nextStatus === OrderStatus.PICKUP
                ? ord.remainingMinutes ?? 12
                : ord.remainingMinutes,
          updatedAt: formatNowTime(),
        };
      }),
    }));

    if (currentOrder && ALLOWED_NEXT_STATUS[currentOrder.status] === nextStatus) {
      if (nextStatus === OrderStatus.PICKUP) {
        pushDeliveryNotification({
          orderId: currentOrder.id,
          orderCode: currentOrder.orderCode,
          storeName: currentOrder.storeName,
          stage: 'DEPARTED',
          title: `${riderLabel} 배정 · 배달 출발`,
          body: `${currentOrder.storeName}에서 음식을 픽업해 출발했습니다.`,
          riderLabel,
          dispatchMode: chosenMode,
        });
      } else if (nextStatus === OrderStatus.COMPLETED) {
        clearOrderDeliveryTimers(currentOrder.id);
        pushDeliveryNotification({
          orderId: currentOrder.id,
          orderCode: currentOrder.orderCode,
          storeName: currentOrder.storeName,
          stage: 'ARRIVED',
          title: '배달 도착 완료',
          body: `${currentOrder.storeName} (${currentOrder.menuName}) 주문이 도착했습니다!`,
          riderLabel,
          dispatchMode: chosenMode,
        });
      }
    }
  };

  const handleCancelBeforeCooking = (orderId: string) => {
    clearOrderDeliveryTimers(orderId);
    setAppState((prev) => {
      const targetOrder = prev.orders.find((o) => o.id === orderId);
      if (!targetOrder) return prev;

      const canConfirmCancel =
        targetOrder.status === OrderStatus.PENDING ||
        targetOrder.status === OrderStatus.ACCEPTED;

      if (!canConfirmCancel) {
        return prev;
      }

      const shouldRestoreStock =
        targetOrder.stockDeducted && !targetOrder.stockRestored;

      const restoreQtyByMenu = new Map<string, number>();
      if (shouldRestoreStock) {
        const lines =
          targetOrder.items && targetOrder.items.length > 0
            ? targetOrder.items
            : [{ menuId: targetOrder.menuId, quantity: targetOrder.servings }];
        for (const line of lines) {
          restoreQtyByMenu.set(
            line.menuId,
            (restoreQtyByMenu.get(line.menuId) ?? 0) + line.quantity
          );
        }
      }

      const shouldRefundAllePay =
        targetOrder.paymentMethod === 'alle_pay' && !targetOrder.mockRefunded;

      return {
        ...prev,
        walletBalance: shouldRefundAllePay
          ? prev.walletBalance + targetOrder.totalAmount
          : prev.walletBalance,
        menus: shouldRestoreStock
          ? prev.menus.map((m) => {
              const restoreAmt = restoreQtyByMenu.get(m.id);
              if (!restoreAmt) return m;
              const restoredStock = m.stock + restoreAmt;
              return {
                ...m,
                stock: restoredStock,
                isSoldOut: restoredStock > 0 ? false : m.isSoldOut,
              };
            })
          : prev.menus,
        orders: prev.orders.map((ord) =>
          ord.id === orderId
            ? {
                ...ord,
                status: OrderStatus.CANCELLED,
                stockRestored: shouldRestoreStock ? true : ord.stockRestored,
                mockRefunded: true,
                updatedAt: formatNowTime(),
              }
            : ord
        ),
      };
    });
    showToast('조리 전 취소가 확정되어 재고 복구 및 환불 처리되었습니다.');
  };

  const handleRequestCancelAfterCooking = (orderId: string, reason: string) => {
    const nowStr = formatNowTime();
    setAppState((prev) => ({
      ...prev,
      orders: prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        if (
          ord.status !== OrderStatus.COOKING &&
          ord.status !== OrderStatus.PICKUP
        ) {
          return ord;
        }
        return {
          ...ord,
          cancelRequested: true,
          cancelRequestReason: reason,
          cancelRequestedAt: nowStr,
          updatedAt: nowStr,
        };
      }),
    }));
    showToast('취소 요청이 매장에 전달되었습니다.');
  };

  const handleAttachEvidence = (
    orderId: string,
    payload: Omit<EvidenceRecord, 'recordedAt'>
  ) => {
    const nowStr = formatNowTime();
    setAppState((prev) => ({
      ...prev,
      orders: prev.orders.map((ord) =>
        ord.id === orderId
          ? {
              ...ord,
              evidenceRecord: {
                ...payload,
                recordedAt: nowStr,
              },
            }
          : ord
      ),
    }));
    showToast('안심 증적 기록이 저장되었습니다.');
  };

  const handleAttachOrderPhotos = (
    orderId: string,
    party: 'owner' | 'rider',
    photos: NonNullable<Order['ownerPackagingPhotos']>
  ) => {
    setAppState((prev) => ({
      ...prev,
      orders: prev.orders.map((ord) =>
        ord.id === orderId
          ? party === 'owner'
            ? { ...ord, ownerPackagingPhotos: photos }
            : { ...ord, riderDeliveryPhotos: photos }
          : ord
      ),
    }));
    showToast(
      party === 'owner'
        ? '점주 포장 증적 사진이 저장되었습니다.'
        : '라이더 배송 증빙 사진이 저장되었습니다.'
    );
  };

  const handleToggleStoreOpen = (storeId: string) => {
    setAppState((prev) => ({
      ...prev,
      stores: prev.stores.map((s) =>
        s.id === storeId ? { ...s, isOpen: !s.isOpen } : s
      ),
    }));
  };

  const handleAdjustStoreExtraPrep = (storeId: string, delta: number) => {
    setAppState((prev) => ({
      ...prev,
      stores: prev.stores.map((s) =>
        s.id === storeId
          ? {
              ...s,
              extraPrepMinutes: Math.max(
                0,
                Math.min(30, (s.extraPrepMinutes ?? 0) + delta)
              ),
            }
          : s
      ),
    }));
  };

  const handleSetStoreExtraPrep = (storeId: string, minutes: number) => {
    setAppState((prev) => ({
      ...prev,
      stores: prev.stores.map((s) =>
        s.id === storeId
          ? { ...s, extraPrepMinutes: Math.max(0, Math.min(30, minutes)) }
          : s
      ),
    }));
  };

  const handleToggleMenuSoldOut = (menuId: string) => {
    setAppState((prev) => ({
      ...prev,
      menus: prev.menus.map((m) =>
        m.id === menuId ? { ...m, isSoldOut: !m.isSoldOut } : m
      ),
    }));
  };

  const handleToggleMenuClosingSale = (
    menuId: string,
    discountPercent = 30
  ) => {
    setAppState((prev) => ({
      ...prev,
      menus: prev.menus.map((m) => {
        if (m.id !== menuId) return m;
        const nextDiscount =
          m.closingDiscountPercent && m.closingDiscountPercent > 0
            ? 0
            : discountPercent;
        return {
          ...m,
          closingDiscountPercent: nextDiscount,
        };
      }),
    }));
  };

  const handleCreateMarketBundleOrder = (payload: {
    items: Array<{ menuId: string; quantity: number }>;
    customerNote: string;
  }): { ok: boolean; error?: string } => {
    if (orderSubmitLockRef.current) {
      return { ok: false, error: '주문이 이미 처리 중입니다.' };
    }
    if (payload.items.length === 0) {
      return { ok: false, error: '최소 1개 이상의 메뉴를 담아주세요.' };
    }

    const menuMap = new Map(appState.menus.map((m) => [m.id, m]));
    const storeMap = new Map(appState.stores.map((s) => [s.id, s]));

    let subtotal = 0;
    const summaryLabels: string[] = [];
    const storeNames = new Set<string>();
    let leadMenu: MenuItem | null = null;
    let leadStoreName = '';

    for (const entry of payload.items) {
      const m = menuMap.get(entry.menuId);
      const st = m ? storeMap.get(m.storeId) : undefined;
      if (!m || !st || !st.isOpen || m.isSoldOut || m.stock < entry.quantity) {
        return {
          ok: false,
          error: `${m?.name ?? '선택 메뉴'}의 재고가 부족하거나 영업 중이 아닙니다.`,
        };
      }
      if (!leadMenu) {
        leadMenu = m;
        leadStoreName = st.name;
      }
      storeNames.add(st.name);
      subtotal += getEffectiveMenuPrice(m) * entry.quantity;
      summaryLabels.push(`[${st.name}] ${m.name}×${entry.quantity}`);
    }

    if (!leadMenu) {
      return { ok: false, error: '주문 항목을 확인할 수 없습니다.' };
    }

    orderSubmitLockRef.current = true;
    const bundleDeliveryFee = 1500;
    const totalAmount = subtotal + bundleDeliveryFee;
    const nowStr = formatNowTime();
    const nextNumber = 101 + appState.orders.length;
    const newOrderId = `ord-mkt-${Date.now()}`;

    const bundleOrder: Order = {
      id: newOrderId,
      orderCode: `MKT-${nextNumber}`,
      storeId: leadMenu.storeId,
      menuId: leadMenu.id,
      menuName:
        payload.items.length > 1
          ? `${leadMenu.name} 외 ${payload.items.length - 1}건 (시장·골목 묶음)`
          : leadMenu.name,
      storeName:
        storeNames.size > 1
          ? `${leadStoreName} 외 ${storeNames.size - 1}곳 묶음`
          : leadStoreName,
      customerAlias: '이웃 고객',
      addressAlias: activeLocation.areaName,
      servings: payload.items.reduce((sum, item) => sum + item.quantity, 0),
      selectedOptionIds: [],
      selectedOptionNames: summaryLabels,
      menuSubtotal: subtotal,
      optionsSubtotal: 0,
      deliveryFee: bundleDeliveryFee,
      sharedDeliveryApplied: true,
      paymentMethod: 'local_currency',
      paymentMethodLabel: '대구로페이 / 골목 묶음',
      couponCode: null,
      couponDiscount: 0,
      totalAmount,
      status: OrderStatus.PENDING,
      dispatchMode: DispatchMode.NEIGHBOR_WALK,
      createdAt: nowStr,
      updatedAt: nowStr,
      stockDeducted: true,
      stockRestored: false,
      mockRefunded: false,
      cancelRequested: false,
      cancelRequestReason: null,
      cancelRequestedAt: null,
      customerNote: `${summaryLabels.join(' + ')}${
        payload.customerNote ? ` / ${payload.customerNote}` : ''
      }`,
    };

    const qtyByMenu = new Map(payload.items.map((i) => [i.menuId, i.quantity]));

    setAppState((prev) => ({
      ...prev,
      menus: prev.menus.map((m) => {
        const deduct = qtyByMenu.get(m.id);
        if (!deduct) return m;
        const nextStock = Math.max(0, m.stock - deduct);
        return {
          ...m,
          stock: nextStock,
          isSoldOut: nextStock === 0 ? true : m.isSoldOut,
        };
      }),
      orders: [bundleOrder, ...prev.orders],
    }));

    setHighlightedOrderId(newOrderId);
    setStep(ConsumerStep.STATUS);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`${bundleOrder.orderCode} 골목·시장 한 바구니 묶음 주문이 접수되었습니다.`);

    window.setTimeout(() => {
      orderSubmitLockRef.current = false;
    }, 300);

    return { ok: true };
  };

  const handleAdjustMenuStock = (menuId: string, delta: number) => {
    setAppState((prev) => ({
      ...prev,
      menus: prev.menus.map((m) => {
        if (m.id !== menuId) return m;
        const nextStock = Math.max(0, m.stock + delta);
        return {
          ...m,
          stock: nextStock,
          isSoldOut: nextStock === 0 ? true : delta > 0 ? false : m.isSoldOut,
        };
      }),
    }));
  };

  const handleAddMenuFromLine = (
    storeId: string,
    rawLine: string
  ): { ok: boolean; message: string } => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      return { ok: false, message: '메뉴명과 가격을 입력해 주세요.' };
    }
    const store = appState.stores.find((s) => s.id === storeId);
    if (!store) {
      return { ok: false, message: '가게 정보를 찾을 수 없습니다.' };
    }

    const newMenu = buildMenuFromRawLine(
      store.id,
      store.image,
      store.basePrepMinutes,
      trimmed
    );

    setAppState((prev) => ({
      ...prev,
      menus: [newMenu, ...prev.menus],
    }));

    return {
      ok: true,
      message: `"${newMenu.name}" (${newMenu.pricePerPerson.toLocaleString('ko-KR')}원) 메뉴가 추가되었습니다.`,
    };
  };

  const handleBulkAddMenusFromSample = (
    storeId: string,
    lines: string[]
  ): number => {
    const store = appState.stores.find((s) => s.id === storeId);
    if (!store) return 0;

    const added = lines.map((line, i) =>
      buildMenuFromRawLine(store.id, store.image, store.basePrepMinutes, line, i)
    );

    setAppState((prev) => ({
      ...prev,
      menus: [...added, ...prev.menus],
    }));
    showToast(`종이 메뉴판 샘플 ${added.length}종이 등록되었습니다.`);
    return added.length;
  };

  const handleReportPriceDifference = (payload: {
    menuId: string;
    menuName: string;
    storeName: string;
    appPrice: number;
    storePrice: number;
  }) => {
    const report: PriceReport = {
      id: `prep-${Date.now()}`,
      menuId: payload.menuId,
      menuName: payload.menuName,
      storeName: payload.storeName,
      appPrice: payload.appPrice,
      storePrice: payload.storePrice,
      reportedAt: formatNowTime(),
      note: '매장가 대비 앱 가격 차이 제보 (암행어사 5,000원 포상)',
    };
    const isInflated = payload.appPrice > payload.storePrice;
    setAppState((prev) => ({
      ...prev,
      walletBalance: isInflated ? prev.walletBalance + 5000 : prev.walletBalance,
      stores: isInflated
        ? prev.stores.map((s) =>
            s.name === payload.storeName ? { ...s, singlePriceRevoked: true } : s
          )
        : prev.stores,
      priceReports: [report, ...prev.priceReports],
    }));
    showToast(
      isInflated
        ? '이중가격 제보 확인! 암행어사 포상 5,000원 적립 및 단일가격 배지가 회수되었습니다.'
        : '가격 차이 제보가 접수되었습니다.'
    );
  };

  const handleSelectOwnerSaasPlan = (plan: PartnerPlanTier) => {
    const planLabelMap: Record<PartnerPlanTier, string> = {
      trial: '체험형 (2개월 무료)',
      basic: '베이직 (월 2.9만 원)',
      pro: '프로 (월 5.9만 원)',
      premium: '프리미엄 (월 9.9만 원)',
    };
    setAppState((prev) => ({
      ...prev,
      ownerSaasSubscribed: plan !== 'trial',
      ownerSaasPlan: plan,
    }));
    showToast(`파트너 구독 요금제가 ‘${planLabelMap[plan]}’으로 변경되었습니다.`);
  };

  const handleSaveReviewReply = (reviewId: string, replyText: string) => {
    setAppState((prev) => ({
      ...prev,
      reviewReplies: {
        ...prev.reviewReplies,
        [reviewId]: {
          ...prev.reviewReplies[reviewId],
          text: replyText,
          updatedAt: formatNowTime().slice(0, 10),
        },
      },
    }));
    showToast('점주 답글이 저장되었습니다.');
  };

  const handleToggleReviewFlag = (reviewId: string, reason: string) => {
    setAppState((prev) => {
      const existing = prev.reviewReplies[reviewId];
      const nextFlag = !existing?.flaggedForReview;
      return {
        ...prev,
        reviewReplies: {
          ...prev.reviewReplies,
          [reviewId]: {
            text: existing?.text ?? '',
            updatedAt: existing?.updatedAt ?? formatNowTime().slice(0, 10),
            flaggedForReview: nextFlag,
            flagReason: nextFlag ? reason : undefined,
          },
        },
      };
    });
    showToast('리뷰 검토 요청이 업데이트되었습니다.');
  };

  const handleResetDemo = () => {
    const reset = resetDemoStorage();
    setAppState(reset.state);
    setStorageMode(reset.storageMode);
    setRawInput(reset.state.lastConditionInput);
    const parsed = parseConditionInput(reset.state.lastConditionInput);
    setParsedCondition(parsed);
    setActiveCondition(parsed);
    setSelectedMenuId(null);
    setConfirmDraft(null);
    setCart(null);
    setQuickPayDraft(null);
    setPendingCartSwitch(null);
    setStoreMenuModal(null);
    setDeliveryNotifications([]);
    setActiveDeliveryAlert(null);
    setMapFocusRequest(null);
    for (const id of deliveryTimersRef.current.keys()) {
      clearOrderDeliveryTimers(id);
    }
    emittedNotifKeysRef.current.clear();
    setHighlightedOrderId(null);
    setAiChatInitialPrompt(undefined);
    setRole(DemoRole.CONSUMER);
    setStep(ConsumerStep.HOME);
    showToast('초기 상태로 되돌렸습니다.');
  };

  const handleJumpDemoScene = (
    scene: 'customer_home' | 'customer_chat' | 'b2b_checkout' | 'owner_dashboard' | 'superapp_hub'
  ) => {
    if (scene === 'customer_home') {
      setAiChatInitialPrompt(undefined);
      setRole(DemoRole.CONSUMER);
      setStep(ConsumerStep.HOME);
      showToast('① 컨디션 홈 · Zero-UI 추천 화면');
    } else if (scene === 'customer_chat') {
      setAiChatInitialPrompt('어제 야근해서 얼큰한 국물 2인분 30분 이내로 추천해줘');
      setRole(DemoRole.CONSUMER);
      setStep(ConsumerStep.AI_CHAT);
      showToast('① 올이 10초 음성·채팅 주문 시연');
    } else if (scene === 'b2b_checkout') {
      const targetMenu =
        appState.menus.find((m) => {
          const st = appState.stores.find((s) => s.id === m.storeId);
          return m.id === 'm1' && st?.isOpen && !m.isSoldOut && m.stock >= 1;
        }) ??
        appState.menus.find((m) => {
          const st = appState.stores.find((s) => s.id === m.storeId);
          return Boolean(st?.isOpen && !m.isSoldOut && m.stock >= 1);
        }) ??
        appState.menus[0];

      if (targetMenu) {
        setConfirmDraft({
          draftId: `draft-demo-${Date.now()}`,
          storeId: targetMenu.storeId,
          items: [
            {
              menuId: targetMenu.id,
              quantity: Math.min(2, Math.max(1, targetMenu.stock)),
              selectedOptionIds: [],
            },
          ],
          couponCode: 'NONE',
          sharedDeliveryApplied: false,
          reservationSlot: 'now',
          paymentMethod: 'b2b_meal_point',
        });
        setRole(DemoRole.CONSUMER);
        setStep(ConsumerStep.CONFIRM);
        showToast('② B2B 기업 식대 · 맞춤 추천 근거 확인 결제');
      }
    } else if (scene === 'owner_dashboard') {
      setRole(DemoRole.OWNER);
      showToast('③ 점주 실시간 주문 접수 · 순수익 비교 대시보드');
    } else if (scene === 'superapp_hub') {
      setRole(DemoRole.CONSUMER);
      setSuperAppTab(SuperAppTab.GROUP_BUY);
      setStep(ConsumerStep.SUPERAPP);
      showToast('④ 음식-이동 크로스 도메인 슈퍼앱 허브');
    }
    setShowDemoSwitcher(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmMenu = confirmDraft?.items[0]
    ? appState.menus.find((m) => m.id === confirmDraft.items[0].menuId)
    : undefined;
  const confirmStore = confirmDraft
    ? appState.stores.find((s) => s.id === confirmDraft.storeId)
    : confirmMenu
      ? appState.stores.find((s) => s.id === confirmMenu.storeId)
      : undefined;

  const cartStore = cart
    ? appState.stores.find((s) => s.id === cart.storeId) ?? null
    : null;

  const cartSummary = useMemo(() => {
    if (!cart || cart.items.length === 0) {
      return { totalCount: 0, totalAmount: 0, label: '' };
    }
    const menuMap = new Map(appState.menus.map((m) => [m.id, m]));
    let totalCount = 0;
    let totalAmount = 0;
    let firstName = '';
    for (const item of cart.items) {
      const m = menuMap.get(item.menuId);
      if (!m) continue;
      if (!firstName) firstName = m.name;
      const unit = getEffectiveMenuPrice(m);
      const optDelta = m.options
        .filter((o) => item.selectedOptionIds.includes(o.id))
        .reduce((s, o) => s + o.priceDelta, 0);
      totalCount += item.quantity;
      totalAmount += (unit + optDelta) * item.quantity;
    }
    const label =
      cart.items.length > 1
        ? `${firstName} 외 ${cart.items.length - 1}건`
        : firstName;
    return { totalCount, totalAmount, label };
  }, [cart, appState.menus]);

  const quickPayStore = quickPayDraft
    ? appState.stores.find((s) => s.id === quickPayDraft.storeId) ?? null
    : null;

  const quickPayItems: QuickPayResolvedItem[] = useMemo(() => {
    if (!quickPayDraft) return [];
    const menuMap = new Map(appState.menus.map((m) => [m.id, m]));
    return quickPayDraft.items
      .map((line) => {
        const menu = menuMap.get(line.menuId);
        if (!menu) return null;
        return {
          menu,
          quantity: line.quantity,
          selectedOptionIds: line.selectedOptionIds,
        };
      })
      .filter((x): x is QuickPayResolvedItem => x !== null);
  }, [quickPayDraft, appState.menus]);

  const pendingOrderCount = appState.orders.filter(
    (o) => o.status === OrderStatus.PENDING
  ).length;
  const activePartnerOrderCount = appState.orders.filter(
    (o) => o.status === OrderStatus.COOKING || o.status === OrderStatus.PICKUP
  ).length;

  return (
    <div
      className={`min-h-screen flex flex-col bg-[#F7F8F5] text-[#1A1D1A] ${
        appState.easyMode ? 'alle-easy-mode' : ''
      }`}
    >
      {/* Contextual Role Strip (Only visible in Owner / Partner mode) */}
      {role !== DemoRole.CONSUMER && (
        <div className="bg-[#1A1D1A] text-white border-b border-white/10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#EAF1E2]">
              {role === DemoRole.OWNER ? (
                <>
                  <StoreIcon className="w-3.5 h-3.5 text-[#82B440]" />
                  <span>점주 · 관리자 대시보드 (대기 {pendingOrderCount}건)</span>
                </>
              ) : (
                <>
                  <Truck className="w-3.5 h-3.5 text-[#82B440]" />
                  <span>배달 파트너 관제 (진행 {activePartnerOrderCount}건)</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setRole(DemoRole.CONSUMER);
                setStep(ConsumerStep.HOME);
              }}
              className="min-h-[30px] px-3 py-1 rounded-lg bg-white/10 hover:bg-white/18 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              고객 홈으로
            </button>
          </div>
        </div>
      )}

      {/* Clean Single-Row Header: Brand Logo + Current Location + Easy Mode + Notification Bell */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-[#E8ECE4]">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                setRole(DemoRole.CONSUMER);
                setStep(ConsumerStep.HOME);
              }}
              className="whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="alle 홈"
            >
              <AlleLogo />
            </button>

            <span
              aria-hidden="true"
              className="h-4 w-px bg-[#E8ECE4] shrink-0"
            />

            <button
              type="button"
              onClick={() => setShowLocationPicker(true)}
              aria-label="등록된 위치 변경하기"
              className="inline-flex min-w-0 min-h-[34px] max-w-full sm:max-w-[260px] px-1.5 sm:px-2.5 py-1 rounded-xl hover:bg-[#EAF1E2]/70 text-xs sm:text-sm font-semibold text-[#1A1D1A] items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#4E6E2A] shrink-0" />
              <span className="truncate">{activeLocation.areaName}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#687064] shrink-0" />
            </button>
          </div>

          {/* Right Search + Easy Mode Toggle + Presenter Demo Switcher + Notification Bell */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenBrowse()}
              aria-label="카테고리·가게 검색"
              className={`easy-compact min-h-[34px] px-2 sm:px-2.5 py-1 rounded-xl text-[11px] font-semibold border inline-flex items-center gap-1 whitespace-nowrap transition-all cursor-pointer ${
                role === DemoRole.CONSUMER && step === ConsumerStep.BROWSE
                  ? 'bg-[#4E6E2A] text-white border-[#4E6E2A]'
                  : 'bg-[#F7F8F5] hover:bg-[#EAF1E2] text-[#1A1D1A] border-[#E8ECE4]'
              }`}
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">카테고리 검색</span>
            </button>

            <button
              type="button"
              onClick={handleToggleEasyMode}
              aria-pressed={appState.easyMode}
              aria-label="큰 글씨 쉬운 모드 전환"
              className={`easy-compact min-h-[34px] px-2 sm:px-2.5 py-1 rounded-xl text-[11px] font-semibold border inline-flex items-center gap-1 whitespace-nowrap transition-all cursor-pointer ${
                appState.easyMode
                  ? 'bg-[#1A1D1A] text-[#EAF1E2] border-[#4E6E2A]'
                  : 'bg-[#F7F8F5] hover:bg-[#EAF1E2] text-[#1A1D1A] border-[#E8ECE4]'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
              <span className="hidden sm:inline">
                {appState.easyMode ? '쉬운 모드 ON' : '가+ 쉬운 모드'}
              </span>
              <span className="sm:hidden">
                {appState.easyMode ? '쉬운 ON' : '쉬운모드'}
              </span>
            </button>

            {showPresenterMode && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowNotifications(false);
                    setShowDemoSwitcher((prev) => !prev);
                  }}
                  aria-expanded={showDemoSwitcher}
                  aria-label="Demo Mode 발표자 시연 전환 열기"
                className={`easy-compact min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-semibold border inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  showDemoSwitcher
                    ? 'bg-[#1A1D1A] text-[#EAF1E2] border-[#4E6E2A]'
                    : 'bg-[#F7F8F5] hover:bg-[#EAF1E2] text-[#1A1D1A] border-[#E8ECE4]'
                }`}
              >
                <Presentation className="w-3.5 h-3.5 text-[#4E6E2A]" />
                <span>Demo Mode</span>
              </button>

              {showDemoSwitcher && (
                <div
                  role="dialog"
                  aria-label="IR 발표자용 시연 퀵 스위처"
                  className="fixed top-16 left-3 right-3 sm:left-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[344px] max-h-[calc(100vh-6rem)] overflow-y-auto bg-[#1A1D1A]/95 backdrop-blur-xl text-white border border-white/15 rounded-2xl shadow-2xl p-3.5 space-y-2.5 z-50"
                >
                  <div className="flex items-center justify-between px-1 pb-1.5 border-b border-white/10">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#EAF1E2]">
                      <Presentation className="w-3.5 h-3.5 text-[#82B440]" />
                      <span>IR 발표자 퀵 스위처</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDemoSwitcher(false)}
                      aria-label="시연 퀵 스위처 닫기"
                      className="p-1 text-[#919A8D] hover:text-white rounded-lg cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div
                      className={`rounded-xl border transition-colors p-2.5 ${
                        role === DemoRole.CONSUMER &&
                        (step === ConsumerStep.HOME || step === ConsumerStep.AI_CHAT)
                          ? 'bg-[#4E6E2A]/35 border-[#82B440]/60'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleJumpDemoScene('customer_home')}
                          className="flex-1 text-left cursor-pointer"
                        >
                          <p className="text-xs font-semibold text-white">
                            ① [고객] 컨디션 홈 & 올이 10초 주문
                          </p>
                          <p className="text-[10.5px] text-[#C8D0C4] mt-0.5">
                            비가격 효용 지표 · 원탭 Zero-UI 진입
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleJumpDemoScene('customer_chat')}
                          className="px-2.5 py-1 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-[10.5px] font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          올이 대화 →
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleJumpDemoScene('b2b_checkout')}
                      className={`w-full text-left rounded-xl border transition-colors p-2.5 cursor-pointer ${
                        role === DemoRole.CONSUMER && step === ConsumerStep.CONFIRM
                          ? 'bg-[#4E6E2A]/35 border-[#82B440]/60'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <p className="text-xs font-semibold text-white">
                        ② [결제] B2B 식대 & 추천 근거 확인 결제
                      </p>
                      <p className="text-[10.5px] text-[#C8D0C4] mt-0.5">
                        맞춤 추천 근거 · 자생형 법인 식대 결제
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleJumpDemoScene('owner_dashboard')}
                      className={`w-full text-left rounded-xl border transition-colors p-2.5 cursor-pointer ${
                        role === DemoRole.OWNER
                          ? 'bg-[#4E6E2A]/35 border-[#82B440]/60'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <p className="text-xs font-semibold text-white">
                        ③ [점주] 실시간 주문 접수 · 순수익 대시보드
                      </p>
                      <p className="text-[10.5px] text-[#C8D0C4] mt-0.5">
                        입점 효과 요약 · 광고비 절감 & 단골 매칭 순증 매출
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleJumpDemoScene('superapp_hub')}
                      className={`w-full text-left rounded-xl border transition-colors p-2.5 cursor-pointer ${
                        role === DemoRole.CONSUMER && step === ConsumerStep.SUPERAPP
                          ? 'bg-[#4E6E2A]/35 border-[#82B440]/60'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <p className="text-xs font-semibold text-white">
                        ④ [확장] 동네 생활 확장 허브
                      </p>
                      <p className="text-[10.5px] text-[#C8D0C4] mt-0.5">
                        이웃 공동구매 · 오피스 B2B · 생활 심부름 통합
                      </p>
                    </button>
                  </div>

                  {/* Compact Presenter Utilities */}
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-1.5 text-[10.5px] text-[#DCE2D9]">
                    <button
                      type="button"
                      onClick={() => {
                        setRole(DemoRole.PARTNER);
                        setShowDemoSwitcher(false);
                      }}
                      className="px-2 py-1 rounded-lg bg-white/8 hover:bg-white/15 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Truck className="w-3 h-3 text-[#82B440]" />
                      <span>파트너 ({activePartnerOrderCount})</span>
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDemoSwitcher(false);
                          setShowFutureModal(true);
                        }}
                        className="px-2 py-1 rounded-lg hover:bg-white/10 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <HelpCircle className="w-3 h-3 text-[#C8D0C4]" />
                        <span>안내</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleResetDemo();
                          setShowDemoSwitcher(false);
                        }}
                        className="px-2 py-1 rounded-lg hover:bg-white/10 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3 text-[#C8D0C4]" />
                        <span>초기화</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            )}

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowDemoSwitcher(false);
                  setShowNotifications((prev) => !prev);
                }}
                aria-expanded={showNotifications}
                aria-label="알림 보기"
                className="easy-compact relative w-10 h-10 rounded-xl hover:bg-[#F7F8F5] text-[#1A1D1A] flex items-center justify-center transition-colors cursor-pointer"
              >
              <Bell className="w-5 h-5" strokeWidth={1.9} />
              {deliveryNotifications.some((n) => !n.read) ? (
                <span
                  aria-label={`읽지 않은 배달 알림 ${deliveryNotifications.filter((n) => !n.read).length}건`}
                  className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D9381E] text-white text-[10px] font-extrabold leading-none flex items-center justify-center ring-2 ring-white"
                >
                  {deliveryNotifications.filter((n) => !n.read).length}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#82B440] ring-2 ring-white"
                />
              )}
            </button>

            {showNotifications && (
              <div
                role="dialog"
                aria-label="최근 알림"
                className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[75vh] overflow-y-auto bg-white border border-[#E8ECE4] rounded-2xl shadow-lg p-4 space-y-3 z-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1A1D1A]">
                    올이 · 실시간 배달 알림
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowNotifications(false)}
                    aria-label="알림 닫기"
                    className="p-1 text-[#687064] hover:text-[#1A1D1A] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-2 text-xs">
                  {deliveryNotifications.map((notif) => {
                    const stageLabel =
                      notif.stage === 'DEPARTED'
                        ? '배달 출발'
                        : notif.stage === 'FIVE_MIN_LEFT'
                        ? '도착 5분 전'
                        : '도착 완료';
                    const stagePillClass =
                      notif.stage === 'ARRIVED'
                        ? 'bg-[#3D5720] text-white'
                        : notif.stage === 'FIVE_MIN_LEFT'
                        ? 'bg-[#D9381E] text-white'
                        : 'bg-[#82B440] text-white';

                    return (
                      <button
                        key={notif.id}
                        type="button"
                        onClick={() => openOrderTrackingFromNotification(notif)}
                        className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                          notif.read
                            ? 'bg-[#F7F8F5] border-[#E8ECE4] hover:bg-[#EAF1E2]'
                            : 'bg-[#FFF9ED] border-[#F0D9A8] hover:bg-[#FFF2D6]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${stagePillClass}`}>
                            {stageLabel}
                          </span>
                          <span className="text-[11px] text-[#687064]">{notif.createdAt}</span>
                        </div>
                        <p className="font-bold text-[#1A1D1A] leading-snug">
                          {notif.title}
                        </p>
                        <p className="text-[#4A5048] mt-0.5 leading-snug">
                          {notif.body}
                        </p>
                        <p className="text-[11px] font-bold text-[#3D5720] mt-1.5 inline-flex items-center gap-1">
                          <Navigation className="w-3 h-3" />
                          배달 위치 확인 →
                        </p>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setShowNotifications(false);
                      setRole(DemoRole.CONSUMER);
                      setStep(ConsumerStep.STATUS);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-[#EAF1E2] hover:bg-[#DCE7CF] transition-colors cursor-pointer"
                  >
                    <p className="font-semibold text-[#3D5720]">
                      실시간 주문 · 최적 배차 안내
                    </p>
                    <p className="text-[#687064] mt-0.5">
                      진행 중인 주문 {appState.orders.length}건의 도착 현황을 확인하세요.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotifications(false);
                      setRole(DemoRole.CONSUMER);
                      setStep(ConsumerStep.SUPERAPP);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-[#F7F8F5] hover:bg-[#EAF1E2] transition-colors cursor-pointer"
                  >
                    <p className="font-semibold text-[#1A1D1A]">
                      이웃 공동구매 · 오피스 B2B 예약 확인
                    </p>
                    <p className="text-[#687064] mt-0.5">
                      12:40 식사 도착 예정에 맞춘 이동 스케줄이 준비되었어요.
                    </p>
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </header>

      {activeDeliveryAlert && (
        <div className="fixed top-[68px] left-1/2 -translate-x-1/2 z-50 w-[calc(100%-24px)] max-w-md">
          <div
            role="button"
            tabIndex={0}
            onClick={() => openOrderTrackingFromNotification(activeDeliveryAlert)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openOrderTrackingFromNotification(activeDeliveryAlert);
              }
            }}
            aria-label={`${activeDeliveryAlert.title} 배달 위치 확인하기`}
            className="w-full text-left bg-[#1A1D1A] text-white rounded-2xl shadow-xl border border-[#3D5720] p-3.5 flex items-start gap-3 cursor-pointer hover:bg-[#252A25] transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-[#82B440] text-white flex items-center justify-center shrink-0 mt-0.5">
              <Navigation className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold text-[#DCE7CF] truncate">
                {activeDeliveryAlert.title}
              </p>
              <p className="text-xs text-white/90 mt-0.5 leading-snug">
                {activeDeliveryAlert.body}
              </p>
              <p className="text-[11px] font-bold text-[#BFE08C] mt-1.5">
                배달 위치 확인 →
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveDeliveryAlert(null);
              }}
              aria-label="알림 배너 닫기"
              className="p-1 text-white/70 hover:text-white shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {storageMode === 'memory' && (
        <div
          role="status"
          className="bg-amber-50/90 border-b border-amber-200 px-4 py-2 text-center text-xs font-medium text-amber-900"
        >
          브라우저 저장소를 사용할 수 없어 메모리 모드로 동작 중입니다.
        </div>
      )}

      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] px-4 py-2.5 bg-[#1A1D1A] text-white text-xs sm:text-sm font-medium rounded-2xl shadow-[0_12px_32px_rgba(26,29,26,0.22)] border border-white/10"
        >
          {toastMessage}
        </div>
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 pt-6 pb-28 md:pt-8 md:pb-28">
        {role === DemoRole.OWNER ? (
          <OwnerDashboardView
            stores={appState.stores}
            menus={appState.menus}
            orders={appState.orders}
            reviews={INITIAL_REVIEWS}
            reviewReplies={appState.reviewReplies}
            priceReports={appState.priceReports}
            stampCount={appState.stampCount}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onCancelOrderBeforeCooking={handleCancelBeforeCooking}
            onToggleStoreOpen={handleToggleStoreOpen}
            onAdjustStoreExtraPrep={handleAdjustStoreExtraPrep}
            onSetStoreExtraPrep={handleSetStoreExtraPrep}
            onToggleMenuSoldOut={handleToggleMenuSoldOut}
            onToggleMenuClosingSale={handleToggleMenuClosingSale}
            onAdjustMenuStock={handleAdjustMenuStock}
            onAddMenuFromLine={handleAddMenuFromLine}
            onBulkAddMenusFromSample={handleBulkAddMenusFromSample}
            onSaveReviewReply={handleSaveReviewReply}
            onToggleReviewFlag={handleToggleReviewFlag}
            onAttachOwnerPhotos={(orderId, photos) =>
              handleAttachOrderPhotos(orderId, 'owner', photos)
            }
            ownerSaasPlan={
              appState.ownerSaasPlan ??
              (appState.ownerSaasSubscribed ? 'pro' : 'trial')
            }
            onSelectOwnerSaasPlan={handleSelectOwnerSaasPlan}
            onSwitchToConsumer={() => setRole(DemoRole.CONSUMER)}
            onOpenAiSettings={() => setShowGeminiModal(true)}
          />
        ) : role === DemoRole.PARTNER ? (
          <PartnerDashboardView
            orders={appState.orders}
            errands={appState.errands}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onAdvanceErrand={handleAdvanceErrand}
            onAttachRiderPhotos={(orderId, photos) =>
              handleAttachOrderPhotos(orderId, 'rider', photos)
            }
            onSwitchToConsumer={() => setRole(DemoRole.CONSUMER)}
            onSwitchToOwner={() => setRole(DemoRole.OWNER)}
          />
        ) : step === ConsumerStep.HOME ? (
          <ConditionHome
            rawInput={rawInput}
            parsedCondition={parsedCondition}
            preferences={appState.preferences}
            stores={appState.stores}
            menus={appState.menus}
            orders={appState.orders}
            reviews={INITIAL_REVIEWS}
            reviewReplies={appState.reviewReplies}
            stampCount={appState.stampCount}
            wishlistIds={appState.wishlistIds}
            easyMode={appState.easyMode}
            onToggleEasyMode={handleToggleEasyMode}
            onToggleWishlist={handleToggleWishlist}
            onOpenAiChat={(prompt) => {
              setAiChatInitialPrompt(prompt);
              setRole(DemoRole.CONSUMER);
              setStep(ConsumerStep.AI_CHAT);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onEarnStamp={handleEarnStamp}
            onRawInputChange={handleRawInputChange}
            onUpdateParsedCondition={setParsedCondition}
            onSubmitSearch={handleSubmitSearch}
            onQuickSelectMenu={handleQuickSelectMenu}
            onQuickReorderToConfirm={handleQuickReorderToConfirm}
            onOpenQuickPay={handleOpenQuickPay}
            onAddToCart={handleAddToCart}
            onOpenSuperApp={handleOpenSuperApp}
            onOpenBrowse={handleOpenBrowse}
            onOpenStoreMenu={handleOpenStoreMenu}
            onSavePreferences={handleSavePreferences}
            onApplyPreferencesToInput={handleApplyPreferencesToInput}
            activeLocation={activeLocation}
            onOpenLocationPicker={() => setShowLocationPicker(true)}
          />
        ) : step === ConsumerStep.BROWSE ? (
          <CategoryBrowseView
            stores={appState.stores}
            menus={appState.menus}
            reviews={INITIAL_REVIEWS}
            wishlistIds={appState.wishlistIds}
            activeLocation={activeLocation}
            initialCategory={browseInitialCategory}
            initialQuery={browseInitialQuery}
            onBackToHome={() => setStep(ConsumerStep.HOME)}
            onOpenLocationPicker={() => setShowLocationPicker(true)}
            onOpenAiChat={(prompt) => {
              setAiChatInitialPrompt(prompt);
              setRole(DemoRole.CONSUMER);
              setStep(ConsumerStep.AI_CHAT);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onToggleWishlist={handleToggleWishlist}
            onAddToCart={handleAddToCart}
            onOpenStoreMenu={handleOpenStoreMenu}
            onQuickOrderMenu={(menuId, servings) =>
              handleQuickReorderToConfirm(menuId, servings)
            }
          />
        ) : step === ConsumerStep.AI_CHAT ? (
          <AiChatOrderView
            stores={appState.stores}
            menus={appState.menus}
            reviews={INITIAL_REVIEWS}
            wishlistIds={appState.wishlistIds}
            activeLocation={activeLocation}
            initialPrompt={aiChatInitialPrompt}
            walletBalance={appState.walletBalance}
            stampCount={appState.stampCount}
            defaultNote={appState.preferences.memoNote}
            onToggleWishlist={handleToggleWishlist}
            onBackToHome={() => {
              setAiChatInitialPrompt(undefined);
              setStep(ConsumerStep.HOME);
            }}
            onOpenAiSettings={() => setShowGeminiModal(true)}
            onOpenSuperApp={handleOpenSuperApp}
            onUseRelayCoupon={(menuId) =>
              handleQuickReorderToConfirm(menuId, 1, { couponCode: 'RELAY1000' })
            }
            onAddToCart={handleAddToCart}
            onAddMultipleToCart={handleAddMultipleToCart}
            onOpenStoreMenu={handleOpenStoreMenu}
            onProceedToConfirmWithItems={handleProceedToConfirmWithItems}
            onOpenBrowse={handleOpenBrowse}
            onOpenRecommendationWithCondition={handleOpenRecommendationWithCondition}
            onProceedToConfirm={handleProceedToConfirm}
            onCompleteVoiceOrder={handleConfirmOrder}
          />
        ) : step === ConsumerStep.RECOMMEND ? (
          <RecommendationView
            condition={activeCondition}
            matches={recommendationResult.matches}
            excluded={recommendationResult.excluded}
            reviews={INITIAL_REVIEWS}
            reviewReplies={appState.reviewReplies}
            allMenus={appState.menus}
            selectedMenuId={selectedMenuId}
            wishlistIds={appState.wishlistIds}
            onToggleWishlist={handleToggleWishlist}
            onSelectMenu={setSelectedMenuId}
            onBackToHome={() => setStep(ConsumerStep.HOME)}
            onQuickRelaxCondition={handleQuickRelaxCondition}
            onReportPriceDifference={handleReportPriceDifference}
            onAddToCart={handleAddToCart}
            onAddMultipleToCart={handleAddMultipleToCart}
            onOpenStoreMenu={handleOpenStoreMenu}
            onProceedToConfirmWithItems={handleProceedToConfirmWithItems}
            onProceedToConfirm={handleProceedToConfirm}
          />
        ) : step === ConsumerStep.CONFIRM &&
          confirmDraft &&
          confirmMenu &&
          confirmStore ? (
          <OrderConfirmationView
            key={confirmDraft.draftId}
            menu={confirmMenu}
            store={confirmStore}
            storeMenus={appState.menus.filter(
              (m) => m.storeId === confirmStore.id
            )}
            initialItems={confirmDraft.items}
            initialServings={confirmDraft.items[0]?.quantity ?? 1}
            initialOptionIds={confirmDraft.items[0]?.selectedOptionIds ?? []}
            initialCouponCode={confirmDraft.couponCode}
            initialSharedDelivery={confirmDraft.sharedDeliveryApplied}
            initialReservationSlot={confirmDraft.reservationSlot}
            initialPaymentMethod={confirmDraft.paymentMethod}
            activeAreaName={activeLocation.areaName}
            defaultAddressAlias={activeLocation.detailAddress}
            walletBalance={appState.walletBalance}
            stampCount={appState.stampCount}
            defaultNote={appState.preferences.memoNote}
            onTopupWalletConfirmed={handleTopupWalletConfirmed}
            onOpenLocationPicker={() => setShowLocationPicker(true)}
            onBack={() => setStep(prevStepBeforeConfirm)}
            onConfirmOrder={handleConfirmOrder}
          />
        ) : step === ConsumerStep.WISHLIST ? (
          <WishlistView
            menus={appState.menus}
            stores={appState.stores}
            wishlistIds={appState.wishlistIds}
            reviews={INITIAL_REVIEWS}
            reviewReplies={appState.reviewReplies}
            onToggleWishlist={handleToggleWishlist}
            onQuickSelectMenu={handleQuickSelectMenu}
            onAddToCart={handleAddToCart}
            onQuickReorderToConfirm={handleQuickReorderToConfirm}
            onGoToBrowse={() => setStep(ConsumerStep.HOME)}
          />
        ) : step === ConsumerStep.MY ? (
          <MyHubView
            role={role}
            walletBalance={appState.walletBalance}
            stampCount={appState.stampCount}
            preferences={appState.preferences}
            wishlistCount={appState.wishlistIds.length}
            orderCount={appState.orders.length}
            orders={appState.orders}
            menus={appState.menus}
            easyMode={appState.easyMode}
            showPresenterMode={showPresenterMode}
            regularMenuId={appState.orders[0]?.menuId ?? 'm1'}
            regularMenuName={appState.orders[0]?.menuName ?? '얼큰 소고기국밥'}
            regularStoreName={
              appState.orders[0]?.storeName ?? '역삼 진국 소고기국밥'
            }
            regularServings={appState.orders[0]?.servings ?? 2}
            activeLocation={activeLocation}
            onTopupWalletConfirmed={handleTopupWalletConfirmed}
            onEarnStamp={handleEarnStamp}
            onChangeRole={setRole}
            onToggleEasyMode={handleToggleEasyMode}
            onTogglePresenterMode={() => setShowPresenterMode((prev) => !prev)}
            onOpenAiSettings={() => setShowGeminiModal(true)}
            onShareDemoSummary={handleShareDemoSummary}
            onGoToHomePrefs={() => setStep(ConsumerStep.HOME)}
            onQuickReorderToConfirm={(menuId, servings) =>
              handleQuickReorderToConfirm(menuId, servings)
            }
            onOpenAiChat={(prompt) => {
              setAiChatInitialPrompt(prompt);
              setRole(DemoRole.CONSUMER);
              setStep(ConsumerStep.AI_CHAT);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenLocationPicker={() => setShowLocationPicker(true)}
          />
        ) : step === ConsumerStep.SUPERAPP ? (
          <SuperAppHubView
            activeTab={superAppTab}
            onChangeTab={setSuperAppTab}
            stores={appState.stores}
            menus={appState.menus}
            reviews={INITIAL_REVIEWS}
            reviewReplies={appState.reviewReplies}
            errands={appState.errands}
            latestOrder={appState.orders[0]}
            activeLocation={activeLocation}
            onJoinGroupBuy={handleJoinGroupBuy}
            onCreateB2BOrder={handleCreateB2BOrder}
            onCreateMarketBundleOrder={handleCreateMarketBundleOrder}
            onCreateErrand={handleCreateErrand}
            onAdvanceErrand={handleAdvanceErrand}
          />
        ) : (
          <OrderStatusView
            orders={appState.orders}
            errands={appState.errands}
            stores={appState.stores}
            menus={appState.menus}
            highlightedOrderId={highlightedOrderId}
            mapFocusRequest={mapFocusRequest}
            showPresenterMode={showPresenterMode}
            onCancelBeforeCooking={handleCancelBeforeCooking}
            onRequestCancelAfterCooking={handleRequestCancelAfterCooking}
            onAttachEvidence={handleAttachEvidence}
            onQuickReorderToConfirm={handleQuickReorderToConfirm}
            onQuickReorderOrder={handleOpenQuickPayFromOrder}
            onUseRelayCoupon={(menuId) =>
              handleQuickReorderToConfirm(menuId, 1, { couponCode: 'RELAY1000' })
            }
            onGoToOwnerDemo={() => setRole(DemoRole.OWNER)}
            onNewOrder={() => setStep(ConsumerStep.HOME)}
          />
        )}
      </main>

      <footer className="hidden md:block border-t border-[#E8ECE4] bg-white pt-5 pb-24 px-4 sm:px-6 text-xs text-[#687064]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span>alle · 일상을 알아서, 우리 동네와 함께</span>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setShowFutureModal(true)}
              className="font-medium text-[#687064] hover:text-[#1A1D1A] transition-colors cursor-pointer"
            >
              서비스 안내
            </button>
            <button
              type="button"
              onClick={handleResetDemo}
              className="font-medium text-[#687064] hover:text-[#4E6E2A] transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>데이터 초기화</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Floating Cart Bar (same-store multi-item cart) */}
      {role === DemoRole.CONSUMER &&
        cart &&
        cartStore &&
        cartSummary.totalCount > 0 &&
        (step === ConsumerStep.HOME ||
          step === ConsumerStep.BROWSE ||
          step === ConsumerStep.AI_CHAT ||
          step === ConsumerStep.RECOMMEND ||
          step === ConsumerStep.WISHLIST) && (
          <div className="fixed bottom-[72px] left-1/2 -translate-x-1/2 z-40 w-[calc(100%-24px)] max-w-xl">
            <div className="rounded-2xl bg-[#1A1D1A] text-white border border-[#4E6E2A]/60 shadow-[0_14px_34px_rgba(26,29,26,0.28)] px-3.5 py-2.5 flex items-center justify-between gap-2.5">
              <div className="min-w-0 flex items-center gap-2.5">
                <div className="relative w-9 h-9 rounded-xl bg-[#4E6E2A] text-white flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-4 h-4" />
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#EAF1E2] text-[#1A1D1A] text-[10px] font-bold flex items-center justify-center">
                    {cartSummary.totalCount}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-[#B8C4B2] truncate">
                    {cartStore.name}
                  </p>
                  <p className="text-xs sm:text-sm font-bold text-white truncate">
                    {cartSummary.label} · {formatWon(cartSummary.totalAmount)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPrevStepBeforeConfirm(step);
                    setConfirmDraft({
                      draftId: `draft-cart-${Date.now()}`,
                      storeId: cart.storeId,
                      items: cart.items,
                      couponCode: 'NONE',
                      sharedDeliveryApplied: false,
                      reservationSlot: 'now',
                    });
                    setRole(DemoRole.CONSUMER);
                    setStep(ConsumerStep.CONFIRM);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="easy-compact min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#82B440] hover:bg-[#72A135] text-[#111411] text-xs sm:text-sm font-bold whitespace-nowrap cursor-pointer"
                >
                  주문하기
                </button>
                <button
                  type="button"
                  onClick={() => setCart(null)}
                  aria-label="장바구니 비우기"
                  className="easy-compact w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-[#DCE2D9] flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Bottom Navigation Bar: 홈 / AI 주문 / 주문내역 / 찜 / MY */}
      <nav
        aria-label="하단 탭 네비게이션"
        className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#FFFFFF] border-t border-[#E8ECE4]"
      >
        <div className="max-w-5xl mx-auto h-full grid grid-cols-5 items-center px-2">
          <button
            type="button"
            onClick={() => {
              setRole(DemoRole.CONSUMER);
              setStep(ConsumerStep.HOME);
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
              role === DemoRole.CONSUMER && step === ConsumerStep.HOME
                ? 'text-[#4E6E2A] font-semibold'
                : 'text-[#687064] hover:text-[#1A1D1A]'
            }`}
          >
            <Home
              className="w-5 h-5"
              strokeWidth={
                role === DemoRole.CONSUMER && step === ConsumerStep.HOME ? 2.2 : 1.75
              }
            />
            <span className="text-[11px] leading-none">홈</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAiChatInitialPrompt(undefined);
              setRole(DemoRole.CONSUMER);
              setStep(ConsumerStep.AI_CHAT);
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
              role === DemoRole.CONSUMER &&
              (step === ConsumerStep.AI_CHAT ||
                step === ConsumerStep.RECOMMEND ||
                step === ConsumerStep.CONFIRM)
                ? 'text-[#4E6E2A] font-semibold'
                : 'text-[#687064] hover:text-[#1A1D1A]'
            }`}
          >
            <Sparkles
              className="w-5 h-5"
              strokeWidth={
                role === DemoRole.CONSUMER &&
                (step === ConsumerStep.AI_CHAT ||
                  step === ConsumerStep.RECOMMEND ||
                  step === ConsumerStep.CONFIRM)
                  ? 2.2
                  : 1.75
              }
            />
            <span className="text-[11px] leading-none">올이 주문</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRole(DemoRole.CONSUMER);
              setStep(ConsumerStep.STATUS);
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
              role === DemoRole.CONSUMER && step === ConsumerStep.STATUS
                ? 'text-[#4E6E2A] font-semibold'
                : 'text-[#687064] hover:text-[#1A1D1A]'
            }`}
          >
            <ClipboardList
              className="w-5 h-5"
              strokeWidth={
                role === DemoRole.CONSUMER && step === ConsumerStep.STATUS
                  ? 2.2
                  : 1.75
              }
            />
            <span className="text-[11px] leading-none">주문내역</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRole(DemoRole.CONSUMER);
              setStep(ConsumerStep.WISHLIST);
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
              role === DemoRole.CONSUMER && step === ConsumerStep.WISHLIST
                ? 'text-[#4E6E2A] font-semibold'
                : 'text-[#687064] hover:text-[#1A1D1A]'
            }`}
          >
            <Heart
              className="w-5 h-5"
              strokeWidth={
                role === DemoRole.CONSUMER && step === ConsumerStep.WISHLIST
                  ? 2.2
                  : 1.75
              }
            />
            <span className="text-[11px] leading-none">찜</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRole(DemoRole.CONSUMER);
              setStep(ConsumerStep.MY);
            }}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
              role === DemoRole.CONSUMER &&
              (step === ConsumerStep.MY || step === ConsumerStep.SUPERAPP)
                ? 'text-[#4E6E2A] font-semibold'
                : 'text-[#687064] hover:text-[#1A1D1A]'
            }`}
          >
            <User
              className="w-5 h-5"
              strokeWidth={
                role === DemoRole.CONSUMER &&
                (step === ConsumerStep.MY || step === ConsumerStep.SUPERAPP)
                  ? 2.2
                  : 1.75
              }
            />
            <span className="text-[11px] leading-none">MY</span>
          </button>
        </div>
      </nav>

      {pendingCartSwitch && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="장바구니 매장 변경 확인"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E8ECE4] p-5 shadow-2xl space-y-4">
            <div className="space-y-1.5">
              <p className="text-base font-bold text-[#1A1D1A]">
                장바구니 매장을 바꿀까요?
              </p>
              <p className="text-xs sm:text-sm text-[#687064] leading-relaxed">
                현재{' '}
                <strong className="text-[#1A1D1A]">
                  {cartStore?.name ?? '다른 매장'}
                </strong>{' '}
                메뉴가 담겨 있습니다. 비우고{' '}
                <strong className="text-[#1A1D1A]">
                  {pendingCartSwitch.storeName} · {pendingCartSwitch.summaryLabel}
                </strong>
                을(를) 담을까요?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPendingCartSwitch(null)}
                className="min-h-[44px] px-3 py-2 rounded-2xl border border-[#DCE2D9] text-sm font-semibold text-[#1A1D1A] hover:bg-[#F7F8F5] cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = pendingCartSwitch;
                  setCart({
                    storeId: next.storeId,
                    items: next.items,
                  });
                  setPendingCartSwitch(null);
                  showToast(`'${next.summaryLabel}'이(가) 장바구니에 담겼습니다.`);
                }}
                className="min-h-[44px] px-3 py-2 rounded-2xl bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-sm font-semibold cursor-pointer"
              >
                비우고 담기
              </button>
            </div>
          </div>
        </div>
      )}

      <QuickPayBottomSheet
        isOpen={Boolean(
          quickPayDraft && quickPayStore && quickPayItems.length > 0
        )}
        store={quickPayStore}
        items={quickPayItems}
        defaultPaymentMethod={quickPayDraft?.paymentMethod}
        defaultCouponCode={quickPayDraft?.couponCode}
        walletBalance={appState.walletBalance}
        stampCount={appState.stampCount}
        activeLocation={activeLocation}
        customerNote={
          quickPayDraft?.customerNote ?? appState.preferences.memoNote
        }
        easyMode={appState.easyMode}
        onTopupWallet={handleTopupWalletConfirmed}
        onOpenFullCheckout={({ paymentMethod, couponCode }) => {
          if (!quickPayDraft) return;
          setPrevStepBeforeConfirm(step);
          setConfirmDraft({
            draftId: `draft-quick-${Date.now()}`,
            storeId: quickPayDraft.storeId,
            items: quickPayDraft.items,
            couponCode,
            sharedDeliveryApplied: false,
            reservationSlot: 'now',
            paymentMethod,
          });
          setQuickPayDraft(null);
          setRole(DemoRole.CONSUMER);
          setStep(ConsumerStep.CONFIRM);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onConfirmQuickPay={(payload) => {
          const firstItem = payload.items[0];
          const totalServings = payload.items.reduce(
            (sum, it) => sum + it.quantity,
            0
          );
          return handleConfirmOrder({
            menuId: firstItem?.menuId ?? '',
            servings: Math.max(1, totalServings),
            selectedOptionIds: firstItem?.selectedOptionIds ?? [],
            items: payload.items,
            couponCode: payload.couponCode,
            couponDiscount: payload.couponDiscount,
            sharedDeliveryApplied: false,
            reservationSlot: null,
            customerAlias: '단골 고객',
            addressAlias: activeLocation.detailAddress,
            customerNote: payload.customerNote,
            paymentMethod: payload.paymentMethod,
            paymentMethodLabel: payload.paymentMethodLabel,
            estimatedSavings: payload.estimatedSavings,
          });
        }}
        onClose={() => setQuickPayDraft(null)}
      />

      <StoreMenuModal
        store={
          storeMenuModal
            ? appState.stores.find((s) => s.id === storeMenuModal.storeId) ??
              null
            : null
        }
        storeMenus={
          storeMenuModal
            ? appState.menus.filter(
                (m) => m.storeId === storeMenuModal.storeId
              )
            : []
        }
        highlightMenuId={storeMenuModal?.highlightMenuId}
        initialServings={storeMenuModal?.initialServings}
        initialOptionIds={storeMenuModal?.initialOptionIds}
        preselectHighlight={storeMenuModal?.preselectHighlight}
        reviews={INITIAL_REVIEWS}
        reviewReplies={appState.reviewReplies}
        cart={cart}
        wishlistIds={appState.wishlistIds}
        onToggleWishlist={handleToggleWishlist}
        onAddMultipleToCart={handleAddMultipleToCart}
        onProceedToConfirmWithItems={handleProceedToConfirmWithItems}
        onClose={() => setStoreMenuModal(null)}
      />

      <LocationPickerModal
        isOpen={showLocationPicker}
        locations={appState.savedLocations}
        selectedLocationId={activeLocation.id}
        onSelectLocation={handleSelectLocation}
        onAddLocation={handleAddLocation}
        onDeleteLocation={handleDeleteLocation}
        onClose={() => setShowLocationPicker(false)}
      />

      <GeminiKeyModal
        isOpen={showGeminiModal}
        onClose={() => setShowGeminiModal(false)}
      />

      <FutureScopeModal
        isOpen={showFutureModal}
        onClose={() => setShowFutureModal(false)}
      />
    </div>
  );
}
