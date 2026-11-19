import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Camera,
  Car,
  CheckCircle2,
  Clock,
  Footprints,
  MapPin,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
  Utensils,
} from 'lucide-react';
import {
  B2B_OFFPEAK_SLOTS,
  GROUP_BUY_POOLS,
  PROHIBITED_ERRAND_KEYWORDS,
} from '../data/seedData';
import {
  ErrandRequest,
  ErrandStatus,
  MenuItem,
  Order,
  SavedLocation,
  Store,
  SuperAppTab,
} from '../types/alle';
import { formatWon } from '../utils/parser';
import { FoodImage } from './FoodImage';

interface SuperAppHubViewProps {
  activeTab: SuperAppTab;
  onChangeTab: (tab: SuperAppTab) => void;
  stores: Store[];
  menus: MenuItem[];
  errands: ErrandRequest[];
  latestOrder?: Order;
  activeLocation?: SavedLocation;
  onJoinGroupBuy: (menuId: string) => void;
  onCreateB2BOrder: (payload: {
    menuId: string;
    servings: number;
    reservationSlot: string;
    customerNote: string;
  }) => { ok: boolean; error?: string };
  onCreateErrand: (payload: {
    title: string;
    category: string;
    pickupAlias: string;
    dropoffAlias: string;
    estimatedItemCost: number;
    errandFee: number;
  }) => { ok: boolean; error?: string };
  onAdvanceErrand: (
    errandId: string,
    nextStatus: ErrandStatus,
    actualReceiptCost?: number
  ) => void;
}

