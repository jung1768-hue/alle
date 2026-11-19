import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flag,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  PackageCheck,
  PlusCircle,
  QrCode,
  ScanText,
  Sparkles,
  Store as StoreIcon,
  TrendingUp,
} from 'lucide-react';
import {
  INITIAL_OWNER_PROFIT_COMPARISON,
  PAPER_MENU_OCR_SAMPLE,
} from '../data/seedData';
import {
  DispatchMode,
  MenuItem,
  Order,
  OrderStatus,
  PriceReport,
  Review,
  ReviewReply,
  Store,
} from '../types/alle';
import { formatWon } from '../utils/parser';
import {
  ExtractedMenuCandidate,
  extractMenusFromImageWithAI,
  hasGeminiApiKey,
  parseOwnerVoiceCommandWithAI,
} from '../utils/gemini';
import { startKoreanVoiceInput } from '../utils/voice';

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
  onToggleStoreOpen: (storeId: string) => void;
  onAdjustStoreExtraPrep: (storeId: string, delta: number) => void;
  onSetStoreExtraPrep: (storeId: string, minutes: number) => void;
  onToggleMenuSoldOut: (menuId: string) => void;
  onAdjustMenuStock: (menuId: string, delta: number) => void;
  onAddMenuFromLine: (
    storeId: string,
    rawLine: string
  ) => {
    ok: boolean;
    message: string;
  };
  onBulkAddMenusFromSample: (storeId: string, lines: string[]) => number;
  onSaveReviewReply: (reviewId: string, replyText: string) => void;
  onToggleReviewFlag: (reviewId: string, reason: string) => void;
  onSwitchToConsumer: () => void;
  onOpenAiSettings?: () => void;
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
  onToggleStoreOpen,
  onAdjustStoreExtraPrep,
  onSetStoreExtraPrep,
  onToggleMenuSoldOut,
  onAdjustMenuStock,
  onAddMenuFromLine,
  onBulkAddMenusFromSample,
  onSaveReviewReply,
  onToggleReviewFlag,
  onSwitchToConsumer,
  onOpenAiSettings,
}: OwnerDashboardViewProps) {
  const [ownerSection, setOwnerSection] = useState<
    'orders' | 'dashboard' | 'ops' | 'crm'
  >('orders');
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
    '대구식 차돌 된장찌개 10000원 얼큰한 국물 한식'
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
      (o) => o.cancelRequested && o.status !== OrderStatus.CANCELLED
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
      const prev = menuStatsMap.get(o.menuId) ?? {
        servings: 0,
        revenue: 0,
        ordersCount: 0,
      };
      menuStatsMap.set(o.menuId, {
        servings: prev.servings + o.servings,
        revenue: prev.revenue + o.totalAmount,
        ordersCount: prev.ordersCount + 1,
      });

      const menuObj = menus.find((m) => m.id === o.menuId);
      if (menuObj) {
        for (const tag of menuObj.tags) {
          tagDemandMap.set(tag, (tagDemandMap.get(tag) ?? 0) + o.servings);
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
        if (targetMenu.isSoldOut) {
          onToggleMenuSoldOut(targetMenu.id);
        }
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
            '매장명을 함께 입력해 주세요. 예: "수성 범어 소고기국밥 영업 중단"'
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
    if (cmd.includes('품절')) {
      executeAction('sold_out');
      return;
    }
    if (cmd.includes('영업 중단') || cmd.includes('영업 재개')) {
      executeAction('toggle_store');
      return;
    }

    if (hasGeminiApiKey()) {
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

      if (!hasGeminiApiKey()) {
        setOcrError(
          '실제 메뉴판 사진 인식은 Gemini AI 키가 필요합니다. 상단 AI 설정에서 키를 입력하거나 "샘플 일괄 등록"을 이용해 주세요.'
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
            Alle 파트너 · 점주 OS
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1A1D1A] tracking-tight mt-0.5">
            점주 수익 · 운영 센터
          </h1>
        </div>
        <button
          type="button"
          onClick={onSwitchToConsumer}
          className="min-h-[40px] px-4 py-2 bg-white hover:bg-[#F7F8F5] border border-[#E8ECE4] text-[#1A1D1A] text-xs sm:text-sm font-semibold rounded-xl whitespace-nowrap shrink-0 cursor-pointer transition-colors"
        >
          고객 화면 보기
        </button>
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
              <span>{analytics.profitComparison.periodLabel} · 대구 입점 매장 기준</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#1A1D1A] tracking-tight text-balance">
              광고비 부담은 없애고, AI 단골 매칭으로 순증 매출을 만들었습니다
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
              타사 수수료 14.8% → <strong className="text-[#1A1D1A]">Alle 0%</strong> · 상단 광고비 0원
            </p>
          </div>

          <div className="bg-[#EAF1E2] border border-[#DCE7CF] rounded-2xl p-5 sm:p-6 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-bold text-[#3D5720]">
                AI 매칭 순증 매출
              </p>
              <span className="w-2 h-2 rounded-full bg-[#82B440] shrink-0" aria-hidden="true" />
            </div>
            <div className="os-kpi text-4xl sm:text-[44px] font-bold text-[#4E6E2A] leading-none">
              +{formatWon(analytics.profitComparison.totalAiRegularIncrementalSales)}
            </div>
            <p className="text-xs text-[#4C6235] tabular-nums pt-1">
              AI 단골 자동 매칭{' '}
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
              <p className="text-[#687064]">노출 입찰 없는 AI 컨디션 매칭</p>
            </div>
            <div className="space-y-1">
              <span className="text-[#687064]">지자체 보조금 의존도</span>
              <div className="font-mono tabular-nums text-base font-bold text-[#4E6E2A]">
                {analytics.profitComparison.subsidyDependencyRatioPercent}%
              </div>
              <p className="text-[#687064]">B2B 식대 · 단골 패스 자생 순환</p>
            </div>
          </div>
        )}
      </section>

      {/* Clean Segmented Navigation Tabs */}
      <div
        role="tablist"
        aria-label="점주 관리 탭"
        className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1.5 bg-white border border-[#E8ECE4] rounded-2xl shadow-sm"
      >
        <button
          type="button"
          role="tab"
          aria-selected={ownerSection === 'orders'}
          onClick={() => setOwnerSection('orders')}
          className={`min-h-[42px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
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
          aria-selected={ownerSection === 'dashboard'}
          onClick={() => setOwnerSection('dashboard')}
          className={`min-h-[42px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
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
          aria-selected={ownerSection === 'ops'}
          onClick={() => setOwnerSection('ops')}
          className={`min-h-[42px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
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
          aria-selected={ownerSection === 'crm'}
          onClick={() => setOwnerSection('crm')}
          className={`min-h-[42px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer ${
            ownerSection === 'crm'
              ? 'bg-[#EAF1E2] text-[#3D5720]'
              : 'text-[#687064] hover:text-[#1A1D1A] hover:bg-[#F7F8F5]'
          }`}
        >
          리뷰 · 제보
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
                  const chosenDispatch =
                    dispatchChoiceByOrder[order.id] ?? DispatchMode.NEIGHBOR_WALK;

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
                          {order.reservationSlot && (
                            <p className="text-xs font-semibold text-[#4E6E2A]">
                              예약 도착: {order.reservationSlot}
                            </p>
                          )}
                          {order.selectedOptionNames.length > 0 && (
                            <p className="text-xs text-[#687064]">
                              옵션: {order.selectedOptionNames.join(', ')}
                            </p>
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
                        order.status !== OrderStatus.CANCELLED && (
                          <div className="p-3.5 bg-[#EAF1E2] border border-[#DCE7CF] rounded-2xl space-y-1 text-xs">
                            <div className="flex items-center gap-1.5 font-semibold text-[#3D5720]">
                              <AlertCircle className="w-4 h-4 text-[#4E6E2A] shrink-0" />
                              <span>
                                조리 후 취소 요청 ({order.cancelRequestedAt})
                              </span>
                            </div>
                            <p className="text-[#1A1D1A]">
                              사유: {order.cancelRequestReason}
                            </p>
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

      {/* 2. Analytics & Statistics Tab */}
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
                유효 {analytics.totalCount}건 · 수수료 0원
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

          {/* Store Revenue & Pipeline Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <section className="lg:col-span-7 os-card rounded-3xl p-6 space-y-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-[#1A1D1A] flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-[#4E6E2A]" />
                  <span>매장별 매출 · 수수료 절감</span>
                </h2>
                <span className="text-xs text-[#687064]">취소 제외</span>
              </div>

              <div className="space-y-4">
                {analytics.byStore.map(({ store, count, revenue }) => {
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
                            <span className="text-red-700 ml-1.5">(영업중단)</span>
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
                            <strong className="font-mono text-[#4E6E2A]">
                              +{formatWon(storeProfit.savedCommissionAndAdFee)}
                            </strong>
                          </span>
                          <span>
                            AI 단골 순증{' '}
                            <strong className="font-mono text-[#1A1D1A]">
                              +{formatWon(storeProfit.aiRegularIncrementalSales)}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                <h3 className="text-sm font-bold text-[#1A1D1A]">
                  인기 취향 수요
                </h3>
                {analytics.tagDemand.length === 0 ? (
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
              onClick={() => setShowMenuTable((prev) => !prev)}
              aria-expanded={showMenuTable}
              className="w-full min-h-[58px] px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#F7F8F5] transition-colors cursor-pointer"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-base font-bold text-[#1A1D1A] flex items-center gap-2">
                  <PackageCheck className="w-4 h-4 text-[#4E6E2A]" />
                  <span>메뉴별 판매 · 재고 상세표</span>
                </span>
                <span className="text-xs text-[#687064] tabular-nums">
                  스탬프 {stampCount}회 · 가격 제보 {priceReports.length}건 · 취소
                  요청 {analytics.cancelRequestCount}건
                </span>
              </div>
              {showMenuTable ? (
                <ChevronUp className="w-4 h-4 text-[#687064] shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#687064] shrink-0" />
              )}
            </button>

            {showMenuTable && (
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
                              <button
                                type="button"
                                onClick={() => onAdjustMenuStock(menu.id, 5)}
                                className="px-2.5 py-1 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#4E6E2A] text-xs font-semibold rounded-lg cursor-pointer"
                              >
                                +5 입고
                              </button>
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
                    {isOcrScanning ? 'AI 메뉴판 인식 중...' : '종이 메뉴판 사진 인식'}
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
                        <span>Gemini Vision 종이 메뉴판 추출 결과</span>
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
                    {onOpenAiSettings && (
                      <button
                        type="button"
                        onClick={onOpenAiSettings}
                        className="px-3 py-1 bg-[#4E6E2A] text-white font-semibold rounded-lg cursor-pointer"
                      >
                        AI 키 설정
                      </button>
                    )}
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stores.map((store) => {
              const storeMenus = menus.filter((m) => m.storeId === store.id);
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
                        {store.category} · 배달비 {formatWon(store.deliveryFee)}{' '}
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
                      return (
                        <div
                          key={menu.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs py-1"
                        >
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
                            <p className="text-[11px] text-[#687064] font-mono tabular-nums">
                              {formatWon(menu.pricePerPerson)} · 재고{' '}
                              {menu.stock}개
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onAdjustMenuStock(menu.id, -1)}
                              aria-label={`${menu.name} 재고 감소`}
                              className="min-w-[32px] min-h-[32px] border border-[#E8ECE4] rounded-lg bg-[#F7F8F5] hover:bg-[#EAF1E2] font-semibold cursor-pointer"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => onAdjustMenuStock(menu.id, 1)}
                              aria-label={`${menu.name} 재고 증가`}
                              className="min-w-[32px] min-h-[32px] border border-[#E8ECE4] rounded-lg bg-[#F7F8F5] hover:bg-[#EAF1E2] font-semibold cursor-pointer"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={!menu.isSoldOut}
                              onClick={() => onToggleMenuSoldOut(menu.id)}
                              className={`min-h-[32px] px-2.5 py-1 rounded-lg font-semibold border cursor-pointer ${
                                menu.isSoldOut
                                  ? 'bg-red-50 border-red-200 text-red-700'
                                  : 'bg-[#EAF1E2] border-[#D4E1C5] text-[#4E6E2A]'
                              }`}
                            >
                              {menu.isSoldOut ? '품절' : '판매 중'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Reviews & Price Reports Tab */}
      {ownerSection === 'crm' && (
        <div className="space-y-6">
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
            <h2 className="text-base font-bold text-[#1A1D1A] flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#4E6E2A]" />
              <span>고객 리뷰 · 답글 관리</span>
            </h2>

            <div className="divide-y divide-[#E8ECE4]">
              {reviews.map((rev) => {
                const menu = menus.find((m) => m.id === rev.menuId);
                const existingReply = reviewReplies[rev.id];
                const draftVal = replyDrafts[rev.id] ?? existingReply?.text ?? '';
                const isFlagged = Boolean(existingReply?.flaggedForReview);

                return (
                  <div key={rev.id} className="py-4 first:pt-1 last:pb-1 space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[#1A1D1A]">
                        {menu?.name ?? rev.menuId} · {rev.author}
                        {rev.isComplaint && (
                          <span className="text-[#687064] ml-1.5">· 개선 요청</span>
                        )}
                        {isFlagged && (
                          <span className="text-[#4E6E2A] ml-1.5">· 확인 요청됨</span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-[#687064]">
                          <span className="text-[#82B440]">★</span> {rev.rating} · {rev.date}
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
                            window.setTimeout(() => setSavedReplyId(null), 2000);
                          }}
                          className="min-h-[38px] px-3.5 py-1 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white font-semibold rounded-xl cursor-pointer"
                        >
                          {savedReplyId === rev.id ? '저장됨' : '등록'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
