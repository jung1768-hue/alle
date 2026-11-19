import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Flag,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  PackageCheck,
  PlusCircle,
  QrCode,
  ScanText,
  Store as StoreIcon,
  TrendingUp,
} from 'lucide-react';
import { PAPER_MENU_OCR_SAMPLE } from '../data/seedData';
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
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: '접수 대기',
  [OrderStatus.ACCEPTED]: '수락됨 (조리 전)',
  [OrderStatus.COOKING]: '조리 중',
  [OrderStatus.PICKUP]: '픽업/배달 중',
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
}: OwnerDashboardViewProps) {
  const [ownerSection, setOwnerSection] = useState<
    'orders' | 'dashboard' | 'ops' | 'crm'
  >('orders');
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'done'>('all');
  const [dispatchChoiceByOrder, setDispatchChoiceByOrder] = useState<
    Record<string, DispatchMode>
  >({});

  const [commandInput, setCommandInput] = useState('');
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null);
  const [isKitchenListening, setIsKitchenListening] = useState(false);
  const stopKitchenVoiceRef = useRef<(() => void) | null>(null);

  const [newMenuStoreId, setNewMenuStoreId] = useState(stores[0]?.id ?? 's1');
  const [newMenuLine, setNewMenuLine] = useState(
    '차돌 된장찌개 10000원 얼큰한 국물 한식'
  );
  const [menuAddNotice, setMenuAddNotice] = useState<string | null>(null);

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

  // Live Admin Analytics Data
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
      .slice(0, 6);
    const maxTagQty = Math.max(1, ...tagDemand.map(([, q]) => q));

    const avgRating =
      reviews.length > 0
        ? (
            reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          ).toFixed(1)
        : '-';

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
    };
  }, [orders, stores, menus, reviews]);

  const runOwnerCommand = (cmdRaw: string) => {
    const cmd = cmdRaw.trim();
    if (!cmd) return;

    if (cmd.includes('수락')) {
      const pendingOrder = orders.find((o) => o.status === OrderStatus.PENDING);
      if (!pendingOrder) {
        setCommandFeedback('접수 대기 중인 주문이 없습니다.');
        return;
      }
      onAdvanceOrderStatus(pendingOrder.id, OrderStatus.ACCEPTED);
      setCommandFeedback(
        `${pendingOrder.orderCode} (${pendingOrder.menuName}) 주문을 수락했습니다.`
      );
      setCommandInput('');
      return;
    }

    if (cmd.includes('조리 시작') || cmd.includes('조리시작')) {
      const acceptedOrder = orders.find((o) => o.status === OrderStatus.ACCEPTED);
      if (!acceptedOrder) {
        setCommandFeedback('수락된 주문이 없습니다.');
        return;
      }
      onAdvanceOrderStatus(acceptedOrder.id, OrderStatus.COOKING);
      setCommandFeedback(`${acceptedOrder.orderCode} 조리를 시작했습니다.`);
      setCommandInput('');
      return;
    }

    if (cmd.includes('픽업') || cmd.includes('라이더')) {
      const cookingOrder = orders.find((o) => o.status === OrderStatus.COOKING);
      if (!cookingOrder) {
        setCommandFeedback('조리 중인 주문이 없습니다.');
        return;
      }
      const mode = cmd.includes('대행사') || cmd.includes('라이더')
        ? DispatchMode.AGENCY_RIDER
        : DispatchMode.NEIGHBOR_WALK;
      onAdvanceOrderStatus(cookingOrder.id, OrderStatus.PICKUP, mode);
      setCommandFeedback(
        `${cookingOrder.orderCode} (${
          mode === DispatchMode.AGENCY_RIDER ? '전문 라이더' : '이웃 도보'
        }) 픽업 처리했습니다.`
      );
      setCommandInput('');
      return;
    }

    if (cmd.includes('완료')) {
      const pickupOrder = orders.find((o) => o.status === OrderStatus.PICKUP);
      if (!pickupOrder) {
        setCommandFeedback('픽업 상태의 주문만 완료 처리할 수 있습니다.');
        return;
      }
      onAdvanceOrderStatus(pickupOrder.id, OrderStatus.COMPLETED);
      setCommandFeedback(`${pickupOrder.orderCode} 주문을 완료 처리했습니다.`);
      setCommandInput('');
      return;
    }

    if (cmd.includes('품절')) {
      const targetMenu = menus.find((m) => cmd.includes(m.name));
      if (!targetMenu) {
        setCommandFeedback(
          '메뉴명을 함께 말씀해 주세요. 예: "얼큰 소고기 해장국 품절"'
        );
        return;
      }
      if (!targetMenu.isSoldOut) {
        onToggleMenuSoldOut(targetMenu.id);
      }
      setCommandFeedback(`"${targetMenu.name}"을 품절 처리했습니다.`);
      setCommandInput('');
      return;
    }

    if (cmd.includes('영업 중단') || cmd.includes('영업 재개')) {
      const targetStore = stores.find((s) => cmd.includes(s.name));
      if (!targetStore) {
        setCommandFeedback(
          '매장명을 함께 입력해 주세요. 예: "종로 해장국집 영업 중단"'
        );
        return;
      }
      onToggleStoreOpen(targetStore.id);
      setCommandFeedback(`"${targetStore.name}" 영업 상태를 변경했습니다.`);
      setCommandInput('');
      return;
    }

    setCommandFeedback(
      '지원 명령: "주문 수락", "조리 시작", "픽업 처리", "완료 처리", "[메뉴명] 품절"'
    );
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
    <div className="space-y-6">
      {/* Clean Admin / Owner Header */}
      <div className="bg-[#141812] text-white rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">점주 · 관리자 센터</h1>
          <p className="text-xs sm:text-sm text-[#CBDCC0] mt-1">
            실시간 주문 접수, 매장 운영 및 매출 데이터를 한 화면에서 관리하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={onSwitchToConsumer}
          className="min-h-[42px] px-4 py-2 bg-[#E7EFE1] text-[#141812] hover:bg-white text-xs sm:text-sm font-bold rounded-2xl whitespace-nowrap shrink-0 cursor-pointer"
        >
          고객 화면 보기
        </button>
      </div>

      {/* Admin Section Switcher (4 Tabs including Data Dashboard) */}
      <div
        role="tablist"
        aria-label="관리자 메뉴"
        className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-[#E9ECE4] border border-[#DDE3D7] rounded-2xl"
      >
        <button
          type="button"
          role="tab"
          aria-selected={ownerSection === 'orders'}
          onClick={() => setOwnerSection('orders')}
          className={`min-h-[42px] px-2 py-1.5 text-xs sm:text-sm font-bold rounded-xl transition-colors cursor-pointer ${
            ownerSection === 'orders'
              ? 'bg-white text-[#2E531A] shadow-2xs'
              : 'text-[#374033] hover:text-[#141812]'
          }`}
        >
          주문 관리 ({pendingCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ownerSection === 'dashboard'}
          onClick={() => setOwnerSection('dashboard')}
          className={`min-h-[42px] px-2 py-1.5 text-xs sm:text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
            ownerSection === 'dashboard'
              ? 'bg-white text-[#2E531A] shadow-2xs'
              : 'text-[#374033] hover:text-[#141812]'
          }`}
        >
          <BarChart3 className="w-4 h-4 shrink-0" />
          <span>데이터 대시보드</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ownerSection === 'ops'}
          onClick={() => setOwnerSection('ops')}
          className={`min-h-[42px] px-2 py-1.5 text-xs sm:text-sm font-bold rounded-xl transition-colors cursor-pointer ${
            ownerSection === 'ops'
              ? 'bg-white text-[#2E531A] shadow-2xs'
              : 'text-[#374033] hover:text-[#141812]'
          }`}
        >
          매장 · 메뉴 운영
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={ownerSection === 'crm'}
          onClick={() => setOwnerSection('crm')}
          className={`min-h-[42px] px-2 py-1.5 text-xs sm:text-sm font-bold rounded-xl transition-colors cursor-pointer ${
            ownerSection === 'crm'
              ? 'bg-white text-[#2E531A] shadow-2xs'
              : 'text-[#374033] hover:text-[#141812]'
          }`}
        >
          리뷰 · 제보
        </button>
      </div>

      {/* 1. Order Queue Tab */}
      {ownerSection === 'orders' && (
        <div className="space-y-5">
          {/* Kitchen Hands-Free Voice Command Bar */}
          <section className="bg-[#E9F1E2] border border-[#C5D8B5] rounded-3xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-[#2E531A]" />
                <h2 className="text-sm font-bold text-[#141812]">
                  주방 빠른 명령
                </h2>
              </div>
              <button
                type="button"
                onClick={handleKitchenVoice}
                className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer ${
                  isKitchenListening
                    ? 'bg-red-600 text-white'
                    : 'bg-white border border-[#C5D8B5] text-[#2E531A]'
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
                    <span>음성 명령</span>
                  </>
                )}
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                runOwnerCommand(commandInput);
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder='예: "주문 수락", "조리 시작", "얼큰 소고기 해장국 품절"'
                className="flex-1 min-h-[42px] px-3.5 bg-white border border-[#C5D8B5] rounded-xl text-sm text-[#141812]"
              />
              <button
                type="submit"
                className="min-h-[42px] px-4 py-2 bg-[#2E531A] hover:bg-[#234113] text-white text-xs sm:text-sm font-semibold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
              >
                실행
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5">
              {[
                '주문 수락',
                '조리 시작',
                '대행사 라이더 호출',
                '완료 처리',
                '얼큰 소고기 해장국 품절',
              ].map((presetCmd) => (
                <button
                  key={presetCmd}
                  type="button"
                  onClick={() => runOwnerCommand(presetCmd)}
                  className="min-h-[32px] px-3 py-1 bg-white border border-[#C5D8B5] hover:bg-[#F4F6F1] text-xs font-semibold text-[#1F3A11] rounded-xl cursor-pointer"
                >
                  {presetCmd}
                </button>
              ))}
            </div>

            {commandFeedback && (
              <p className="text-xs font-bold text-[#2E531A]">
                {commandFeedback}
              </p>
            )}
          </section>

          {/* Order Queue */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[#141812]">
                주문 현황{' '}
                <span className="text-sm font-medium text-[#4A5246] tabular-nums">
                  · 대기 {pendingCount} · 진행 {activeCount}
                </span>
              </h2>
              <div className="flex items-center gap-1 p-1 bg-[#E9ECE4] border border-[#DDE3D7] rounded-2xl">
                {(
                  [
                    { id: 'all', label: '전체' },
                    { id: 'active', label: '진행 중' },
                    { id: 'done', label: '완료/취소' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterTab(tab.id)}
                    className={`min-h-[34px] px-3 py-1 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                      filterTab === tab.id
                        ? 'bg-white text-[#2E531A] shadow-2xs'
                        : 'text-[#374033] hover:text-[#141812]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="bg-white border border-[#DDE3D7] rounded-3xl p-8 text-center text-sm text-[#4A5246]">
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
                      className="bg-white border border-[#DDE3D7] rounded-3xl p-4 sm:p-5 space-y-4 shadow-[0_2px_10px_rgba(20,24,18,0.03)]"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#4A5246]">
                            <span className="font-mono font-bold text-[#141812]">
                              {order.orderCode}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {order.customerAlias} / {order.addressAlias}
                            </span>
                            {order.isB2B && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-bold text-[#2E531A]">
                                  B2B 단체
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {order.createdAt}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-[#141812] mt-1">
                            {order.storeName} · {order.menuName} ×{' '}
                            <span className="tabular-nums">{order.servings}인</span>
                          </h3>
                          {order.reservationSlot && (
                            <p className="text-xs font-semibold text-[#2E531A] mt-0.5">
                              예약 도착: {order.reservationSlot}
                            </p>
                          )}
                          {order.selectedOptionNames.length > 0 && (
                            <p className="text-xs text-[#374033] mt-0.5">
                              옵션: {order.selectedOptionNames.join(', ')}
                            </p>
                          )}
                          {order.customerNote && (
                            <p className="text-xs text-[#4A5246] mt-0.5">
                              요청사항: {order.customerNote}
                            </p>
                          )}
                        </div>

                        <div className="sm:text-right shrink-0">
                          <div className="text-base font-bold font-mono tabular-nums text-[#141812]">
                            {formatWon(order.totalAmount)}
                          </div>
                          <div className="text-xs font-bold mt-0.5 text-[#2E531A]">
                            {STATUS_LABELS[order.status]}
                            {order.mockRefunded && ' · 환불 완료'}
                          </div>
                        </div>
                      </div>

                      {order.cancelRequested &&
                        order.status !== OrderStatus.CANCELLED && (
                          <div className="p-3.5 bg-[#FFFBEF] border border-[#E8D595] rounded-2xl space-y-1 text-xs">
                            <div className="flex items-center gap-1.5 font-bold text-amber-900">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>
                                조리 후 취소 요청 ({order.cancelRequestedAt})
                              </span>
                            </div>
                            <p className="text-[#141812]">
                              사유: {order.cancelRequestReason}
                            </p>
                          </div>
                        )}

                      <div className="pt-3 border-t border-[#EBEFEB] space-y-2.5">
                        {order.status === OrderStatus.COOKING && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-[#374033]">
                              배차 선택:
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
                                  ? 'bg-[#E7EFE1] border-[#6FA33A] text-[#1F3A11]'
                                  : 'bg-white border-[#DDE3D7] text-[#374033]'
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
                                  ? 'bg-[#E7EFE1] border-[#6FA33A] text-[#1F3A11]'
                                  : 'bg-white border-[#DDE3D7] text-[#374033]'
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
                                  className="min-h-[42px] px-4 py-2 bg-[#2E531A] hover:bg-[#234113] text-white text-xs sm:text-sm font-semibold rounded-xl cursor-pointer"
                                >
                                  주문 수락
                                </button>
                                <button
                                  type="button"
                                  disabled
                                  title="수락 전에는 완료할 수 없습니다"
                                  className="min-h-[42px] px-3 py-2 bg-[#F4F6F1] text-[#8E968A] text-xs rounded-xl flex items-center gap-1 cursor-not-allowed"
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
                                className="min-h-[42px] px-4 py-2 bg-[#2E531A] hover:bg-[#234113] text-white text-xs sm:text-sm font-semibold rounded-xl cursor-pointer"
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
                                className="min-h-[42px] px-4 py-2 bg-[#2E531A] hover:bg-[#234113] text-white text-xs sm:text-sm font-semibold rounded-xl cursor-pointer"
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
                                className="min-h-[42px] px-4 py-2 bg-[#141812] hover:bg-[#232B1F] text-white text-xs sm:text-sm font-semibold rounded-xl cursor-pointer"
                              >
                                배달 완료
                              </button>
                            )}

                            {order.status === OrderStatus.COMPLETED && (
                              <span className="text-xs font-bold text-[#2E531A] flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" />
                                처리 완료
                              </span>
                            )}

                            {order.status === OrderStatus.CANCELLED && (
                              <span className="text-xs font-medium text-[#374033]">
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
                              className="min-h-[42px] px-3.5 py-2 border border-red-300 bg-white hover:bg-red-50 text-red-700 text-xs font-semibold rounded-xl cursor-pointer"
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

      {/* 2. Admin Data Dashboard Tab (NEW) */}
      {ownerSection === 'dashboard' && (
        <div className="space-y-6">
          {/* 4-Column KPI Strip */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-[#DDE3D7] rounded-2xl p-4">
              <div className="text-xs font-semibold text-[#4A5246]">
                누적 유효 매출
              </div>
              <div className="text-xl sm:text-2xl font-bold text-[#141812] font-mono tabular-nums mt-1">
                {formatWon(analytics.totalRevenue)}
              </div>
              <div className="text-xs font-semibold text-[#2E531A] mt-1 tabular-nums">
                유효 주문 {analytics.totalCount}건 · 수수료 0원
              </div>
            </div>

            <div className="bg-white border border-[#DDE3D7] rounded-2xl p-4">
              <div className="text-xs font-semibold text-[#4A5246]">
                평균 객단가 (AOV)
              </div>
              <div className="text-xl sm:text-2xl font-bold text-[#141812] font-mono tabular-nums mt-1">
                {formatWon(analytics.avgOrderValue)}
              </div>
              <div className="text-xs text-[#4A5246] mt-1 tabular-nums">
                B2B 단체 {analytics.b2bCount}건 ({formatWon(analytics.b2bRevenue)})
              </div>
            </div>

            <div className="bg-white border border-[#DDE3D7] rounded-2xl p-4">
              <div className="text-xs font-semibold text-[#4A5246]">
                주문 완료율
              </div>
              <div className="text-xl sm:text-2xl font-bold text-[#2E531A] font-mono tabular-nums mt-1">
                {analytics.completionRate}%
              </div>
              <div className="text-xs text-[#4A5246] mt-1 tabular-nums">
                완료 {analytics.completedCount} · 진행 {activeCount} · 취소{' '}
                {analytics.cancelledCount}
              </div>
            </div>

            <div className="bg-white border border-[#DDE3D7] rounded-2xl p-4">
              <div className="text-xs font-semibold text-[#4A5246]">
                운영 · 재고 알림
              </div>
              <div className="text-xl sm:text-2xl font-bold text-[#141812] font-mono tabular-nums mt-1">
                {analytics.lowOrOutMenus.length}건
              </div>
              <div className="text-xs text-[#4A5246] mt-1 tabular-nums">
                영업 중 {analytics.openStoresCount}/{stores.length}곳 · 평점{' '}
                {analytics.avgRating}
              </div>
            </div>
          </section>

          {/* Store Revenue Comparison & Order Pipeline */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Store Revenue Bar Chart */}
            <section className="lg:col-span-7 bg-white border border-[#DDE3D7] rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#141812] flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-[#2E531A]" />
                  <span>매장별 매출 현황</span>
                </h2>
                <span className="text-xs text-[#4A5246]">취소 제외 집계</span>
              </div>

              <div className="space-y-3">
                {analytics.byStore.map(({ store, count, revenue }) => {
                  const pct = Math.round(
                    (revenue / analytics.maxStoreRevenue) * 100
                  );
                  return (
                    <div key={store.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#141812] truncate">
                          {store.name}
                          {!store.isOpen && (
                            <span className="text-red-700 ml-1.5">(영업중단)</span>
                          )}
                        </span>
                        <span className="font-mono tabular-nums font-bold text-[#141812] shrink-0">
                          {formatWon(revenue)} · {count}건
                        </span>
                      </div>
                      <div className="h-2.5 bg-[#EFF2EC] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#2E531A] rounded-full transition-all"
                          style={{ width: `${Math.max(revenue > 0 ? 6 : 0, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Pipeline Breakdown & Demand Tags */}
            <section className="lg:col-span-5 bg-white border border-[#DDE3D7] rounded-3xl p-5 space-y-5">
              <div className="space-y-3">
                <h2 className="text-base font-bold text-[#141812]">
                  주문 단계별 분포
                </h2>
                <div className="grid grid-cols-3 gap-2">
                  {analytics.statusPipeline.map((st) => (
                    <div
                      key={st.status}
                      className="p-2.5 bg-[#F4F6F1] border border-[#E6EBE1] rounded-xl"
                    >
                      <div className="text-[11px] font-semibold text-[#4A5246] truncate">
                        {st.label}
                      </div>
                      <div className="text-base font-bold font-mono tabular-nums text-[#141812] mt-0.5">
                        {st.count}건
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-[#EBEFEB] space-y-2.5">
                <h3 className="text-sm font-bold text-[#141812]">
                  인기 맛·카테고리 수요
                </h3>
                {analytics.tagDemand.length === 0 ? (
                  <p className="text-xs text-[#4A5246]">주문 데이터가 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {analytics.tagDemand.map(([tag, qty]) => {
                      const pct = Math.round((qty / analytics.maxTagQty) * 100);
                      return (
                        <div key={tag} className="flex items-center gap-2 text-xs">
                          <span className="w-16 font-semibold text-[#374033] shrink-0">
                            {tag}
                          </span>
                          <div className="flex-1 h-2 bg-[#EFF2EC] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#6FA33A] rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-10 text-right font-mono tabular-nums font-bold text-[#141812]">
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

          {/* Menu Performance & Stock Health Table */}
          <section className="bg-white border border-[#DDE3D7] rounded-3xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[#141812] flex items-center gap-1.5">
                <PackageCheck className="w-4 h-4 text-[#2E531A]" />
                <span>메뉴별 판매 · 재고 현황</span>
              </h2>
              <div className="flex items-center gap-3 text-xs text-[#4A5246] tabular-nums">
                <span>스탬프 적립 {stampCount}회</span>
                <span>·</span>
                <span>가격 제보 {priceReports.length}건</span>
                <span>·</span>
                <span>취소 요청 {analytics.cancelRequestCount}건</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[#E6EBE1] text-[#4A5246]">
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
                      빠른 관리
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBEFEB]">
                  {analytics.topMenus.map(
                    ({ menu, storeName, servings, revenue }) => {
                      const out = menu.isSoldOut || menu.stock <= 0;
                      const low = !out && menu.stock <= 3;
                      return (
                        <tr key={menu.id} className="hover:bg-[#F4F6F1]/70">
                          <td className="py-2.5 pr-3 font-bold text-[#141812]">
                            {menu.name}
                          </td>
                          <td className="py-2.5 px-3 text-[#4A5246] whitespace-nowrap">
                            {storeName}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#141812]">
                            {servings}인
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[#141812]">
                            {formatWon(revenue)}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold ${
                              out
                                ? 'text-red-700'
                                : low
                                  ? 'text-amber-800'
                                  : 'text-[#2E531A]'
                            }`}
                          >
                            {out ? '품절' : `${menu.stock}개`}
                          </td>
                          <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onAdjustMenuStock(menu.id, 5)}
                              className="px-2.5 py-1 bg-[#E7EFE1] hover:bg-[#D8E7CE] text-[#1F3A11] text-xs font-bold rounded-lg cursor-pointer"
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
          </section>
        </div>
      )}

      {/* 3. Store & Menu Operations Tab */}
      {ownerSection === 'ops' && (
        <div className="space-y-6">
          <section className="bg-white border border-[#DDE3D7] rounded-3xl p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-[#2E531A]" />
                <h2 className="text-base font-bold text-[#141812]">
                  신규 메뉴 등록
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  const count = onBulkAddMenusFromSample(
                    newMenuStoreId,
                    PAPER_MENU_OCR_SAMPLE
                  );
                  setMenuAddNotice(`추천 메뉴 ${count}종이 일괄 등록되었습니다.`);
                }}
                className="min-h-[36px] px-3 py-1 bg-[#E7EFE1] hover:bg-[#D8E7CE] text-[#1F3A11] text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <ScanText className="w-3.5 h-3.5" />
                <span>메뉴판 일괄 등록</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <select
                value={newMenuStoreId}
                onChange={(e) => setNewMenuStoreId(e.target.value)}
                className="min-h-[44px] px-3 bg-[#F4F6F1] border border-[#CBDCC0] rounded-xl text-sm text-[#141812]"
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
                className="flex-1 min-h-[44px] px-3.5 border border-[#CBDCC0] rounded-xl text-sm text-[#141812]"
              />
              <button
                type="button"
                onClick={() => {
                  const res = onAddMenuFromLine(newMenuStoreId, newMenuLine);
                  setMenuAddNotice(res.message);
                }}
                className="min-h-[44px] px-5 py-2 bg-[#2E531A] hover:bg-[#234113] text-white text-sm font-semibold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
              >
                등록
              </button>
            </div>

            {menuAddNotice && (
              <p className="text-xs font-bold text-[#2E531A]">{menuAddNotice}</p>
            )}
          </section>

          {/* Store Availability & Menu Stock */}
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
                  className="bg-white border border-[#DDE3D7] rounded-3xl p-4 sm:p-5 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <StoreIcon className="w-4 h-4 text-[#2E531A] shrink-0" />
                        <h3 className="text-sm font-bold text-[#141812] truncate">
                          {store.name}
                        </h3>
                      </div>
                      <p className="text-xs text-[#4A5246] mt-0.5 tabular-nums">
                        {store.category} · 배달비 {formatWon(store.deliveryFee)}{' '}
                        · 조리대기 {activeKitchenCount}건
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={store.isOpen}
                      onClick={() => onToggleStoreOpen(store.id)}
                      className={`min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        store.isOpen
                          ? 'bg-[#E7EFE1] border-[#6FA33A] text-[#1F3A11]'
                          : 'bg-red-50 border-red-400 text-red-800'
                      }`}
                    >
                      {store.isOpen ? '영업 중' : '영업 중단'}
                    </button>
                  </div>

                  <div className="px-3 py-2 bg-[#F4F6F1] border border-[#DDE3D7] rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[#374033]">
                      추가 조리시간{' '}
                      <strong className="font-mono tabular-nums text-[#141812]">
                        +{store.extraPrepMinutes}분
                      </strong>
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          onSetStoreExtraPrep(store.id, recommendedExtraMins)
                        }
                        className="min-h-[30px] px-2.5 bg-[#E7EFE1] hover:bg-[#D8E7CE] text-[#1F3A11] rounded-lg font-bold cursor-pointer"
                      >
                        자동 (+{recommendedExtraMins}분)
                      </button>
                      <button
                        type="button"
                        onClick={() => onAdjustStoreExtraPrep(store.id, -5)}
                        className="min-w-[32px] min-h-[30px] px-2 bg-white border border-[#CBDCC0] rounded-lg font-semibold cursor-pointer"
                      >
                        -5분
                      </button>
                      <button
                        type="button"
                        onClick={() => onAdjustStoreExtraPrep(store.id, 5)}
                        className="min-w-[32px] min-h-[30px] px-2 bg-white border border-[#CBDCC0] rounded-lg font-semibold cursor-pointer"
                      >
                        +5분
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-[#EBEFEB] pt-2.5 space-y-2.5">
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
                                  ? 'text-[#8E968A] line-through'
                                  : 'text-[#141812]'
                              }`}
                            >
                              {menu.name}
                            </p>
                            <p className="text-[11px] text-[#4A5246] font-mono tabular-nums">
                              {formatWon(menu.pricePerPerson)} · 재고{' '}
                              {menu.stock}개
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onAdjustMenuStock(menu.id, -1)}
                              aria-label={`${menu.name} 재고 감소`}
                              className="min-w-[34px] min-h-[34px] border border-[#CBDCC0] rounded-lg bg-[#F4F6F1] hover:bg-[#E7EFE1] font-semibold cursor-pointer"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => onAdjustMenuStock(menu.id, 1)}
                              aria-label={`${menu.name} 재고 증가`}
                              className="min-w-[34px] min-h-[34px] border border-[#CBDCC0] rounded-lg bg-[#F4F6F1] hover:bg-[#E7EFE1] font-semibold cursor-pointer"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={!menu.isSoldOut}
                              onClick={() => onToggleMenuSoldOut(menu.id)}
                              className={`min-h-[34px] px-2.5 py-1 rounded-lg font-semibold border cursor-pointer ${
                                menu.isSoldOut
                                  ? 'bg-red-50 border-red-300 text-red-700'
                                  : 'bg-[#E7EFE1] border-[#6FA33A] text-[#1F3A11]'
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
          <section className="bg-white border border-[#DDE3D7] rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#141812]">
                가격 차이 제보 ({priceReports.length}건)
              </h2>
              <span className="text-xs font-semibold text-[#2E531A] flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5" />
                단골 스탬프 {stampCount}회 적립됨
              </span>
            </div>
            {priceReports.length === 0 ? (
              <p className="text-xs text-[#4A5246]">
                접수된 가격 차이 제보가 없습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {priceReports.map((rep) => (
                  <div
                    key={rep.id}
                    className="p-3.5 bg-[#FFFBEF] border border-[#E8D595] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#141812]">
                        {rep.storeName} · {rep.menuName}
                      </span>
                      <span className="text-[#374033] ml-2">
                        앱 {formatWon(rep.appPrice)} / 매장{' '}
                        {formatWon(rep.storePrice)}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-[#4A5246]">
                      {rep.reportedAt}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-[#DDE3D7] rounded-3xl p-5 space-y-4">
            <h2 className="text-base font-bold text-[#141812] flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#2E531A]" />
              <span>고객 리뷰 · 답글 관리</span>
            </h2>

            <div className="space-y-3">
              {reviews.map((rev) => {
                const menu = menus.find((m) => m.id === rev.menuId);
                const existingReply = reviewReplies[rev.id];
                const draftVal = replyDrafts[rev.id] ?? existingReply?.text ?? '';
                const isFlagged = Boolean(existingReply?.flaggedForReview);

                return (
                  <div
                    key={rev.id}
                    className={`p-4 rounded-2xl border space-y-2.5 text-xs ${
                      rev.isComplaint
                        ? 'bg-[#FFFBEF] border-[#E8D595]'
                        : 'bg-[#F4F6F1] border-[#DDE3D7]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-[#141812]">
                        {menu?.name ?? rev.menuId} · {rev.author}
                        {rev.isComplaint && ' · 개선 요청'}
                        {isFlagged && ' · 확인 요청됨'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-[#4A5246]">
                          ★ {rev.rating} · {rev.date}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onToggleReviewFlag(rev.id, '사실확인 검토 요청')
                          }
                          className={`min-h-[30px] px-2.5 py-0.5 rounded-lg border font-semibold flex items-center gap-1 cursor-pointer ${
                            isFlagged
                              ? 'bg-amber-100 border-amber-400 text-amber-900'
                              : 'bg-white border-[#CBDCC0] text-[#374033]'
                          }`}
                        >
                          <Flag className="w-3 h-3" />
                          <span>{isFlagged ? '확인 요청됨' : '확인 요청'}</span>
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-[#141812]">{rev.content}</p>

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
                        className="flex-1 min-h-[38px] px-3 bg-white border border-[#CBDCC0] rounded-xl text-xs text-[#141812]"
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
                          className="min-h-[38px] px-3 py-1 bg-[#E7EFE1] hover:bg-[#D8E7CE] text-[#1F3A11] font-semibold rounded-xl cursor-pointer"
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
                          className="min-h-[38px] px-3.5 py-1 bg-[#2E531A] hover:bg-[#234113] text-white font-semibold rounded-xl cursor-pointer"
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
