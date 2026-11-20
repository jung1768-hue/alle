import { useMemo, useState } from 'react';
import {
  Bike,
  Camera,
  CheckCircle2,
  Footprints,
  Lock,
  MapPin,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react';
import {
  DispatchMode,
  ErrandRequest,
  ErrandStatus,
  EvidencePhoto,
  Order,
  OrderStatus,
} from '../types/alle';
import { readCompressedEvidencePhotos } from '../utils/imageUpload';
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
      <div className="bg-[#1A1D1A] text-white rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#3A4038]">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#D4E1C5]">
            배달 파트너 센터
          </p>
          <h1 className="text-xl font-bold tracking-tight">
            이웃 도보 · 라이더 배차
          </h1>
          <p className="text-xs sm:text-sm text-[#E8ECE4]">
            조리 중인 주문을 수락해 픽업·배달을 완료하세요.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={onSwitchToConsumer}
            className="min-h-[42px] px-4 py-2 bg-[#EAF1E2] hover:bg-white text-[#1A1D1A] text-xs sm:text-sm font-bold rounded-xl whitespace-nowrap cursor-pointer"
          >
            고객 홈
          </button>
          <button
            type="button"
            onClick={onSwitchToOwner}
            className="min-h-[42px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold rounded-xl whitespace-nowrap cursor-pointer"
          >
            점주 · 관리자
          </button>
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
          <div className="text-xs font-semibold text-[#687064]">생활 심부름 모집</div>
          <div className="text-2xl font-bold text-[#1A1D1A] font-mono tabular-nums mt-1">
            {openErrands.length}건
          </div>
          <div className="text-xs text-[#687064] mt-0.5">
            금지 품목 필터 통과 요청
          </div>
        </div>
        <div className="bg-white border border-[#E8ECE4] rounded-2xl p-4">
          <div className="text-xs font-semibold text-[#687064]">완료 건수 · 정산 예정</div>
          <div className="text-2xl font-bold text-[#4E6E2A] font-mono tabular-nums mt-1">
            {formatWon(estimatedMockReward)}
          </div>
          <div className="text-xs text-[#687064] tabular-nums mt-0.5">
            완료 {completedDeliveries.length}건 · 건당 2,000원
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
        <div className="inline-flex items-center p-1 bg-[#F0F3EC] border border-[#E8ECE4] rounded-xl">
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
                  ? 'bg-white text-[#4E6E2A] shadow-2xs'
                  : 'text-[#687064] hover:text-[#1A1D1A]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

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

            return (
              <article
                key={order.id}
                className="bg-white border border-[#E8ECE4] rounded-3xl p-5 space-y-4 shadow-[0_2px_10px_rgba(26,29,26,0.03)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-[#687064]">
                      <span className="font-mono font-bold text-[#1A1D1A]">
                        {order.orderCode}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>
                        {order.storeName} → {order.addressAlias}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#1A1D1A] mt-1">
                      {order.menuName} ({order.servings}인)
                    </h3>
                    <p className="text-xs text-[#555E52] mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#4E6E2A]" />
                      <span>
                        {order.dispatchMode === DispatchMode.AGENCY_RIDER
                          ? '전문 라이더 배차'
                          : '이웃 도보 파트너'}
                      </span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-[#4E6E2A] font-mono tabular-nums">
                      배달비 2,000원
                    </div>
                    <div className="text-xs text-[#687064] mt-0.5">
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

                <div className="pt-3 border-t border-[#E8ECE4] flex flex-wrap items-center justify-between gap-2">
                  {isAcceptedOnly && (
                    <span className="text-xs font-medium text-[#687064] flex items-center gap-1.5">
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
                    <div className="p-2.5 rounded-xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-2 text-xs">
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
      <section className="space-y-3 pt-2">
        <h2 className="text-lg font-bold text-[#1A1D1A] flex items-center gap-2">
          <Truck className="w-5 h-5 text-[#4E6E2A]" />
          <span>이웃 생활 심부름 파트너 수락 대기 ({openErrands.length}건)</span>
        </h2>
        {openErrands.length === 0 ? (
          <div className="bg-white border border-[#E8ECE4] rounded-2xl p-6 text-center text-xs text-[#687064]">
            현재 대기 중인 생활 심부름 요청이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {openErrands.map((err) => (
              <div
                key={err.id}
                className="bg-white border border-[#E8ECE4] rounded-2xl p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs text-[#687064]">
                    {err.category} · {err.pickupAlias} → {err.dropoffAlias}
                  </div>
                  <div className="text-sm font-bold text-[#1A1D1A] truncate mt-0.5">
                    {err.title}
                  </div>
                  <div className="text-xs font-bold text-[#4E6E2A] font-mono tabular-nums mt-1">
                    심부름 보수 {formatWon(err.errandFee)} · 에스크로 예치됨
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAdvanceErrand(err.id, ErrandStatus.MATCHED)}
                  className="min-h-[42px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs font-bold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
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
