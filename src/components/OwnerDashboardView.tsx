import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileText,
  Flag,
  Loader2,
  Lock,
  Megaphone,
  MessageSquare,
  Mic,
  MicOff,
  PackageCheck,
  Pencil,
  PlusCircle,
  QrCode,
  ScanText,
  Search,
  ShieldCheck,
  Sparkles,
  Store as StoreIcon,
  Ticket,
  Trash2,
  TrendingUp,
  Truck,
  X,
} from 'lucide-react';
import {
  INITIAL_OWNER_PROFIT_COMPARISON,
  PAPER_MENU_OCR_SAMPLE,
} from '../data/seedData';
import {
  DeliveryFeeTier,
  DispatchMode,
  EvidencePhoto,
  MenuItem,
  Order,
  OrderStatus,
  PartnerPlanTier,
  PriceReport,
  Review,
  ReviewReply,
  Store,
  StoreCoupon,
  StorePromotion,
} from '../types/alle';
import { readCompressedEvidencePhotos } from '../utils/imageUpload';
import { formatWon } from '../utils/parser';
import { getDeliveryMethodMeta } from '../utils/pricing';
import {
  checkServerGeminiAvailable,
  ExtractedMenuCandidate,
  extractMenusFromImageWithAI,
  parseOwnerVoiceCommandWithAI,
} from '../utils/gemini';
import { startKoreanVoiceInput } from '../utils/voice';
import { B2BStatementModal } from './B2BStatementModal';

interface OwnerDashboardViewProps {
  stores: Store[];
  menus: MenuItem[];
  orders: Order[];
  reviews: Review[];
  reviewReplies: Record<string, ReviewReply>;
  priceReports: PriceReport[];
  stampCount: number;
  onAdvanceOrderStatus: (
    orderId: string,
    nextStatus: OrderStatus,
    dispatchMode?: DispatchMode
  ) => void;
  onCancelOrderBeforeCooking: (orderId: string) => void;
  onResolveCancelRequest?: (
    orderId: string,
    decision: 'approve' | 'reject'
  ) => void;
  onToggleStoreOpen: (storeId: string) => void;
  onAdjustStoreExtraPrep: (storeId: string, delta: number) => void;
  onSetStoreExtraPrep: (storeId: string, minutes: number) => void;
  onToggleMenuSoldOut: (menuId: string) => void;
  onToggleMenuClosingSale: (menuId: string, discountPercent?: number) => void;
  onSetMenuDiscountPercent?: (menuId: string, percent: number) => void;
  onAdjustMenuStock: (menuId: string, delta: number) => void;
  onAddMenuFromLine: (
    storeId: string,
    rawLine: string
  ) => {
    ok: boolean;
    message: string;
  };
  onBulkAddMenusFromSample: (storeId: string, lines: string[]) => number;
  onUpdateMenu?: (
    menuId: string,
    patch: { name: string; pricePerPerson: number }
  ) => void;
  onDeleteMenu?: (menuId: string) => void;
  storePromotions?: StorePromotion[];
  storeCoupons?: StoreCoupon[];
  onUpdateStoreDeliveryPolicy?: (
    storeId: string,
    deliveryFee: number,
    deliveryFeeTiers: DeliveryFeeTier[]
  ) => void;
  onAddStorePromotion?: (
    promo: Omit<StorePromotion, 'id' | 'createdAt'>
  ) => void;
  onToggleStorePromotion?: (promoId: string) => void;
  onDeleteStorePromotion?: (promoId: string) => void;
  onAddStoreCoupon?: (coupon: Omit<StoreCoupon, 'id' | 'createdAt'>) => void;
  onToggleStoreCoupon?: (couponId: string) => void;
  onDeleteStoreCoupon?: (couponId: string) => void;
  onSaveReviewReply: (reviewId: string, replyText: string) => void;
  onToggleReviewFlag: (reviewId: string, reason: string) => void;
  onAttachOwnerPhotos?: (orderId: string, photos: EvidencePhoto[]) => void;
  ownerSaasPlan?: PartnerPlanTier;
  onSelectOwnerSaasPlan?: (plan: PartnerPlanTier) => void;
  onSwitchToConsumer: () => void;
  onSwitchToPartner?: () => void;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: '접수 대기',
  [OrderStatus.ACCEPTED]: '수락됨',
  [OrderStatus.COOKING]: '조리 중',
  [OrderStatus.PICKUP]: '픽업·배달 중',
  [OrderStatus.COMPLETED]: '완료',
  [OrderStatus.CANCELLED]: '취소됨',
};

