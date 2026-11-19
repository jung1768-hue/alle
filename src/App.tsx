import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ClipboardList,
  Heart,
  HelpCircle,
  Home,
  MapPin,
  Presentation,
  RotateCcw,
  Search,
  Sparkles,
  Store as StoreIcon,
  Truck,
  User,
  X,
} from 'lucide-react';
import { AiChatOrderView } from './components/AiChatOrderView';
import { AlleLogo } from './components/AlleBrand';
import { ConditionHome } from './components/ConditionHome';
import { FutureScopeModal } from './components/FutureScopeModal';
import { GeminiKeyModal } from './components/GeminiKeyModal';
import { LocationPickerModal } from './components/LocationPickerModal';
import { MyHubView } from './components/MyHubView';
import { OrderConfirmationView } from './components/OrderConfirmationView';
import { OrderStatusView } from './components/OrderStatusView';
import { OwnerDashboardView } from './components/OwnerDashboardView';
import { PartnerDashboardView } from './components/PartnerDashboardView';
import { RecommendationView } from './components/RecommendationView';
import { SuperAppHubView } from './components/SuperAppHubView';
import { WishlistView } from './components/WishlistView';
import { INITIAL_REVIEWS, PROHIBITED_ERRAND_KEYWORDS } from './data/seedData';
import {
  AllePersistedState,
  ConsumerStep,
  DemoRole,
  DispatchMode,
  ErrandRequest,
  ErrandStatus,
  EvidenceRecord,
  MenuItem,
  Order,
  OrderStatus,
  ParsedCondition,
  PaymentMethod,
  PriceReport,
  SavedLocation,
  SuperAppTab,
  UserPreferences,
} from './types/alle';
import {
  evaluateRecommendations,
  getEffectiveMenuPrice,
  parseConditionInput,
} from './utils/parser';
import { checkServerGeminiAvailable } from './utils/gemini';
import {
  extractSharedState,
  FirebaseSyncStatus,
  pushSharedState,
  subscribeSharedState,
} from './utils/firebase';
import {
  loadDemoState,
  resetDemoStorage,
  saveDemoState,
  StorageMode,
} from './utils/storage';

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
    menuId: string;
    servings: number;
    selectedOptionIds: string[];
    couponCode: string;
    sharedDeliveryApplied?: boolean;
    reservationSlot?: string;
    paymentMethod?: PaymentMethod;
  } | null>(null);

  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(
    null
  );
  const [aiChatInitialPrompt, setAiChatInitialPrompt] = useState<
    string | undefined
  >(undefined);
  const [showFutureModal, setShowFutureModal] = useState<boolean>(false);
  const [showGeminiModal, setShowGeminiModal] = useState<boolean>(false);
  const [showLocationPicker, setShowLocationPicker] = useState<boolean>(false);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showDemoSwitcher, setShowDemoSwitcher] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [firebaseSyncStatus, setFirebaseSyncStatus] =
    useState<FirebaseSyncStatus>('connecting');

  const orderSubmitLockRef = useRef<boolean>(false);
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
      },
      (status) => {
        setFirebaseSyncStatus(status);
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
        areaName: '대구 수성구 범어동',
        detailAddress: '수성구 범어동 수령지 A',
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
      appState.menus
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
  }, [activeCondition, appState.stores, appState.menus, selectedMenuId]);

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
      appState.menus
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
      appState.menus
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

  const handleQuickReorderToConfirm = (
    menuId: string,
    servings: number,
    options?: {
      sharedDeliveryApplied?: boolean;
      reservationSlot?: string;
      couponCode?: string;
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
    setConfirmDraft({
      menuId,
      servings: Math.min(Math.max(1, servings), targetMenu.stock),
      selectedOptionIds: [],
      couponCode: options?.couponCode ?? 'NONE',
      sharedDeliveryApplied: options?.sharedDeliveryApplied ?? false,
      reservationSlot: options?.reservationSlot ?? 'now',
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
      appState.menus
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
    setConfirmDraft(payload);
    setStep(ConsumerStep.CONFIRM);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleConfirmOrder = (payload: {
    menuId: string;
    servings: number;
    selectedOptionIds: string[];
    couponCode: string;
    couponDiscount: number;
    sharedDeliveryApplied: boolean;
    reservationSlot: string | null;
    customerAlias: string;
    addressAlias: string;
    customerNote: string;
    paymentMethod?: PaymentMethod;
    paymentMethodLabel?: string;
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
    if (!targetStore.isOpen) {
      return { ok: false, error: '현재 영업 중단 상태인 가게입니다.' };
    }
    if (targetMenu.isSoldOut || targetMenu.stock <= 0) {
      return { ok: false, error: '품절된 메뉴입니다.' };
    }
    if (!Number.isInteger(payload.servings) || payload.servings < 1) {
      return { ok: false, error: '수량은 1 이상의 양의 정수여야 합니다.' };
    }
    if (targetMenu.stock < payload.servings) {
      return {
        ok: false,
        error: `남은 재고(${targetMenu.stock}개)가 부족합니다.`,
      };
    }

    orderSubmitLockRef.current = true;

    const effectiveUnitPrice = getEffectiveMenuPrice(targetMenu);
    const menuSubtotal = effectiveUnitPrice * payload.servings;
    const selectedOpts = targetMenu.options.filter((o) =>
      payload.selectedOptionIds.includes(o.id)
    );
    const optionsSubtotal = selectedOpts.reduce((sum, o) => sum + o.priceDelta, 0);
    const effectiveDeliveryFee = payload.sharedDeliveryApplied
      ? Math.round(targetStore.deliveryFee / 2)
      : targetStore.deliveryFee;
    const cappedCoupon = Math.max(
      0,
      Math.min(payload.couponDiscount, menuSubtotal)
    );
    const totalAmount =
      menuSubtotal + optionsSubtotal + effectiveDeliveryFee - cappedCoupon;

    const nowStr = formatNowTime();
    const nextNumber = 101 + appState.orders.length;
    const newOrderId = `ord-${Date.now()}`;

    const newOrder: Order = {
      id: newOrderId,
      orderCode: `ALLE-${nextNumber}`,
      storeId: targetStore.id,
      menuId: targetMenu.id,
      menuName: targetMenu.name,
      storeName: targetStore.name,
      customerAlias: payload.customerAlias,
      addressAlias: payload.addressAlias,
      servings: payload.servings,
      selectedOptionIds: selectedOpts.map((o) => o.id),
      selectedOptionNames: selectedOpts.map((o) => o.name),
      menuSubtotal,
      optionsSubtotal,
      deliveryFee: effectiveDeliveryFee,
      sharedDeliveryApplied: payload.sharedDeliveryApplied,
      reservationSlot: payload.reservationSlot,
      isB2B: payload.paymentMethod === 'b2b_meal_point',
      paymentMethod: payload.paymentMethod ?? 'local_currency',
      paymentMethodLabel:
        payload.paymentMethodLabel ?? '대구로페이 / 지역화폐',
      couponCode: payload.couponCode === 'NONE' ? null : payload.couponCode,
      couponDiscount: cappedCoupon,
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
      stampCount:
        payload.paymentMethod === 'alle_regular_pass'
          ? prev.stampCount + 1
          : prev.stampCount,
      menus: prev.menus.map((m) => {
        if (m.id !== targetMenu.id) return m;
        const nextStock = Math.max(0, m.stock - payload.servings);
        return {
          ...m,
          stock: nextStock,
          isSoldOut: nextStock === 0 ? true : m.isSoldOut,
        };
      }),
      orders: [newOrder, ...prev.orders],
    }));

    setHighlightedOrderId(newOrderId);
    setConfirmDraft(null);
    setStep(ConsumerStep.STATUS);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`${newOrder.orderCode} 주문이 접수되었습니다.`);

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
    actualReceiptCost?: number
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
          };
        }
        return {
          ...err,
          status: nextStatus,
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
          updatedAt: formatNowTime(),
        };
      }),
    }));
  };

  const handleCancelBeforeCooking = (orderId: string) => {
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

      return {
        ...prev,
        menus: shouldRestoreStock
          ? prev.menus.map((m) => {
              if (m.id !== targetOrder.menuId) return m;
              const restoredStock = m.stock + targetOrder.servings;
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
    showToast('조리 전 취소가 확정되어 재고 복구 및 모의 환불 처리되었습니다.');
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
      note: '매장가 대비 앱 가격 차이 제보',
    };
    setAppState((prev) => ({
      ...prev,
      priceReports: [report, ...prev.priceReports],
    }));
    showToast('가격 차이 제보가 접수되었습니다.');
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
      showToast('① AI 10초 음성·채팅 주문 시연');
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
          menuId: targetMenu.id,
          servings: Math.min(2, Math.max(1, targetMenu.stock)),
          selectedOptionIds: [],
          couponCode: 'NONE',
          sharedDeliveryApplied: false,
          reservationSlot: 'now',
          paymentMethod: 'b2b_meal_point',
        });
        setRole(DemoRole.CONSUMER);
        setStep(ConsumerStep.CONFIRM);
        showToast('② B2B 기업 식대 · AI 추천 근거 확인 결제');
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

  const confirmMenu = confirmDraft
    ? appState.menus.find((m) => m.id === confirmDraft.menuId)
    : undefined;
  const confirmStore = confirmMenu
    ? appState.stores.find((s) => s.id === confirmMenu.storeId)
    : undefined;

  const pendingOrderCount = appState.orders.filter(
    (o) => o.status === OrderStatus.PENDING
  ).length;
  const activePartnerOrderCount = appState.orders.filter(
    (o) => o.status === OrderStatus.COOKING || o.status === OrderStatus.PICKUP
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F8F5] text-[#1A1D1A]">
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

      {/* Clean Header: Brand Logo + Current Location + Notification Bell */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-[#E8ECE4]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
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
              className="hidden sm:inline-block h-4 w-px bg-[#E8ECE4] shrink-0"
            />

            <button
              type="button"
              onClick={() => setShowLocationPicker(true)}
              aria-label="등록된 위치 변경하기"
              className="hidden sm:inline-flex min-h-[36px] max-w-[260px] px-2.5 py-1 rounded-xl hover:bg-[#EAF1E2]/70 text-sm font-semibold text-[#1A1D1A] items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <MapPin className="w-4 h-4 text-[#4E6E2A] shrink-0" />
              <span className="truncate">{activeLocation.areaName}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#687064] shrink-0" />
            </button>
          </div>

          {/* Right Notification Bell Icon with Fresh Lime Green Dot */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowNotifications((prev) => !prev)}
              aria-expanded={showNotifications}
              aria-label="알림 보기"
              className="relative w-10 h-10 rounded-xl hover:bg-[#F7F8F5] text-[#1A1D1A] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Bell className="w-5 h-5" strokeWidth={1.9} />
              <span
                aria-hidden="true"
                className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#82B440] ring-2 ring-white"
              />
            </button>

            {showNotifications && (
              <div
                role="dialog"
                aria-label="최근 알림"
                className="absolute right-0 mt-2 w-72 sm:w-80 bg-white border border-[#E8ECE4] rounded-2xl shadow-lg p-4 space-y-3 z-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1A1D1A]">
                    Alle AI 알림
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
                      실시간 주문 · AI 최적 배차 안내
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

        {/* Mobile Compact Location Row right under Logo */}
        <div className="sm:hidden px-4 pb-2.5 pt-0.5 flex items-center">
          <button
            type="button"
            onClick={() => setShowLocationPicker(true)}
            aria-label="등록된 위치 변경하기"
            className="min-h-[32px] max-w-full px-1 py-0.5 rounded-lg text-[13px] font-semibold text-[#1A1D1A] inline-flex items-center gap-1 cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
            <span className="truncate">{activeLocation.areaName}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#687064] shrink-0" />
          </button>
        </div>
      </header>

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
            onSwitchToConsumer={() => setRole(DemoRole.CONSUMER)}
            onOpenAiSettings={() => setShowGeminiModal(true)}
          />
        ) : role === DemoRole.PARTNER ? (
          <PartnerDashboardView
            orders={appState.orders}
            errands={appState.errands}
            onAdvanceOrderStatus={handleAdvanceOrderStatus}
            onAdvanceErrand={handleAdvanceErrand}
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
            stampCount={appState.stampCount}
            wishlistIds={appState.wishlistIds}
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
            onOpenSuperApp={handleOpenSuperApp}
            onSavePreferences={handleSavePreferences}
            onApplyPreferencesToInput={handleApplyPreferencesToInput}
            activeLocation={activeLocation}
            onOpenLocationPicker={() => setShowLocationPicker(true)}
          />
        ) : step === ConsumerStep.AI_CHAT ? (
          <AiChatOrderView
            stores={appState.stores}
            menus={appState.menus}
            wishlistIds={appState.wishlistIds}
            initialPrompt={aiChatInitialPrompt}
            onToggleWishlist={handleToggleWishlist}
            onBackToHome={() => {
              setAiChatInitialPrompt(undefined);
              setStep(ConsumerStep.HOME);
            }}
            onOpenSuperApp={handleOpenSuperApp}
            onUseRelayCoupon={(menuId) =>
              handleQuickReorderToConfirm(menuId, 1, { couponCode: 'RELAY1000' })
            }
            onOpenRecommendationWithCondition={handleOpenRecommendationWithCondition}
            onProceedToConfirm={handleProceedToConfirm}
          />
        ) : step === ConsumerStep.RECOMMEND ? (
          <RecommendationView
            condition={activeCondition}
            matches={recommendationResult.matches}
            excluded={recommendationResult.excluded}
            reviews={INITIAL_REVIEWS}
            reviewReplies={appState.reviewReplies}
            selectedMenuId={selectedMenuId}
            wishlistIds={appState.wishlistIds}
            onToggleWishlist={handleToggleWishlist}
            onSelectMenu={setSelectedMenuId}
            onBackToHome={() => setStep(ConsumerStep.HOME)}
            onQuickRelaxCondition={handleQuickRelaxCondition}
            onReportPriceDifference={handleReportPriceDifference}
            onProceedToConfirm={handleProceedToConfirm}
          />
        ) : step === ConsumerStep.CONFIRM &&
          confirmDraft &&
          confirmMenu &&
          confirmStore ? (
          <OrderConfirmationView
            key={`${confirmDraft.menuId}-${confirmDraft.paymentMethod ?? 'local_currency'}`}
            menu={confirmMenu}
            store={confirmStore}
            initialServings={confirmDraft.servings}
            initialOptionIds={confirmDraft.selectedOptionIds}
            initialCouponCode={confirmDraft.couponCode}
            initialSharedDelivery={confirmDraft.sharedDeliveryApplied}
            initialReservationSlot={confirmDraft.reservationSlot}
            initialPaymentMethod={confirmDraft.paymentMethod}
            defaultAddressAlias={activeLocation.detailAddress}
            stampCount={appState.stampCount}
            defaultNote={appState.preferences.memoNote}
            onOpenLocationPicker={() => setShowLocationPicker(true)}
            onBack={() => setStep(ConsumerStep.RECOMMEND)}
            onConfirmOrder={handleConfirmOrder}
          />
        ) : step === ConsumerStep.WISHLIST ? (
          <WishlistView
            menus={appState.menus}
            stores={appState.stores}
            wishlistIds={appState.wishlistIds}
            onToggleWishlist={handleToggleWishlist}
            onQuickSelectMenu={handleQuickSelectMenu}
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
            regularMenuId={appState.orders[0]?.menuId ?? 'm1'}
            regularMenuName={appState.orders[0]?.menuName ?? '얼큰 소고기국밥'}
            regularStoreName={
              appState.orders[0]?.storeName ?? '수성 범어 소고기국밥'
            }
            regularServings={appState.orders[0]?.servings ?? 2}
            activeLocation={activeLocation}
            onTopupWalletConfirmed={handleTopupWalletConfirmed}
            onEarnStamp={handleEarnStamp}
            onChangeRole={setRole}
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
            stores={appState.stores}
            menus={appState.menus}
            highlightedOrderId={highlightedOrderId}
            onCancelBeforeCooking={handleCancelBeforeCooking}
            onRequestCancelAfterCooking={handleRequestCancelAfterCooking}
            onAttachEvidence={handleAttachEvidence}
            onQuickReorderToConfirm={handleQuickReorderToConfirm}
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
          <span>
            alle · 차세대 하이퍼로컬 AI 생활 OS{' '}
            <span className="text-[#4E6E2A] font-semibold">
              (
              {firebaseSyncStatus === 'synced'
                ? 'Firebase 실시간 동기화'
                : firebaseSyncStatus === 'connecting'
                  ? 'Firebase 연결 중...'
                  : '로컬 저장소 모드'}
              )
            </span>
          </span>
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

      {/* Bottom Navigation Bar: 홈 / 검색 / 주문내역 / 찜 / MY */}
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
            <Search
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
            <span className="text-[11px] leading-none">검색</span>
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

      {/* Subtle Presenter Demo Mode Quick Switcher */}
      <div className="fixed bottom-20 right-3 md:bottom-20 md:right-5 z-50 flex flex-col items-end gap-2">
        {showDemoSwitcher && (
          <div
            role="dialog"
            aria-label="IR 발표자용 시연 퀵 스위처"
            className="w-[312px] sm:w-[344px] bg-[#1A1D1A]/95 backdrop-blur-xl text-white border border-white/15 rounded-2xl shadow-2xl p-3.5 space-y-2.5"
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
                      ① [고객] 컨디션 홈 & AI 10초 주문
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
                    AI 채팅 →
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
                  Explainable AI 근거 · 자생형 법인 식대 결제
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
                  입점 효과 요약 · 광고비 절감 & AI 단골 순증 매출
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
                  ④ [확장] 음식-이동 연결 슈퍼앱 허브
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

        <button
          type="button"
          onClick={() => setShowDemoSwitcher((prev) => !prev)}
          aria-expanded={showDemoSwitcher}
          aria-label="Demo Mode 발표자 시연 전환 열기"
          className={`min-h-[32px] px-3 py-1.5 rounded-full text-[11px] font-semibold backdrop-blur-md border shadow-sm inline-flex items-center gap-1.5 transition-all cursor-pointer ${
            showDemoSwitcher
              ? 'bg-[#1A1D1A]/95 text-[#EAF1E2] border-[#82B440]/60'
              : 'bg-[#1A1D1A]/55 hover:bg-[#1A1D1A]/85 text-white/90 hover:text-white border-white/15'
          }`}
        >
          <Presentation className="w-3.5 h-3.5 text-[#82B440]" />
          <span>Demo Mode</span>
        </button>
      </div>

      <LocationPickerModal
        isOpen={showLocationPicker}
        locations={appState.savedLocations}
        selectedLocationId={activeLocation.id}
        onSelectLocation={handleSelectLocation}
        onAddLocation={handleAddLocation}
        onDeleteLocation={handleDeleteLocation}
        onClose={() => setShowLocationPicker(false)}
      />

      <FutureScopeModal
        isOpen={showFutureModal}
        onClose={() => setShowFutureModal(false)}
      />
    </div>
  );
}
