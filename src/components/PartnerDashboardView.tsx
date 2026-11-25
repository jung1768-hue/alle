import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Bike,
  Camera,
  CheckCircle2,
  Clock,
  Footprints,
  Lock,
  MapPin,
  Receipt,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react';
import {
  DeliveryMethod,
  DispatchMode,
  ErrandRequest,
  ErrandStatus,
  EvidencePhoto,
  Order,
  OrderStatus,
} from '../types/alle';
import { readCompressedEvidencePhotos } from '../utils/imageUpload';
import { formatWon } from '../utils/parser';
import {
  getDeliveryMethodMeta,
  MATCHING_FEE_PER_CASE,
} from '../utils/pricing';
import { BARO_PARTNER_KIT_SRC } from './AlleBrand';
import { LiveDeliveryMapCard } from './LiveDeliveryMapCard';

interface PartnerDashboardViewProps {
  orders: Order[];
  errands: ErrandRequest[];
  onAdvanceOrderStatus: (
    orderId: string,
    nextStatus: OrderStatus,
    dispatchMode?: DispatchMode
  ) => void;
  onAdvanceErrand: (
    errandId: string,
    nextStatus: ErrandStatus,
    actualReceiptCost?: number,
    receiptPhoto?: EvidencePhoto
  ) => void;
  onAttachRiderPhotos?: (orderId: string, photos: EvidencePhoto[]) => void;
  onSwitchToConsumer: () => void;
  onSwitchToOwner: () => void;
}