export function SuperAppHubView({
  activeTab,
  onChangeTab,
  stores,
  menus,
  errands,
  latestOrder,
  activeLocation,
  onJoinGroupBuy,
  onCreateB2BOrder,
  onCreateErrand,
  onAdvanceErrand,
}: SuperAppHubViewProps) {
  const [taxiStatus, setTaxiStatus] = useState<'idle' | 'matching' | 'reserved'>(
    'idle'
  );
  const [taxiEtaAdjusted, setTaxiEtaAdjusted] = useState<boolean>(false);

  const handleSimulateTaxiBooking = () => {
    if (taxiStatus !== 'idle') return;
    setTaxiStatus('matching');
    window.setTimeout(() => {
      setTaxiStatus('reserved');
    }, 450);
  };

  const handleResetTaxiBooking = () => {
    setTaxiStatus('idle');
    setTaxiEtaAdjusted(false);
  };

  const activeMealName = latestOrder?.menuName ?? '얼큰 소고기국밥';
  const activeStoreName = latestOrder?.storeName ?? '수성 범어 소고기국밥';
  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const menuMap = useMemo(() => new Map(menus.map((m) => [m.id, m])), [menus]);

  // B2B Off-peak state
  const availableMenus = useMemo(
    () =>
      menus.filter((m) => {
        const st = storeMap.get(m.storeId);
        return Boolean(st?.isOpen && !m.isSoldOut && m.stock >= 1);
      }),
    [menus, storeMap]
  );

  const [b2bMenuId, setB2bMenuId] = useState<string>(availableMenus[0]?.id ?? 'm1');
  const selectedB2bMenu =
    menus.find((m) => m.id === b2bMenuId) ?? availableMenus[0] ?? menus[0];
  const selectedB2bStore = selectedB2bMenu
    ? storeMap.get(selectedB2bMenu.storeId)
    : undefined;

  const [b2bServings, setB2bServings] = useState<number>(
    Math.min(5, Math.max(1, selectedB2bMenu?.stock ?? 1))
  );
  const [b2bSlot, setB2bSlot] = useState<string>(B2B_OFFPEAK_SLOTS[0]);
  const [b2bNote, setB2bNote] = useState<string>('오피스 A 로비 앞 수령');
  const [b2bError, setB2bError] = useState<string | null>(null);

  // C2C Errand state
  const [errandTitle, setErrandTitle] = useState<string>('약국 일반 상비약 구매 대행');
  const [errandCategory, setErrandCategory] = useState<string>('생활/약국 심부름');
  const [pickupAlias, setPickupAlias] = useState<string>('동네 약국 A');
  const [dropoffAlias, setDropoffAlias] = useState<string>(
    activeLocation?.detailAddress ?? '수령지 A'
  );
  const [estimatedItemCost, setEstimatedItemCost] = useState<number>(6000);
  const [errandFee, setErrandFee] = useState<number>(2000);
  const [errandError, setErrandError] = useState<string | null>(null);
  const [receiptInputs, setReceiptInputs] = useState<Record<string, number>>({});
  const [dualPhotoChecked, setDualPhotoChecked] = useState<Record<string, boolean>>({});

  const prohibitedMatches = useMemo(() => {
    const text = errandTitle.trim();
    if (!text) return [];
    return PROHIBITED_ERRAND_KEYWORDS.filter((kw) => text.includes(kw));
  }, [errandTitle]);

  const handleSubmitB2B = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedB2bMenu) return;
    if (!Number.isInteger(b2bServings) || b2bServings < 1) {
      setB2bError('주문 수량은 1 이상의 양의 정수여야 합니다.');
      return;
    }
    const res = onCreateB2BOrder({
      menuId: selectedB2bMenu.id,
      servings: b2bServings,
      reservationSlot: b2bSlot,
      customerNote: b2bNote.trim(),
    });
    if (!res.ok) {
      setB2bError(res.error ?? 'B2B 주문을 처리할 수 없습니다.');
    } else {
      setB2bError(null);
    }
  };

  const handleSubmitErrand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!errandTitle.trim()) {
      setErrandError('심부름 요청 내용을 입력해 주세요.');
      return;
    }
    if (prohibitedMatches.length > 0) {
      setErrandError(
        `금지 품목(${prohibitedMatches.join(', ')})이 포함되어 등록할 수 없습니다.`
      );
      return;
    }
    if (
      !Number.isInteger(estimatedItemCost) ||
      estimatedItemCost < 0 ||
      !Number.isInteger(errandFee) ||
      errandFee < 500
    ) {
      setErrandError('물품 예상액(0원 이상)과 심부름비(500원 이상)를 원 단위 정수로 입력하세요.');
      return;
    }
    const res = onCreateErrand({
      title: errandTitle.trim(),
      category: errandCategory,
      pickupAlias: pickupAlias.trim() || '픽업지 A',
      dropoffAlias: dropoffAlias.trim() || '수령지 A',
      estimatedItemCost,
      errandFee,
    });
    if (!res.ok) {
      setErrandError(res.error ?? '심부름 등록에 실패했습니다.');
    } else {
      setErrandError(null);
      setErrandTitle('');
    }
  };

  const b2bSubtotal = selectedB2bMenu
    ? selectedB2bMenu.pricePerPerson * Math.max(1, b2bServings)
    : 0;
  const b2bDeliveryFee = selectedB2bStore?.deliveryFee ?? 0;
  const b2bTotal = b2bSubtotal + b2bDeliveryFee;

  return (
    <div className="space-y-6">
      {/* Cross-Domain Single AI Agent Proposal Card (Food -> Mobility) */}
      <section
        aria-label="단일 AI 에이전트 크로스 도메인 제안"
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#141812] via-[#1C2716] to-[#283E1A] text-white p-5 sm:p-6 border border-[#344C24] shadow-[0_10px_28px_rgba(20,24,18,0.16)] space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-[#C7F08F]">
            <Sparkles className="w-3.5 h-3.5 text-[#8BC34A]" />
            <span>SINGLE AI AGENT · 크로스 도메인 맥락 제안</span>
          </div>
          <span className="text-[11px] font-semibold text-[#D5E6C3] font-mono tabular-nums">
            식사 → 이동 자동 연계
          </span>
        </div>

        {/* Context Chain Visual */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2.5 bg-white/8 border border-white/12 rounded-2xl p-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#8BC34A]/20 border border-[#8BC34A]/35 flex items-center justify-center shrink-0">
              <Utensils className="w-4 h-4 text-[#C7F08F]" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#B9CCB0] font-medium">
                진행 중인 식사 주문 · 도착 예정 12:40
              </p>
              <p className="text-xs sm:text-sm font-bold text-white truncate">
                {activeStoreName} · {activeMealName}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center justify-center px-1 text-[#8BC34A]">
            <ArrowRight className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/12 border border-white/20 flex items-center justify-center shrink-0">
              <Car className="w-4 h-4 text-[#C7F08F]" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#B9CCB0] font-medium">
                다음 일정 감지 · 동성로 오후 미팅
              </p>
              <p className="text-xs sm:text-sm font-bold text-white truncate">
                {activeLocation?.detailAddress ?? '범어동 수령지 A'} → 동성로 중앙로역 (13:15 출발)
              </p>
            </div>
          </div>
        </div>

        {/* Proposal Headline & Details */}
        <div className="space-y-2">
          <h1 className="text-lg sm:text-xl font-bold leading-snug text-white">
            “식사 도착 예정 시간(12:40)에 맞춰 동성로 미팅 장소로 이동할 호출
            택시를 미리 예약할까요?”
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#CFE0C5]">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#8BC34A]" />
              식사 완료 후 13:15 자동 배차
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#8BC34A]" />
              예상 이동 14분 · 예상 요금 6,800원 (B2B·지역화폐 통합 정산)
            </span>
          </div>
        </div>

        {/* One-Click Simulation Action Area */}
        {taxiStatus === 'reserved' ? (
          <div className="bg-[#8BC34A]/18 border border-[#8BC34A]/45 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-[#A5E058] shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-white">
                    호출 택시 연계 예약 완료 · 대구 31바 4820 (중형)
                  </p>
                  <p className="text-xs text-[#DCECD0]">
                    {taxiEtaAdjusted
                      ? '배달 5분 지연 시나리오 반영 → 택시 픽업 시각이 13:20으로 자동 재조정되었습니다.'
                      : `13:15 ${activeLocation?.detailAddress ?? '범어동 수령지 A'} 앞 대기 예정 · 배달 도착 변동 시 호출 시각 자동 동기화`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetTaxiBooking}
                className="min-h-[34px] px-3 py-1 bg-white/10 hover:bg-white/20 text-[#DCECD0] text-xs font-semibold rounded-xl inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>다시 시연</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/12">
              <button
                type="button"
                onClick={() => setTaxiEtaAdjusted((prev) => !prev)}
                className="min-h-[34px] px-3 py-1 bg-white/12 hover:bg-white/20 text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                {taxiEtaAdjusted
                  ? '기본 13:15 스케줄로 복귀'
                  : '배달 5분 지연 시 자동 재조정 시뮬레이션'}
              </button>
              <button
                type="button"
                onClick={() => onChangeTab(SuperAppTab.ERRAND)}
                className="min-h-[34px] px-3 py-1 bg-transparent hover:bg-white/10 border border-white/20 text-[#DCECD0] text-xs font-semibold rounded-xl cursor-pointer"
              >
                식후 약국·생활 심부름도 함께 보기
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={taxiStatus === 'matching'}
              onClick={handleSimulateTaxiBooking}
              className="flex-1 min-h-[48px] px-5 py-2.5 bg-[#8BC34A] hover:bg-[#9BD15B] disabled:bg-[#709A3F] text-[#141812] text-sm font-bold rounded-2xl inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Car className="w-4 h-4 shrink-0" />
              <span>
                {taxiStatus === 'matching'
                  ? 'AI가 12:40 배달 동선과 배차 슬롯을 연동 중...'
                  : '원클릭으로 13:15 호출 택시 예약 시뮬레이션'}
              </span>
              {taxiStatus === 'idle' && <ArrowRight className="w-4 h-4 shrink-0" />}
            </button>
            <button
              type="button"
              onClick={() => onChangeTab(SuperAppTab.B2B)}
              className="min-h-[48px] px-4 py-2.5 bg-white/10 hover:bg-white/18 border border-white/18 text-white text-xs sm:text-sm font-semibold rounded-2xl whitespace-nowrap cursor-pointer"
            >
              B2B 팀 식사 연계
            </button>
          </div>
        )}
      </section>

      {/* Secondary Hub Intro */}
      <div className="bg-[#E9F1E2] border border-[#CBDCC0] rounded-3xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#141812]">
            하이퍼로컬 슈퍼앱 서비스 허브
          </h2>
          <p className="text-xs text-[#374033] mt-0.5">
            하나의 AI 에이전트 안에서 이웃 묶음배달, B2B 오프피크 단체 예약, C2C 생활 심부름까지 연결합니다.
          </p>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div
        role="tablist"
        aria-label="슈퍼앱 확장 기능 선택"
        className="grid grid-cols-3 p-1 bg-[#E7ECE2] border border-[#DDE3D7] rounded-2xl"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === SuperAppTab.GROUP_BUY}
          onClick={() => onChangeTab(SuperAppTab.GROUP_BUY)}
          className={`min-h-[44px] px-2 py-1.5 text-xs sm:text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === SuperAppTab.GROUP_BUY
              ? 'bg-white text-[#141812] shadow-xs'
              : 'text-[#374033] hover:text-[#141812]'
          }`}
        >
          <Users className="w-4 h-4 shrink-0 hidden sm:block" />
          <span>이웃 묶음배달</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === SuperAppTab.B2B}
          onClick={() => onChangeTab(SuperAppTab.B2B)}
          className={`min-h-[44px] px-2 py-1.5 text-xs sm:text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === SuperAppTab.B2B
              ? 'bg-white text-[#141812] shadow-xs'
              : 'text-[#374033] hover:text-[#141812]'
          }`}
        >
          <Briefcase className="w-4 h-4 shrink-0 hidden sm:block" />
          <span>B2B 오프피크</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === SuperAppTab.ERRAND}
          onClick={() => onChangeTab(SuperAppTab.ERRAND)}
          className={`min-h-[44px] px-2 py-1.5 text-xs sm:text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === SuperAppTab.ERRAND
              ? 'bg-white text-[#141812] shadow-xs'
              : 'text-[#374033] hover:text-[#141812]'
          }`}
        >
          <Footprints className="w-4 h-4 shrink-0 hidden sm:block" />
          <span>C2C 생활 심부름</span>
        </button>
      </div>

      {/* 1. Neighbor Group Buy Tab */}
      {activeTab === SuperAppTab.GROUP_BUY && (
        <section className="space-y-4">
          <div className="bg-white border border-[#E6EAE2] rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#141812]">
                이웃 묶음배달 · 배달비 매칭
              </h2>
              <p className="text-xs text-[#374033] mt-0.5">
                근처 이웃과 함께 주문하면 배달비를 50% 절약할 수 있어요.
              </p>
            </div>
            <span className="text-xs font-bold text-[#4A6B1C] shrink-0">
              매칭 가능 {GROUP_BUY_POOLS.length}건
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {GROUP_BUY_POOLS.map((pool) => {
              const store = storeMap.get(pool.storeId);
              const menu = menuMap.get(pool.menuId);
              if (!store || !menu) return null;
              const unavailable = !store.isOpen || menu.isSoldOut || menu.stock <= 0;
              const pct = Math.min(
                100,
                Math.round((pool.currentParticipants / pool.targetParticipants) * 100)
              );

              return (
                <article
                  key={pool.id}
                  className="bg-white border border-[#E6EAE2] rounded-3xl overflow-hidden shadow-[0_2px_10px_rgba(24,26,24,0.03)] flex flex-col justify-between"
                >
                  <div>
                    <div className="aspect-4/3 w-full overflow-hidden">
                      <FoodImage
                        src={menu.image}
                        alt={menu.name}
                        className="w-full h-full"
                      />
                    </div>
                    <div className="p-4 space-y-2.5">
                      <div className="text-xs text-[#717870]">
                        {pool.areaRadiusLabel} · {pool.remainingTimeLabel}
                      </div>
                      <h3 className="text-base font-bold text-[#141812]">
                        {menu.name}
                      </h3>
                      <p className="text-xs text-[#374033]">{pool.title}</p>

                      <div className="pt-1 text-xs space-y-1">
                        <div className="flex items-center justify-between font-mono tabular-nums">
                          <span className="text-[#717870] line-through">
                            기존 배달비 {formatWon(pool.originalDeliveryFee)}
                          </span>
                          <span className="font-bold text-[#4A6B1C]">
                            매칭 배달비 {formatWon(pool.sharedDeliveryFee)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[#374033] tabular-nums">
                          <span>
                            현재 {pool.currentParticipants}명 참여 중
                          </span>
                          <span>목표 {pool.targetParticipants}명</span>
                        </div>
                        <div className="h-2 bg-[#EFF2EC] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#2E531A] rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 pt-0">
                    <button
                      type="button"
                      disabled={unavailable}
                      onClick={() => onJoinGroupBuy(menu.id)}
                      className="w-full min-h-[44px] px-4 py-2 bg-[#E5EED4] hover:bg-[#DCE8C8] disabled:bg-[#F7F8F5] disabled:text-[#98A095] text-[#3B5714] text-sm font-bold rounded-2xl transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      {unavailable
                        ? !store.isOpen
                          ? '영업 중단으로 마감'
                          : '품절로 마감'
                        : '공동구매 함께 주문하기'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* 2. B2B Off-peak Group Order Tab */}
      {activeTab === SuperAppTab.B2B && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <form
            onSubmit={handleSubmitB2B}
            className="lg:col-span-7 bg-white border border-[#E6EAE2] rounded-3xl p-5 sm:p-6 space-y-4 shadow-[0_2px_10px_rgba(24,26,24,0.03)]"
          >
            <div>
              <h2 className="text-lg font-bold text-[#141812]">
                B2B 오프피크 단체 선주문
              </h2>
              <p className="text-xs text-[#374033] mt-0.5">
                여유 시간대에 오피스·팀 단체 주문을 미리 예약하세요.
              </p>
            </div>

            {b2bError && (
              <div
                role="alert"
                className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800"
              >
                {b2bError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#141812] mb-1">
                  수령지
                </label>
                <div className="px-3.5 py-2.5 bg-[#F7F8F5] border border-[#E6EAE2] rounded-xl text-sm font-medium text-[#374033]">
                  오피스 A · 오피스 구역 A
                </div>
              </div>

              <div>
                <label
                  htmlFor="b2b-menu"
                  className="block text-xs font-bold text-[#141812] mb-1"
                >
                  단체 주문 메뉴 선택 (영업 중·재고 보유 매장)
                </label>
                <select
                  id="b2b-menu"
                  value={selectedB2bMenu?.id ?? ''}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setB2bMenuId(nextId);
                    const nextM = menus.find((m) => m.id === nextId);
                    if (nextM) {
                      setB2bServings((prev) =>
                        Math.min(Math.max(1, prev), Math.max(1, nextM.stock))
                      );
                    }
                  }}
                  className="w-full min-h-[44px] px-3.5 bg-white border border-[#DCE5CF] rounded-xl text-sm"
                >
                  {availableMenus.map((m) => {
                    const st = storeMap.get(m.storeId);
                    return (
                      <option key={m.id} value={m.id}>
                        {st?.name} · {m.name} ({formatWon(m.pricePerPerson)} / 재고{' '}
                        {m.stock}개)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="b2b-slot"
                    className="block text-xs font-bold text-[#141812] mb-1"
                  >
                    오프피크 도착 슬롯
                  </label>
                  <select
                    id="b2b-slot"
                    value={b2bSlot}
                    onChange={(e) => setB2bSlot(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 bg-white border border-[#DCE5CF] rounded-xl text-sm"
                  >
                    {B2B_OFFPEAK_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="b2b-qty"
                    className="block text-xs font-bold text-[#141812] mb-1"
                  >
                    단체 수량 (최대 재고 {selectedB2bMenu?.stock ?? 0}개)
                  </label>
                  <input
                    id="b2b-qty"
                    type="number"
                    min={1}
                    max={Math.max(1, selectedB2bMenu?.stock ?? 1)}
                    value={b2bServings}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setB2bServings(Number.isInteger(val) && val >= 1 ? val : 1);
                    }}
                    className="w-full min-h-[44px] px-3.5 border border-[#DCE5CF] rounded-xl font-mono tabular-nums text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="b2b-note"
                  className="block text-xs font-bold text-[#141812] mb-1"
                >
                  오피스 전달 메모
                </label>
                <input
                  id="b2b-note"
                  type="text"
                  value={b2bNote}
                  onChange={(e) => setB2bNote(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 border border-[#DCE5CF] rounded-xl text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!selectedB2bMenu || availableMenus.length === 0}
              className="w-full min-h-[48px] py-2.5 px-6 bg-[#2E531A] hover:bg-[#4D711D] disabled:bg-[#D4DBD0] text-white text-sm font-semibold rounded-2xl cursor-pointer"
            >
              {formatWon(b2bTotal)} 단체 주문 확정
            </button>
          </form>

          <div className="lg:col-span-5 bg-white border border-[#E6EAE2] rounded-3xl p-5 sm:p-6 space-y-3 shadow-[0_2px_10px_rgba(24,26,24,0.03)]">
            <h3 className="text-base font-bold text-[#141812]">
              견적 및 정산 요약
            </h3>
            {selectedB2bMenu && selectedB2bStore ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between text-[#374033]">
                  <dt>선택 매장</dt>
                  <dd className="font-semibold text-[#141812]">
                    {selectedB2bStore.name}
                  </dd>
                </div>
                <div className="flex justify-between text-[#374033]">
                  <dt>
                    메뉴 금액 ({formatWon(selectedB2bMenu.pricePerPerson)} ×{' '}
                    {b2bServings}인)
                  </dt>
                  <dd className="font-mono tabular-nums">
                    {formatWon(b2bSubtotal)}
                  </dd>
                </div>
                <div className="flex justify-between text-[#374033]">
                  <dt>배달비</dt>
                  <dd className="font-mono tabular-nums">
                    +{formatWon(b2bDeliveryFee)}
                  </dd>
                </div>
                <div className="flex justify-between text-[#4A6B1C]">
                  <dt>플랫폼 중개수수료</dt>
                  <dd className="font-mono tabular-nums font-bold">0원 (0%)</dd>
                </div>
                <div className="pt-2.5 border-t border-[#EBEFEB] flex justify-between font-bold text-[#141812]">
                  <dt>최종 결제액</dt>
                  <dd className="font-mono tabular-nums text-lg text-[#4A6B1C]">
                    {formatWon(b2bTotal)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-[#717870]">주문 가능한 메뉴가 없습니다.</p>
            )}
            <div className="p-3.5 bg-[#EFF5E6] border border-[#DCE5CF] rounded-2xl text-xs text-[#3B5714]">
              접수 즉시 점주 주문 관리에 B2B 오프피크 예약 건으로 표시됩니다.
            </div>
          </div>
        </section>
      )}

      {/* 3. C2C Local Errand & Escrow Tab */}
      {activeTab === SuperAppTab.ERRAND && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Create Errand Form with Prohibited Filter */}
          <form
            onSubmit={handleSubmitErrand}
            className="lg:col-span-5 bg-white border border-[#E6EAE2] rounded-3xl p-5 space-y-4 shadow-[0_2px_10px_rgba(24,26,24,0.03)]"
          >
            <div>
              <h2 className="text-lg font-bold text-[#141812]">
                동네 생활 심부름 요청
              </h2>
              <p className="text-xs text-[#374033] mt-0.5">
                주류·담배 등 제한 품목은 자동 차단되며, 영수증 실비 차액이 정산됩니다.
              </p>
            </div>

            {prohibitedMatches.length > 0 && (
              <div
                role="alert"
                className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2 text-xs text-red-900"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <strong>요청 불가 품목 감지:</strong> ‘
                  {prohibitedMatches.join(', ')}’ 관련 심부름은 접수할 수 없습니다.
                </div>
              </div>
            )}

            {errandError && prohibitedMatches.length === 0 && (
              <div
                role="alert"
                className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800"
              >
                {errandError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#141812] mb-1">
                  심부름 내용
                </label>
                <input
                  type="text"
                  value={errandTitle}
                  onChange={(e) => setErrandTitle(e.target.value)}
                  placeholder="예: 세탁소 정장 수령 또는 편의점 우산 구매"
                  className="w-full min-h-[42px] px-3.5 border border-[#DCE5CF] rounded-xl text-sm"
                />
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {[
                    '세탁소 정장 수령',
                    '동네 약국 밴드·소독약 구매',
                  ].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setErrandTitle(sample)}
                      className="min-h-[28px] px-2.5 py-0.5 bg-[#F7F8F5] border border-[#E6EAE2] rounded-lg text-[11px] text-[#374033] hover:border-[#79A92C] cursor-pointer"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-[#141812] mb-1">
                    카테고리
                  </label>
                  <select
                    value={errandCategory}
                    onChange={(e) => setErrandCategory(e.target.value)}
                    className="w-full min-h-[42px] px-3 bg-white border border-[#DCE5CF] rounded-xl text-xs"
                  >
                    <option value="생활/약국 심부름">생활/약국 심부름</option>
                    <option value="세탁물 수령">세탁물 수령</option>
                    <option value="분리수거/문서전달">분리수거/문서전달</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#141812] mb-1">
                    픽업지 표기
                  </label>
                  <input
                    type="text"
                    value={pickupAlias}
                    onChange={(e) => setPickupAlias(e.target.value)}
                    className="w-full min-h-[42px] px-3 border border-[#DCE5CF] rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-[#141812] mb-1">
                    예상 물품비 (원)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={estimatedItemCost}
                    onChange={(e) =>
                      setEstimatedItemCost(
                        Math.max(0, parseInt(e.target.value, 10) || 0)
                      )
                    }
                    className="w-full min-h-[42px] px-3 border border-[#DCE5CF] rounded-xl font-mono tabular-nums text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#141812] mb-1">
                    이웃 심부름비 (원)
                  </label>
                  <input
                    type="number"
                    min={500}
                    step={500}
                    value={errandFee}
                    onChange={(e) =>
                      setErrandFee(
                        Math.max(500, parseInt(e.target.value, 10) || 500)
                      )
                    }
                    className="w-full min-h-[42px] px-3 border border-[#DCE5CF] rounded-xl font-mono tabular-nums text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#EFF5E6] border border-[#DCE5CF] rounded-2xl flex items-center justify-between text-xs font-bold text-[#3B5714]">
              <span>에스크로 선예치 금액</span>
              <span className="font-mono tabular-nums text-base">
                {formatWon(estimatedItemCost + errandFee)}
              </span>
            </div>

            <button
              type="submit"
              disabled={prohibitedMatches.length > 0}
              className="w-full min-h-[46px] py-2.5 px-5 bg-[#2E531A] hover:bg-[#4D711D] disabled:bg-[#D4DBD0] text-white text-sm font-semibold rounded-2xl cursor-pointer disabled:cursor-not-allowed"
            >
              심부름 등록하기
            </button>
          </form>

          {/* Active Errands & Receipt Reconciliation */}
          <div className="lg:col-span-7 space-y-3.5">
            {errands.map((err) => {
              const receiptVal =
                receiptInputs[err.id] ?? err.actualReceiptCost ?? err.estimatedItemCost;
              const dualOk = dualPhotoChecked[err.id] ?? false;

              return (
                <article
                  key={err.id}
                  className="bg-white border border-[#E6EAE2] rounded-3xl p-5 space-y-3.5 shadow-[0_2px_10px_rgba(24,26,24,0.03)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-[#717870]">
                        {err.category} · {err.pickupAlias} → {err.dropoffAlias}
                      </div>
                      <h3 className="text-base font-bold text-[#141812] mt-0.5">
                        {err.title}
                      </h3>
                      <p className="text-xs text-[#374033] font-mono tabular-nums mt-0.5">
                        선예치 {formatWon(err.escrowTotal)} (예상 물품{' '}
                        {formatWon(err.estimatedItemCost)} + 심부름비{' '}
                        {formatWon(err.errandFee)})
                      </p>
                    </div>
                    <span className="text-xs font-bold text-[#4A6B1C]">
                      {err.status === ErrandStatus.OPEN
                        ? '파트너 매칭 대기'
                        : err.status === ErrandStatus.MATCHED
                          ? '수락 · 안심 보험 적용'
                          : err.status === ErrandStatus.RECEIPT_CHECKED
                            ? '영수증 차액 확인'
                            : '완료됨'}
                    </span>
                  </div>

                  {err.status === ErrandStatus.OPEN && (
                    <div className="pt-2 border-t border-[#EBEFEB] flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-[#374033] flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#2E531A]" />
                        수락 즉시 시간제 안심 보험 적용
                      </span>
                      <button
                        type="button"
                        onClick={() => onAdvanceErrand(err.id, ErrandStatus.MATCHED)}
                        className="min-h-[38px] px-4 py-1.5 bg-[#E5EED4] hover:bg-[#DCE8C8] text-[#3B5714] text-xs font-bold rounded-xl cursor-pointer"
                      >
                        심부름 수락하기
                      </button>
                    </div>
                  )}

                  {err.status === ErrandStatus.MATCHED && (
                    <div className="p-3.5 bg-[#F7F8F5] border border-[#E6EAE2] rounded-2xl space-y-2.5 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-[#141812]">
                        <Receipt className="w-4 h-4 text-[#2E531A]" />
                        <span>영수증 실비 입력 및 정산</span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={receiptVal}
                          onChange={(e) =>
                            setReceiptInputs((prev) => ({
                              ...prev,
                              [err.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                            }))
                          }
                          className="flex-1 min-h-[38px] px-3 bg-white border border-[#DCE5CF] rounded-xl font-mono tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onAdvanceErrand(
                              err.id,
                              ErrandStatus.RECEIPT_CHECKED,
                              receiptVal
                            )
                          }
                          className="min-h-[38px] px-4 py-1.5 bg-[#2E531A] hover:bg-[#4D711D] text-white font-semibold rounded-xl cursor-pointer"
                        >
                          영수증 정산 확인
                        </button>
                      </div>
                    </div>
                  )}

                  {err.status === ErrandStatus.RECEIPT_CHECKED && (
                    <div className="p-3.5 bg-[#EFF5E6] border border-[#DCE5CF] rounded-2xl space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-[#141812]">
                          실제 영수증: {formatWon(err.actualReceiptCost ?? 0)}
                        </span>
                        <span className="font-bold text-[#4A6B1C]">
                          {(err.refundDifference ?? 0) >= 0
                            ? `차액 환불 ${formatWon(err.refundDifference ?? 0)}`
                            : `추가 차액 ${formatWon(Math.abs(err.refundDifference ?? 0))}`}
                        </span>
                      </div>
                      <label className="flex items-center gap-2 text-[#3B5714] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dualOk}
                          onChange={(e) =>
                            setDualPhotoChecked((prev) => ({
                              ...prev,
                              [err.id]: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-[#2E531A]"
                        />
                        <Camera className="w-3.5 h-3.5" />
                        <span>물품 외관 및 도착 확인 완료</span>
                      </label>
                      <button
                        type="button"
                        disabled={!dualOk}
                        onClick={() => onAdvanceErrand(err.id, ErrandStatus.COMPLETED)}
                        className="min-h-[38px] px-4 py-1.5 bg-[#232D1B] disabled:bg-[#D4DBD0] text-white font-semibold rounded-xl cursor-pointer disabled:cursor-not-allowed"
                      >
                        심부름 완료 확정
                      </button>
                    </div>
                  )}

                  {err.status === ErrandStatus.COMPLETED && (
                    <div className="pt-2 border-t border-[#EBEFEB] flex items-center justify-between text-xs text-[#4A6B1C] font-semibold">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        영수증 대조 및 정산 완료
                      </span>
                      <span className="font-mono tabular-nums">
                        영수증 {formatWon(err.actualReceiptCost ?? 0)}
                      </span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