export function OwnerDashboardView({
  stores,
  menus,
  orders,
  reviews,
  reviewReplies,
  priceReports,
  stampCount,
  onAdvanceOrderStatus,
  onCancelOrderBeforeCooking,
  onResolveCancelRequest,
  onToggleStoreOpen,
  onAdjustStoreExtraPrep,
  onSetStoreExtraPrep,
  onToggleMenuSoldOut,
  onToggleMenuClosingSale,
  onSetMenuDiscountPercent,
  onAdjustMenuStock,
  onAddMenuFromLine,
  onBulkAddMenusFromSample,
  onUpdateMenu,
  onDeleteMenu,
  storePromotions = [],
  storeCoupons = [],
  onUpdateStoreDeliveryPolicy,
  onAddStorePromotion,
  onToggleStorePromotion,
  onDeleteStorePromotion,
  onAddStoreCoupon,
  onToggleStoreCoupon,
  onDeleteStoreCoupon,
  onSaveReviewReply,
  onToggleReviewFlag,
  onAttachOwnerPhotos,
  ownerSaasPlan = 'trial',
  onSelectOwnerSaasPlan,
  onSwitchToConsumer,
  onSwitchToPartner,
}: OwnerDashboardViewProps) {
  const [ownerSection, setOwnerSection] = useState<
    'orders' | 'promo' | 'ops' | 'dashboard' | 'crm'
  >('orders');

  const defaultPromoStore =
    stores.find((s) => s.id === 'dg-s171') ??
    stores.find((s) => s.id === 's30') ??
    stores[0];
  const [promoStoreId, setPromoStoreId] = useState<string>(
    defaultPromoStore?.id ?? 's1'
  );
  const selectedPromoStore = useMemo(
    () => stores.find((s) => s.id === promoStoreId) ?? stores[0],
    [stores, promoStoreId]
  );

  const [draftBaseFee, setDraftBaseFee] = useState<number>(
    selectedPromoStore?.deliveryFee ?? 2000
  );
  const [draftTiers, setDraftTiers] = useState<DeliveryFeeTier[]>(
    selectedPromoStore?.deliveryFeeTiers ?? []
  );
  const [deliverySavedNotice, setDeliverySavedNotice] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!selectedPromoStore) return;
    setDraftBaseFee(selectedPromoStore.deliveryFee ?? 2000);
    setDraftTiers(
      selectedPromoStore.deliveryFeeTiers
        ? selectedPromoStore.deliveryFeeTiers.map((t) => ({ ...t }))
        : []
    );
  }, [selectedPromoStore?.id]);

  const [promoBadge, setPromoBadge] = useState<string>('점주 이벤트');
  const [promoTitle, setPromoTitle] = useState<string>('');
  const [promoDesc, setPromoDesc] = useState<string>('');
  const [showAllStorePromos, setShowAllStorePromos] = useState<boolean>(false);

  const [couponLabel, setCouponLabel] = useState<string>('');
  const [couponType, setCouponType] = useState<'fixed' | 'percent'>('fixed');
  const [couponValue, setCouponValue] = useState<string>('2000');
  const [couponMinSubtotal, setCouponMinSubtotal] = useState<string>('');
  const [csLightboxPhoto, setCsLightboxPhoto] = useState<EvidencePhoto | null>(
    null
  );
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'done'>('all');
  const [showKpiBreakdown, setShowKpiBreakdown] = useState(false);
  const [showKitchenVoice, setShowKitchenVoice] = useState(false);
  const [showMenuTable, setShowMenuTable] = useState(false);
  const [dispatchChoiceByOrder, setDispatchChoiceByOrder] = useState<
    Record<string, DispatchMode>
  >({});

  const [commandInput, setCommandInput] = useState('');
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null);
  const [isKitchenListening, setIsKitchenListening] = useState(false);
  const [isCommandProcessing, setIsCommandProcessing] = useState(false);
  const stopKitchenVoiceRef = useRef<(() => void) | null>(null);

  const [newMenuStoreId, setNewMenuStoreId] = useState(stores[0]?.id ?? 's1');
  const [newMenuLine, setNewMenuLine] = useState(
    '우리동네 차돌 된장찌개 10000원 얼큰한 국물 한식'
  );
  const [menuAddNotice, setMenuAddNotice] = useState<string | null>(null);
  const [ocrImagePreview, setOcrImagePreview] = useState<string | null>(null);
  const [isOcrScanning, setIsOcrScanning] = useState(false);
  const [ocrCandidates, setOcrCandidates] = useState<
    Array<ExtractedMenuCandidate & { selected: boolean }>
  >([]);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const ocrFileInputRef = useRef<HTMLInputElement | null>(null);

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savedReplyId, setSavedReplyId] = useState<string | null>(null);
  const [campaignNotice, setCampaignNotice] = useState<string | null>(null);
  const [aiMarketingNotice, setAiMarketingNotice] = useState<string | null>(
    null
  );
  const [statementOrder, setStatementOrder] = useState<Order | null>(null);
  const [opsStoreQuery, setOpsStoreQuery] = useState('');
  const [showAllOpsStores, setShowAllOpsStores] = useState(false);
  const [showAllDashboardStores, setShowAllDashboardStores] = useState(false);
  const [crmReviewQuery, setCrmReviewQuery] = useState('');
  const [showAllCrmReviews, setShowAllCrmReviews] = useState(false);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [editMenuName, setEditMenuName] = useState('');
  const [editMenuPrice, setEditMenuPrice] = useState('');

  const ownerStoreMap = useMemo(
    () => new Map(stores.map((s) => [s.id, s])),
    [stores]
  );

  const PLAN_RANK: Record<PartnerPlanTier, number> = {
    trial: 0,
    basic: 1,
    pro: 2,
    premium: 3,
  };
  const PLAN_LABEL: Record<PartnerPlanTier, string> = {
    trial: '프로모션 (3개월 무료)',
    basic: '베이직 (월 2.9만 원)',
    pro: '프로 (월 5.9만 원)',
    premium: '프리미엄 (월 9.9만 원)',
  };
  const hasPlan = (minPlan: PartnerPlanTier) =>
    PLAN_RANK[ownerSaasPlan] >= PLAN_RANK[minPlan];

  const renderPlanLock = (
    minPlan: PartnerPlanTier,
    featureTitle: string,
    summary: string
  ) => (
    <div className="p-3.5 rounded-2xl bg-[#F7F8F5] border border-dashed border-[#CBD4C4] space-y-2 flex flex-col justify-between">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[#687064] flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#8A9485] shrink-0" />
            <span>{featureTitle}</span>
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[#E8ECE4] text-[#555E52] text-[10px] font-bold shrink-0">
            {PLAN_LABEL[minPlan]} 이상
          </span>
        </div>
        <p className="text-[11px] text-[#687064] leading-snug">{summary}</p>
      </div>
      {onSelectOwnerSaasPlan && (
        <button
          type="button"
          onClick={() => onSelectOwnerSaasPlan(minPlan)}
          className="self-start px-2.5 py-1 rounded-lg bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-[11px] font-bold transition-colors cursor-pointer"
        >
          {PLAN_LABEL[minPlan]}으로 전환해 보기 →
        </button>
      )}
    </div>
  );

  useEffect(() => {
    return () => {
      stopKitchenVoiceRef.current?.();
    };
  }, []);

  const filteredOrders = useMemo(() => {
    if (filterTab === 'active') {
      return orders.filter(
        (o) =>
          o.status !== OrderStatus.COMPLETED && o.status !== OrderStatus.CANCELLED
      );
    }
    if (filterTab === 'done') {
      return orders.filter(
        (o) =>
          o.status === OrderStatus.COMPLETED || o.status === OrderStatus.CANCELLED
      );
    }
    return orders;
  }, [orders, filterTab]);

  const pendingCount = orders.filter(
    (o) => o.status === OrderStatus.PENDING
  ).length;
  const activeCount = orders.filter(
    (o) =>
      o.status !== OrderStatus.COMPLETED && o.status !== OrderStatus.CANCELLED
  ).length;

  const analytics = useMemo(() => {
    const validOrders = orders.filter((o) => o.status !== OrderStatus.CANCELLED);
    const totalRevenue = validOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const avgOrderValue =
      validOrders.length > 0
        ? Math.round(totalRevenue / validOrders.length)
        : 0;
    const completedCount = orders.filter(
      (o) => o.status === OrderStatus.COMPLETED
    ).length;
    const cancelledCount = orders.filter(
      (o) => o.status === OrderStatus.CANCELLED
    ).length;
    const cancelRequestCount = orders.filter(
      (o) =>
        o.cancelRequested &&
        o.status !== OrderStatus.CANCELLED &&
        o.status !== OrderStatus.COMPLETED
    ).length;
    const completionRate =
      orders.length > 0 ? Math.round((completedCount / orders.length) * 100) : 0;

    const b2bOrders = validOrders.filter((o) => o.isB2B);
    const b2bRevenue = b2bOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    const byStore = stores
      .map((st) => {
        const storeOrders = validOrders.filter((o) => o.storeId === st.id);
        return {
          store: st,
          count: storeOrders.length,
          revenue: storeOrders.reduce((s, o) => s + o.totalAmount, 0),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const maxStoreRevenue = Math.max(1, ...byStore.map((s) => s.revenue));

    const statusPipeline = [
      OrderStatus.PENDING,
      OrderStatus.ACCEPTED,
      OrderStatus.COOKING,
      OrderStatus.PICKUP,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
    ].map((status) => ({
      status,
      label: STATUS_LABELS[status],
      count: orders.filter((o) => o.status === status).length,
    }));

    const menuStatsMap = new Map<
      string,
      { servings: number; revenue: number; ordersCount: number }
    >();
    const tagDemandMap = new Map<string, number>();

    for (const o of validOrders) {
      const orderLines =
        o.items && o.items.length > 0
          ? o.items
          : [
              {
                menuId: o.menuId,
                quantity: o.servings,
                lineSubtotal: o.totalAmount,
              },
            ];

      for (const line of orderLines) {
        const prev = menuStatsMap.get(line.menuId) ?? {
          servings: 0,
          revenue: 0,
          ordersCount: 0,
        };
        menuStatsMap.set(line.menuId, {
          servings: prev.servings + line.quantity,
          revenue: prev.revenue + line.lineSubtotal,
          ordersCount: prev.ordersCount + 1,
        });

        const menuObj = menus.find((m) => m.id === line.menuId);
        if (menuObj) {
          for (const tag of menuObj.tags) {
            tagDemandMap.set(tag, (tagDemandMap.get(tag) ?? 0) + line.quantity);
          }
        }
      }
    }

    const storeMap = new Map(stores.map((s) => [s.id, s]));
    const topMenus = menus
      .map((m) => {
        const stat = menuStatsMap.get(m.id) ?? {
          servings: 0,
          revenue: 0,
          ordersCount: 0,
        };
        return {
          menu: m,
          storeName: storeMap.get(m.storeId)?.name ?? '',
          ...stat,
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.servings - a.servings)
      .slice(0, 6);

    const lowOrOutMenus = menus.filter((m) => m.isSoldOut || m.stock <= 3);
    const openStoresCount = stores.filter((s) => s.isOpen).length;
    const tagDemand = Array.from(tagDemandMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxTagQty = Math.max(1, ...tagDemand.map(([, q]) => q));

    const avgRating =
      reviews.length > 0
        ? (
            reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          ).toFixed(1)
        : '-';

    const liveSavedFeeDelta = Math.round(totalRevenue * 0.148);
    const totalSavedCommissionAndAdFee =
      INITIAL_OWNER_PROFIT_COMPARISON.savedCommissionAndAdFee +
      liveSavedFeeDelta;
    const totalBrokerageFeeSaved =
      INITIAL_OWNER_PROFIT_COMPARISON.savedBreakdown.brokerageFeeSaved +
      liveSavedFeeDelta;
    const totalAdExposureFeeSaved =
      INITIAL_OWNER_PROFIT_COMPARISON.savedBreakdown.adExposureFeeSaved;

    const totalAiRegularIncrementalSales =
      INITIAL_OWNER_PROFIT_COMPARISON.aiRegularIncrementalSales + totalRevenue;
    const totalAiRegularMatchedOrders =
      INITIAL_OWNER_PROFIT_COMPARISON.aiRegularMatchedOrders +
      validOrders.length;

    return {
      totalCount: validOrders.length,
      totalRevenue,
      avgOrderValue,
      completedCount,
      cancelledCount,
      cancelRequestCount,
      completionRate,
      b2bCount: b2bOrders.length,
      b2bRevenue,
      byStore,
      maxStoreRevenue,
      statusPipeline,
      topMenus,
      lowOrOutMenus,
      openStoresCount,
      tagDemand,
      maxTagQty,
      avgRating,
      profitComparison: {
        ...INITIAL_OWNER_PROFIT_COMPARISON,
        totalSavedCommissionAndAdFee,
        totalBrokerageFeeSaved,
        totalAdExposureFeeSaved,
        totalAiRegularIncrementalSales,
        totalAiRegularMatchedOrders,
      },
    };
  }, [orders, stores, menus, reviews]);

  const runOwnerCommand = async (cmdRaw: string) => {
    const cmd = cmdRaw.trim();
    if (!cmd) return;

    const executeAction = (
      action:
        | 'accept_order'
        | 'start_cooking'
        | 'pickup_order'
        | 'complete_order'
        | 'sold_out'
        | 'restock'
        | 'add_prep_minutes'
        | 'toggle_store',
      opts?: {
        targetName?: string;
        value?: number;
        dispatchMode?: DispatchMode;
      }
    ): boolean => {
      if (action === 'accept_order') {
        const pendingOrder = orders.find((o) => o.status === OrderStatus.PENDING);
        if (!pendingOrder) {
          setCommandFeedback('접수 대기 중인 주문이 없습니다.');
          return true;
        }
        onAdvanceOrderStatus(pendingOrder.id, OrderStatus.ACCEPTED);
        setCommandFeedback(
          `${pendingOrder.orderCode} (${pendingOrder.menuName}) 주문을 수락했습니다.`
        );
        setCommandInput('');
        return true;
      }

      if (action === 'start_cooking') {
        const acceptedOrder = orders.find((o) => o.status === OrderStatus.ACCEPTED);
        if (!acceptedOrder) {
          setCommandFeedback('수락된 주문이 없습니다.');
          return true;
        }
        onAdvanceOrderStatus(acceptedOrder.id, OrderStatus.COOKING);
        setCommandFeedback(`${acceptedOrder.orderCode} 조리를 시작했습니다.`);
        setCommandInput('');
        return true;
      }

      if (action === 'pickup_order') {
        const cookingOrder = orders.find((o) => o.status === OrderStatus.COOKING);
        if (!cookingOrder) {
          setCommandFeedback('조리 중인 주문이 없습니다.');
          return true;
        }
        const mode = opts?.dispatchMode ?? DispatchMode.NEIGHBOR_WALK;
        onAdvanceOrderStatus(cookingOrder.id, OrderStatus.PICKUP, mode);
        setCommandFeedback(
          `${cookingOrder.orderCode} (${
            mode === DispatchMode.AGENCY_RIDER ? '전문 라이더' : '이웃 도보'
          }) 픽업 처리했습니다.`
        );
        setCommandInput('');
        return true;
      }

      if (action === 'complete_order') {
        const pickupOrder = orders.find((o) => o.status === OrderStatus.PICKUP);
        if (!pickupOrder) {
          setCommandFeedback('픽업 상태의 주문만 완료 처리할 수 있습니다.');
          return true;
        }
        onAdvanceOrderStatus(pickupOrder.id, OrderStatus.COMPLETED);
        setCommandFeedback(`${pickupOrder.orderCode} 주문을 완료 처리했습니다.`);
        setCommandInput('');
        return true;
      }

      if (action === 'add_prep_minutes') {
        const delta = opts?.value ?? 5;
        const targetStore =
          (opts?.targetName
            ? stores.find((s) => s.name.includes(opts.targetName!))
            : undefined) ?? stores[0];
        if (!targetStore) return false;
        onAdjustStoreExtraPrep(targetStore.id, delta);
        setCommandFeedback(
          `"${targetStore.name}" 추가 조리시간을 ${delta > 0 ? `+${delta}` : delta}분 조정했습니다.`
        );
        setCommandInput('');
        return true;
      }

      if (action === 'restock') {
        const targetMenu = opts?.targetName
          ? menus.find(
              (m) =>
                m.name.includes(opts.targetName!) ||
                opts.targetName!.includes(m.name)
            )
          : menus.find((m) => cmd.includes(m.name));
        if (!targetMenu) {
          setCommandFeedback('재고를 변경할 메뉴명을 함께 말씀해 주세요.');
          return true;
        }
        const qty = opts?.value ?? 5;
        onAdjustMenuStock(targetMenu.id, qty);
        setCommandFeedback(
          `"${targetMenu.name}" 재고를 +${qty}개 입고(판매 재개)했습니다.`
        );
        setCommandInput('');
        return true;
      }

      if (action === 'sold_out') {
        const targetMenu = opts?.targetName
          ? menus.find(
              (m) =>
                m.name.includes(opts.targetName!) ||
                opts.targetName!.includes(m.name)
            )
          : menus.find((m) => cmd.includes(m.name));
        if (!targetMenu) {
          setCommandFeedback(
            '메뉴명을 함께 말씀해 주세요. 예: "얼큰 소고기국밥 품절"'
          );
          return true;
        }
        if (!targetMenu.isSoldOut) {
          onToggleMenuSoldOut(targetMenu.id);
        }
        setCommandFeedback(`"${targetMenu.name}"을 품절 처리했습니다.`);
        setCommandInput('');
        return true;
      }

      if (action === 'toggle_store') {
        const targetStore =
          (opts?.targetName
            ? stores.find((s) => s.name.includes(opts.targetName!))
            : undefined) ?? stores.find((s) => cmd.includes(s.name));
        if (!targetStore) {
          setCommandFeedback(
            '매장명을 함께 입력해 주세요. 예: "역삼 진국 소고기국밥 영업 중단"'
          );
          return true;
        }
        onToggleStoreOpen(targetStore.id);
        setCommandFeedback(`"${targetStore.name}" 영업 상태를 변경했습니다.`);
        setCommandInput('');
        return true;
      }

      return false;
    };

    if (cmd.includes('수락')) {
      executeAction('accept_order');
      return;
    }
    if (cmd.includes('조리 시작') || cmd.includes('조리시작')) {
      executeAction('start_cooking');
      return;
    }
    if (cmd.includes('픽업') || cmd.includes('라이더')) {
      const mode =
        cmd.includes('대행사') || cmd.includes('라이더')
          ? DispatchMode.AGENCY_RIDER
          : DispatchMode.NEIGHBOR_WALK;
      executeAction('pickup_order', { dispatchMode: mode });
      return;
    }
    if (cmd.includes('완료')) {
      executeAction('complete_order');
      return;
    }
    if (cmd.includes('품절 해제') || cmd.includes('판매 재개')) {
      executeAction('restock', { value: 5 });
      return;
    }
    if (cmd.includes('재고') && (cmd.includes('추가') || cmd.includes('입고'))) {
      const numMatch = cmd.match(/(\d+)/);
      executeAction('restock', {
        value: numMatch ? parseInt(numMatch[1], 10) : 5,
      });
      return;
    }
    if (cmd.includes('지연') || cmd.includes('조리시간') || cmd.includes('분 더')) {
      const numMatch = cmd.match(/(\d+)\s*분/);
      executeAction('add_prep_minutes', {
        value: numMatch ? parseInt(numMatch[1], 10) : 5,
      });
      return;
    }
    if (cmd.includes('마감') && (cmd.includes('특가') || cmd.includes('할인') || cmd.includes('세일'))) {
      const targetMenu = menus.find((m) => cmd.includes(m.name)) ?? menus[0];
      if (!targetMenu) return;
      const pctMatch = cmd.match(/(\d+)\s*%/);
      const pct = pctMatch ? Math.min(50, Math.max(10, parseInt(pctMatch[1], 10))) : 30;
      onToggleMenuClosingSale(targetMenu.id, pct);
      setCommandFeedback(
        `"${targetMenu.name}" 마감 ${
          targetMenu.closingDiscountPercent ? '특가를 해제' : `${pct}% 특가를 시작`
        }했습니다.`
      );
      setCommandInput('');
      return;
    }

    if (cmd.includes('품절')) {
      executeAction('sold_out');
      return;
    }
    if (cmd.includes('영업 중단') || cmd.includes('영업 재개')) {
      executeAction('toggle_store');
      return;
    }

    if (await checkServerGeminiAvailable()) {
      setIsCommandProcessing(true);
      const aiCmd = await parseOwnerVoiceCommandWithAI(
        cmd,
        stores.map((s) => s.name),
        menus.map((m) => m.name)
      );
      setIsCommandProcessing(false);
      if (aiCmd && aiCmd.action !== 'unknown') {
        const handled = executeAction(aiCmd.action, {
          targetName: aiCmd.targetName,
          value: aiCmd.value,
          dispatchMode:
            aiCmd.dispatchMode === 'agency_rider'
              ? DispatchMode.AGENCY_RIDER
              : DispatchMode.NEIGHBOR_WALK,
        });
        if (handled) return;
      }
    }

    setCommandFeedback(
      '지원 명령: "주문 수락", "조리 시작", "픽업 처리", "조리시간 10분 추가", "[메뉴명] 품절 / 품절 해제"'
    );
  };

  const handleMenuImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrError(null);
    setOcrCandidates([]);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setOcrImagePreview(dataUrl);

      const base64 = dataUrl.split(',')[1] ?? '';
      const mimeType = file.type || 'image/jpeg';

      if (!(await checkServerGeminiAvailable())) {
        setOcrError(
          '현재 서버에 Gemini API가 연결되어 있지 않습니다. Cloudflare 배포 환경에서 이용하거나 "샘플 일괄 등록"을 이용해 주세요.'
        );
        return;
      }

      setIsOcrScanning(true);
      try {
        const extracted = await extractMenusFromImageWithAI(base64, mimeType);
        setOcrCandidates(extracted.map((item) => ({ ...item, selected: true })));
        if (extracted.length === 0) {
          setOcrError('사진에서 메뉴를 찾지 못했습니다. 더 선명한 메뉴판 사진을 올려주세요.');
        }
      } catch (err) {
        setOcrError(
          err instanceof Error
            ? err.message
            : '메뉴판 인식 중 오류가 발생했습니다.'
        );
      } finally {
        setIsOcrScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleKitchenVoice = () => {
    if (isKitchenListening) {
      stopKitchenVoiceRef.current?.();
      setIsKitchenListening(false);
      return;
    }
    setIsKitchenListening(true);
    stopKitchenVoiceRef.current = startKoreanVoiceInput({
      onTranscript: (text) => {
        setIsKitchenListening(false);
        setCommandInput(text);
        runOwnerCommand(text);
      },
      onUnavailableOrError: () => {
        setIsKitchenListening(false);
        setCommandFeedback(
          '마이크 입력을 사용할 수 없어 아래 빠른 명령 버튼을 이용해 주세요.'
        );
      },
      onEnd: () => {
        setIsKitchenListening(false);
      },
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Quiet Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#4E6E2A]">
            Baro 파트너 · 점주 OS
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1A1D1A] tracking-tight mt-0.5">
            점주 수익 · 운영 센터
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onSwitchToPartner && (
            <button
              type="button"
              onClick={onSwitchToPartner}
              className="min-h-[40px] px-4 py-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] border border-[#D4E1C5] text-[#3D5720] text-xs sm:text-sm font-semibold rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              배달 파트너
            </button>
          )}
          <button
            type="button"
            onClick={onSwitchToConsumer}
            className="min-h-[40px] px-4 py-2 bg-white hover:bg-[#F7F8F5] border border-[#E8ECE4] text-[#1A1D1A] text-xs sm:text-sm font-semibold rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            고객 화면 보기
          </button>
        </div>
      </div>

      {/* Dominant 2-KPI Hero Card (1-Second IR Readability) */}
      <section
        aria-label="이번 달 점주 핵심 성과"
        className="os-card rounded-[32px] p-7 sm:p-10 space-y-7"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4E6E2A]">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{analytics.profitComparison.periodLabel} · 전국 입점 매장 기준</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#1A1D1A] tracking-tight text-balance">
              광고비 부담은 없애고, 맞춤 단골 매칭으로 순증 매출을 만들었습니다
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowKpiBreakdown((prev) => !prev)}
            className="min-h-[36px] px-3.5 py-1.5 bg-[#F7F8F5] hover:bg-[#F0F3EC] border border-[#E8ECE4] text-[#555E52] text-xs font-semibold rounded-xl inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <span>{showKpiBreakdown ? '산출 근거 접기' : '산출 근거 보기'}</span>
            {showKpiBreakdown ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Two Warm Sage KPI Highlight Boxes with Deep Olive Numbers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="bg-[#EAF1E2] border border-[#DCE7CF] rounded-2xl p-5 sm:p-6 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-bold text-[#3D5720]">
                이번 달 절감된 광고·수수료
              </p>
              <span className="w-2 h-2 rounded-full bg-[#82B440] shrink-0" aria-hidden="true" />
            </div>
            <div className="os-kpi text-4xl sm:text-[44px] font-bold text-[#4E6E2A] leading-none">
              +{formatWon(analytics.profitComparison.totalSavedCommissionAndAdFee)}
            </div>
            <p className="text-xs text-[#4C6235] tabular-nums pt-1">
              타사 수수료 14.8% → <strong className="text-[#1A1D1A]">Baro 0%</strong> · 상단 광고비 0원
            </p>
          </div>

          <div className="bg-[#EAF1E2] border border-[#DCE7CF] rounded-2xl p-5 sm:p-6 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-bold text-[#3D5720]">
                맞춤 매칭 순증 매출
              </p>
              <span className="w-2 h-2 rounded-full bg-[#82B440] shrink-0" aria-hidden="true" />
            </div>
            <div className="os-kpi text-4xl sm:text-[44px] font-bold text-[#4E6E2A] leading-none">
              +{formatWon(analytics.profitComparison.totalAiRegularIncrementalSales)}
            </div>
            <p className="text-xs text-[#4C6235] tabular-nums pt-1">
              단골 자동 매칭{' '}
              <strong className="text-[#1A1D1A]">
                +{analytics.profitComparison.totalAiRegularMatchedOrders}건
              </strong>{' '}
              · 재주문율{' '}
              <strong className="text-[#3D5720]">
                {analytics.profitComparison.repeatCustomerRatePercent}%
              </strong>
            </p>
          </div>
        </div>

        {/* Collapsible Breakdown Drawer */}
        {showKpiBreakdown && (
          <div className="pt-6 border-t border-[#E8ECE4] grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
            <div className="space-y-1">
              <span className="text-[#687064]">중개 수수료 절감액</span>
              <div className="font-mono tabular-nums text-base font-bold text-[#4E6E2A]">
                {formatWon(analytics.profitComparison.totalBrokerageFeeSaved)}
              </div>
              <p className="text-[#687064]">
                {analytics.profitComparison.competitorPlatformLabel} 대비
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-[#687064]">상단·깃발 광고비 절감액</span>
              <div className="font-mono tabular-nums text-base font-bold text-[#4E6E2A]">
                {formatWon(analytics.profitComparison.totalAdExposureFeeSaved)}
              </div>
              <p className="text-[#687064]">노출 입찰 없는 컨디션 맞춤 매칭</p>
            </div>
            <div className="space-y-1">
              <span className="text-[#687064]">🏢 B2B 기업 식대 · Baro페이 정산</span>
              <div className="font-mono tabular-nums text-base font-bold text-[#4E6E2A]">
                {analytics.b2bCount}건 · {formatWon(analytics.b2bRevenue)}
              </div>
              <p className="text-[#687064]">
                B2B 식대 우선 매칭 · Baro페이 수수료 1.5% (일반 PG 3% 대비 절반)
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Clean Segmented Navigation Tabs */}
      <div
        role="tablist"
        aria-label="점주 관리 탭"
        className="grid grid-cols-2 sm:grid-cols-5 gap-1 p-1.5 bg-white border border-[#E8ECE4] rounded-2xl shadow-sm"
      >
        <button
          type="button"
          role="tab"
          aria-selected={ownerSection === 'orders'}
          onClick={() => setOwnerSection('orders')}
          className={`min-h-[42px] px-2.5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
            ownerSection === 'orders'
              ? 'bg-[#EAF1E2] text-[#3D5720]'
              : 'text-[#687064] hover:text-[#1A1D1A] hover:bg-[#F7F8F5]'
          }`}
        >
          실시간 주문 ({pendingCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ownerSection === 'promo'}
          onClick={() => setOwnerSection('promo')}
          className={`min-h-[42px] px-2.5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
            ownerSection === 'promo'
              ? 'bg-[#EAF1E2] text-[#3D5720]'
              : 'text-[#687064] hover:text-[#1A1D1A] hover:bg-[#F7F8F5]'
          }`}
        >
          <Megaphone className="w-4 h-4 shrink-0" />
          <span>홍보·쿠폰·배달비</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ownerSection === 'ops'}
          onClick={() => setOwnerSection('ops')}
          className={`min-h-[42px] px-2.5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
            ownerSection === 'ops'
              ? 'bg-[#EAF1E2] text-[#3D5720]'
              : 'text-[#687064] hover:text-[#1A1D1A] hover:bg-[#F7F8F5]'
          }`}
        >
          매장 · 메뉴
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ownerSection === 'dashboard'}
          onClick={() => setOwnerSection('dashboard')}
          className={`min-h-[42px] px-2.5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
            ownerSection === 'dashboard'
              ? 'bg-[#EAF1E2] text-[#3D5720]'
              : 'text-[#687064] hover:text-[#1A1D1A] hover:bg-[#F7F8F5]'
          }`}
        >
          <BarChart3 className="w-4 h-4 shrink-0" />
          <span>매출 · 통계</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ownerSection === 'crm'}
          onClick={() => setOwnerSection('crm')}
          className={`min-h-[42px] px-2.5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer inline-flex items-center justify-center gap-1.5 ${
            ownerSection === 'crm'
              ? 'bg-[#EAF1E2] text-[#3D5720]'
              : 'text-[#687064] hover:text-[#1A1D1A] hover:bg-[#F7F8F5]'
          }`}
        >
          <span>CS · 증적 · 리뷰</span>
          {orders.filter(
            (o) =>
              o.evidenceRecord ||
              (o.cancelRequested &&
                o.status !== OrderStatus.CANCELLED &&
                o.status !== OrderStatus.COMPLETED)
          ).length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[#D9381E] text-white text-[10px] font-extrabold leading-none">
              {
                orders.filter(
                  (o) =>
                    o.evidenceRecord ||
                    (o.cancelRequested &&
                      o.status !== OrderStatus.CANCELLED &&
                      o.status !== OrderStatus.COMPLETED)
                ).length
              }
            </span>
          )}
        </button>
      </div>

      {/* 1. Real-Time Orders Tab */}
      {ownerSection === 'orders' && (
        <div className="space-y-6">
          {/* Collapsible Kitchen Voice Command Bar */}
          <section className="os-card rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowKitchenVoice((prev) => !prev)}
              aria-expanded={showKitchenVoice}
              className="w-full min-h-[54px] px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#F7F8F5] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Mic className="w-4 h-4 text-[#4E6E2A] shrink-0" />
                <span className="text-sm font-semibold text-[#1A1D1A]">
                  주방 핸즈프리 음성 · 빠른 명령
                </span>
                <span className="hidden sm:inline text-xs text-[#687064] truncate">
                  · 주문 수락, 조리 시작, 품절 처리를 말로 실행
                </span>
              </div>
              {showKitchenVoice ? (
                <ChevronUp className="w-4 h-4 text-[#687064] shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#687064] shrink-0" />
              )}
            </button>

            {showKitchenVoice && (
              <div className="px-5 pb-5 pt-3 border-t border-[#E8ECE4] space-y-3 bg-[#F7F8F5]/60">
                <div className="flex flex-col sm:flex-row gap-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      runOwnerCommand(commandInput);
                    }}
                    className="flex-1 flex gap-2"
                  >
                    <input
                      type="text"
                      value={commandInput}
                      onChange={(e) => setCommandInput(e.target.value)}
                      placeholder='예: "주문 수락", "조리 시작", "얼큰 소고기국밥 품절"'
                      className="flex-1 min-h-[42px] px-3.5 bg-white border border-[#E8ECE4] rounded-xl text-sm text-[#1A1D1A]"
                    />
                    <button
                      type="submit"
                      disabled={isCommandProcessing}
                      className="min-h-[42px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isCommandProcessing ? '분석 중...' : '실행'}
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={handleKitchenVoice}
                    className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      isKitchenListening
                        ? 'bg-red-600 text-white'
                        : 'bg-[#EAF1E2] text-[#4E6E2A] hover:bg-[#DCE7CF]'
                    }`}
                  >
                    {isKitchenListening ? (
                      <>
                        <MicOff className="w-3.5 h-3.5" />
                        <span>듣는 중...</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5" />
                        <span>음성 입력</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    '주문 수락',
                    '조리 시작',
                    '대행사 라이더 호출',
                    '완료 처리',
                    '얼큰 소고기국밥 품절',
                  ].map((presetCmd) => (
                    <button
                      key={presetCmd}
                      type="button"
                      onClick={() => runOwnerCommand(presetCmd)}
                      className="min-h-[32px] px-3 py-1 bg-white border border-[#E8ECE4] hover:border-[#4E6E2A] text-xs font-medium text-[#3A4038] rounded-xl cursor-pointer transition-colors"
                    >
                      {presetCmd}
                    </button>
                  ))}
                </div>

                {commandFeedback && (
                  <p className="text-xs font-semibold text-[#4E6E2A]">
                    {commandFeedback}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Order Queue Header & Filter */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-base sm:text-lg font-bold text-[#1A1D1A]">
                  실시간 주문 내역
                </h2>
                <span className="text-xs text-[#687064] tabular-nums">
                  대기 {pendingCount} · 진행 {activeCount}
                </span>
              </div>
              <div className="flex items-center gap-1 p-1 bg-[#F0F3EC] border border-[#E8ECE4] rounded-xl">
                {(
                  [
                    { id: 'all', label: '전체' },
                    { id: 'active', label: '진행 중' },
                    { id: 'done', label: '완료·취소' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterTab(tab.id)}
                    className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      filterTab === tab.id
                        ? 'bg-white text-[#4E6E2A] shadow-2xs'
                        : 'text-[#687064] hover:text-[#1A1D1A]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="os-card rounded-3xl p-10 text-center text-sm text-[#687064]">
                해당 상태의 주문이 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredOrders.map((order) => {
                  const isBeforeCooking =
                    order.status === OrderStatus.PENDING ||
                    order.status === OrderStatus.ACCEPTED;
                  const effectiveMethod =
                    order.deliveryMethod ??
                    (order.sharedDeliveryApplied
                      ? 'auto_bundle'
                      : 'partner_direct');
                  const methodMeta = getDeliveryMethodMeta(effectiveMethod);
                  const chosenDispatch =
                    dispatchChoiceByOrder[order.id] ?? methodMeta.dispatchMode;

                  return (
                    <article
                      key={order.id}
                      className="os-card rounded-3xl p-5 space-y-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#687064]">
                            <span className="font-mono font-semibold text-[#1A1D1A]">
                              {order.orderCode}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[11px] font-bold">
                              {methodMeta.label}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {order.customerAlias} / {order.addressAlias}
                            </span>
                            {order.isB2B && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-semibold text-[#4E6E2A]">
                                  B2B 단체
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {order.createdAt}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-[#1A1D1A]">
                            {order.storeName} · {order.menuName} ×{' '}
                            <span className="tabular-nums">{order.servings}인</span>
                          </h3>
                          {order.items && order.items.length > 1 && (
                            <p className="text-xs text-[#555E52]">
                              구성:{' '}
                              {order.items
                                .map((it) =>
                                  it.selectedOptionNames.length > 0
                                    ? `${it.menuName}×${it.quantity} (${it.selectedOptionNames.join(', ')})`
                                    : `${it.menuName}×${it.quantity}`
                                )
                                .join(' · ')}
                            </p>
                          )}
                          {order.reservationSlot && (
                            <p className="text-xs font-semibold text-[#4E6E2A]">
                              예약 도착: {order.reservationSlot}
                            </p>
                          )}
                          {(!order.items || order.items.length <= 1) &&
                            order.selectedOptionNames.length > 0 && (
                              <p className="text-xs text-[#687064]">
                                옵션: {order.selectedOptionNames.join(', ')}
                              </p>
                            )}
                          {order.isB2B && (
                            <button
                              type="button"
                              onClick={() => setStatementOrder(order)}
                              className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-[11px] font-bold cursor-pointer"
                            >
                              <FileText className="w-3 h-3" />
                              <span>B2B 거래명세표 보기</span>
                            </button>
                          )}
                          {order.customerNote && (
                            <p className="text-xs text-[#687064]">
                              요청: {order.customerNote}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-base font-bold font-mono tabular-nums text-[#1A1D1A]">
                            {formatWon(order.totalAmount)}
                          </div>
                          <div className="text-xs font-semibold mt-0.5 text-[#4E6E2A]">
                            {STATUS_LABELS[order.status]}
                            {order.mockRefunded && ' · 환불'}
                          </div>
                        </div>
                      </div>

                      {order.cancelRequested &&
                        order.status !== OrderStatus.CANCELLED &&
                        order.status !== OrderStatus.COMPLETED && (
                          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2.5 text-xs">
                            <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                              <span>
                                조리 후 취소 요청 ({order.cancelRequestedAt})
                              </span>
                            </div>
                            <p className="text-[#1A1D1A]">
                              사유: {order.cancelRequestReason}
                            </p>
                            {onResolveCancelRequest && (
                              <div className="flex flex-wrap gap-2 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onResolveCancelRequest(order.id, 'approve')
                                  }
                                  className="min-h-[34px] px-3 py-1 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
                                >
                                  취소 승인 (환불)
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onResolveCancelRequest(order.id, 'reject')
                                  }
                                  className="min-h-[34px] px-3 py-1 rounded-xl bg-white hover:bg-[#EAF1E2] border border-[#D4E1C5] text-[#3D5720] font-bold cursor-pointer"
                                >
                                  취소 반려 (진행 유지)
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                      {onAttachOwnerPhotos &&
                        order.status !== OrderStatus.CANCELLED && (
                          <div className="p-3 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-[#3D5720] inline-flex items-center gap-1.5">
                                <PackageCheck className="w-3.5 h-3.5" />
                                배달 전 포장 · 실링 사진 (
                                {(order.ownerPackagingPhotos ?? []).length}/3)
                              </span>
                              <label className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] font-bold inline-flex items-center gap-1 cursor-pointer">
                                <Camera className="w-3.5 h-3.5" />
                                <span>포장 사진 찍기·올리기</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  disabled={
                                    (order.ownerPackagingPhotos ?? []).length >= 3
                                  }
                                  onChange={async (e) => {
                                    const existing =
                                      order.ownerPackagingPhotos ?? [];
                                    const added =
                                      await readCompressedEvidencePhotos(
                                        e,
                                        existing.length,
                                        3
                                      );
                                    if (added.length > 0) {
                                      onAttachOwnerPhotos(
                                        order.id,
                                        [...existing, ...added].slice(0, 3)
                                      );
                                    }
                                  }}
                                  className="hidden"
                                />
                              </label>
                            </div>
                            {(order.ownerPackagingPhotos ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {(order.ownerPackagingPhotos ?? []).map(
                                  (photo, idx) => (
                                    <div
                                      key={`${photo.name}-${idx}`}
                                      className="relative"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => setCsLightboxPhoto(photo)}
                                        className="block cursor-pointer"
                                        aria-label={`${photo.name} 크게 보기`}
                                      >
                                        <img
                                          src={photo.dataUrl}
                                          alt={photo.name}
                                          className="w-14 h-14 rounded-lg object-cover border border-[#D4E1C5]"
                                        />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onAttachOwnerPhotos(
                                            order.id,
                                            (
                                              order.ownerPackagingPhotos ?? []
                                            ).filter((_, i) => i !== idx)
                                          )
                                        }
                                        aria-label="포장 사진 삭제"
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#1A1D1A] text-white flex items-center justify-center cursor-pointer"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        )}

                      <div className="pt-3.5 border-t border-[#E8ECE4] space-y-3">
                        {order.status === OrderStatus.COOKING && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-medium text-[#687064]">
                              배차 방식
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setDispatchChoiceByOrder((prev) => ({
                                  ...prev,
                                  [order.id]: DispatchMode.NEIGHBOR_WALK,
                                }))
                              }
                              className={`min-h-[32px] px-2.5 py-1 rounded-lg border font-semibold cursor-pointer ${
                                chosenDispatch === DispatchMode.NEIGHBOR_WALK
                                  ? 'bg-[#EAF1E2] border-[#4E6E2A] text-[#4E6E2A]'
                                  : 'bg-white border-[#E8ECE4] text-[#687064]'
                              }`}
                            >
                              이웃 도보
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDispatchChoiceByOrder((prev) => ({
                                  ...prev,
                                  [order.id]: DispatchMode.AGENCY_RIDER,
                                }))
                              }
                              className={`min-h-[32px] px-2.5 py-1 rounded-lg border font-semibold cursor-pointer ${
                                chosenDispatch === DispatchMode.AGENCY_RIDER
                                  ? 'bg-[#EAF1E2] border-[#4E6E2A] text-[#4E6E2A]'
                                  : 'bg-white border-[#E8ECE4] text-[#687064]'
                              }`}
                            >
                              전문 라이더
                            </button>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {order.status === OrderStatus.PENDING && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onAdvanceOrderStatus(
                                      order.id,
                                      OrderStatus.ACCEPTED
                                    )
                                  }
                                  className="min-h-[40px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-semibold rounded-xl cursor-pointer transition-colors"
                                >
                                  주문 수락
                                </button>
                                <button
                                  type="button"
                                  disabled
                                  title="수락 전에는 완료할 수 없습니다"
                                  className="min-h-[40px] px-3 py-2 bg-[#F7F8F5] text-[#919A8D] text-xs rounded-xl flex items-center gap-1 cursor-not-allowed"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>완료 불가</span>
                                </button>
                              </>
                            )}

                            {order.status === OrderStatus.ACCEPTED && (
                              <button
                                type="button"
                                onClick={() =>
                                  onAdvanceOrderStatus(
                                    order.id,
                                    OrderStatus.COOKING
                                  )
                                }
                                className="min-h-[40px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-semibold rounded-xl cursor-pointer transition-colors"
                              >
                                조리 시작
                              </button>
                            )}

                            {order.status === OrderStatus.COOKING && (
                              <button
                                type="button"
                                onClick={() =>
                                  onAdvanceOrderStatus(
                                    order.id,
                                    OrderStatus.PICKUP,
                                    chosenDispatch
                                  )
                                }
                                className="min-h-[40px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-semibold rounded-xl cursor-pointer transition-colors"
                              >
                                픽업 처리
                              </button>
                            )}

                            {order.status === OrderStatus.PICKUP && (
                              <button
                                type="button"
                                onClick={() =>
                                  onAdvanceOrderStatus(
                                    order.id,
                                    OrderStatus.COMPLETED
                                  )
                                }
                                className="min-h-[40px] px-4 py-2 bg-[#1A1D1A] hover:bg-[#252A25] text-white text-xs sm:text-sm font-semibold rounded-xl cursor-pointer transition-colors"
                              >
                                배달 완료
                              </button>
                            )}

                            {order.status === OrderStatus.COMPLETED && (
                              <span className="text-xs font-semibold text-[#4E6E2A] flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" />
                                처리 완료
                              </span>
                            )}

                            {order.status === OrderStatus.CANCELLED && (
                              <span className="text-xs font-medium text-[#687064]">
                                취소 · 환불 완료
                                {order.stockRestored ? ' · 재고 복구됨' : ''}
                              </span>
                            )}
                          </div>

                          {isBeforeCooking && (
                            <button
                              type="button"
                              onClick={() =>
                                onCancelOrderBeforeCooking(order.id)
                              }
                              className="min-h-[40px] px-3.5 py-2 border border-red-200 bg-white hover:bg-red-50 text-red-700 text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                            >
                              조리 전 취소
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 2. Self-Service Store Promotions, Coupons & Tiered Delivery Fee (FREE for All Owners) */}
      {ownerSection === 'promo' && selectedPromoStore && (
        <div className="space-y-6">
          {/* Store Selector */}
          <section className="os-card rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="inline-flex flex-wrap items-center gap-1.5 text-xs font-bold text-[#4E6E2A]">
                <span>🎁 홍보·쿠폰은 유료 플랜(베이직 월 2.9만 원~) 포함 ·</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  현재 프로모션 기간 3개월 무료 제공 중
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[#1A1D1A]">
                가게 홍보 이벤트 · 쿠폰 · 상생 배달비 설정
              </h2>
            </div>
            <select
              aria-label="설정할 매장 선택"
              value={selectedPromoStore.id}
              onChange={(e) => setPromoStoreId(e.target.value)}
              className="min-h-[42px] px-3.5 bg-[#F7F8F5] border border-[#D4E1C5] rounded-xl text-sm font-bold text-[#1A1D1A] max-w-full sm:max-w-xs"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.areaLabel.split(' · ')[0]})
                </option>
              ))}
            </select>
          </section>

          {/* Card 1: Mutual-Benefit Tiered Delivery Fee */}
          <section className="os-card rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#1A1D1A] flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#4E6E2A]" />
                  <span>상생 배달비 설정 (최소주문 없음 · 1개도 배달)</span>
                </h3>
                <p className="text-xs text-[#687064]">
                  최소주문 없이 1개 주문도 배달합니다. 기본 배달비는 고객이 부담하고, 주문 금액이 커질수록 점주님이 일부 지원해 상생할 수 있어요.
                </p>
              </div>
            </div>

            {/* Base Delivery Fee */}
            <div className="p-4 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#1A1D1A]">
                  기본 배달비 (1개 주문 시 구매자 부담)
                </div>
                <div className="text-[11px] text-[#687064]">
                  착한가격(매장 동일가) 원칙으로 숨겨진 수수료 없이 배달비만 투명하게 안내됩니다.
                </div>
              </div>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDraftBaseFee((f) => Math.max(0, f - 500))}
                  className="w-9 h-9 rounded-xl bg-white border border-[#E8ECE4] font-bold cursor-pointer"
                >
                  -
                </button>
                <span className="min-w-[76px] text-center font-mono font-extrabold text-sm text-[#4E6E2A] tabular-nums">
                  {formatWon(draftBaseFee)}
                </span>
                <button
                  type="button"
                  onClick={() => setDraftBaseFee((f) => Math.min(6000, f + 500))}
                  className="w-9 h-9 rounded-xl bg-white border border-[#E8ECE4] font-bold cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* 1-Click Presets */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-[#687064]">빠른 프리셋:</span>
              <button
                type="button"
                onClick={() => setDraftTiers([])}
                className="px-3 py-1.5 rounded-xl bg-white border border-[#E8ECE4] hover:border-[#82B440] font-semibold cursor-pointer"
              >
                기본형 (구간 없음)
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraftTiers([
                    {
                      minSubtotal: 15000,
                      deliveryFee: Math.max(0, draftBaseFee - 1000),
                    },
                    { minSubtotal: 25000, deliveryFee: 0 },
                  ])
                }
                className="px-3 py-1.5 rounded-xl bg-[#EAF1E2] border border-[#82B440] text-[#3D5720] font-bold cursor-pointer"
              >
                상생 추천 (1.5만↑ -1천 · 2.5만↑ 무료)
              </button>
              <button
                type="button"
                onClick={() =>
                  setDraftTiers([
                    {
                      minSubtotal: 10000,
                      deliveryFee: Math.max(0, draftBaseFee - 500),
                    },
                    { minSubtotal: 20000, deliveryFee: 0 },
                  ])
                }
                className="px-3 py-1.5 rounded-xl bg-white border border-[#E8ECE4] hover:border-[#82B440] font-semibold cursor-pointer"
              >
                소액 상생 (1만↑ -500 · 2만↑ 무료)
              </button>
            </div>

            {/* Editable Tiers */}
            <div className="space-y-2">
              {draftTiers.map((tier, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-[#FAFCF8] border border-[#E8ECE4] text-xs"
                >
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={tier.minSubtotal}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                      setDraftTiers((prev) =>
                        prev.map((t, i) =>
                          i === idx ? { ...t, minSubtotal: val } : t
                        )
                      );
                    }}
                    className="w-28 min-h-[36px] px-2.5 bg-white border border-[#E8ECE4] rounded-lg font-mono font-bold"
                  />
                  <span className="font-semibold text-[#555E52]">
                    원 이상 주문 시 → 배달비
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={tier.deliveryFee}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                      setDraftTiers((prev) =>
                        prev.map((t, i) =>
                          i === idx ? { ...t, deliveryFee: val } : t
                        )
                      );
                    }}
                    className="w-24 min-h-[36px] px-2.5 bg-white border border-[#E8ECE4] rounded-lg font-mono font-bold"
                  />
                  <span className="font-semibold text-[#4E6E2A]">
                    원 {tier.deliveryFee === 0 && '(점주 지원 무료)'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftTiers((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="ml-auto px-2.5 py-1 rounded-lg bg-red-50 text-red-700 font-bold cursor-pointer"
                  >
                    삭제
                  </button>
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setDraftTiers((prev) => [
                      ...prev,
                      {
                        minSubtotal:
                          prev.length > 0
                            ? prev[prev.length - 1].minSubtotal + 10000
                            : 15000,
                        deliveryFee: 0,
                      },
                    ])
                  }
                  className="px-3 py-1.5 rounded-xl bg-[#F7F8F5] hover:bg-[#EAF1E2] border border-[#E8ECE4] text-xs font-bold text-[#3D5720] cursor-pointer"
                >
                  + 지원 구간 추가
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateStoreDeliveryPolicy?.(
                      selectedPromoStore.id,
                      draftBaseFee,
                      draftTiers
                    );
                    setDeliverySavedNotice('상생 배달비 정책이 저장되었습니다.');
                    window.setTimeout(() => setDeliverySavedNotice(null), 2500);
                  }}
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold cursor-pointer"
                >
                  배달비 정책 저장
                </button>
              </div>
              {deliverySavedNotice && (
                <p className="text-xs font-bold text-[#4E6E2A]">
                  ✓ {deliverySavedNotice}
                </p>
              )}
            </div>
          </section>

          {/* Card 2: Store Event / Promotion Banner */}
          <section className="os-card rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#1A1D1A] flex flex-wrap items-center gap-2">
                  <Megaphone className="w-4 h-4 text-[#4E6E2A]" />
                  <span>우리 가게 자체 이벤트 · 가게 홍보 등록</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold">
                    유료 플랜 · 3개월 무료 프로모션
                  </span>
                </h3>
                <p className="text-xs text-[#687064] mt-0.5">
                  등록한 이벤트는 고객 홈 화면과 가게 메뉴창 상단에 바로 노출됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAllStorePromos((p) => !p)}
                className="text-xs font-bold text-[#4E6E2A] underline cursor-pointer"
              >
                {showAllStorePromos ? '선택 매장만 보기' : '전체 매장 이벤트 보기'}
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!promoTitle.trim()) return;
                onAddStorePromotion?.({
                  storeId: selectedPromoStore.id,
                  badgeText: promoBadge,
                  title: promoTitle.trim(),
                  description: promoDesc.trim(),
                  isActive: true,
                });
                setPromoTitle('');
                setPromoDesc('');
              }}
              className="p-4 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-3"
            >
              <div className="flex flex-wrap gap-1.5">
                {['점주 이벤트', '리뷰 혜택', '신메뉴 특가', '오늘의 혜택'].map(
                  (b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setPromoBadge(b)}
                      className={`px-3 py-1 rounded-full border text-xs font-bold cursor-pointer ${
                        promoBadge === b
                          ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                          : 'bg-white border-[#E8ECE4] text-[#434B40]'
                      }`}
                    >
                      {b}
                    </button>
                  )
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={promoTitle}
                  onChange={(e) => setPromoTitle(e.target.value)}
                  placeholder="이벤트 제목 (예: 리뷰 약속 시 음료수 1캔 무료)"
                  className="min-h-[42px] px-3.5 bg-white border border-[#E8ECE4] rounded-xl text-sm text-[#1A1D1A]"
                />
                <input
                  type="text"
                  value={promoDesc}
                  onChange={(e) => setPromoDesc(e.target.value)}
                  placeholder="상세 안내 (예: 1개 주문해도 정성껏 담아드려요)"
                  className="min-h-[42px] px-3.5 bg-white border border-[#E8ECE4] rounded-xl text-sm text-[#1A1D1A]"
                />
              </div>
              <button
                type="submit"
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                + {selectedPromoStore.name} 이벤트 등록
              </button>
            </form>

            <div className="space-y-2">
              {storePromotions
                .filter(
                  (p) => showAllStorePromos || p.storeId === selectedPromoStore.id
                )
                .map((promo) => {
                  const stName =
                    stores.find((s) => s.id === promo.storeId)?.name ?? '';
                  return (
                    <div
                      key={promo.id}
                      className="p-3.5 rounded-2xl bg-white border border-[#E8ECE4] flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold">
                            {promo.badgeText ?? '점주 이벤트'}
                          </span>
                          <span className="font-bold text-[#4E6E2A]">
                            {stName}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-[#1A1D1A]">
                          {promo.title}
                        </p>
                        {promo.description && (
                          <p className="text-[#687064]">{promo.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleStorePromotion?.(promo.id)}
                          className={`min-h-[34px] px-3 py-1 rounded-xl font-bold border cursor-pointer ${
                            promo.isActive
                              ? 'bg-[#EAF1E2] border-[#82B440] text-[#3D5720]'
                              : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#687064]'
                          }`}
                        >
                          {promo.isActive ? '노출 ON' : '일시정지'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteStorePromotion?.(promo.id)}
                          aria-label="이벤트 삭제"
                          className="p-2 rounded-xl hover:bg-red-50 text-[#687064] hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>

          {/* Card 3: Store Coupons */}
          <section className="os-card rounded-3xl p-6 space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#1A1D1A] flex flex-wrap items-center gap-2">
                <Ticket className="w-4 h-4 text-[#4E6E2A]" />
                <span>가게 자체 쿠폰 발행 · 할인 설정</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold">
                  유료 플랜 · 3개월 무료 프로모션
                </span>
              </h3>
              <p className="text-xs text-[#687064] mt-0.5">
                점주님이 발행한 쿠폰은 고객 결제 시 자동 적용 후보로 노출됩니다. 금액 조건을 비우면 1개 주문에도 즉시 할인됩니다.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const val = Math.max(1, parseInt(couponValue, 10) || 0);
                if (!couponLabel.trim() || val <= 0) return;
                const minSub = parseInt(couponMinSubtotal, 10);
                const code = `STORE_${Math.random()
                  .toString(36)
                  .slice(2, 6)
                  .toUpperCase()}`;
                onAddStoreCoupon?.({
                  storeId: selectedPromoStore.id,
                  code,
                  label: couponLabel.trim(),
                  discountType: couponType,
                  discountValue:
                    couponType === 'percent' ? Math.min(50, val) : val,
                  maxDiscountAmount: couponType === 'percent' ? 5000 : undefined,
                  minSubtotal:
                    Number.isFinite(minSub) && minSub > 0 ? minSub : undefined,
                  isActive: true,
                });
                setCouponLabel('');
                setCouponMinSubtotal('');
              }}
              className="p-4 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={couponLabel}
                  onChange={(e) => setCouponLabel(e.target.value)}
                  placeholder="쿠폰명 (예: 단골 감사 2,000원 즉시 할인)"
                  className="min-h-[42px] px-3.5 bg-white border border-[#E8ECE4] rounded-xl text-sm text-[#1A1D1A]"
                />
                <div className="flex gap-2">
                  <select
                    value={couponType}
                    onChange={(e) =>
                      setCouponType(e.target.value as 'fixed' | 'percent')
                    }
                    className="min-h-[42px] px-3 bg-white border border-[#E8ECE4] rounded-xl text-xs font-bold"
                  >
                    <option value="fixed">정액 (원)</option>
                    <option value="percent">정률 (%)</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={couponValue}
                    onChange={(e) => setCouponValue(e.target.value)}
                    placeholder={couponType === 'fixed' ? '2000' : '10'}
                    className="w-24 min-h-[42px] px-3 bg-white border border-[#E8ECE4] rounded-xl text-sm font-mono font-bold"
                  />
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={couponMinSubtotal}
                    onChange={(e) => setCouponMinSubtotal(e.target.value)}
                    placeholder="조건금액(선택)"
                    className="flex-1 min-w-0 min-h-[42px] px-3 bg-white border border-[#E8ECE4] rounded-xl text-xs"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                + 가게 쿠폰 발행하기
              </button>
            </form>

            <div className="space-y-2">
              {storeCoupons
                .filter(
                  (c) => showAllStorePromos || c.storeId === selectedPromoStore.id
                )
                .map((cp) => {
                  const stName =
                    stores.find((s) => s.id === cp.storeId)?.name ?? '';
                  return (
                    <div
                      key={cp.id}
                      className="p-3.5 rounded-2xl bg-white border border-[#E8ECE4] flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] font-bold">
                            {cp.discountType === 'percent'
                              ? `${cp.discountValue}% 할인`
                              : `${formatWon(cp.discountValue)} 할인`}
                          </span>
                          <span className="font-bold text-[#4E6E2A]">
                            {stName}
                          </span>
                          {cp.minSubtotal ? (
                            <span className="text-[#687064]">
                              · {formatWon(cp.minSubtotal)}↑
                            </span>
                          ) : (
                            <span className="text-[#687064]">· 조건 없음</span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-[#1A1D1A]">
                          {cp.label}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleStoreCoupon?.(cp.id)}
                          className={`min-h-[34px] px-3 py-1 rounded-xl font-bold border cursor-pointer ${
                            cp.isActive
                              ? 'bg-[#EAF1E2] border-[#82B440] text-[#3D5720]'
                              : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#687064]'
                          }`}
                        >
                          {cp.isActive ? '사용 가능' : '중지'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteStoreCoupon?.(cp.id)}
                          aria-label="쿠폰 삭제"
                          className="p-2 rounded-xl hover:bg-red-50 text-[#687064] hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        </div>
      )}

      {/* 3. Analytics & Statistics Tab */}
      {ownerSection === 'dashboard' && (
        <div className="space-y-6">
          {/* Unified 4-Metric Hairline Strip */}
          <section className="os-card rounded-3xl p-6 grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-0 lg:divide-x lg:divide-[#E8ECE4]">
            <div className="lg:pr-5 space-y-1">
              <div className="text-xs text-[#687064]">세션 유효 매출</div>
              <div className="os-kpi text-xl sm:text-2xl font-bold text-[#1A1D1A]">
                {formatWon(analytics.totalRevenue)}
              </div>
              <div className="text-xs text-[#4E6E2A] font-medium tabular-nums">
                유효 {analytics.totalCount}건 · 중개 0% (PG 실비만 매장과 동일 부담)
              </div>
            </div>

            <div className="lg:px-5 space-y-1">
              <div className="text-xs text-[#687064]">평균 객단가</div>
              <div className="os-kpi text-xl sm:text-2xl font-bold text-[#1A1D1A]">
                {formatWon(analytics.avgOrderValue)}
              </div>
              <div className="text-xs text-[#687064] tabular-nums">
                B2B 단체 {analytics.b2bCount}건 ({formatWon(analytics.b2bRevenue)})
              </div>
            </div>

            <div className="lg:px-5 space-y-1">
              <div className="text-xs text-[#687064]">주문 완료율</div>
              <div className="os-kpi text-xl sm:text-2xl font-bold text-[#4E6E2A]">
                {analytics.completionRate}%
              </div>
              <div className="text-xs text-[#687064] tabular-nums">
                완료 {analytics.completedCount} · 진행 {activeCount} · 취소{' '}
                {analytics.cancelledCount}
              </div>
            </div>

            <div className="lg:pl-5 space-y-1">
              <div className="text-xs text-[#687064]">매장 · 재고 상태</div>
              <div className="os-kpi text-xl sm:text-2xl font-bold text-[#1A1D1A]">
                {analytics.openStoresCount}/{stores.length}곳 영업
              </div>
              <div className="text-xs text-[#687064] tabular-nums">
                재고 주의 {analytics.lowOrOutMenus.length}건 · 평점{' '}
                {analytics.avgRating}
              </div>
            </div>
          </section>

          {/* alle Partners Subscription Model (PPT Slides 10, 11, 13, 18) */}
          <section className="os-card rounded-3xl p-6 space-y-4 border border-[#DCE7CF]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4E6E2A]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>플랫폼 중개수수료 0% · 카드·PG 수수료 및 배달 수행비 별도</span>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-[#1A1D1A] mt-0.5">
                  파트너 구독요금제 (검증용 가설 · 광고비보다 관리 가능한 월 구독)
                </h2>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EAF1E2] text-[#3D5720] text-xs font-bold">
                현재 선택:{' '}
                {ownerSaasPlan === 'trial'
                  ? '프로모션 (3개월 무료)'
                  : ownerSaasPlan === 'basic'
                    ? '베이직 (월 2.9만원)'
                    : ownerSaasPlan === 'pro'
                      ? '프로 (월 5.9만원)'
                      : '프리미엄 (월 9.9만원)'}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              {(
                [
                  {
                    id: 'trial',
                    name: '프로모션 (오픈 기념)',
                    price: '3개월 무료',
                    desc: '매장 등록 · 홍보 이벤트·쿠폰 무료 체험',
                  },
                  {
                    id: 'basic',
                    name: '베이직',
                    price: '월 2.9만 원',
                    desc: '홍보·쿠폰 발행 · 주문·단골 관리',
                  },
                  {
                    id: 'pro',
                    name: '프로 (기준)',
                    price: '월 5.9만 원',
                    desc: '홍보·쿠폰 + 재방문 캠페인 · 매출 분석',
                  },
                  {
                    id: 'premium',
                    name: '프리미엄',
                    price: '월 9.9만 원',
                    desc: '전 기능 + AI 마케팅 · 고급 고객 분석',
                  },
                ] as const
              ).map((tier) => {
                const active = ownerSaasPlan === tier.id;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => onSelectOwnerSaasPlan?.(tier.id)}
                    aria-pressed={active}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer space-y-1 ${
                      active
                        ? 'bg-[#EAF1E2] border-[#4E6E2A] ring-1 ring-[#4E6E2A]/30'
                        : 'bg-[#F7F8F5] border-[#E8ECE4] hover:border-[#82B440]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-[#1A1D1A]">{tier.name}</span>
                      {active && (
                        <span className="text-[10px] font-extrabold text-[#3D5720]">
                          ✓ 선택됨
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-extrabold text-[#3D5720]">
                      {tier.price}
                    </div>
                    <p className="text-[11px] text-[#555E52] leading-snug">
                      {tier.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {(
                [
                  { min: 'trial' as PartnerPlanTier, label: '매장 등록 · 주문 접수' },
                  { min: 'basic' as PartnerPlanTier, label: '단골 관리 · 세무 자동 정리' },
                  { min: 'pro' as PartnerPlanTier, label: '재방문 캠페인 · 매출 분석' },
                  { min: 'premium' as PartnerPlanTier, label: 'AI 마케팅 · 고급 고객 분석' },
                ] as const
              ).map((cap) => {
                const enabled = hasPlan(cap.min);
                return (
                  <span
                    key={cap.label}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border font-medium ${
                      enabled
                        ? 'bg-[#EAF1E2] border-[#CFE0BC] text-[#3D5720]'
                        : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#8A9485]'
                    }`}
                  >
                    {enabled ? (
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                    ) : (
                      <Lock className="w-3 h-3 shrink-0" />
                    )}
                    <span>{cap.label}</span>
                  </span>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {hasPlan('basic') ? (
                <div className="p-3.5 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#1A1D1A]">
                      📊 세무 · 부가세 장부 자동 정리
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[10px] font-bold">
                      베이직+
                    </span>
                  </div>
                  <div className="text-[#687064] tabular-nums">
                    과세표준(공급가액):{' '}
                    <strong className="text-[#1A1D1A]">
                      {formatWon(Math.round(analytics.totalRevenue / 1.1))}
                    </strong>
                  </div>
                  <div className="text-[#687064] tabular-nums">
                    예상 부가세(10%):{' '}
                    <strong className="text-[#4E6E2A]">
                      {formatWon(
                        analytics.totalRevenue -
                          Math.round(analytics.totalRevenue / 1.1)
                      )}
                    </strong>
                  </div>
                </div>
              ) : (
                renderPlanLock(
                  'basic',
                  '📊 세무 · 부가세 장부 자동 정리',
                  '주문별 과세표준·예상 부가세(10%) 자동 집계를 제공합니다.'
                )
              )}

              {hasPlan('pro') ? (
                <div className="p-3.5 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#1A1D1A]">
                      📈 재방문 캠페인 & 매출 KPI
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[10px] font-bold">
                      프로+
                    </span>
                  </div>
                  <p className="text-[#555E52] leading-snug">
                    • 프로(5.9만 원) 기준 100개 점포 월 590만 · 추적 KPI: 30일 재주문율 · 공동배달 성사율
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCampaignNotice(
                          `단골 ${Math.max(3, stampCount + 2)}명에게 1초 재주문 리마인드 캠페인을 발송했습니다.`
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#4E6E2A] hover:bg-[#3D5720] text-white text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      단골 재방문 캠페인 발송
                    </button>
                    {campaignNotice && (
                      <span className="text-[11px] text-[#3D5720] font-medium">
                        ✓ {campaignNotice}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                renderPlanLock(
                  'pro',
                  '📈 재방문 캠페인 & 매출 KPI',
                  '단골 재방문 푸시 캠페인 발송과 30일 재주문율·수익 시뮬레이션을 제공합니다.'
                )
              )}

              {hasPlan('premium') ? (
                <div className="p-3.5 rounded-2xl bg-[#EAF1E2]/70 border border-[#DCE7CF] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#3D5720]">
                      📞 AI 마케팅 · 보이스봇 & 고객 분석
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#4E6E2A] text-white text-[10px] font-bold">
                      프리미엄
                    </span>
                  </div>
                  <p className="text-[#434B40] leading-snug">
                    • 11:42 “단체 12인분 가능?” → 오프피크 11:30 예약 링크 자동 전송
                  </p>
                  <p className="text-[#434B40] leading-snug">
                    • 세그먼트: 단골 재주문(42%) · 오프피크 직장인(35%) · 자동 묶음배송(23%)
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setAiMarketingNotice(
                          '오프피크(11:30~12:00) 직장인 세그먼트에 AI 맞춤 메뉴 제안을 자동 발송했습니다.'
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#3D5720] hover:bg-[#2F4418] text-white text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      AI 세그먼트 마케팅 실행
                    </button>
                    {aiMarketingNotice && (
                      <span className="text-[11px] text-[#3D5720] font-medium">
                        ✓ {aiMarketingNotice}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                renderPlanLock(
                  'premium',
                  '📞 AI 마케팅 · 보이스봇 & 고객 분석',
                  '부재중 AI 보이스봇 자동 응대, 고객 세그먼트 분석 및 AI 자동 마케팅을 제공합니다.'
                )
              )}
            </div>
          </section>

          {/* Store Revenue & Pipeline Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <section className="lg:col-span-7 os-card rounded-3xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-[#1A1D1A] flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-[#4E6E2A]" />
                  <span>매장별 매출 · 수수료 절감</span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#687064]">취소 제외</span>
                  {analytics.byStore.length > 10 && (
                    <button
                      type="button"
                      onClick={() => setShowAllDashboardStores((prev) => !prev)}
                      className="text-xs font-bold text-[#4E6E2A] hover:underline cursor-pointer"
                    >
                      {showAllDashboardStores
                        ? '주요 매장만 보기'
                        : `전체 매장 보기 (${analytics.byStore.length}곳)`}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {(() => {
                  const activeRevStores = analytics.byStore.filter(
                    (s) => s.revenue > 0
                  );
                  const visibleDashboardStores = showAllDashboardStores
                    ? analytics.byStore
                    : activeRevStores.length > 0
                      ? activeRevStores
                      : analytics.byStore.slice(0, 10);
                  return visibleDashboardStores.map(
                    ({ store, count, revenue }) => {
                      const pct = Math.round(
                        (revenue / analytics.maxStoreRevenue) * 100
                      );
                      const storeProfit =
                        analytics.profitComparison.byStore[store.id];
                      return (
                        <div key={store.id} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-[#1A1D1A] truncate">
                              {store.name}
                              {!store.isOpen && (
                                <span className="text-red-700 ml-1.5">
                                  (영업중단)
                                </span>
                              )}
                            </span>
                            <span className="font-mono tabular-nums font-bold text-[#1A1D1A] shrink-0">
                              {formatWon(revenue)} · {count}건
                            </span>
                          </div>
                          <div className="h-2 bg-[#EAF1E2] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#82B440] rounded-full transition-all"
                              style={{
                                width: `${Math.max(revenue > 0 ? 6 : 0, pct)}%`,
                              }}
                            />
                          </div>
                          {storeProfit && (
                            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-[#687064] tabular-nums">
                              <span>
                                30일 수수료 절감{' '}
                                {hasPlan('pro') ? (
                                  <strong className="font-mono text-[#4E6E2A]">
                                    +{formatWon(storeProfit.savedCommissionAndAdFee)}
                                  </strong>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[#8A9485]">
                                    <Lock className="w-3 h-3" /> 프로+
                                  </span>
                                )}
                              </span>
                              <span>
                                단골 매칭 순증{' '}
                                {hasPlan('basic') ? (
                                  <strong className="font-mono text-[#1A1D1A]">
                                    +{formatWon(storeProfit.aiRegularIncrementalSales)}
                                  </strong>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-[#8A9485]">
                                    <Lock className="w-3 h-3" /> 베이직+
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    }
                  );
                })()}
              </div>
            </section>

            <section className="lg:col-span-5 os-card rounded-3xl p-6 space-y-6">
              <div className="space-y-3">
                <h2 className="text-base font-bold text-[#1A1D1A]">
                  주문 단계별 현황
                </h2>
                <div className="grid grid-cols-3 gap-2.5">
                  {analytics.statusPipeline.map((st) => (
                    <div
                      key={st.status}
                      className="py-2.5 px-3 bg-[#F7F8F5] rounded-xl"
                    >
                      <div className="text-[11px] text-[#687064] truncate">
                        {st.label}
                      </div>
                      <div className="text-base font-bold font-mono tabular-nums text-[#1A1D1A] mt-0.5">
                        {st.count}건
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-5 border-t border-[#E8ECE4] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#1A1D1A]">
                    인기 취향 수요 (기본 추천 노출)
                  </h3>
                  {!hasPlan('basic') && (
                    <span className="text-[10px] font-bold text-[#687064] inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" /> 베이직+
                    </span>
                  )}
                </div>
                {!hasPlan('basic') ? (
                  renderPlanLock(
                    'basic',
                    '인기 취향 수요 · 추천 노출 분석',
                    '고객이 많이 찾는 취향 태그와 기본 추천 노출 비중을 확인할 수 있습니다.'
                  )
                ) : analytics.tagDemand.length === 0 ? (
                  <p className="text-xs text-[#687064]">주문 데이터가 없습니다.</p>
                ) : (
                  <div className="space-y-2.5">
                    {analytics.tagDemand.map(([tag, qty]) => {
                      const pct = Math.round((qty / analytics.maxTagQty) * 100);
                      return (
                        <div key={tag} className="flex items-center gap-2.5 text-xs">
                          <span className="w-16 font-medium text-[#555E52] shrink-0 truncate">
                            {tag}
                          </span>
                          <div className="flex-1 h-2 bg-[#EAF1E2] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#82B440] rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-9 text-right font-mono tabular-nums font-semibold text-[#1A1D1A]">
                            {qty}인
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Collapsible Menu Performance & Stock Table */}
          <section className="os-card rounded-3xl overflow-hidden">
            <button
              type="button"
              onClick={() => {
                if (hasPlan('pro')) {
                  setShowMenuTable((prev) => !prev);
                }
              }}
              aria-expanded={hasPlan('pro') ? showMenuTable : false}
              className={`w-full min-h-[58px] px-6 py-4 flex items-center justify-between gap-3 text-left transition-colors ${
                hasPlan('pro')
                  ? 'hover:bg-[#F7F8F5] cursor-pointer'
                  : 'bg-[#F7F8F5]/60 cursor-default'
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-base font-bold text-[#1A1D1A] flex items-center gap-2">
                  {hasPlan('pro') ? (
                    <PackageCheck className="w-4 h-4 text-[#4E6E2A]" />
                  ) : (
                    <Lock className="w-4 h-4 text-[#8A9485]" />
                  )}
                  <span>메뉴별 판매 · 재고 상세표</span>
                  {!hasPlan('pro') && (
                    <span className="px-2 py-0.5 rounded-full bg-[#E8ECE4] text-[#555E52] text-[10px] font-bold">
                      프로 (월 5.9만 원) 이상
                    </span>
                  )}
                </span>
                <span className="text-xs text-[#687064] tabular-nums">
                  스탬프 {stampCount}회 · 가격 제보 {priceReports.length}건 · 취소
                  요청 {analytics.cancelRequestCount}건
                </span>
              </div>
              {hasPlan('pro') ? (
                showMenuTable ? (
                  <ChevronUp className="w-4 h-4 text-[#687064] shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#687064] shrink-0" />
                )
              ) : (
                onSelectOwnerSaasPlan && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectOwnerSaasPlan('pro');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectOwnerSaasPlan('pro');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    프로로 전환해 보기 →
                  </span>
                )
              )}
            </button>

            {hasPlan('pro') && showMenuTable && (
              <div className="px-6 pb-6 pt-2 border-t border-[#E8ECE4] overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-[#E8ECE4] text-[#687064]">
                      <th className="py-2.5 pr-3 font-semibold">메뉴</th>
                      <th className="py-2.5 px-3 font-semibold">매장</th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        판매량
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        매출액
                      </th>
                      <th className="py-2.5 px-3 font-semibold text-right">
                        재고
                      </th>
                      <th className="py-2.5 pl-3 font-semibold text-right">
                        관리
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8ECE4]">
                    {analytics.topMenus.map(
                      ({ menu, storeName, servings, revenue }) => {
                        const out = menu.isSoldOut || menu.stock <= 0;
                        const low = !out && menu.stock <= 3;
                        return (
                          <tr key={menu.id} className="hover:bg-[#F7F8F5]">
                            <td className="py-3 pr-3 font-semibold text-[#1A1D1A]">
                              {menu.name}
                            </td>
                            <td className="py-3 px-3 text-[#687064] whitespace-nowrap">
                              {storeName}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-[#1A1D1A]">
                              {servings}인
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-[#1A1D1A]">
                              {formatWon(revenue)}
                            </td>
                            <td
                              className={`py-3 px-3 text-right font-mono tabular-nums font-semibold ${
                                out
                                  ? 'text-red-700'
                                  : low
                                    ? 'text-[#687064]'
                                    : 'text-[#4E6E2A]'
                              }`}
                            >
                              {out ? '품절' : `${menu.stock}개`}
                            </td>
                            <td className="py-3 pl-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onToggleMenuClosingSale(menu.id, 30)}
                                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg cursor-pointer border ${
                                    (menu.closingDiscountPercent ?? 0) > 0
                                      ? 'bg-amber-600 border-amber-600 text-white'
                                      : 'bg-[#FFFBEF] border-[#E8D595] text-amber-900 hover:bg-amber-100'
                                  }`}
                                >
                                  {(menu.closingDiscountPercent ?? 0) > 0
                                    ? `마감 -${menu.closingDiscountPercent}% ON`
                                    : '마감 30%'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onAdjustMenuStock(menu.id, 5)}
                                  className="px-2.5 py-1 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#4E6E2A] text-xs font-semibold rounded-lg cursor-pointer"
                                >
                                  +5 입고
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* 3. Store & Menu Operations Tab */}
      {ownerSection === 'ops' && (
        <div className="space-y-6">
          <div className="p-4 bg-[#FFFBEF] border border-[#E8D595] rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-amber-900">
              🔥 현재 마감 30% 특가 진행 중{' '}
              <strong className="font-mono text-sm">
                {menus.filter((m) => (m.closingDiscountPercent ?? 0) > 0).length}개
              </strong>{' '}
              메뉴
            </span>
            <span className="text-amber-800">
              아래 각 매장 메뉴에서 1탭으로 마감 특가를 바로 켜거나 끌 수 있습니다.
            </span>
          </div>

          <section className="os-card rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-[#4E6E2A]" />
                <h2 className="text-base font-bold text-[#1A1D1A]">
                  신규 메뉴 등록
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={ocrFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleMenuImageUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => ocrFileInputRef.current?.click()}
                  disabled={isOcrScanning}
                  className="min-h-[36px] px-3.5 py-1.5 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:opacity-60 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  {isOcrScanning ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isOcrScanning ? '메뉴판 자동 인식 중...' : '종이 메뉴판 사진 인식'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const count = onBulkAddMenusFromSample(
                      newMenuStoreId,
                      PAPER_MENU_OCR_SAMPLE
                    );
                    setMenuAddNotice(`추천 메뉴 ${count}종이 일괄 등록되었습니다.`);
                  }}
                  className="min-h-[36px] px-3.5 py-1.5 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#4E6E2A] text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <ScanText className="w-3.5 h-3.5" />
                  <span>샘플 일괄 등록</span>
                </button>
              </div>
            </div>

            {(ocrImagePreview || ocrError || ocrCandidates.length > 0) && (
              <div className="p-4 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {ocrImagePreview && (
                      <img
                        src={ocrImagePreview}
                        alt="업로드된 메뉴판"
                        className="w-16 h-16 object-cover rounded-xl border border-[#E8ECE4] shrink-0"
                      />
                    )}
                    <div>
                      <p className="text-xs font-bold text-[#1A1D1A] inline-flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-[#4E6E2A]" />
                        <span>Baro 분석 종이 메뉴판 추출 결과</span>
                      </p>
                      <p className="text-[11px] text-[#687064] mt-0.5">
                        인식된 메뉴를 확인하고 선택 항목을 한 번에 등록하세요.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOcrImagePreview(null);
                      setOcrCandidates([]);
                      setOcrError(null);
                    }}
                    className="text-xs font-semibold text-[#687064] hover:text-[#1A1D1A] cursor-pointer"
                  >
                    닫기
                  </button>
                </div>

                {ocrError && (
                  <div className="p-3 bg-[#FFFBEF] border border-[#E8D595] rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
                    <span>{ocrError}</span>
                  </div>
                )}

                {ocrCandidates.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ocrCandidates.map((item, idx) => (
                        <label
                          key={`${item.name}-${idx}`}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer text-xs ${
                            item.selected
                              ? 'bg-white border-[#82B440]'
                              : 'bg-white/60 border-[#E8ECE4] opacity-70'
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() =>
                                setOcrCandidates((prev) =>
                                  prev.map((c, i) =>
                                    i === idx ? { ...c, selected: !c.selected } : c
                                  )
                                )
                              }
                              className="w-4 h-4 accent-[#4E6E2A]"
                            />
                            <span className="font-semibold text-[#1A1D1A] truncate">
                              {item.name}
                            </span>
                          </span>
                          <span className="font-mono font-bold text-[#4E6E2A] shrink-0">
                            {formatWon(item.price)}
                          </span>
                        </label>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const selected = ocrCandidates.filter((c) => c.selected);
                        if (selected.length === 0) return;
                        const lines = selected.map(
                          (c) => `${c.name} ${c.price}원 ${c.tags.join(' ')}`
                        );
                        const added = onBulkAddMenusFromSample(
                          newMenuStoreId,
                          lines
                        );
                        setMenuAddNotice(
                          `메뉴판 사진에서 추출한 ${added}개 메뉴를 등록했습니다.`
                        );
                        setOcrCandidates([]);
                        setOcrImagePreview(null);
                      }}
                      className="min-h-[38px] px-4 py-1.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      선택 메뉴 ({ocrCandidates.filter((c) => c.selected).length}개) 일괄 등록
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5">
              <select
                value={newMenuStoreId}
                onChange={(e) => setNewMenuStoreId(e.target.value)}
                className="min-h-[44px] px-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-xl text-sm text-[#1A1D1A]"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={newMenuLine}
                onChange={(e) => setNewMenuLine(e.target.value)}
                placeholder="예: 차돌 된장찌개 10000원 얼큰한 국물 한식"
                className="flex-1 min-h-[44px] px-3.5 border border-[#E8ECE4] rounded-xl text-sm text-[#1A1D1A]"
              />
              <button
                type="button"
                onClick={() => {
                  const res = onAddMenuFromLine(newMenuStoreId, newMenuLine);
                  setMenuAddNotice(res.message);
                }}
                className="min-h-[44px] px-5 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-sm font-semibold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
              >
                등록
              </button>
            </div>

            {menuAddNotice && (
              <p className="text-xs font-semibold text-[#4E6E2A]">
                {menuAddNotice}
              </p>
            )}
          </section>

          {(() => {
            const opsQ = opsStoreQuery.trim().toLowerCase();
            const matchedStores = stores.filter((st) => {
              if (!opsQ) return true;
              const hay = `${st.name} ${st.category} ${st.areaLabel}`.toLowerCase();
              return hay.includes(opsQ);
            });
            const visibleStores =
              opsQ || showAllOpsStores
                ? matchedStores
                : matchedStores.slice(0, 12);

            return (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-[#687064] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={opsStoreQuery}
                      onChange={(e) => setOpsStoreQuery(e.target.value)}
                      placeholder="매장명·지역·업종 검색 (예: 소복한닭, 산격동, 국밥)"
                      className="w-full min-h-[42px] pl-10 pr-3.5 bg-white border border-[#E8ECE4] rounded-xl text-sm text-[#1A1D1A]"
                    />
                  </div>
                  {!opsQ && matchedStores.length > 12 && (
                    <button
                      type="button"
                      onClick={() => setShowAllOpsStores((prev) => !prev)}
                      className="min-h-[42px] px-4 py-2 bg-white hover:bg-[#EAF1E2] border border-[#E8ECE4] text-xs font-bold text-[#3D5720] rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {showAllOpsStores
                        ? '주요 12곳만 보기'
                        : `전체 매장 보기 (${matchedStores.length}곳)`}
                    </button>
                  )}
                </div>

                {visibleStores.length === 0 ? (
                  <div className="os-card rounded-3xl p-8 text-center text-xs text-[#687064]">
                    검색 조건에 맞는 매장이 없습니다.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {visibleStores.map((store) => {
                      const storeMenus = menus.filter(
                        (m) => m.storeId === store.id && m.pricePerPerson > 0
                      );
                      const activeKitchenCount = orders.filter(
                        (o) =>
                          o.storeId === store.id &&
                          (o.status === OrderStatus.ACCEPTED ||
                            o.status === OrderStatus.COOKING)
                      ).length;
                      const recommendedExtraMins = activeKitchenCount * 5;

              return (
                <div
                  key={store.id}
                  className="os-card rounded-3xl p-5 space-y-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <StoreIcon className="w-4 h-4 text-[#4E6E2A] shrink-0" />
                        <h3 className="text-sm font-bold text-[#1A1D1A] truncate">
                          {store.name}
                        </h3>
                      </div>
                      <p className="text-xs text-[#687064] mt-0.5 tabular-nums">
                        {store.category} · 기본 배달비 {formatWon(store.deliveryFee)}{' '}
                        {store.deliveryFeeTiers &&
                        store.deliveryFeeTiers.length > 0
                          ? `· 상생 구간 ${store.deliveryFeeTiers.length}개`
                          : ''}{' '}
                        · 조리대기 {activeKitchenCount}건
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={store.isOpen}
                      onClick={() => onToggleStoreOpen(store.id)}
                      className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        store.isOpen
                          ? 'bg-[#EAF1E2] border-[#D4E1C5] text-[#4E6E2A]'
                          : 'bg-red-50 border-red-300 text-red-700'
                      }`}
                    >
                      {store.isOpen ? '영업 중' : '영업 중단'}
                    </button>
                  </div>

                  <div className="px-3.5 py-2.5 bg-[#F7F8F5] rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[#687064]">
                      추가 조리시간{' '}
                      <strong className="font-mono tabular-nums text-[#1A1D1A]">
                        +{store.extraPrepMinutes}분
                      </strong>
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onSetStoreExtraPrep(store.id, recommendedExtraMins)
                        }
                        className="min-h-[30px] px-2.5 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#4E6E2A] rounded-lg font-semibold cursor-pointer"
                      >
                        자동 (+{recommendedExtraMins}분)
                      </button>
                      <button
                        type="button"
                        onClick={() => onAdjustStoreExtraPrep(store.id, -5)}
                        className="min-w-[32px] min-h-[30px] px-2 bg-white border border-[#E8ECE4] rounded-lg font-medium cursor-pointer"
                      >
                        -5분
                      </button>
                      <button
                        type="button"
                        onClick={() => onAdjustStoreExtraPrep(store.id, 5)}
                        className="min-w-[32px] min-h-[30px] px-2 bg-white border border-[#E8ECE4] rounded-lg font-medium cursor-pointer"
                      >
                        +5분
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-[#E8ECE4] pt-3 space-y-2.5">
                    {storeMenus.map((menu) => {
                      const effectiveSoldOut =
                        menu.isSoldOut || menu.stock <= 0;
                      const isEditingThis = editingMenuId === menu.id;
                      return (
                        <div
                          key={menu.id}
                          className="space-y-2 text-xs py-2 border-b border-[#F0F3EC] last:border-b-0"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p
                                className={`font-semibold truncate ${
                                  effectiveSoldOut
                                    ? 'text-[#919A8D] line-through'
                                    : 'text-[#1A1D1A]'
                                }`}
                              >
                                {menu.name}
                              </p>
                              <p className="text-[11px] text-[#687064] font-mono tabular-nums mt-0.5">
                                {formatWon(menu.pricePerPerson)} · 재고{' '}
                                {menu.stock}개
                              </p>
                            </div>

                            {(onUpdateMenu || onDeleteMenu) && (
                              <div className="flex items-center gap-1 shrink-0">
                                {onUpdateMenu && (
                                  <button
                                    type="button"
                                    aria-label={`${menu.name} 수정`}
                                    onClick={() => {
                                      if (isEditingThis) {
                                        setEditingMenuId(null);
                                      } else {
                                        setEditingMenuId(menu.id);
                                        setEditMenuName(menu.name);
                                        setEditMenuPrice(
                                          String(menu.pricePerPerson)
                                        );
                                      }
                                    }}
                                    className="easy-compact min-h-[32px] px-2.5 border border-[#E8ECE4] rounded-lg bg-white hover:bg-[#EAF1E2] text-[#434B40] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                                  >
                                    <Pencil className="w-3 h-3 shrink-0" />
                                    <span>수정</span>
                                  </button>
                                )}
                                {onDeleteMenu && (
                                  <button
                                    type="button"
                                    aria-label={`${menu.name} 삭제`}
                                    onClick={() => onDeleteMenu(menu.id)}
                                    className="easy-compact min-w-[32px] min-h-[32px] p-1.5 border border-[#E8ECE4] rounded-lg bg-white hover:bg-red-50 text-[#687064] hover:text-red-700 inline-flex items-center justify-center shrink-0 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="inline-flex rounded-lg border border-[#E8D595] bg-[#FFFBEF] p-0.5">
                              {[0, 10, 20, 30].map((pct) => {
                                const currentPct =
                                  menu.closingDiscountPercent ?? 0;
                                const active = currentPct === pct;
                                return (
                                  <button
                                    key={pct}
                                    type="button"
                                    onClick={() => {
                                      if (onSetMenuDiscountPercent) {
                                        onSetMenuDiscountPercent(menu.id, pct);
                                      } else if (pct === 0 && currentPct > 0) {
                                        onToggleMenuClosingSale(
                                          menu.id,
                                          currentPct
                                        );
                                      } else if (pct > 0) {
                                        onToggleMenuClosingSale(menu.id, pct);
                                      }
                                    }}
                                    className={`easy-compact min-h-[30px] px-2 py-1 text-[11px] font-bold rounded-md cursor-pointer whitespace-nowrap ${
                                      active
                                        ? pct === 0
                                          ? 'bg-white text-[#1A1D1A] shadow-2xs'
                                          : 'bg-amber-600 text-white'
                                        : 'text-amber-900 hover:bg-amber-100'
                                    }`}
                                  >
                                    {pct === 0 ? '정가' : `-${pct}%`}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => onAdjustMenuStock(menu.id, -1)}
                                aria-label={`${menu.name} 재고 감소`}
                                className="easy-compact min-w-[32px] min-h-[32px] border border-[#E8ECE4] rounded-lg bg-[#F7F8F5] hover:bg-[#EAF1E2] font-semibold cursor-pointer"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                onClick={() => onAdjustMenuStock(menu.id, 1)}
                                aria-label={`${menu.name} 재고 증가`}
                                className="easy-compact min-w-[32px] min-h-[32px] border border-[#E8ECE4] rounded-lg bg-[#F7F8F5] hover:bg-[#EAF1E2] font-semibold cursor-pointer"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={!menu.isSoldOut}
                                onClick={() => onToggleMenuSoldOut(menu.id)}
                                className={`easy-compact min-h-[32px] px-2.5 py-1 rounded-lg font-semibold border whitespace-nowrap cursor-pointer ${
                                  menu.isSoldOut
                                    ? 'bg-red-50 border-red-200 text-red-700'
                                    : 'bg-[#EAF1E2] border-[#D4E1C5] text-[#4E6E2A]'
                                }`}
                              >
                                {menu.isSoldOut ? '품절' : '판매 중'}
                              </button>
                            </div>
                          </div>

                          {isEditingThis && onUpdateMenu && (
                            <div className="p-2.5 rounded-xl bg-[#F7F8F5] border border-[#D4E1C5] flex flex-wrap items-center gap-2">
                              <input
                                type="text"
                                value={editMenuName}
                                onChange={(e) => setEditMenuName(e.target.value)}
                                placeholder="메뉴명"
                                className="flex-1 min-w-[120px] min-h-[34px] px-2.5 bg-white border border-[#E8ECE4] rounded-lg text-xs"
                              />
                              <input
                                type="number"
                                min={500}
                                step={500}
                                value={editMenuPrice}
                                onChange={(e) =>
                                  setEditMenuPrice(e.target.value)
                                }
                                placeholder="가격(원)"
                                className="w-24 min-h-[34px] px-2.5 bg-white border border-[#E8ECE4] rounded-lg font-mono text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const parsedPrice = parseInt(
                                    editMenuPrice,
                                    10
                                  );
                                  if (!editMenuName.trim() || !parsedPrice) {
                                    return;
                                  }
                                  onUpdateMenu(menu.id, {
                                    name: editMenuName.trim(),
                                    pricePerPerson: parsedPrice,
                                  });
                                  setEditingMenuId(null);
                                }}
                                className="min-h-[34px] px-3 py-1 rounded-lg bg-[#4E6E2A] text-white font-bold cursor-pointer"
                              >
                                저장
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingMenuId(null)}
                                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white border border-[#E8ECE4] text-[#687064] font-semibold cursor-pointer"
                              >
                                취소
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* 4. CS Evidence, Reviews & Price Reports Tab */}
      {ownerSection === 'crm' && (
        <div className="space-y-6">
          {/* 3-Party CS & Photo Evidence Vault */}
          <section className="os-card rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#1A1D1A] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#4E6E2A]" />
                  <span>CS 처리 · 3자 사진 증적 대조함</span>
                </h2>
                <p className="text-xs text-[#687064] mt-0.5">
                  점주 배달 전 포장 사진, 라이더 배송 사진, 고객 클레임 사진 및 10초 자동 중재 결과를 한곳에서 확인합니다.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EAF1E2] text-[#3D5720] text-xs font-bold">
                CS·증적{' '}
                {
                  orders.filter(
                    (o) =>
                      o.evidenceRecord ||
                      (o.cancelRequested &&
                        o.status !== OrderStatus.CANCELLED &&
                        o.status !== OrderStatus.COMPLETED) ||
                      (o.ownerPackagingPhotos?.length ?? 0) > 0 ||
                      (o.riderDeliveryPhotos?.length ?? 0) > 0
                  ).length
                }
                건
              </span>
            </div>

            {(() => {
              const csTargetOrders = orders.filter(
                (o) =>
                  o.evidenceRecord ||
                  (o.cancelRequested &&
                    o.status !== OrderStatus.CANCELLED &&
                    o.status !== OrderStatus.COMPLETED) ||
                  (o.ownerPackagingPhotos?.length ?? 0) > 0 ||
                  (o.riderDeliveryPhotos?.length ?? 0) > 0
              );

              if (csTargetOrders.length === 0) {
                return (
                  <div className="p-5 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] text-xs text-[#687064] space-y-1">
                    <p className="font-semibold text-[#1A1D1A]">
                      아직 접수된 CS 클레임이나 등록된 3자 증적 사진이 없습니다.
                    </p>
                    <p>
                      ‘주문 처리’ 탭에서 배달 전 포장 사진을 올리거나, 라이더/고객이 사진을 제출하면 이곳에서 3자 대조가 가능합니다.
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {csTargetOrders.map((ord) => {
                    const ownerPhotos = ord.ownerPackagingPhotos ?? [];
                    const riderPhotos = ord.riderDeliveryPhotos ?? [];
                    const customerPhotos =
                      ord.evidenceRecord?.evidencePhotos ?? [];

                    return (
                      <div
                        key={ord.id}
                        className="p-4 rounded-2xl bg-[#F7F8F5] border border-[#DCE7CF] space-y-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-mono font-bold text-[#1A1D1A]">
                              {ord.orderCode}
                            </span>
                            <span className="text-[#687064] mx-1.5">·</span>
                            <span className="font-bold text-[#1A1D1A]">
                              {ord.storeName} · {ord.menuName} ({ord.servings}인)
                            </span>
                            <span className="text-[#687064] ml-2">
                              {formatWon(ord.totalAmount)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {ord.evidenceRecord?.aiVerdict && (
                              <span className="px-2.5 py-0.5 rounded-full bg-[#3D5720] text-white text-[11px] font-bold inline-flex items-center gap-1">
                                <ClipboardCheck className="w-3 h-3" />
                                {ord.evidenceRecord.aiVerdict.faultLabel}
                              </span>
                            )}
                            {ord.cancelRequested &&
                              ord.status !== OrderStatus.CANCELLED &&
                              ord.status !== OrderStatus.COMPLETED && (
                                <>
                                  <span className="px-2.5 py-0.5 rounded-full bg-amber-600 text-white text-[11px] font-bold">
                                    조리 후 취소 요청
                                  </span>
                                  {onResolveCancelRequest && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onResolveCancelRequest(
                                            ord.id,
                                            'approve'
                                          )
                                        }
                                        className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold cursor-pointer"
                                      >
                                        취소 승인
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onResolveCancelRequest(
                                            ord.id,
                                            'reject'
                                          )
                                        }
                                        className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-white border border-[#D4E1C5] text-[#3D5720] text-[11px] font-bold cursor-pointer"
                                      >
                                        반려
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                          </div>
                        </div>

                        {/* 3-Party Photo Comparison Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                          {/* 1. Owner Packaging Photos */}
                          <div className="p-3 rounded-xl bg-white border border-[#E8ECE4] space-y-2">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-[#3D5720]">
                                📦 점주 포장 사진 ({ownerPhotos.length})
                              </span>
                              {onAttachOwnerPhotos && (
                                <label className="text-[11px] font-bold text-[#4E6E2A] hover:underline cursor-pointer">
                                  + 추가
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    disabled={ownerPhotos.length >= 3}
                                    onChange={async (e) => {
                                      const added =
                                        await readCompressedEvidencePhotos(
                                          e,
                                          ownerPhotos.length,
                                          3
                                        );
                                      if (added.length > 0) {
                                        onAttachOwnerPhotos(
                                          ord.id,
                                          [...ownerPhotos, ...added].slice(0, 3)
                                        );
                                      }
                                    }}
                                    className="hidden"
                                  />
                                </label>
                              )}
                            </div>
                            {ownerPhotos.length === 0 ? (
                              <p className="text-[11px] text-[#919A8D]">
                                등록된 포장 사진 없음
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {ownerPhotos.map((p, i) => (
                                  <button
                                    key={`${p.name}-${i}`}
                                    type="button"
                                    onClick={() => setCsLightboxPhoto(p)}
                                    className="cursor-pointer"
                                  >
                                    <img
                                      src={p.dataUrl}
                                      alt={p.name}
                                      className="w-16 h-16 rounded-lg object-cover border border-[#D4E1C5]"
                                    />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 2. Rider / Partner Delivery Photos */}
                          <div className="p-3 rounded-xl bg-white border border-[#E8ECE4] space-y-2">
                            <div className="font-bold text-[#1A1D1A]">
                              🛵 라이더 배송 사진 ({riderPhotos.length})
                            </div>
                            {riderPhotos.length === 0 ? (
                              <p className="text-[11px] text-[#919A8D]">
                                {ord.riderName
                                  ? `${ord.riderName} 배차됨 · 사진 대기`
                                  : '등록된 배송 사진 없음'}
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {riderPhotos.map((p, i) => (
                                  <button
                                    key={`${p.name}-${i}`}
                                    type="button"
                                    onClick={() => setCsLightboxPhoto(p)}
                                    className="cursor-pointer"
                                  >
                                    <img
                                      src={p.dataUrl}
                                      alt={p.name}
                                      className="w-16 h-16 rounded-lg object-cover border border-[#D4E1C5]"
                                    />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 3. Customer Claim Photos */}
                          <div className="p-3 rounded-xl bg-white border border-[#E8ECE4] space-y-2">
                            <div className="font-bold text-[#1A1D1A]">
                              🙋 고객 클레임 사진 ({customerPhotos.length})
                            </div>
                            {customerPhotos.length === 0 ? (
                              <p className="text-[11px] text-[#919A8D]">
                                {ord.evidenceRecord
                                  ? `메모: ${ord.evidenceRecord.customerMemoNote}`
                                  : '접수된 고객 사진 없음'}
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="flex flex-wrap gap-1.5">
                                  {customerPhotos.map((p, i) => (
                                    <button
                                      key={`${p.name}-${i}`}
                                      type="button"
                                      onClick={() => setCsLightboxPhoto(p)}
                                      className="cursor-pointer"
                                    >
                                      <img
                                        src={p.dataUrl}
                                        alt={p.name}
                                        className="w-16 h-16 rounded-lg object-cover border border-[#D4E1C5]"
                                      />
                                    </button>
                                  ))}
                                </div>
                                {ord.evidenceRecord?.customerMemoNote && (
                                  <p className="text-[11px] text-[#555E52]">
                                    “{ord.evidenceRecord.customerMemoNote}”
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Mediation Verdict & Settlement Breakdown */}
                        {ord.evidenceRecord?.aiVerdict && (
                          <div className="p-3 rounded-xl bg-white border border-[#D4E1C5] space-y-1.5">
                            <p className="font-semibold text-[#1A1D1A]">
                              {ord.evidenceRecord.aiVerdict.summary}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                              <div>
                                <span className="font-bold text-[#4E6E2A]">
                                  점주 정산:
                                </span>{' '}
                                {ord.evidenceRecord.aiVerdict.ownerAction}
                              </div>
                              <div>
                                <span className="font-bold text-[#4E6E2A]">
                                  고객 보상:
                                </span>{' '}
                                {ord.evidenceRecord.aiVerdict.customerAction}
                              </div>
                              <div>
                                <span className="font-bold text-[#4E6E2A]">
                                  파트너 조치:
                                </span>{' '}
                                {ord.evidenceRecord.aiVerdict.courierAction}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>

          <section className="os-card rounded-3xl p-6 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[#1A1D1A]">
                가격 차이 제보 ({priceReports.length}건)
              </h2>
              <span className="text-xs font-semibold text-[#4E6E2A] flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5" />
                단골 스탬프 {stampCount}회 적립
              </span>
            </div>
            {priceReports.length === 0 ? (
              <p className="text-xs text-[#687064]">
                접수된 가격 차이 제보가 없습니다.
              </p>
            ) : (
              <div className="divide-y divide-[#E8ECE4]">
                {priceReports.map((rep) => (
                  <div
                    key={rep.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-[#1A1D1A]">
                        {rep.storeName} · {rep.menuName}
                      </span>
                      <span className="text-[#687064] ml-2">
                        앱 {formatWon(rep.appPrice)} / 매장{' '}
                        {formatWon(rep.storePrice)}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-[#687064]">
                      {rep.reportedAt}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="os-card rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <h2 className="text-base font-bold text-[#1A1D1A] flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#4E6E2A]" />
                <span>고객 리뷰 · 답글 관리 ({reviews.length}건)</span>
              </h2>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={crmReviewQuery}
                  onChange={(e) => setCrmReviewQuery(e.target.value)}
                  placeholder="매장·메뉴·리뷰 검색"
                  className="min-h-[38px] px-3 bg-[#F7F8F5] border border-[#E8ECE4] rounded-xl text-xs text-[#1A1D1A]"
                />
                {!crmReviewQuery.trim() && reviews.length > 20 && (
                  <button
                    type="button"
                    onClick={() => setShowAllCrmReviews((prev) => !prev)}
                    className="text-xs font-bold text-[#4E6E2A] whitespace-nowrap cursor-pointer"
                  >
                    {showAllCrmReviews ? '최근 20건만' : '전체 보기'}
                  </button>
                )}
              </div>
            </div>

            <div className="divide-y divide-[#E8ECE4]">
              {(() => {
                const rq = crmReviewQuery.trim().toLowerCase();
                const filteredReviews = reviews.filter((rev) => {
                  if (!rq) return true;
                  const m = menus.find((item) => item.id === rev.menuId);
                  const st = m ? ownerStoreMap.get(m.storeId) : undefined;
                  const hay = `${st?.name ?? ''} ${m?.name ?? ''} ${rev.author} ${rev.content}`.toLowerCase();
                  return hay.includes(rq);
                });
                const visibleReviews =
                  rq || showAllCrmReviews
                    ? filteredReviews
                    : filteredReviews.slice(0, 20);
                return visibleReviews.map((rev) => {
                  const menu = menus.find((m) => m.id === rev.menuId);
                  const stName = menu
                    ? ownerStoreMap.get(menu.storeId)?.name
                    : undefined;
                  const existingReply = reviewReplies[rev.id];
                  const draftVal =
                    replyDrafts[rev.id] ?? existingReply?.text ?? '';
                  const isFlagged = Boolean(existingReply?.flaggedForReview);

                  return (
                    <div
                      key={rev.id}
                      className="py-4 first:pt-1 last:pb-1 space-y-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-[#1A1D1A]">
                          {stName ? `${stName} · ` : ''}
                          {menu?.name ?? rev.menuId} · {rev.author}
                          {rev.isComplaint && (
                            <span className="text-[#687064] ml-1.5">
                              · 개선 요청
                            </span>
                          )}
                          {isFlagged && (
                            <span className="text-[#4E6E2A] ml-1.5">
                              · 확인 요청됨
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono tabular-nums text-[#687064]">
                            <span className="text-[#82B440]">★</span>{' '}
                            {rev.rating} · {rev.date}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onToggleReviewFlag(rev.id, '사실확인 검토 요청')
                            }
                            className={`min-h-[30px] px-2.5 py-0.5 rounded-lg border font-medium flex items-center gap-1 cursor-pointer ${
                              isFlagged
                                ? 'bg-[#EAF1E2] border-[#82B440] text-[#3D5720]'
                                : 'bg-white border-[#E8ECE4] text-[#687064]'
                            }`}
                          >
                            <Flag className="w-3 h-3" />
                            <span>{isFlagged ? '요청됨' : '확인 요청'}</span>
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-[#1A1D1A] leading-relaxed">
                        {rev.content}
                      </p>

                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <input
                          type="text"
                          value={draftVal}
                          onChange={(e) =>
                            setReplyDrafts((prev) => ({
                              ...prev,
                              [rev.id]: e.target.value,
                            }))
                          }
                          placeholder="고객에게 남길 답글을 입력하세요"
                          className="flex-1 min-h-[38px] px-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-xl text-xs text-[#1A1D1A]"
                        />
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const template = rev.isComplaint
                                ? '이용에 불편을 드려 죄송합니다. 남겨주신 의견은 조리와 포장에 즉시 반영하겠습니다.'
                                : '소중한 후기 감사합니다! 다음 주문에서도 정성껏 준비하겠습니다.';
                              setReplyDrafts((prev) => ({
                                ...prev,
                                [rev.id]: template,
                              }));
                            }}
                            className="min-h-[38px] px-3 py-1 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#4E6E2A] font-semibold rounded-xl cursor-pointer"
                          >
                            초안
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!draftVal.trim()) return;
                              onSaveReviewReply(rev.id, draftVal.trim());
                              setSavedReplyId(rev.id);
                              window.setTimeout(
                                () => setSavedReplyId(null),
                                2000
                              );
                            }}
                            className="min-h-[38px] px-3.5 py-1 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white font-semibold rounded-xl cursor-pointer"
                          >
                            {savedReplyId === rev.id ? '저장됨' : '등록'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </section>
        </div>
      )}

      <B2BStatementModal
        order={statementOrder}
        onClose={() => setStatementOrder(null)}
      />

      {csLightboxPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="증적 사진 확대 보기"
          onClick={() => setCsLightboxPhoto(null)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-lg w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-[#E8ECE4]"
          >
            <div className="px-4 py-3 border-b border-[#E8ECE4] flex items-center justify-between text-xs font-bold text-[#1A1D1A]">
              <span className="truncate">{csLightboxPhoto.name}</span>
              <button
                type="button"
                onClick={() => setCsLightboxPhoto(null)}
                aria-label="사진 닫기"
                className="p-1 text-[#687064] hover:text-[#1A1D1A] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={csLightboxPhoto.dataUrl}
              alt={csLightboxPhoto.name}
              className="w-full max-h-[75vh] object-contain bg-[#F7F8F5]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