export function PartnerDashboardView({
  orders,
  errands,
  onAdvanceOrderStatus,
  onAdvanceErrand,
  onAttachRiderPhotos,
  onSwitchToConsumer,
  onSwitchToOwner,
}: PartnerDashboardViewProps) {
  const [trackFilter, setTrackFilter] = useState<'all' | DeliveryMethod>('all');
  const [errandReceiptInputs, setErrandReceiptInputs] = useState<
    Record<string, number>
  >({});
  const [errandReceiptPhotos, setErrandReceiptPhotos] = useState<
    Record<string, EvidencePhoto>
  >({});
  const [errandReceiptErrors, setErrandReceiptErrors] = useState<
    Record<string, string>
  >({});

  const getEffectiveOrderMethod = (order: Order): DeliveryMethod =>
    order.deliveryMethod ??
    (order.sharedDeliveryApplied ? 'auto_bundle' : 'partner_direct');

  const getOrderDeliveryPayout = (order: Order): number =>
    order.deliveryFee > 0 ? order.deliveryFee : 2000;

  const deliveryQueue = useMemo(
    () =>
      orders.filter((o) => {
        if (
          o.status !== OrderStatus.COOKING &&
          o.status !== OrderStatus.PICKUP &&
          o.status !== OrderStatus.ACCEPTED
        ) {
          return false;
        }
        if (trackFilter === 'all') return true;
        return getEffectiveOrderMethod(o) === trackFilter;
      }),
    [orders, trackFilter]
  );

  const cookingBundleOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === OrderStatus.COOKING &&
          getEffectiveOrderMethod(o) === 'auto_bundle'
      ),
    [orders]
  );

  const completedDeliveries = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.COMPLETED),
    [orders]
  );

  const openErrands = useMemo(
    () => errands.filter((e) => e.status === ErrandStatus.OPEN),
    [errands]
  );

  const matchedErrands = useMemo(
    () => errands.filter((e) => e.status === ErrandStatus.MATCHED),
    [errands]
  );

  const awaitingCustomerErrands = useMemo(
    () => errands.filter((e) => e.status === ErrandStatus.RECEIPT_CHECKED),
    [errands]
  );

  const completedErrands = useMemo(
    () => errands.filter((e) => e.status === ErrandStatus.COMPLETED),
    [errands]
  );

  const grossDeliveryReward = completedDeliveries.reduce(
    (sum, o) => sum + getOrderDeliveryPayout(o),
    0
  );
  const netErrandReward = completedErrands.reduce(
    (sum, e) => sum + Math.max(0, e.errandFee - MATCHING_FEE_PER_CASE),
    0
  );
  const deliveryMatchingFees = completedDeliveries.length * MATCHING_FEE_PER_CASE;
  const estimatedMockReward =
    Math.max(0, grossDeliveryReward - deliveryMatchingFees) + netErrandReward;

  return (
    <div className="space-y-6">
      {/* Midnight-Emerald Partner Banner */}
      <div className="bg-gradient-to-br from-[#0D2821] via-[#12382E] to-[#0B221C] text-white rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#1D4A3C]">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#D1F5E5]">
            배달 파트너 센터
          </p>
          <h1 className="text-xl font-bold tracking-tight">
            이웃 도보 · 라이더 배차
          </h1>
          <p className="text-xs sm:text-sm text-[#E6F5EE]">
            조리 중인 주문을 수락해 픽업·배달을 완료하세요.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={onSwitchToConsumer}
            className="min-h-[42px] px-4 py-2 bg-[#EAF6F0] hover:bg-white text-[#0D2821] text-xs sm:text-sm font-bold rounded-xl whitespace-nowrap cursor-pointer"
          >
            고객 홈
          </button>
          <button
            type="button"
            onClick={onSwitchToOwner}
            className="min-h-[42px] px-4 py-2 bg-[#0F6B46] hover:bg-[#0B5638] text-white text-xs sm:text-sm font-bold rounded-xl whitespace-nowrap cursor-pointer"
          >
            점주 · 관리자
          </button>
        </div>
      </div>

      {/* Baro Official Partner Kit Showcase */}
      <div className="bg-[#F1F7F4] border border-[#D5E8DF] rounded-3xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-[1.15fr_1fr] gap-4 items-center">
        <div className="rounded-2xl overflow-hidden bg-[#F1F7F4]">
          <img
            src={BARO_PARTNER_KIT_SRC}
            alt="Baro 공식 파트너 앱, 모자, 보온 배달 가방 킷"
            className="w-full h-44 sm:h-52 object-cover block"
          />
        </div>
        <div className="space-y-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#DCF2E7] text-[#0B4F34] text-xs font-bold">
            Baro 공식 배달 · 심부름 킷
          </span>
          <h2 className="text-base sm:text-lg font-extrabold text-[#111827] tracking-tight">
            바로 모자 · 보온 가방 착용 배송
          </h2>
          <p className="text-xs sm:text-sm text-[#374151] leading-relaxed break-keep">
            일반 음식 배달과 바로 심부름 파트너로 활동할 때 Baro 공식 모자와 야간 반사띠 보온 가방을 착용하고 안전하게 배송합니다.
          </p>
        </div>
      </div>

      {/* Summary KPI Row (Honest Demo Aggregates) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-[#E8ECE4] rounded-2xl p-4">
          <div className="text-xs font-semibold text-[#687064]">배달·픽업 대기</div>
          <div className="text-2xl font-bold text-[#1A1D1A] font-mono tabular-nums mt-1">
            {deliveryQueue.length}건
          </div>
          <div className="text-xs text-[#4E6E2A] font-medium mt-0.5">
            조리 중 / 픽업 이동 주문
          </div>
        </div>
        <div className="bg-white border border-[#E8ECE4] rounded-2xl p-4">
          <div className="text-xs font-semibold text-[#687064]">생활 심부름 콜 · 진행</div>
          <div className="text-2xl font-bold text-[#1A1D1A] font-mono tabular-nums mt-1">
            {openErrands.length + matchedErrands.length}건
          </div>
          <div className="text-xs text-[#687064] mt-0.5">
            수락 대기 {openErrands.length}건 · 영수증 첨부 대기 {matchedErrands.length}건
          </div>
        </div>
        <div className="bg-white border border-[#E8ECE4] rounded-2xl p-4">
          <div className="text-xs font-semibold text-[#687064]">완료 건수 · 실정산 예정</div>
          <div className="text-2xl font-bold text-[#4E6E2A] font-mono tabular-nums mt-1">
            {formatWon(estimatedMockReward)}
          </div>
          <div className="text-xs text-[#687064] tabular-nums mt-0.5">
            배달 {completedDeliveries.length}건 · 심부름 {completedErrands.length}건 · 매칭 수수료 {formatWon(MATCHING_FEE_PER_CASE)}/건 제외
          </div>
        </div>
      </div>

      {/* Geofencing Privacy Safeguard Banner */}
      <div className="bg-[#EAF1E2] border border-[#D4E1C5] rounded-2xl px-4 py-3 flex items-center gap-2.5 text-xs text-[#3D5720] font-medium">
        <ShieldCheck className="w-4 h-4 text-[#4E6E2A] shrink-0" />
        <span>반경 20m 안심 위치 마스킹이 적용되어 출발지 및 거주지 상세 위치는 비공개로 보호됩니다.</span>
      </div>

      {/* Track Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[#1A1D1A]">
          배송 콜 목록
        </h2>
        <div className="inline-flex flex-wrap items-center p-1 bg-[#F0F3EC] border border-[#E8ECE4] rounded-xl gap-1">
          {(
            [
              { id: 'all', label: '전체' },
              { id: 'auto_bundle', label: '📦 자동 묶음 콜' },
              { id: 'single_express', label: '⚡ 한집 빠른배송' },
              { id: 'partner_direct', label: '🚶 동네 파트너(도보)' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTrackFilter(t.id)}
              className={`min-h-[36px] px-3 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                trackFilter === t.id
                  ? 'bg-white text-[#4E6E2A] shadow-2xs'
                  : 'text-[#687064] hover:text-[#1A1D1A]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-Bundle Dispatch Highlight Banner */}
      {cookingBundleOrders.length >= 2 && (
        <div className="p-4 rounded-2xl bg-[#EAF1E2] border-2 border-[#82B440] flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5 text-xs">
            <p className="font-extrabold text-[#3D5720] text-sm">
              📦 자동 묶음배차 그룹 대기 ({cookingBundleOrders.length}건 동선 매칭)
            </p>
            <p className="text-[#4C6235]">
              {cookingBundleOrders.map((o) => `${o.orderCode}(${o.storeName})`).join(' + ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              for (const ord of cookingBundleOrders) {
                onAdvanceOrderStatus(
                  ord.id,
                  OrderStatus.PICKUP,
                  DispatchMode.AGENCY_RIDER
                );
              }
            }}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-extrabold cursor-pointer shrink-0"
          >
            묶음 일괄 픽업 수락 ({cookingBundleOrders.length}건)
          </button>
        </div>
      )}

      {/* Delivery Orders */}
      {deliveryQueue.length === 0 ? (
        <div className="bg-white border border-[#E8ECE4] rounded-3xl p-8 text-center text-sm text-[#687064]">
          현재 수락·조리·픽업 진행 중인 주문이 없습니다. 점주 화면에서 주문을 수락·조리
          시작으로 넘겨보세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {deliveryQueue.map((order) => {
            const isCooking = order.status === OrderStatus.COOKING;
            const isPickup = order.status === OrderStatus.PICKUP;
            const isAcceptedOnly = order.status === OrderStatus.ACCEPTED;
            const basePayout = getOrderDeliveryPayout(order);
            const netPayout = Math.max(0, basePayout - MATCHING_FEE_PER_CASE);

            return (
              <article
                key={order.id}
                className="bg-white border border-[#E8ECE4] rounded-3xl p-5 space-y-4 shadow-[0_2px_10px_rgba(26,29,26,0.03)]"
              >
                {/* Band 1: Top delivery method / tags + current stage pill */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[11px] font-bold">
                      {getDeliveryMethodMeta(getEffectiveOrderMethod(order)).label}
                    </span>
                    {order.isB2B && (
                      <span className="px-2.5 py-0.5 rounded-full bg-[#EEF4FC] text-[#1D4ED8] text-[11px] font-bold">
                        B2B 단체
                      </span>
                    )}
                    {order.reservationSlot && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-bold">
                        예약 {order.reservationSlot}
                      </span>
                    )}
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                      isAcceptedOnly
                        ? 'bg-[#F7F8F5] text-[#555E52] border border-[#E8ECE4]'
                        : isCooking
                          ? 'bg-[#EAF1E2] text-[#3D5720] border border-[#D4E1C5]'
                          : 'bg-[#1A1D1A] text-white'
                    }`}
                  >
                    {isAcceptedOnly
                      ? '점주 조리 시작 대기'
                      : isCooking
                        ? '조리 중 · 픽업 가능'
                        : '픽업 완료 · 이동 중'}
                  </span>
                </div>

                {/* Band 2: Full-width order route, menu, items, customer note & dispatch */}
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-[#687064] leading-relaxed">
                    <span className="font-mono font-bold text-[#1A1D1A]">
                      {order.orderCode}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span>
                      {order.storeName} → {order.addressAlias}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-[#1A1D1A] leading-snug">
                    {order.menuName} ({order.servings}인)
                  </h3>
                  {order.items && order.items.length > 1 && (
                    <p className="text-xs text-[#555E52] leading-relaxed">
                      구성:{' '}
                      {order.items
                        .map((it) => `${it.menuName}×${it.quantity}`)
                        .join(', ')}
                    </p>
                  )}
                  {order.customerNote && (
                    <p className="text-xs font-semibold text-[#3D5720] bg-[#F7F8F5] border border-[#E8ECE4] rounded-xl px-3 py-2 leading-relaxed">
                      요청사항: {order.customerNote}
                    </p>
                  )}
                  <p className="text-xs text-[#555E52] flex items-center gap-1.5 pt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
                    <span>
                      {order.dispatchMode === DispatchMode.AGENCY_RIDER
                        ? `전문 라이더 배차${order.riderName ? ` (${order.riderName})` : ''}`
                        : order.dispatchMode === DispatchMode.NEIGHBOR_WALK
                          ? `이웃 도보 파트너${order.riderName ? ` (${order.riderName})` : ''}`
                          : '배차 대기 (픽업 수락 시 방식 선택)'}
                    </span>
                  </p>
                </div>

                {/* Band 3: Full-width payout summary strip */}
                <div className="px-3.5 py-2.5 rounded-2xl bg-[#F4F8EF] border border-[#DCE7CF] flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-bold text-[#4E6E2A] font-mono tabular-nums">
                    배달료 {formatWon(basePayout)}
                  </span>
                  <span className="text-xs font-bold text-[#3D5720] tabular-nums">
                    매칭 수수료 {formatWon(MATCHING_FEE_PER_CASE)} 제외 · 실수령{' '}
                    {formatWon(netPayout)}
                  </span>
                </div>

                {(isCooking || isPickup) && (
                  <LiveDeliveryMapCard
                    orderCode={order.orderCode}
                    storeName={order.storeName}
                    addressAlias={order.addressAlias}
                    status={order.status}
                    dispatchMode={order.dispatchMode}
                    deliveryStage={order.deliveryStage}
                    riderName={order.riderName}
                    remainingMinutes={order.remainingMinutes}
                  />
                )}

                <div className="pt-3 border-t border-[#E8ECE4] space-y-3">
                  {isAcceptedOnly && (
                    <span className="text-xs font-medium text-[#687064] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                      <span>점주가 ‘조리 시작’을 누른 후 픽업할 수 있습니다.</span>
                    </span>
                  )}

                  {isCooking && (
                    <div className="flex flex-wrap gap-2 w-full">
                      <button
                        type="button"
                        onClick={() =>
                          onAdvanceOrderStatus(
                            order.id,
                            OrderStatus.PICKUP,
                            DispatchMode.NEIGHBOR_WALK
                          )
                        }
                        className="flex-1 min-h-[44px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Footprints className="w-4 h-4" />
                        <span>이웃 도보 픽업 수락</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onAdvanceOrderStatus(
                            order.id,
                            OrderStatus.PICKUP,
                            DispatchMode.AGENCY_RIDER
                          )
                        }
                        className="flex-1 min-h-[44px] px-4 py-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Bike className="w-4 h-4" />
                        <span>전문 라이더 픽업</span>
                      </button>
                    </div>
                  )}

                  {isPickup && (
                    <button
                      type="button"
                      onClick={() =>
                        onAdvanceOrderStatus(order.id, OrderStatus.COMPLETED)
                      }
                      className="w-full min-h-[44px] px-4 py-2 bg-[#1A1D1A] hover:bg-[#252A25] text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#82B440]" />
                      <span>수령지 20m 도달 · 배달 완료 처리</span>
                    </button>
                  )}

                  {onAttachRiderPhotos && (
                    <div className="w-full p-3 rounded-xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-[#3D5720]">
                          라이더 픽업 · 문 앞 배송 사진 ({(order.riderDeliveryPhotos ?? []).length}/3)
                        </span>
                        <label className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] font-bold inline-flex items-center gap-1 cursor-pointer">
                          <Camera className="w-3.5 h-3.5" />
                          <span>배송 사진 올리기</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={(order.riderDeliveryPhotos ?? []).length >= 3}
                            onChange={async (e) => {
                              const existing = order.riderDeliveryPhotos ?? [];
                              const added = await readCompressedEvidencePhotos(
                                e,
                                existing.length,
                                3
                              );
                              if (added.length > 0) {
                                onAttachRiderPhotos(
                                  order.id,
                                  [...existing, ...added].slice(0, 3)
                                );
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {(order.riderDeliveryPhotos ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {(order.riderDeliveryPhotos ?? []).map((photo, idx) => (
                            <div key={`${photo.name}-${idx}`} className="relative">
                              <img
                                src={photo.dataUrl}
                                alt={photo.name}
                                className="w-14 h-14 rounded-lg object-cover border border-[#D4E1C5]"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  onAttachRiderPhotos(
                                    order.id,
                                    (order.riderDeliveryPhotos ?? []).filter(
                                      (_, i) => i !== idx
                                    )
                                  )
                                }
                                aria-label="배송 사진 삭제"
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#1A1D1A] text-white flex items-center justify-center cursor-pointer"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Partner Errand Tasks */}
      <section className="space-y-4 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-[#1A1D1A] flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#4E6E2A]" />
            <span>
              이웃 생활 심부름 요청 · 진행 관리 (대기 {openErrands.length} · 진행 {matchedErrands.length})
            </span>
          </h2>
        </div>

        {openErrands.length === 0 &&
        matchedErrands.length === 0 &&
        awaitingCustomerErrands.length === 0 &&
        completedErrands.length === 0 ? (
          <div className="bg-white border border-[#E8ECE4] rounded-2xl p-6 text-center text-xs text-[#687064]">
            현재 대기 중이거나 진행 중인 생활 심부름 요청이 없습니다.
          </div>
        ) : (
          <div className="space-y-4">
            {/* 1. Open errands awaiting partner acceptance */}
            {openErrands.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[#3D5720]">
                  1. 수락 대기 심부름 ({openErrands.length}건)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {openErrands.map((err) => (
                    <div
                      key={err.id}
                      className="bg-white border border-[#E8ECE4] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs text-[#687064]">
                          {err.category} · {err.pickupAlias} → {err.dropoffAlias}
                        </div>
                        <div className="text-sm font-bold text-[#1A1D1A] truncate mt-0.5">
                          {err.title}
                        </div>
                        <div className="text-xs text-[#687064] font-mono tabular-nums mt-0.5">
                          예상 물품비 {formatWon(err.estimatedItemCost)}
                        </div>
                        <div className="text-xs font-bold text-[#4E6E2A] font-mono tabular-nums mt-0.5">
                          심부름 보수 {formatWon(err.errandFee)} · 매칭 수수료{' '}
                          {formatWon(MATCHING_FEE_PER_CASE)} 제외 실수령{' '}
                          {formatWon(Math.max(0, err.errandFee - MATCHING_FEE_PER_CASE))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAdvanceErrand(err.id, ErrandStatus.MATCHED)}
                        className="min-h-[42px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs font-bold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        심부름 확인 · 수락
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Matched errands requiring partner receipt upload & delivery completion */}
            {matchedErrands.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[#3D5720]">
                  2. 진행 중 심부름 · 배송 완료 후 영수증 첨부 ({matchedErrands.length}건)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {matchedErrands.map((err) => {
                    const receiptVal =
                      errandReceiptInputs[err.id] ??
                      err.actualReceiptCost ??
                      err.estimatedItemCost;
                    const photo = errandReceiptPhotos[err.id];
                    return (
                      <div
                        key={err.id}
                        className="bg-white border border-[#4E6E2A] ring-1 ring-[#4E6E2A]/15 rounded-2xl p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs text-[#687064]">
                              {err.category} · {err.pickupAlias} → {err.dropoffAlias}
                            </div>
                            <div className="text-sm font-bold text-[#1A1D1A] truncate mt-0.5">
                              {err.title}
                            </div>
                            <div className="text-xs text-[#4E6E2A] font-semibold mt-0.5">
                              담당: {err.partnerName ?? '이웃 배달 파트너'} · 예상 물품비{' '}
                              {formatWon(err.estimatedItemCost)}
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[11px] font-bold shrink-0">
                            진행 중
                          </span>
                        </div>

                        <div className="pt-2.5 border-t border-[#E8ECE4] space-y-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 font-semibold text-[#1A1D1A]">
                              <Receipt className="w-3.5 h-3.5 text-[#4E6E2A]" />
                              <span>구매 영수증 첨부 · 실비 입력</span>
                            </span>
                            <label className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] font-bold inline-flex items-center gap-1 cursor-pointer">
                              <Camera className="w-3.5 h-3.5" />
                              <span>
                                {photo ? '영수증 재첨부' : '영수증 사진 첨부'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const loaded = await readCompressedEvidencePhotos(
                                    e,
                                    0,
                                    1
                                  );
                                  if (loaded[0]) {
                                    setErrandReceiptPhotos((prev) => ({
                                      ...prev,
                                      [err.id]: loaded[0],
                                    }));
                                    setErrandReceiptErrors((prev) => {
                                      const next = { ...prev };
                                      delete next[err.id];
                                      return next;
                                    });
                                  }
                                }}
                                className="hidden"
                              />
                            </label>
                          </div>

                          {errandReceiptErrors[err.id] && (
                            <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{errandReceiptErrors[err.id]}</span>
                            </p>
                          )}

                          {photo && (
                            <div className="flex items-center gap-2 p-2 rounded-xl bg-[#F7F8F5] border border-[#D4E1C5]">
                              <img
                                src={photo.dataUrl}
                                alt={photo.name}
                                className="w-12 h-12 rounded-lg object-cover border border-[#D4E1C5] shrink-0"
                              />
                              <span className="text-[11px] text-[#3D5720] font-semibold">
                                영수증 사진 첨부됨 · 실비 금액을 확인해 주세요.
                              </span>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <input
                              type="number"
                              min={0}
                              step={100}
                              aria-label="실제 영수증 물품비"
                              value={receiptVal}
                              onChange={(e) =>
                                setErrandReceiptInputs((prev) => ({
                                  ...prev,
                                  [err.id]: Math.max(
                                    0,
                                    parseInt(e.target.value, 10) || 0
                                  ),
                                }))
                              }
                              className="flex-1 min-w-[100px] min-h-[38px] px-3 bg-[#F7F8F5] border border-[#E8ECE4] rounded-xl font-mono tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (err.estimatedItemCost > 0 && !photo) {
                                  setErrandReceiptErrors((prev) => ({
                                    ...prev,
                                    [err.id]:
                                      '물품 구매 심부름은 영수증 사진을 먼저 첨부해 주세요.',
                                  }));
                                  return;
                                }
                                onAdvanceErrand(
                                  err.id,
                                  ErrandStatus.RECEIPT_CHECKED,
                                  receiptVal,
                                  photo
                                );
                              }}
                              className="min-h-[38px] px-4 py-1.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white font-bold rounded-xl whitespace-nowrap cursor-pointer"
                            >
                              영수증 첨부 · 배송 완료
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onAdvanceErrand(err.id, ErrandStatus.OPEN)
                              }
                              className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-red-50 border border-[#E8ECE4] hover:border-red-200 text-[#687064] hover:text-red-700 font-bold rounded-xl whitespace-nowrap cursor-pointer"
                            >
                              수락 취소
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Delivered errands awaiting customer confirmation/approval */}
            {awaitingCustomerErrands.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[#687064]">
                  3. 배송 완료 · 고객 확인 및 승인 대기 ({awaitingCustomerErrands.length}건)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {awaitingCustomerErrands.map((err) => (
                    <div
                      key={err.id}
                      className="bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl p-4 space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-[#1A1D1A] truncate">
                            {err.title}
                          </div>
                          <div className="text-[#687064] mt-0.5">
                            영수증 실비 {formatWon(err.actualReceiptCost ?? 0)} 제출 완료
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold shrink-0">
                          <Clock className="w-3 h-3" />
                          <span>고객 승인 대기</span>
                        </span>
                      </div>
                      {err.receiptPhoto && (
                        <img
                          src={err.receiptPhoto.dataUrl}
                          alt={err.receiptPhoto.name}
                          className="w-12 h-12 rounded-lg object-cover border border-[#D4E1C5]"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Completed errands */}
            {completedErrands.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[#4E6E2A]">
                  4. 정산 완료 심부름 ({completedErrands.length}건)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {completedErrands.map((err) => (
                    <div
                      key={err.id}
                      className="bg-white border border-[#D4E1C5] rounded-2xl p-4 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#1A1D1A] truncate">
                          {err.title}
                        </div>
                        <div className="text-[#687064] mt-0.5">
                          실비 {formatWon(err.actualReceiptCost ?? 0)} · 정산 완료
                        </div>
                      </div>
                      <span className="font-mono font-bold text-[#4E6E2A] shrink-0">
                        +{formatWon(Math.max(0, err.errandFee - MATCHING_FEE_PER_CASE))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
