import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList,
  Heart,
  HelpCircle,
  Home,
  MessageSquare,
  Presentation,
  RotateCcw,
  Store as StoreIcon,
  Truck,
  User,
  X,
} from 'lucide-react';
import { AiChatOrderView } from './components/AiChatOrderView';
import { AlleLogo } from './components/AlleBrand';
import { ConditionHome } from './components/ConditionHome';
import { FutureScopeModal } from './components/FutureScopeModal';
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
  SuperAppTab,
  UserPreferences,
} from './types/alle';
import { evaluateRecommendations, parseConditionInput } from './utils/parser';
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
  const [showDemoSwitcher, setShowDemoSwitcher] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const orderSubmitLockRef = useRef<boolean>(false);

  useEffect(() => {
    const mode = saveDemoState({
      ...appState,
      lastConditionInput: rawInput,
    });
    setStorageMode(mode);
  }, [appState, rawInput]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const recommendationResult = useMemo(
    () => evaluateRecommendations(activeCondition, appState.stores, appState.menus),
    [activeCondition, appState.stores, appState.menus]
  );

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
      servings: parsedCondition.servings || 2,
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
    options?: { sharedDeliveryApplied?: boolean; reservationSlot?: string }
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
      couponCode: 'NONE',
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

    const menuSubtotal = targetMenu.pricePerPerson * payload.servings;
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
    const menuSubtotal = targetMenu.pricePerPerson * payload.servings;
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
    <div className="min-h-screen flex flex-col bg-[#F4F6F1] text-[#141812]">
      {/* Dark Role Switcher Bar */}
      <div className="bg-[#141812] text-white border-b border-white/10">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div
              role="group"
              aria-label="고객 점주 배달 파트너 전환"
              className="inline-flex items-center p-0.5 bg-white/10 rounded-xl"
            >
              <button
                type="button"
                onClick={() => setRole(DemoRole.CONSUMER)}
                className={`min-h-[32px] px-3 py-1 text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  role === DemoRole.CONSUMER
                    ? 'bg-[#8BC34A] text-[#141812] font-bold shadow-2xs'
                    : 'text-[#DDE3D7] hover:text-white font-medium'
                }`}
              >
                고객
              </button>
              <button
                type="button"
                onClick={() => setRole(DemoRole.OWNER)}
                className={`min-h-[32px] px-3 py-1 text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
                  role === DemoRole.OWNER
                    ? 'bg-[#8BC34A] text-[#141812] font-bold shadow-2xs'
                    : 'text-[#DDE3D7] hover:text-white font-medium'
                }`}
              >
                <StoreIcon className="w-3.5 h-3.5" />
                <span>점주 · 관리자 ({pendingOrderCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setRole(DemoRole.PARTNER)}
                className={`min-h-[32px] px-3 py-1 text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1 ${
                  role === DemoRole.PARTNER
                    ? 'bg-[#8BC34A] text-[#141812] font-bold shadow-2xs'
                    : 'text-[#DDE3D7] hover:text-white font-medium'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>배달 파트너 ({activePartnerOrderCount})</span>
              </button>
            </div>
            <span className="hidden md:inline text-[11px] text-[#B5C6A8]">
              같은 브라우저 연동 시연
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowFutureModal(true)}
            className="min-h-[32px] px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-[#CBDCC0] hover:text-white flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#8BC34A]" />
            <span>이용 안내</span>
          </button>
        </div>
      </div>

      {/* Main Sticky Header */}
      <header className="sticky top-0 z-40 h-14 bg-white/95 backdrop-blur-xs border-b border-[#DDE3D7]">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8">
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

          <nav
            aria-label="주요 화면 이동"
            className="hidden md:flex items-center gap-6 text-sm font-semibold text-[#374033]"
          >
            <button
              type="button"
              onClick={() => {
                setRole(DemoRole.CONSUMER);
                setStep(ConsumerStep.HOME);
              }}
              className={`whitespace-nowrap shrink-0 hover:text-[#141812] transition-colors cursor-pointer ${
                role === DemoRole.CONSUMER && step === ConsumerStep.HOME
                  ? 'text-[#2E531A] font-bold underline underline-offset-4'
                  : ''
              }`}
            >
              홈
            </button>
            <button
              type="button"
              onClick={() => {
                setAiChatInitialPrompt(undefined);
                setRole(DemoRole.CONSUMER);
                setStep(ConsumerStep.AI_CHAT);
              }}
              className={`whitespace-nowrap shrink-0 hover:text-[#141812] transition-colors cursor-pointer flex items-center gap-1 ${
                role === DemoRole.CONSUMER && step === ConsumerStep.AI_CHAT
                  ? 'text-[#2E531A] font-bold underline underline-offset-4'
                  : ''
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>AI 상담</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRole(DemoRole.CONSUMER);
                setStep(ConsumerStep.RECOMMEND);
              }}
              className={`whitespace-nowrap shrink-0 hover:text-[#141812] transition-colors cursor-pointer ${
                role === DemoRole.CONSUMER && step === ConsumerStep.RECOMMEND
                  ? 'text-[#2E531A] font-bold underline underline-offset-4'
                  : ''
              }`}
            >
              전체 비교
            </button>
            <button
              type="button"
              onClick={() => {
                setRole(DemoRole.CONSUMER);
                setStep(ConsumerStep.STATUS);
              }}
              className={`whitespace-nowrap shrink-0 hover:text-[#141812] transition-colors cursor-pointer ${
                role === DemoRole.CONSUMER && step === ConsumerStep.STATUS
                  ? 'text-[#2E531A] font-bold underline underline-offset-4'
                  : ''
              }`}
            >
              주문내역
            </button>
            <button
              type="button"
              onClick={() => {
                setRole(DemoRole.CONSUMER);
                setStep(ConsumerStep.WISHLIST);
              }}
              className={`whitespace-nowrap shrink-0 hover:text-[#141812] transition-colors cursor-pointer ${
                role === DemoRole.CONSUMER && step === ConsumerStep.WISHLIST
                  ? 'text-[#2E531A] font-bold underline underline-offset-4'
                  : ''
              }`}
            >
              찜 ({appState.wishlistIds.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setRole(DemoRole.CONSUMER);
                setStep(ConsumerStep.MY);
              }}
              className={`whitespace-nowrap shrink-0 hover:text-[#141812] transition-colors cursor-pointer ${
                role === DemoRole.CONSUMER && step === ConsumerStep.MY
                  ? 'text-[#2E531A] font-bold underline underline-offset-4'
                  : ''
              }`}
            >
              MY
            </button>
            <button
              type="button"
              onClick={() => {
                setRole(DemoRole.CONSUMER);
                setStep(ConsumerStep.SUPERAPP);
              }}
              className={`whitespace-nowrap shrink-0 hover:text-[#141812] transition-colors cursor-pointer ${
                role === DemoRole.CONSUMER && step === ConsumerStep.SUPERAPP
                  ? 'text-[#2E531A] font-bold underline underline-offset-4'
                  : ''
              }`}
            >
              공동구매 · 더보기
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResetDemo}
              className="min-h-[36px] px-3 py-1.5 text-xs font-bold text-[#374033] hover:text-[#141812] bg-[#F4F6F1] hover:bg-[#E7EFE1] border border-[#DDE3D7] rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>초기화</span>
            </button>
          </div>
        </div>
      </header>

      {storageMode === 'memory' && (
        <div
          role="status"
          className="bg-[#FFFBEF] border-b border-[#E8D595] px-4 py-2 text-center text-xs font-medium text-amber-900"
        >
          브라우저 저장소를 사용할 수 없어 메모리 모드로 동작 중입니다.
        </div>
      )}

      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-20 md:bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] px-4 py-2.5 bg-[#141812] text-white text-xs sm:text-sm font-medium rounded-2xl shadow-lg"
        >
          {toastMessage}
        </div>
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5 pb-24 md:py-8">
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
            onAdjustMenuStock={handleAdjustMenuStock}
            onAddMenuFromLine={handleAddMenuFromLine}
            onBulkAddMenusFromSample={handleBulkAddMenusFromSample}
            onSaveReviewReply={handleSaveReviewReply}
            onToggleReviewFlag={handleToggleReviewFlag}
            onSwitchToConsumer={() => setRole(DemoRole.CONSUMER)}
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
            stampCount={appState.stampCount}
            defaultNote={appState.preferences.memoNote}
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
          />
        ) : step === ConsumerStep.SUPERAPP ? (
          <SuperAppHubView
            activeTab={superAppTab}
            onChangeTab={setSuperAppTab}
            stores={appState.stores}
            menus={appState.menus}
            errands={appState.errands}
            latestOrder={appState.orders[0]}
            onJoinGroupBuy={handleJoinGroupBuy}
            onCreateB2BOrder={handleCreateB2BOrder}
            onCreateErrand={handleCreateErrand}
            onAdvanceErrand={handleAdvanceErrand}
          />
        ) : (
          <OrderStatusView
            orders={appState.orders}
            menus={appState.menus}
            highlightedOrderId={highlightedOrderId}
            onCancelBeforeCooking={handleCancelBeforeCooking}
            onRequestCancelAfterCooking={handleRequestCancelAfterCooking}
            onAttachEvidence={handleAttachEvidence}
            onQuickReorderToConfirm={handleQuickReorderToConfirm}
            onGoToOwnerDemo={() => setRole(DemoRole.OWNER)}
            onNewOrder={() => setStep(ConsumerStep.HOME)}
          />
        )}
      </main>

      <footer className="hidden md:block border-t border-[#DDE3D7] bg-white py-4 px-4 sm:px-6 text-xs text-[#4A5246]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            alle · 우리 동네 AI 음성·맞춤 주문 플랫폼 (가명 별칭 고객 A / 수령지 A)
          </span>
          <button
            type="button"
            onClick={() => setShowFutureModal(true)}
            className="text-left sm:text-right font-bold text-[#2E531A] hover:text-[#141812] underline underline-offset-4 cursor-pointer"
          >
            서비스 원칙 · 이용 안내
          </button>
        </div>
      </footer>

      {/* Mobile Bottom 5-Tab Bar (홈 · AI 상담 · 주문내역 · 찜 · MY) */}
      <nav
        aria-label="모바일 하단 탭"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 backdrop-blur-md border-t border-[#DDE3D7] grid grid-cols-5 items-center px-1"
      >
        <button
          type="button"
          onClick={() => {
            setRole(DemoRole.CONSUMER);
            setStep(ConsumerStep.HOME);
          }}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            role === DemoRole.CONSUMER && step === ConsumerStep.HOME
              ? 'text-[#2E531A] font-bold'
              : 'text-[#4A5246]'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[11px] leading-none">홈</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAiChatInitialPrompt(undefined);
            setRole(DemoRole.CONSUMER);
            setStep(ConsumerStep.AI_CHAT);
          }}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            role === DemoRole.CONSUMER &&
            (step === ConsumerStep.AI_CHAT ||
              step === ConsumerStep.RECOMMEND ||
              step === ConsumerStep.CONFIRM)
              ? 'text-[#2E531A] font-bold'
              : 'text-[#4A5246]'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[11px] leading-none">AI 상담</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setRole(DemoRole.CONSUMER);
            setStep(ConsumerStep.STATUS);
          }}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            role === DemoRole.CONSUMER && step === ConsumerStep.STATUS
              ? 'text-[#2E531A] font-bold'
              : 'text-[#4A5246]'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span className="text-[11px] leading-none">주문내역</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setRole(DemoRole.CONSUMER);
            setStep(ConsumerStep.WISHLIST);
          }}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            role === DemoRole.CONSUMER && step === ConsumerStep.WISHLIST
              ? 'text-[#2E531A] font-bold'
              : 'text-[#4A5246]'
          }`}
        >
          <Heart className="w-5 h-5" />
          <span className="text-[11px] leading-none">찜</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setRole(DemoRole.CONSUMER);
            setStep(ConsumerStep.MY);
          }}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            role === DemoRole.CONSUMER && step === ConsumerStep.MY
              ? 'text-[#2E531A] font-bold'
              : 'text-[#4A5246]'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[11px] leading-none">MY</span>
        </button>
      </nav>

      {/* Subtle Presenter Demo Mode Quick Switcher */}
      <div className="fixed bottom-20 right-3 md:bottom-4 md:right-4 z-50 flex flex-col items-end gap-2">
        {showDemoSwitcher && (
          <div
            role="dialog"
            aria-label="IR 발표자용 시연 퀵 스위처"
            className="w-[304px] sm:w-[336px] bg-[#141812]/95 backdrop-blur-md text-white border border-white/15 rounded-2xl shadow-2xl p-3 space-y-2"
          >
            <div className="flex items-center justify-between px-1 pb-1 border-b border-white/10">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#C7F08F]">
                <Presentation className="w-3.5 h-3.5 text-[#8BC34A]" />
                <span>IR 발표자 퀵 스위처</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDemoSwitcher(false)}
                aria-label="시연 퀵 스위처 닫기"
                className="p-1 text-white/60 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <div
                className={`rounded-xl border transition-colors p-2 ${
                  role === DemoRole.CONSUMER &&
                  (step === ConsumerStep.HOME || step === ConsumerStep.AI_CHAT)
                    ? 'bg-[#8BC34A]/18 border-[#8BC34A]/50'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleJumpDemoScene('customer_home')}
                    className="flex-1 text-left cursor-pointer"
                  >
                    <p className="text-xs font-bold text-white">
                      ① [고객] 컨디션 홈 & AI 10초 주문
                    </p>
                    <p className="text-[10px] text-[#B9CCB0] mt-0.5">
                      비가격 효용 배지 · 원탭 Zero-UI 진입
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleJumpDemoScene('customer_chat')}
                    className="px-2 py-1 bg-[#8BC34A] hover:bg-[#9BD15B] text-[#141812] text-[10px] font-bold rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    AI 채팅 →
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleJumpDemoScene('b2b_checkout')}
                className={`w-full text-left rounded-xl border transition-colors p-2 cursor-pointer ${
                  role === DemoRole.CONSUMER && step === ConsumerStep.CONFIRM
                    ? 'bg-[#8BC34A]/18 border-[#8BC34A]/50'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <p className="text-xs font-bold text-white">
                  ② [결제] B2B 식대 & 추천 근거 확인 결제
                </p>
                <p className="text-[10px] text-[#B9CCB0] mt-0.5">
                  Explainable AI 근거 · 자생형 법인 식대 결제
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleJumpDemoScene('owner_dashboard')}
                className={`w-full text-left rounded-xl border transition-colors p-2 cursor-pointer ${
                  role === DemoRole.OWNER
                    ? 'bg-[#8BC34A]/18 border-[#8BC34A]/50'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <p className="text-xs font-bold text-white">
                  ③ [점주] 실시간 주문 접수 · 순수익 대시보드
                </p>
                <p className="text-[10px] text-[#B9CCB0] mt-0.5">
                  입점 효과 요약 · 광고비 절감 & AI 단골 순증 매출
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleJumpDemoScene('superapp_hub')}
                className={`w-full text-left rounded-xl border transition-colors p-2 cursor-pointer ${
                  role === DemoRole.CONSUMER && step === ConsumerStep.SUPERAPP
                    ? 'bg-[#8BC34A]/18 border-[#8BC34A]/50'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <p className="text-xs font-bold text-white">
                  ④ [확장] 음식-이동 연결 슈퍼앱 허브
                </p>
                <p className="text-[10px] text-[#B9CCB0] mt-0.5">
                  단일 AI 에이전트 식사 후 호출 택시 원클릭 연계
                </p>
              </button>
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
              ? 'bg-[#141812]/95 text-[#C7F08F] border-[#8BC34A]/50'
              : 'bg-[#141812]/55 hover:bg-[#141812]/85 text-white/85 hover:text-white border-white/15'
          }`}
        >
          <Presentation className="w-3.5 h-3.5 text-[#8BC34A]" />
          <span>Demo Mode</span>
        </button>
      </div>

      <FutureScopeModal
        isOpen={showFutureModal}
        onClose={() => setShowFutureModal(false)}
      />
    </div>
  );
}
