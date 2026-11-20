import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  List,
  MessageCircle,
  Store as StoreIcon,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import {
  AiMediationVerdict,
  DispatchMode,
  ErrandRequest,
  ErrandStatus,
  EvidencePhoto,
  EvidenceRecord,
  MenuItem,
  Order,
  OrderStatus,
  Store,
} from '../types/alle';
import { readCompressedEvidencePhotos } from '../utils/imageUpload';
import { formatWon } from '../utils/parser';
import { FoodImage } from './FoodImage';
import { LiveDeliveryMapCard } from './LiveDeliveryMapCard';

interface OrderStatusViewProps {
  orders: Order[];
  errands?: ErrandRequest[];
  stores: Store[];
  menus: MenuItem[];
  highlightedOrderId: string | null;
  mapFocusRequest?: { orderId: string; seq: number } | null;
  showPresenterMode?: boolean;
  onCancelBeforeCooking: (orderId: string) => void;
  onRequestCancelAfterCooking: (orderId: string, reason: string) => void;
  onAttachEvidence: (
    orderId: string,
    payload: Omit<EvidenceRecord, 'recordedAt'>
  ) => void;
  onQuickReorderToConfirm: (menuId: string, servings: number) => void;
  onQuickReorderOrder?: (order: Order) => void;
  onUseRelayCoupon?: (menuId: string) => void;
  onGoToOwnerDemo: () => void;
  onNewOrder: () => void;
}

const STEPS: Array<{ status: OrderStatus; label: string }> = [
  { status: OrderStatus.PENDING, label: '접수 대기' },
  { status: OrderStatus.ACCEPTED, label: '수락됨' },
  { status: OrderStatus.COOKING, label: '조리 중' },
  { status: OrderStatus.PICKUP, label: '배송 시작' },
  { status: OrderStatus.COMPLETED, label: '도착 완료' },
];

const ERRAND_STEPS: Array<{ status: ErrandStatus; label: string }> = [
  { status: ErrandStatus.OPEN, label: '요청 등록' },
  { status: ErrandStatus.MATCHED, label: '파트너 매칭' },
  { status: ErrandStatus.RECEIPT_CHECKED, label: '배송 시작' },
  { status: ErrandStatus.COMPLETED, label: '도착 완료' },
];

function getStepIndex(status: OrderStatus): number {
  return STEPS.findIndex((s) => s.status === status);
}

function parseOrderDateParts(createdAt: string): {
  year: number;
  month: number;
  day: number;
  dateKey: string;
} {
  const datePart = createdAt.split(' ')[0] || '2026-11-13';
  const [yStr, mStr, dStr] = datePart.split('-');
  const year = parseInt(yStr, 10) || 2026;
  const month = parseInt(mStr, 10) || 11;
  const day = parseInt(dStr, 10) || 13;
  return { year, month, day, dateKey: datePart };
}

function getFaqAutoReply(order: Order, topic: 'eta' | 'note'): string {
  if (topic === 'note') {
    return order.customerNote
      ? `요청 메모("${order.customerNote}")가 매장 주문표에 전달되어 있습니다.`
      : '기본 규격(일회용품·기본 반찬)으로 접수되어 있습니다.';
  }
  if (order.status === OrderStatus.PENDING) {
    return '매장 확인 대기 중입니다. 수락 후 바로 조리가 시작됩니다.';
  }
  if (order.status === OrderStatus.ACCEPTED) {
    return '주문이 수락되어 곧 조리를 시작합니다.';
  }
  if (order.status === OrderStatus.COOKING) {
    return `주방에서 조리 중입니다. 완료 후 ${
      order.reservationSlot
        ? `예약 시간(${order.reservationSlot})에 맞춰`
        : '배달 파트너 픽업으로'
    } 이동합니다.`;
  }
  if (order.status === OrderStatus.PICKUP) {
    const modeLabel =
      order.dispatchMode === DispatchMode.AGENCY_RIDER
        ? '전문 라이더'
        : '이웃 도보 파트너';
    return `${modeLabel}가 픽업을 완료해 ${order.addressAlias} 방향으로 이동 중입니다.`;
  }
  return '배달이 완료된 주문입니다.';
}

