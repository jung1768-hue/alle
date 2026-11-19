import { useMemo, useState } from 'react';
import {
  Bike,
  CheckCircle2,
  Footprints,
  Lock,
  MapPin,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import {
  DispatchMode,
  ErrandRequest,
  ErrandStatus,
  Order,
  OrderStatus,
} from '../types/alle';
import { formatWon } from '../utils/parser';
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
    actualReceiptCost?: number
  ) => void;
  onSwitchToConsumer: () => void;
  onSwitchToOwner: () => void;
}

export function PartnerDashboardView({
  orders,
  errands,
  onAdvanceOrderStatus,
  onAdvanceErrand,
  onSwitchToConsumer,
  onSwitchToOwner,
}: PartnerDashboardViewProps) {
  const [trackFilter, setTrackFilter] = useState<'all' | DispatchMode>('all');

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
        if (!o.dispatchMode) return true;
        return o.dispatchMode === trackFilter;
      }),
    [orders, trackFilter]
  );

  const completedDeliveries = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.COMPLETED),
    [orders]
  );

  const openErrands = useMemo(
    () => errands.filter((e) => e.status === ErrandStatus.OPEN),
    [errands]
  );

  const estimatedMockReward = completedDeliveries.length * 2000;

  return (
    <div className="space-y-6">
      {/* Dark Botanical Partner Banner */}
      <div className="bg-[#141812] text-white rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#2C3528]">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#C5E09B]">
            배달 파트너 센터
          </p>
          <h1 className="text-xl font-bold tracking-tight">
            이웃 도보 · 라이더 배차
          </h1>
          <p className="text-xs sm:text-sm text-[#DDE6D5]">
            조리 중인 주문을 수락해 픽업·배달을 완료하세요.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={onSwitchToConsumer}
            className="min-h-[42px] px-4 py-2 bg-[#E7EFE1] hover:bg-white text-[#141812] text-xs sm:text-sm font-bold rounded-xl whitespace-nowrap cursor-pointer"
          >
            고객 홈
          </button>
          <button
            type="button"
            onClick={onSwitchToOwner}
            className="min-h-[42px] px-4 py-2 bg-[#2E531A] hover:bg-[#3A6822] text-white text-xs sm:text-sm font-bold rounded-xl whitespace-nowrap cursor-pointer"
          >
            점주 · 관리자
          </button>
        </div>
      </div>

      {/* Summary KPI Row (Honest Demo Aggregates) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-[#DDE3D7] rounded-2xl p-4">
          <div className="text-xs font-semibold text-[#4A5246]">배달·픽업 대기</div>
          <div className="text-2xl font-bold text-[#141812] font-mono tabular-nums mt-1">
            {deliveryQueue.length}건
          </div>
          <div className="text-xs text-[#2E531A] font-medium mt-0.5">
            조리 중 / 픽업 이동 주문
          </div>
        </div>
        <div className="bg-white border border-[#DDE3D7] rounded-2xl p-4">
          <div className="text-xs font-semibold text-[#4A5246]">생활 심부름 모집</div>
          <div className="text-2xl font-bold text-[#141812] font-mono tabular-nums mt-1">
            {openErrands.length}건
          </div>
          <div className="text-xs text-[#4A5246] mt-0.5">
            금지 품목 필터 통과 요청
          </div>
        </div>
        <div className="bg-white border border-[#DDE3D7] rounded-2xl p-4">
          <div className="text-xs font-semibold text-[#4A5246]">완료 건수 · 정산 예정</div>
          <div className="text-2xl font-bold text-[#2E531A] font-mono tabular-nums mt-1">
            {formatWon(estimatedMockReward)}
          </div>
          <div className="text-xs text-[#4A5246] tabular-nums mt-0.5">
            완료 {completedDeliveries.length}건 · 건당 2,000원
          </div>
        </div>
      </div>

      {/* Geofencing Privacy Safeguard Banner */}
      <div className="bg-[#E9F1E2] border border-[#C5D8B5] rounded-2xl px-4 py-3 flex items-center gap-2.5 text-xs text-[#1F3A11] font-medium">
        <ShieldCheck className="w-4 h-4 text-[#2E531A] shrink-0" />
        <span>반경 20m 안심 위치 마스킹이 적용되어 출발지 및 거주지 상세 위치는 비공개로 보호됩니다.</span>
      </div>

      {/* Track Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[#141812]">
          배송 콜 목록
        </h2>
        <div className="inline-flex items-center p-1 bg-[#E9ECE4] border border-[#DDE3D7] rounded-xl">
          {(
            [
              { id: 'all', label: '전체' },
              { id: DispatchMode.NEIGHBOR_WALK, label: 'Track 1 이웃 도보' },
              { id: DispatchMode.AGENCY_RIDER, label: 'Track 2 전문 라이더' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTrackFilter(t.id)}
              className={`min-h-[36px] px-3 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                trackFilter === t.id
                  ? 'bg-white text-[#2E531A] shadow-2xs'
                  : 'text-[#4A5246] hover:text-[#141812]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Delivery Orders */}
      {deliveryQueue.length === 0 ? (
        <div className="bg-white border border-[#DDE3D7] rounded-3xl p-8 text-center text-sm text-[#4A5246]">
          현재 수락·조리·픽업 진행 중인 주문이 없습니다. 점주 화면에서 주문을 수락·조리
          시작으로 넘겨보세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {deliveryQueue.map((order) => {
            const isCooking = order.status === OrderStatus.COOKING;
            const isPickup = order.status === OrderStatus.PICKUP;
            const isAcceptedOnly = order.status === OrderStatus.ACCEPTED;

            return (
              <article
                key={order.id}
                className="bg-white border border-[#DDE3D7] rounded-3xl p-5 space-y-4 shadow-[0_2px_10px_rgba(20,24,18,0.03)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-[#4A5246]">
                      <span className="font-mono font-bold text-[#141812]">
                        {order.orderCode}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>
                        {order.storeName} → {order.addressAlias}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#141812] mt-1">
                      {order.menuName} ({order.servings}인)
                    </h3>
                    <p className="text-xs text-[#374033] mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#2E531A]" />
                      <span>
                        {order.dispatchMode === DispatchMode.AGENCY_RIDER
                          ? '전문 라이더 배차'
                          : '이웃 도보 파트너'}
                      </span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-[#2E531A] font-mono tabular-nums">
                      배달비 2,000원
                    </div>
                    <div className="text-xs text-[#4A5246] mt-0.5">
                      {isAcceptedOnly
                        ? '점주 조리 시작 대기'
                        : isCooking
                          ? '조리 중 · 픽업 가능'
                          : '픽업 완료 · 이동 중'}
                    </div>
                  </div>
                </div>

                {(isCooking || isPickup) && (
                  <LiveDeliveryMapCard
                    orderCode={order.orderCode}
                    storeName={order.storeName}
                    addressAlias={order.addressAlias}
                    status={order.status}
                    dispatchMode={order.dispatchMode}
                  />
                )}

                <div className="pt-3 border-t border-[#E6EBE1] flex flex-wrap items-center justify-between gap-2">
                  {isAcceptedOnly && (
                    <span className="text-xs font-medium text-[#4A5246] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      점주가 ‘조리 시작’을 누른 후 픽업할 수 있습니다.
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
                        className="flex-1 min-h-[44px] px-4 py-2 bg-[#2E531A] hover:bg-[#234113] text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
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
                        className="flex-1 min-h-[44px] px-4 py-2 bg-[#E7EFE1] hover:bg-[#D8E6CD] text-[#1F3A11] text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
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
                      className="w-full min-h-[44px] px-4 py-2 bg-[#141812] hover:bg-[#232B1F] text-white text-xs sm:text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#8BC34A]" />
                      <span>수령지 20m 도달 · 배달 완료 처리</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Partner Errand Tasks */}
      <section className="space-y-3 pt-2">
        <h2 className="text-lg font-bold text-[#141812] flex items-center gap-2">
          <Truck className="w-5 h-5 text-[#2E531A]" />
          <span>이웃 생활 심부름 파트너 수락 대기 ({openErrands.length}건)</span>
        </h2>
        {openErrands.length === 0 ? (
          <div className="bg-white border border-[#DDE3D7] rounded-2xl p-6 text-center text-xs text-[#4A5246]">
            현재 대기 중인 생활 심부름 요청이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {openErrands.map((err) => (
              <div
                key={err.id}
                className="bg-white border border-[#DDE3D7] rounded-2xl p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs text-[#4A5246]">
                    {err.category} · {err.pickupAlias} → {err.dropoffAlias}
                  </div>
                  <div className="text-sm font-bold text-[#141812] truncate mt-0.5">
                    {err.title}
                  </div>
                  <div className="text-xs font-bold text-[#2E531A] font-mono tabular-nums mt-1">
                    심부름 보수 {formatWon(err.errandFee)} · 에스크로 예치됨
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAdvanceErrand(err.id, ErrandStatus.MATCHED)}
                  className="min-h-[42px] px-4 py-2 bg-[#2E531A] hover:bg-[#234113] text-white text-xs font-bold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
                >
                  심부름 수락
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