export function OrderStatusView({
  orders,
  errands = [],
  stores,
  menus,
  highlightedOrderId,
  mapFocusRequest = null,
  showPresenterMode = false,
  onCancelBeforeCooking,
  onRequestCancelAfterCooking,
  onAttachEvidence,
  onQuickReorderToConfirm,
  onQuickReorderOrder,
  onUseRelayCoupon,
  onGoToOwnerDemo,
  onNewOrder,
}: OrderStatusViewProps) {
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [historyViewMode, setHistoryViewMode] = useState<'list' | 'calendar'>(
    'list'
  );
  const [calendarScope, setCalendarScope] = useState<'monthly' | 'yearly'>(
    'monthly'
  );

  const defaultOrderDate = useMemo(() => {
    const latest = orders[0];
    return latest
      ? parseOrderDateParts(latest.createdAt)
      : { year: 2026, month: 11, day: 13, dateKey: '2026-11-13' };
  }, [orders]);

  const relayOffer = useMemo(() => {
    const latest = orders.find((o) => o.status !== OrderStatus.CANCELLED);
    if (!latest) return null;
    const storeMap = new Map(stores.map((s) => [s.id, s]));
    const currentStore = storeMap.get(latest.storeId);
    const candidateMenus = menus.filter((m) => {
      const st = storeMap.get(m.storeId);
      return (
        Boolean(st?.isOpen) &&
        m.storeId !== latest.storeId &&
        !m.isSoldOut &&
        m.stock >= 1
      );
    });
    if (candidateMenus.length === 0) return null;
    const preferred =
      candidateMenus.find((m) => {
        const st = storeMap.get(m.storeId);
        return (
          st &&
          currentStore &&
          st.categoryGroup !== currentStore.categoryGroup
        );
      }) ?? candidateMenus[0];
    const partnerStore = storeMap.get(preferred.storeId);
    if (!partnerStore) return null;
    return {
      fromStoreName: latest.storeName,
      partnerStore,
      menu: preferred,
    };
  }, [orders, stores, menus]);

  const [calendarYear, setCalendarYear] = useState<number>(defaultOrderDate.year);
  const [calendarMonth, setCalendarMonth] = useState<number>(
    defaultOrderDate.month
  );
  const [selectedDay, setSelectedDay] = useState<number>(defaultOrderDate.day);

  const [requestingOrderId, setRequestingOrderId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState<string>('');
  const [faqRepliesByOrder, setFaqRepliesByOrder] = useState<
    Record<string, string>
  >({});

  // 4-stage evidence recording & AI 10-second mediation UI state
  const [evidenceOrderId, setEvidenceOrderId] = useState<string | null>(null);
  const [claimType, setClaimType] =
    useState<AiMediationVerdict['claimType']>('spill');
  const [ownerSealCheck, setOwnerSealCheck] = useState<boolean>(true);
  const [courierCheck, setCourierCheck] = useState<boolean>(true);
  const [customerEvidenceNote, setCustomerEvidenceNote] = useState<string>(
    '국물 용기 실링 및 도착 상태 확인 요청'
  );
  const [evidencePhotos, setEvidencePhotos] = useState<EvidencePhoto[]>([]);

  const handleEvidenceFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const loaded = await readCompressedEvidencePhotos(
      e,
      evidencePhotos.length,
      3
    );
    if (loaded.length > 0) {
      setEvidencePhotos((prev) => [...prev, ...loaded].slice(0, 3));
    }
  };

  const buildAiMediationVerdict = (
    order: Order,
    type: AiMediationVerdict['claimType'],
    ownerSealed: boolean,
    courierChecked: boolean,
    photoCount = 0
  ): AiMediationVerdict => {
    const photoSuffix =
      photoCount > 0 ? ` (고객 현장 사진 증빙 ${photoCount}장 교차 검증 반영)` : '';
    const photoConfidenceBoost = photoCount > 0 ? 2 : 0;

    if (order.totalAmount > 100000) {
      return {
        claimType: type,
        faultParty: 'escalated',
        faultLabel: '인간 관리자 에스컬레이션 (10만 원 초과)',
        confidencePercent: Math.min(99, 84 + photoConfidenceBoost),
        processedSeconds: 1.8,
        summary: `10만 원 초과 대량 주문 건으로 자동 에스크로 동결 후 전담 CS 감독관 검토 큐로 즉시 연결되었습니다.${photoSuffix}`,
        customerAction: '에스크로 보호 대기 (우선 연락)',
        ownerAction: '제출 증빙 검토 후 정산 확정',
        courierAction: '배송 로그 보존',
      };
    }

    if (type === 'spill') {
      const faultOwner = !ownerSealed;
      return {
        claimType: type,
        faultParty: faultOwner ? 'owner' : 'courier',
        faultLabel: faultOwner ? '가맹점주 포장 귀책' : '배달 파트너 이동 중 파손',
        confidencePercent: Math.min(99, 96 + photoConfidenceBoost),
        processedSeconds: 2.3,
        summary: `${
          faultOwner
            ? '점주 용기 실링 미확인 상태로 출고되어 포장 미흡으로 판정되었습니다.'
            : '점주 실링 정상 + 이동 중 충격/기울어짐 로그 교차 검증으로 배달 중 파손 판정되었습니다.'
        }${photoSuffix}`,
        customerAction: `${formatWon(order.totalAmount)} 즉시 환불 + 위로 포인트 3,000원`,
        ownerAction: faultOwner
          ? '해당 주문 정산 보류'
          : '음식값 100% 정상 정산 입금',
        courierAction: faultOwner
          ? '배달비 100% 정상 지급'
          : '시간제 미니보험 기금 처리 (사비 면제)',
      };
    }

    if (type === 'missing') {
      return {
        claimType: type,
        faultParty: 'owner',
        faultLabel: '가맹점주 품목 누락',
        confidencePercent: Math.min(99, 94 + photoConfidenceBoost),
        processedSeconds: 2.1,
        summary: `주문 영수증 품목 리스트와 수령 구성품 대조 결과 일부 품목 누락이 감지되었습니다.${photoSuffix}`,
        customerAction: '누락 품목 즉시 부분 환불 + 1,000원 alle 캐시',
        ownerAction: '누락 품목 금액만 에스크로 자동 차감',
        courierAction: '배달비 100% 정상 지급',
      };
    }

    if (type === 'misdelivery') {
      return {
        claimType: type,
        faultParty: 'courier',
        faultLabel: '배달 파트너 오배송 (호수 불일치)',
        confidencePercent: Math.min(99, 97 + photoConfidenceBoost),
        processedSeconds: 1.9,
        summary: `${
          courierChecked
            ? '문 앞 사진 호수 번호판 OCR과 수령지 주소 불일치가 감지되어 즉시 재배치 알림을 전송했습니다.'
            : '수령지 호수 불일치 및 이동 로그 미확인으로 전액 환불 처리되었습니다.'
        }${photoSuffix}`,
        customerAction: `${formatWon(order.totalAmount)} 즉시 환불 또는 원클릭 재주문`,
        ownerAction: '음식값 100% 정상 정산 입금',
        courierAction: '5분 내 위치 이동 알림 (미조치 시 배달료 미지급)',
      };
    }

    return {
      claimType: type,
      faultParty: 'platform_buffer',
      faultLabel: '상생 버퍼 기금 중재',
      confidencePercent: Math.min(99, 91 + photoConfidenceBoost),
      processedSeconds: 2.6,
      summary: `점주 실링·배달 상태 모두 정상으로 확인되어 플랫폼 상생 버퍼 기금으로 원만히 보상합니다.${photoSuffix}`,
      customerAction: '상생 버퍼 기금 2,000원 위로 쿠폰 즉시 지급',
      ownerAction: '음식값 100% 정상 정산 입금',
      courierAction: '배달비 100% 정상 지급',
    };
  };

  const renderEvidenceForm = (order: Order) => (
    <div className="p-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl space-y-2.5 text-xs">
      <div className="font-bold text-[#1A1D1A]">
        4단계 디지털 증적 제출 · 10초 자동 중재
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['spill', '국물 쏟아짐/파손'],
            ['missing', '품목 누락'],
            ['misdelivery', '오배송(호수 불일치)'],
            ['quality', '단순 변심/품질 문의'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setClaimType(key)}
            className={`px-2.5 py-1 rounded-lg font-semibold border cursor-pointer ${
              claimType === key
                ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                : 'bg-white border-[#E8ECE4] text-[#434B40]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[#1A1D1A]">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={ownerSealCheck}
            onChange={(e) => setOwnerSealCheck(e.target.checked)}
            className="accent-[#4E6E2A]"
          />
          <span>1. 점주 실링/영수증 정상</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={courierCheck}
            onChange={(e) => setCourierCheck(e.target.checked)}
            className="accent-[#4E6E2A]"
          />
          <span>2. 파트너 이동/센서 로그 확인</span>
        </label>
      </div>
      <input
        type="text"
        value={customerEvidenceNote}
        onChange={(e) => setCustomerEvidenceNote(e.target.value)}
        className="w-full min-h-[38px] px-3 bg-white border border-[#D4E1C5] rounded-xl text-[#1A1D1A]"
        placeholder="3. 고객 클레임 내용"
      />
      <div className="p-2.5 rounded-xl bg-white border border-dashed border-[#82B440]/70 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-[#3D5720]">
            4. 현장 사진 · 영수증 증거 첨부 (최대 3장)
          </span>
          <label className="min-h-[32px] px-3 py-1 rounded-lg bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] font-bold inline-flex items-center gap-1.5 cursor-pointer">
            <Camera className="w-3.5 h-3.5" />
            <span>사진 올리기</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleEvidenceFileChange}
              disabled={evidencePhotos.length >= 3}
              className="hidden"
            />
          </label>
        </div>
        {evidencePhotos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {evidencePhotos.map((photo, idx) => (
              <div key={`${photo.name}-${idx}`} className="relative">
                <img
                  src={photo.dataUrl}
                  alt={photo.name}
                  className="w-16 h-16 rounded-lg object-cover border border-[#D4E1C5]"
                />
                <button
                  type="button"
                  onClick={() =>
                    setEvidencePhotos((prev) => prev.filter((_, i) => i !== idx))
                  }
                  aria-label="첨부 사진 삭제"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#1A1D1A] text-white flex items-center justify-center cursor-pointer shadow-xs"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const aiVerdict = buildAiMediationVerdict(
              order,
              claimType,
              ownerSealCheck,
              courierCheck,
              evidencePhotos.length
            );
            onAttachEvidence(order.id, {
              ownerSealingChecked: ownerSealCheck,
              courierConditionChecked: courierCheck,
              customerMemoNote:
                customerEvidenceNote.trim() || '고객 확인 메모',
              escrowStatus: '에스크로 자동 정산 집행 완료',
              evidencePhotos:
                evidencePhotos.length > 0 ? evidencePhotos : undefined,
              aiVerdict,
            });
            setEvidencePhotos([]);
            setEvidenceOrderId(null);
          }}
          className="min-h-[38px] px-4 py-1.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white font-bold rounded-xl cursor-pointer"
        >
          10초 자동 중재 실행
        </button>
        <button
          type="button"
          onClick={() => {
            setEvidencePhotos([]);
            setEvidenceOrderId(null);
          }}
          className="min-h-[38px] px-3 py-1.5 border border-[#D4E1C5] bg-white text-[#555E52] font-semibold rounded-xl cursor-pointer"
        >
          닫기
        </button>
      </div>
    </div>
  );

  const menuMap = useMemo(() => new Map(menus.map((m) => [m.id, m])), [menus]);

  const activeOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status !== OrderStatus.COMPLETED && o.status !== OrderStatus.CANCELLED
      ),
    [orders]
  );

  const historyOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === OrderStatus.COMPLETED || o.status === OrderStatus.CANCELLED
      ),
    [orders]
  );

  const visibleOrders = tab === 'active' ? activeOrders : historyOrders;

  useEffect(() => {
    if (!mapFocusRequest?.orderId) return;
    const target = orders.find((o) => o.id === mapFocusRequest.orderId);
    if (!target) return;
    const isHistory =
      target.status === OrderStatus.COMPLETED ||
      target.status === OrderStatus.CANCELLED;
    setTab(isHistory ? 'history' : 'active');
    const t = window.setTimeout(() => {
      const el = document.getElementById(`order-map-${target.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [mapFocusRequest, orders]);

  const activeErrands = useMemo(
    () => errands.filter((e) => e.status !== ErrandStatus.COMPLETED),
    [errands]
  );
  const historyErrands = useMemo(
    () => errands.filter((e) => e.status === ErrandStatus.COMPLETED),
    [errands]
  );
  const visibleErrands = tab === 'active' ? activeErrands : historyErrands;

  // Calendar aggregation
  const daysInCalendarMonth = new Date(calendarYear, calendarMonth, 0).getDate();
  const leadingEmptyCells =
    (new Date(calendarYear, calendarMonth - 1, 1).getDay() + 6) % 7;
  const clampedSelectedDay = Math.min(selectedDay, daysInCalendarMonth);
  const ordersByDay = useMemo(() => {
    const map = new Map<number, Order[]>();
    for (const o of orders) {
      const { year, month, day } = parseOrderDateParts(o.createdAt);
      if (year === calendarYear && month === calendarMonth) {
        const list = map.get(day) ?? [];
        list.push(o);
        map.set(day, list);
      }
    }
    return map;
  }, [orders, calendarYear, calendarMonth]);

  const selectedDayOrders = ordersByDay.get(clampedSelectedDay) ?? [];
  const selectedDayTotal = selectedDayOrders.reduce(
    (sum, o) => sum + (o.status === OrderStatus.CANCELLED ? 0 : o.totalAmount),
    0
  );

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1D1A]">주문내역</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showPresenterMode && (
              <button
                type="button"
                onClick={onGoToOwnerDemo}
                className="min-h-[42px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold rounded-2xl flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <StoreIcon className="w-4 h-4" />
                <span>점주 · 관리자</span>
              </button>
            )}
            <button
              type="button"
              onClick={onNewOrder}
              className="min-h-[42px] px-4 py-2 border border-[#D4E1C5] bg-white hover:bg-[#EAF1E2] text-[#1A1D1A] text-xs sm:text-sm font-bold rounded-2xl whitespace-nowrap shrink-0 cursor-pointer"
            >
              새 주문하기
            </button>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="주문 현황 및 주문 기록"
          className="grid grid-cols-2 p-1 bg-white border border-[#E8ECE4] rounded-2xl shadow-sm"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'active'}
            onClick={() => setTab('active')}
            className={`min-h-[44px] py-2 text-sm font-bold rounded-xl transition-colors cursor-pointer ${
              tab === 'active'
                ? 'bg-[#EAF1E2] text-[#3D5720]'
                : 'text-[#687064] hover:text-[#1A1D1A]'
            }`}
          >
            주문현황 ({activeOrders.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            onClick={() => setTab('history')}
            className={`min-h-[44px] py-2 text-sm font-bold rounded-xl transition-colors cursor-pointer ${
              tab === 'history'
                ? 'bg-[#EAF1E2] text-[#3D5720]'
                : 'text-[#687064] hover:text-[#1A1D1A]'
            }`}
          >
            주문기록 ({historyOrders.length})
          </button>
        </div>
      </div>

      {/* History Sub-Mode Switcher: List vs Monthly/Yearly Food Calendar */}
      {tab === 'history' && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#E8ECE4] rounded-2xl px-4 py-2.5">
          <span className="text-xs font-bold text-[#555E52] tabular-nums">
            전체 {orders.length}건 · 완료/취소 {historyOrders.length}건
          </span>
          <div className="inline-flex items-center p-1 bg-[#F0F3EC] border border-[#E8ECE4] rounded-xl">
            <button
              type="button"
              onClick={() => setHistoryViewMode('list')}
              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                historyViewMode === 'list'
                  ? 'bg-white text-[#4E6E2A] shadow-2xs'
                  : 'text-[#687064]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>목록 보기</span>
            </button>
            <button
              type="button"
              onClick={() => setHistoryViewMode('calendar')}
              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                historyViewMode === 'calendar'
                  ? 'bg-white text-[#4E6E2A] shadow-2xs'
                  : 'text-[#687064]'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>음식 달력</span>
            </button>
          </div>
        </div>
      )}

      {tab === 'history' && historyViewMode === 'calendar' ? (
        <div className="space-y-4">
          {/* Calendar Header Controls */}
          <div className="bg-white border border-[#E8ECE4] rounded-3xl p-4 sm:p-5 space-y-4 shadow-[0_2px_10px_rgba(26,29,26,0.03)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center p-1 bg-[#F0F3EC] border border-[#E8ECE4] rounded-xl">
                <button
                  type="button"
                  onClick={() => setCalendarScope('monthly')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                    calendarScope === 'monthly'
                      ? 'bg-[#4E6E2A] text-white'
                      : 'text-[#555E52]'
                  }`}
                >
                  월별
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarScope('yearly')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                    calendarScope === 'yearly'
                      ? 'bg-[#4E6E2A] text-white'
                      : 'text-[#555E52]'
                  }`}
                >
                  연간
                </button>
              </div>

              <div className="flex items-center gap-3 text-lg font-bold text-[#1A1D1A] tabular-nums">
                <button
                  type="button"
                  aria-label="이전 달"
                  onClick={() => {
                    if (calendarMonth === 1) {
                      setCalendarYear((y) => y - 1);
                      setCalendarMonth(12);
                    } else {
                      setCalendarMonth((m) => m - 1);
                    }
                  }}
                  className="min-w-[36px] min-h-[36px] rounded-xl hover:bg-[#F7F8F5] flex items-center justify-center cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>
                  {calendarYear}년 {calendarMonth}월
                </span>
                <button
                  type="button"
                  aria-label="다음 달"
                  onClick={() => {
                    if (calendarMonth === 12) {
                      setCalendarYear((y) => y + 1);
                      setCalendarMonth(1);
                    } else {
                      setCalendarMonth((m) => m + 1);
                    }
                  }}
                  className="min-w-[36px] min-h-[36px] rounded-xl hover:bg-[#F7F8F5] flex items-center justify-center cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setCalendarYear(defaultOrderDate.year);
                  setCalendarMonth(defaultOrderDate.month);
                  setSelectedDay(defaultOrderDate.day);
                  setCalendarScope('monthly');
                }}
                className="min-h-[36px] px-3 py-1 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs font-bold rounded-xl cursor-pointer"
              >
                최근 주문일 이동
              </button>
            </div>

            {calendarScope === 'yearly' ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => {
                  const count = orders.filter((o) => {
                    const p = parseOrderDateParts(o.createdAt);
                    return p.year === calendarYear && p.month === m;
                  }).length;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setCalendarMonth(m);
                        setCalendarScope('monthly');
                      }}
                      className={`p-3 rounded-2xl border text-center cursor-pointer transition-colors ${
                        m === calendarMonth
                          ? 'bg-[#EAF1E2] border-[#4E6E2A] font-bold'
                          : 'bg-[#F7F8F5] border-[#E8ECE4] hover:bg-white'
                      }`}
                    >
                      <div className="text-sm font-bold text-[#1A1D1A]">{m}월</div>
                      <div className="text-xs font-semibold text-[#4E6E2A] tabular-nums mt-0.5">
                        {count}건 주문
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-7 text-center text-xs font-bold text-[#687064]">
                  {['월', '화', '수', '목', '금', '토', '일'].map((w) => (
                    <div key={w} className="py-1">
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: leadingEmptyCells }, (_, idx) => (
                    <div
                      key={`empty-${idx}`}
                      aria-hidden="true"
                      className="min-h-[60px] sm:min-h-[74px]"
                    />
                  ))}
                  {Array.from({ length: daysInCalendarMonth }, (_, i) => i + 1).map(
                    (day) => {
                      const dayList = ordersByDay.get(day) ?? [];
                      const hasOrders = dayList.length > 0;
                      const isSelected = day === clampedSelectedDay;
                      const firstMenu = dayList[0]
                        ? menuMap.get(dayList[0].menuId)
                        : undefined;

                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setSelectedDay(day)}
                          className={`min-h-[60px] sm:min-h-[74px] rounded-2xl p-1 flex flex-col items-center justify-between transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-[#EAF1E2] border-2 border-[#4E6E2A]'
                              : hasOrders
                                ? 'bg-white border-2 border-[#4E6E2A]/80 hover:bg-[#EAF1E2]/60'
                                : 'bg-[#F7F8F5] border border-[#E8ECE4] hover:bg-white'
                          }`}
                        >
                          <span
                            className={`text-xs font-bold tabular-nums ${
                              isSelected || hasOrders
                                ? 'text-[#3D5720]'
                                : 'text-[#687064]'
                            }`}
                          >
                            {day}
                          </span>
                          {hasOrders && firstMenu ? (
                            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full overflow-hidden border-2 border-[#4E6E2A] shadow-2xs">
                              <FoodImage
                                src={firstMenu.image}
                                alt={firstMenu.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <span className="h-7 sm:h-9" />
                          )}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Selected Day Orders Detail Card */}
          <div className="bg-white border border-[#E8ECE4] rounded-3xl p-5 space-y-3.5 shadow-[0_2px_10px_rgba(26,29,26,0.03)]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1A1D1A] tabular-nums">
                {calendarMonth}월 {clampedSelectedDay}일 주문 내역
              </h2>
              <span className="text-xs font-bold text-[#4E6E2A] font-mono tabular-nums">
                총 {selectedDayOrders.length}건 · {formatWon(selectedDayTotal)}
              </span>
            </div>

            {selectedDayOrders.length === 0 ? (
              <p className="py-5 text-center text-xs text-[#687064]">
                선택한 날짜에 주문 기록이 없습니다. 음식 사진이 있는 날짜를 눌러보세요.
              </p>
            ) : (
              <div className="space-y-3">
                {selectedDayOrders.map((ord) => {
                  const menuObj = menuMap.get(ord.menuId);
                  const canReorder = Boolean(
                    menuObj && !menuObj.isSoldOut && menuObj.stock >= 1
                  );
                  return (
                    <div
                      key={ord.id}
                      className="p-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-[#E8ECE4]">
                          <FoodImage
                            src={menuObj?.image ?? ''}
                            alt={ord.menuName}
                            className="w-full h-full"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#1A1D1A] truncate">
                            {ord.storeName} · {ord.menuName} ({ord.servings}인)
                          </div>
                          <div className="text-xs text-[#687064] font-mono tabular-nums">
                            {ord.createdAt} ·{' '}
                            {ord.status === OrderStatus.CANCELLED
                              ? '취소 완료'
                              : STEPS[getStepIndex(ord.status)]?.label ?? ord.status}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <span className="font-mono tabular-nums font-bold text-sm text-[#1A1D1A]">
                          {formatWon(ord.totalAmount)}
                        </span>
                        <button
                          type="button"
                          disabled={!canReorder}
                          onClick={() =>
                            onQuickReorderOrder
                              ? onQuickReorderOrder(ord)
                              : onQuickReorderToConfirm(ord.menuId, ord.servings)
                          }
                          className="min-h-[38px] px-3.5 py-1.5 bg-[#EAF1E2] hover:bg-[#DCE7CF] border border-[#82B440]/50 disabled:bg-[#F7F8F5] disabled:border-[#E8ECE4] disabled:text-[#687064] text-[#3D5720] text-xs font-bold rounded-xl inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed transition-colors"
                        >
                          <span>{canReorder ? '⚡ 1초 결제' : '재고 없음'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : visibleOrders.length === 0 && visibleErrands.length === 0 ? (
        <div className="bg-white border border-[#E8ECE4] rounded-3xl p-8 text-center text-sm text-[#687064]">
          {tab === 'active'
            ? '현재 진행 중인 주문이나 심부름이 없습니다.'
            : '완료되거나 취소된 주문 기록이 없습니다.'}
        </div>
      ) : (
        <div className="space-y-4">
          {relayOffer && onUseRelayCoupon && (
            <div className="p-4 sm:p-5 bg-[#EAF1E2] border border-[#82B440]/60 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl overflow-hidden border border-[#D4E1C5] shrink-0">
                  <FoodImage
                    src={relayOffer.menu.image}
                    alt={relayOffer.menu.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-bold text-[#3D5720]">
                    🎁 옆집 릴레이 쿠폰 도착 · 1,000원 즉시 할인
                  </p>
                  <p className="text-sm font-bold text-[#1A1D1A] truncate">
                    {relayOffer.partnerStore.name} · {relayOffer.menu.name}
                  </p>
                  <p className="text-xs text-[#3D5720]">
                    {relayOffer.fromStoreName} 주문 감사로 반경 200m 동네 이웃 매장에서 사용 가능합니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUseRelayCoupon(relayOffer.menu.id)}
                className="min-h-[40px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs font-bold rounded-xl shrink-0 cursor-pointer"
              >
                릴레이 1,000원 할인 주문
              </button>
            </div>
          )}

          {visibleOrders.map((order) => {
            const currentIdx = getStepIndex(order.status);
            const isCancelled = order.status === OrderStatus.CANCELLED;
            const isBeforeCooking =
              order.status === OrderStatus.PENDING ||
              order.status === OrderStatus.ACCEPTED;
            const isAfterCooking =
              order.status === OrderStatus.COOKING ||
              order.status === OrderStatus.PICKUP;
            const showLiveMap =
              order.status === OrderStatus.COOKING ||
              order.status === OrderStatus.PICKUP ||
              order.status === OrderStatus.COMPLETED;
            const isHighlighted = order.id === highlightedOrderId;
            const menuObj = menuMap.get(order.menuId);
            const menuImage = menuObj?.image ?? '';
            const canReorder = Boolean(
              menuObj && !menuObj.isSoldOut && menuObj.stock >= 1
            );

            return (
              <article
                key={order.id}
                className={`bg-white rounded-3xl border p-5 sm:p-6 space-y-4 shadow-[0_2px_12px_rgba(26,29,26,0.03)] ${
                  isHighlighted
                    ? 'border-[#4E6E2A] ring-2 ring-[#4E6E2A]/15'
                    : 'border-[#E8ECE4]'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 border border-[#E8ECE4]">
                    <FoodImage
                      src={menuImage}
                      alt={order.menuName}
                      className="w-full h-full"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[11px] font-bold">
                            {order.orderCode.startsWith('MKT-')
                              ? '🧺 시장·골목 묶음'
                              : order.isB2B
                                ? '🏢 B2B 단체식'
                                : order.sharedDeliveryApplied
                                  ? '👥 이웃 묶음'
                                  : '🍽️ 일반 배달'}
                          </span>
                          {!isCancelled && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                order.status === OrderStatus.COMPLETED
                                  ? 'bg-[#4E6E2A] text-white'
                                  : order.status === OrderStatus.PICKUP
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-[#F7F8F5] text-[#434B40] border border-[#E8ECE4]'
                              }`}
                            >
                              {order.status === OrderStatus.COMPLETED
                                ? '✅ 도착 완료'
                                : order.status === OrderStatus.PICKUP
                                  ? '🚚 배송 시작됨'
                                  : `${STEPS[currentIdx]?.label ?? order.status}`}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#687064]">
                          <span className="font-mono font-bold text-[#1A1D1A]">
                            {order.orderCode}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span>
                            {order.customerAlias} / {order.addressAlias}
                          </span>
                          {order.isB2B && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="font-bold text-[#4E6E2A]">
                                B2B 오프피크
                              </span>
                            </>
                          )}
                        </div>
                        <h2 className="text-base sm:text-lg font-bold text-[#1A1D1A] mt-0.5">
                          {order.storeName}
                        </h2>
                        <p className="text-sm font-medium text-[#555E52]">
                          {order.menuName} ({order.servings}인)
                        </p>
                        {order.items && order.items.length > 1 && (
                          <ul className="mt-1 space-y-0.5 text-xs text-[#687064]">
                            {order.items.map((it, idx) => (
                              <li key={`${it.menuId}-${idx}`}>
                                · {it.menuName} × {it.quantity}
                                {it.selectedOptionNames.length > 0 &&
                                  ` (${it.selectedOptionNames.join(', ')})`}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="text-left sm:text-right shrink-0">
                        <div className="text-lg font-bold text-[#1A1D1A] font-mono tabular-nums">
                          {formatWon(order.totalAmount)}
                        </div>
                        <div className="text-xs font-bold mt-0.5">
                          {isCancelled ? (
                            <span className="text-red-700">
                              취소 완료 {order.mockRefunded ? '· 모의 환불 완료' : ''}
                            </span>
                          ) : order.status === OrderStatus.COMPLETED ? (
                            <span className="text-[#4E6E2A]">주문 완료</span>
                          ) : (
                            <span className="text-[#4E6E2A]">
                              {STEPS[currentIdx]?.label ?? order.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-1.5 text-xs text-[#687064] font-mono tabular-nums">
                      {order.createdAt}
                      {order.paymentMethodLabel && ` · ${order.paymentMethodLabel}`}
                      {order.reservationSlot && ` · 도착 예약: ${order.reservationSlot}`}
                      {order.sharedDeliveryApplied && ' · 이웃 묶음배달'}
                      {order.selectedOptionNames.length > 0 &&
                        ` · 옵션: ${order.selectedOptionNames.join(', ')}`}
                      {order.customerNote && ` · 메모: ${order.customerNote}`}
                    </div>
                  </div>
                </div>

                {/* Progress Bar + Stepper */}
                {!isCancelled ? (
                  <div className="space-y-2.5">
                    <div className="h-2 w-full bg-[#EAF1E2] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#82B440] rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.round(((currentIdx + 1) / STEPS.length) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                      {STEPS.map((step, idx) => {
                        const done = idx < currentIdx;
                        const current = idx === currentIdx;
                        return (
                          <div
                            key={step.status}
                            className={`p-2 sm:p-2.5 rounded-xl border text-center transition-colors ${
                              current
                                ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white font-bold shadow-xs'
                                : done
                                  ? 'bg-[#EAF1E2] border-[#82B440]/50 text-[#3D5720] font-semibold'
                                  : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#687064]'
                            }`}
                          >
                            <div className="text-[11px] sm:text-xs whitespace-nowrap truncate">
                              {step.label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl flex items-center gap-2.5 text-sm text-[#555E52]">
                    <XCircle className="w-4 h-4 text-red-700 shrink-0" />
                    <span>
                      조리 전 취소가 확정되어 주문이 취소되었습니다.{' '}
                      {order.mockRefunded && (
                        <strong className="font-bold text-[#1A1D1A]">
                          모의 환불 완료
                        </strong>
                      )}
                      {order.stockRestored && ' (재고 1회 복구 완료)'}
                    </span>
                  </div>
                )}

                {/* Dispatch Mode Display */}
                {order.dispatchMode && !isCancelled && (
                  <div className="px-3.5 py-2.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl flex items-center gap-2 text-xs text-[#555E52]">
                    <Truck className="w-4 h-4 text-[#4E6E2A] shrink-0" />
                    <span>
                      배차 방식:{' '}
                      <strong className="font-bold text-[#1A1D1A]">
                        {order.dispatchMode === DispatchMode.AGENCY_RIDER
                          ? '전문 라이더'
                          : '이웃 도보 파트너'}
                      </strong>
                    </span>
                  </div>
                )}

                {!isCancelled && !showLiveMap && !order.deliveryStage && (
                  <div className="px-3.5 py-2.5 bg-[#EAF1E2]/70 border border-[#D4E1C5] rounded-2xl flex items-center gap-2 text-xs text-[#3D5720] font-medium">
                    <Truck className="w-4 h-4 text-[#4E6E2A] shrink-0" />
                    <span>
                      전문 라이더 · 배달 파트너 배정 중 · 배정 시 출발 · 도착 5분 전 · 도착 알림을 보내드려요
                    </span>
                  </div>
                )}

                {(showLiveMap || Boolean(order.deliveryStage)) && (
                  <div id={`order-map-${order.id}`}>
                    <LiveDeliveryMapCard
                      orderCode={order.orderCode}
                      storeName={order.storeName}
                      addressAlias={order.addressAlias}
                      status={order.status}
                      dispatchMode={order.dispatchMode}
                      deliveryStage={order.deliveryStage}
                      riderName={order.riderName}
                      remainingMinutes={order.remainingMinutes}
                      isFocused={mapFocusRequest?.orderId === order.id}
                    />
                  </div>
                )}

                {/* Repeated Customer FAQ Auto-Response Simulation */}
                {!isCancelled && order.status !== OrderStatus.COMPLETED && (
                  <div className="p-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-[#1A1D1A] flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5 text-[#4E6E2A]" />
                        <span>빠른 문의 응답</span>
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setFaqRepliesByOrder((prev) => ({
                              ...prev,
                              [order.id]: getFaqAutoReply(order, 'eta'),
                            }))
                          }
                          className="min-h-[32px] px-2.5 py-1 bg-white border border-[#D4E1C5] hover:bg-[#EAF1E2] rounded-lg font-bold text-[#3D5720] cursor-pointer"
                        >
                          “배달 언제 오나요?”
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setFaqRepliesByOrder((prev) => ({
                              ...prev,
                              [order.id]: getFaqAutoReply(order, 'note'),
                            }))
                          }
                          className="min-h-[32px] px-2.5 py-1 bg-white border border-[#D4E1C5] hover:bg-[#EAF1E2] rounded-lg font-bold text-[#3D5720] cursor-pointer"
                        >
                          “수저/메모 전달됐나요?”
                        </button>
                      </div>
                    </div>
                    {faqRepliesByOrder[order.id] && (
                      <p className="text-[#1A1D1A] bg-white border border-[#E8ECE4] rounded-xl px-3 py-2 font-medium">
                        {faqRepliesByOrder[order.id]}
                      </p>
                    )}
                  </div>
                )}

                {/* Recorded Post-Cooking Cancel Request & 4-Way Evidence Record (No AI Fault Judgement) */}
                {order.cancelRequested && !isCancelled && (
                  <div className="p-4 bg-[#F7F8F5] border border-[#D4E1C5] rounded-2xl space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2 font-bold text-[#3D5720]">
                      <span>조리 시작 후 취소 요청이 기록되었습니다</span>
                      <span className="font-mono tabular-nums text-[#687064]">
                        {order.cancelRequestedAt}
                      </span>
                    </div>
                    <p className="text-[#1A1D1A] font-medium">
                      요청 사유: {order.cancelRequestReason}
                    </p>
                    <p className="text-[#555E52]">
                      조리 시작 이후 요청은 기록만 남기며 재고·금액을 자동으로 바꾸지
                      않습니다. (자동 과실 판정 없음)
                    </p>
                  </div>
                )}

                {order.evidenceRecord && (
                  <div className="p-4 bg-[#EAF1E2] border border-[#82B440]/60 rounded-2xl space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-[#3D5720]">
                      <span className="flex items-center gap-1.5">
                        <ClipboardCheck className="w-4 h-4" />
                        <span>
                          {order.evidenceRecord.aiVerdict
                            ? `⚡ 10초 자동 중재 판정 완료 (${order.evidenceRecord.aiVerdict.processedSeconds}초 · 신뢰도 ${order.evidenceRecord.aiVerdict.confidencePercent}%)`
                            : '안심 거래 증적 기록'}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums">
                        {order.evidenceRecord.recordedAt}
                      </span>
                    </div>
                    <p className="text-[#1A1D1A] font-medium">
                      점주 실링: {order.evidenceRecord.ownerSealingChecked ? '확인' : '미확인'} · 파트너 상태:{' '}
                      {order.evidenceRecord.courierConditionChecked ? '확인' : '미확인'} · {order.evidenceRecord.escrowStatus}
                    </p>
                    <p className="text-[#555E52]">
                      고객 메모: {order.evidenceRecord.customerMemoNote}
                    </p>
                    {order.evidenceRecord.evidencePhotos &&
                      order.evidenceRecord.evidencePhotos.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <div className="text-[11px] font-bold text-[#3D5720]">
                            첨부된 현장 사진 · 영수증 증거 (
                            {order.evidenceRecord.evidencePhotos.length}장)
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {order.evidenceRecord.evidencePhotos.map((photo, idx) => (
                              <img
                                key={`${photo.name}-${idx}`}
                                src={photo.dataUrl}
                                alt={photo.name}
                                className="w-16 h-16 rounded-xl object-cover border border-[#D4E1C5] bg-white"
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    {order.evidenceRecord.aiVerdict && (
                      <div className="p-3 bg-white border border-[#D4E1C5] rounded-xl space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span className="px-2 py-0.5 rounded-full bg-[#4E6E2A] text-white text-[11px] font-bold">
                            판정: {order.evidenceRecord.aiVerdict.faultLabel}
                          </span>
                        </div>
                        <p className="text-[#1A1D1A] font-medium leading-relaxed">
                          {order.evidenceRecord.aiVerdict.summary}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                          <div className="p-2 rounded-lg bg-[#F7F8F5] border border-[#E8ECE4]">
                            <div className="text-[11px] font-bold text-[#4E6E2A]">
                              고객 보상
                            </div>
                            <div className="text-[#1A1D1A] font-semibold mt-0.5">
                              {order.evidenceRecord.aiVerdict.customerAction}
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-[#F7F8F5] border border-[#E8ECE4]">
                            <div className="text-[11px] font-bold text-[#4E6E2A]">
                              점주 정산
                            </div>
                            <div className="text-[#1A1D1A] font-semibold mt-0.5">
                              {order.evidenceRecord.aiVerdict.ownerAction}
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-[#F7F8F5] border border-[#E8ECE4]">
                            <div className="text-[11px] font-bold text-[#4E6E2A]">
                              파트너 조치
                            </div>
                            <div className="text-[#1A1D1A] font-semibold mt-0.5">
                              {order.evidenceRecord.aiVerdict.courierAction}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(order.status === OrderStatus.COMPLETED || isCancelled) && (
                  <div className="pt-3 border-t border-[#E8ECE4] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-[#687064]">
                        이전 옵션 그대로 바로 다시 주문
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {order.status === OrderStatus.COMPLETED && !order.evidenceRecord && (
                          <button
                            type="button"
                            onClick={() =>
                              setEvidenceOrderId((prev) =>
                                prev === order.id ? null : order.id
                              )
                            }
                            className="min-h-[40px] px-3.5 py-1.5 border border-[#D4E1C5] bg-white hover:bg-[#F7F8F5] text-[#1A1D1A] text-xs font-bold rounded-xl cursor-pointer"
                          >
                            10초 자동 중재 시연
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!canReorder}
                          onClick={() =>
                            onQuickReorderOrder
                              ? onQuickReorderOrder(order)
                              : onQuickReorderToConfirm(order.menuId, order.servings)
                          }
                          className="min-h-[42px] px-4 py-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] border border-[#82B440]/50 disabled:bg-[#F7F8F5] disabled:border-[#E8ECE4] disabled:text-[#687064] text-[#3D5720] text-xs sm:text-sm font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition-colors"
                        >
                          <span>
                            {canReorder ? '⚡ 1초 결제 재주문' : '현재 재고 없음'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {order.status === OrderStatus.COMPLETED &&
                      evidenceOrderId === order.id &&
                      !order.evidenceRecord &&
                      renderEvidenceForm(order)}
                  </div>
                )}

                {!isCancelled && order.status !== OrderStatus.COMPLETED && (
                  <div className="pt-3 border-t border-[#E8ECE4] flex flex-wrap items-center justify-between gap-3">
                    {isBeforeCooking && (
                      <>
                        <span className="text-xs text-[#555E52] flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#4E6E2A]" />
                          조리 시작 전이므로 즉시 취소할 수 있습니다.
                        </span>
                        <button
                          type="button"
                          onClick={() => onCancelBeforeCooking(order.id)}
                          className="min-h-[42px] px-4 py-2 border border-red-300 bg-white hover:bg-red-50 text-red-700 text-xs sm:text-sm font-bold rounded-xl cursor-pointer"
                        >
                          조리 전 취소 확정
                        </button>
                      </>
                    )}

                    {isAfterCooking && (
                      <div className="w-full space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-[#555E52]">
                            {order.cancelRequested
                              ? '취소 요청이 매장에 전달되었습니다.'
                              : '조리가 시작되어 취소 요청만 남길 수 있습니다.'}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {!order.cancelRequested && requestingOrderId !== order.id && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRequestingOrderId(order.id);
                                  setReasonDraft('');
                                }}
                                className="min-h-[40px] px-3.5 py-1.5 border border-[#D4E1C5] bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs font-bold rounded-xl cursor-pointer"
                              >
                                취소 요청 기록하기
                              </button>
                            )}
                            {!order.evidenceRecord && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEvidenceOrderId((prev) =>
                                    prev === order.id ? null : order.id
                                  )
                                }
                                className="min-h-[40px] px-3.5 py-1.5 border border-[#D4E1C5] bg-white hover:bg-[#F7F8F5] text-[#1A1D1A] text-xs font-bold rounded-xl cursor-pointer"
                              >
                                안심 증적 기록
                              </button>
                            )}
                          </div>
                        </div>

                        {requestingOrderId === order.id && (
                          <div className="p-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl space-y-2.5">
                            <label className="block text-xs font-bold text-[#1A1D1A]">
                              취소 요청 사유
                            </label>
                            <input
                              type="text"
                              value={reasonDraft}
                              onChange={(e) => setReasonDraft(e.target.value)}
                              placeholder="예: 수령 일정 변경으로 취소 요청드립니다."
                              className="w-full min-h-[42px] px-3.5 bg-white border border-[#D4E1C5] rounded-xl text-sm text-[#1A1D1A]"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const trimmed = reasonDraft.trim();
                                  if (!trimmed) return;
                                  onRequestCancelAfterCooking(order.id, trimmed);
                                  setRequestingOrderId(null);
                                  setReasonDraft('');
                                }}
                                className="min-h-[40px] px-4 py-1.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs font-bold rounded-xl cursor-pointer"
                              >
                                요청 기록 저장
                              </button>
                              <button
                                type="button"
                                onClick={() => setRequestingOrderId(null)}
                                className="min-h-[40px] px-3 py-1.5 border border-[#D4E1C5] bg-white text-[#555E52] text-xs font-semibold rounded-xl cursor-pointer"
                              >
                                닫기
                              </button>
                            </div>
                          </div>
                        )}

                        {evidenceOrderId === order.id &&
                          !order.evidenceRecord &&
                          renderEvidenceForm(order)}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}

          {visibleErrands.map((errand) => {
            const eIdx = ERRAND_STEPS.findIndex((s) => s.status === errand.status);
            return (
              <article
                key={errand.id}
                className="bg-white rounded-3xl border border-[#E8ECE4] p-5 sm:p-6 space-y-4 shadow-[0_2px_12px_rgba(26,29,26,0.03)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[11px] font-bold">
                        🏃 장보기 · 생활 심부름
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          errand.status === ErrandStatus.COMPLETED
                            ? 'bg-[#4E6E2A] text-white'
                            : errand.status === ErrandStatus.RECEIPT_CHECKED
                              ? 'bg-amber-600 text-white'
                              : 'bg-[#F7F8F5] text-[#434B40] border border-[#E8ECE4]'
                        }`}
                      >
                        {errand.status === ErrandStatus.COMPLETED
                          ? '✅ 도착 완료'
                          : errand.status === ErrandStatus.RECEIPT_CHECKED
                            ? '🚚 배송 시작됨'
                            : ERRAND_STEPS[eIdx]?.label ?? errand.status}
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-[#1A1D1A]">
                      {errand.title}
                    </h2>
                    <p className="text-xs text-[#687064] mt-0.5">
                      {errand.pickupAlias} → {errand.dropoffAlias} · {errand.createdAt}
                    </p>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <div className="text-lg font-bold text-[#1A1D1A] font-mono tabular-nums">
                      {formatWon(errand.escrowTotal)}
                    </div>
                    <div className="text-[11px] text-[#687064]">
                      심부름비 {formatWon(errand.errandFee)} 포함
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {ERRAND_STEPS.map((st, idx) => {
                    const reached = idx <= eIdx;
                    const isCurrent = idx === eIdx;
                    return (
                      <div
                        key={st.status}
                        className={`py-2 px-1.5 rounded-xl text-center border text-[11px] font-semibold ${
                          isCurrent
                            ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                            : reached
                              ? 'bg-[#EAF1E2] border-[#D4E1C5] text-[#3D5720]'
                              : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#687064]'
                        }`}
                      >
                        {st.label}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
