import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  Camera,
  CheckCircle2,
  Clock,
  Footprints,
  MapPin,
  Receipt,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  B2B_OFFPEAK_SLOTS,
  GROUP_BUY_POOLS,
  PROHIBITED_ERRAND_KEYWORDS,
} from '../data/seedData';
import {
  ErrandRequest,
  ErrandStatus,
  EvidencePhoto,
  MenuItem,
  Order,
  SavedLocation,
  Store,
  SuperAppTab,
} from '../types/alle';
import { readCompressedEvidencePhotos } from '../utils/imageUpload';
import { formatWon, getEffectiveMenuPrice } from '../utils/parser';
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
  onCreateMarketBundleOrder: (payload: {
    items: Array<{ menuId: string; quantity: number }>;
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
    actualReceiptCost?: number,
    receiptPhoto?: EvidencePhoto
  ) => void;
}

export function SuperAppHubView({
  activeTab,
  onChangeTab,
  stores,
  menus,
  errands,
  activeLocation,
  onJoinGroupBuy,
  onCreateB2BOrder,
  onCreateMarketBundleOrder,
  onCreateErrand,
  onAdvanceErrand,
}: SuperAppHubViewProps) {
  const activeOrigin =
    activeLocation?.detailAddress ?? '강남구 역삼동 수령지 A';
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

  // Traditional Market / Alley Multi-Store Bundle state (prioritize 전통시장 / 0원 최소주문 점포)
  const marketBundleCatalog = useMemo(() => {
    const sorted = [...availableMenus].sort((a, b) => {
      const sa = storeMap.get(a.storeId);
      const sb = storeMap.get(b.storeId);
      const aMarket = sa?.name.includes('시장') || sa?.minOrderAmount === 0 ? 1 : 0;
      const bMarket = sb?.name.includes('시장') || sb?.minOrderAmount === 0 ? 1 : 0;
      return bMarket - aMarket;
    });
    const seenStores = new Set<string>();
    const picked: Array<{ menu: MenuItem; store: Store; unitPrice: number }> = [];
    for (const m of sorted) {
      const st = storeMap.get(m.storeId);
      if (!st || seenStores.has(st.id)) continue;
      seenStores.add(st.id);
      picked.push({
        menu: m,
        store: st,
        unitPrice: getEffectiveMenuPrice(m),
      });
      if (picked.length >= 6) break;
    }
    return picked;
  }, [availableMenus, storeMap]);

  const [bundleQtyByMenu, setBundleQtyByMenu] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    if (marketBundleCatalog[0]) init[marketBundleCatalog[0].menu.id] = 1;
    if (marketBundleCatalog[1]) init[marketBundleCatalog[1].menu.id] = 1;
    return init;
  });
  const [bundleNote, setBundleNote] = useState<string>('문 앞 비대면 수령');
  const [bundleError, setBundleError] = useState<string | null>(null);

  const bundleItems = useMemo(
    () =>
      marketBundleCatalog
        .filter((entry) => (bundleQtyByMenu[entry.menu.id] ?? 0) > 0)
        .map((entry) => ({
          ...entry,
          quantity: bundleQtyByMenu[entry.menu.id] ?? 0,
        })),
    [marketBundleCatalog, bundleQtyByMenu]
  );

  const bundleSubtotal = useMemo(
    () =>
      bundleItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [bundleItems]
  );

  // C2C Errand state
  const [errandTitle, setErrandTitle] = useState<string>('약국 일반 상비약 구매 대행');
  const [errandCategory, setErrandCategory] = useState<string>('생활/약국 심부름');
  const [pickupAlias, setPickupAlias] = useState<string>('동네 약국 A');
  const [dropoffAlias, setDropoffAlias] = useState<string>(activeOrigin);
  const [estimatedItemCost, setEstimatedItemCost] = useState<number>(6000);
  const [errandFee, setErrandFee] = useState<number>(2000);
  const [errandError, setErrandError] = useState<string | null>(null);
  const [receiptInputs, setReceiptInputs] = useState<Record<string, number>>({});
  const [receiptPhotos, setReceiptPhotos] = useState<Record<string, EvidencePhoto>>({});
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
      setErrandError(
        '물품 예상액(0원 이상)과 심부름비(500원 이상)를 원 단위 정수로 입력하세요.'
      );
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
    ? getEffectiveMenuPrice(selectedB2bMenu) * Math.max(1, b2bServings)
    : 0;
  const b2bDeliveryFee = selectedB2bStore?.deliveryFee ?? 0;
  const b2bTotal = b2bSubtotal + b2bDeliveryFee;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Clean Local Extension Hub Header */}
      <section className="os-card rounded-3xl p-6 sm:p-7 space-y-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4E6E2A]">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>alle 동네 생활 확장</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#1A1D1A] tracking-tight">
          이웃 공동구매 · 오피스 B2B · 생활 심부름
        </h1>
        <p className="text-xs sm:text-sm text-[#555D51] leading-relaxed">
          배달비를 나누는 반경 300m 공동구매부터 오프피크 단체 예약, 에스크로 기반 동네 심부름까지 한 번에 이용할 수 있습니다.
        </p>
      </section>

      {/* Connected Local Services Dock */}
      <section className="space-y-4">
        <div
          role="tablist"
          aria-label="생활 확장 서비스 선택"
          className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === SuperAppTab.MARKET_BUNDLE}
            onClick={() => onChangeTab(SuperAppTab.MARKET_BUNDLE)}
            className={`min-h-[68px] p-3 rounded-2xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
              activeTab === SuperAppTab.MARKET_BUNDLE
                ? 'bg-[#EAF1E2] border-[#4E6E2A]'
                : 'bg-white border-[#E8ECE4] hover:border-[#4E6E2A]/40'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                activeTab === SuperAppTab.MARKET_BUNDLE
                  ? 'bg-[#4E6E2A] text-white'
                  : 'bg-[#F7F8F5] text-[#687064]'
              }`}
            >
              <ShoppingBasket className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#1A1D1A] truncate">
                시장·골목 묶음
              </div>
              <div className="text-[11px] text-[#687064] truncate">
                한 바구니 1,500원
              </div>
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === SuperAppTab.GROUP_BUY}
            onClick={() => onChangeTab(SuperAppTab.GROUP_BUY)}
            className={`min-h-[68px] p-3 rounded-2xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
              activeTab === SuperAppTab.GROUP_BUY
                ? 'bg-[#EAF1E2] border-[#4E6E2A]'
                : 'bg-white border-[#E8ECE4] hover:border-[#4E6E2A]/40'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                activeTab === SuperAppTab.GROUP_BUY
                  ? 'bg-[#4E6E2A] text-white'
                  : 'bg-[#F7F8F5] text-[#687064]'
              }`}
            >
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#1A1D1A] truncate">
                이웃 묶음
              </div>
              <div className="text-[11px] text-[#687064] truncate">
                배달비 50%
              </div>
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === SuperAppTab.B2B}
            onClick={() => onChangeTab(SuperAppTab.B2B)}
            className={`min-h-[68px] p-3 rounded-2xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
              activeTab === SuperAppTab.B2B
                ? 'bg-[#EAF1E2] border-[#4E6E2A]'
                : 'bg-white border-[#E8ECE4] hover:border-[#4E6E2A]/40'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                activeTab === SuperAppTab.B2B
                  ? 'bg-[#4E6E2A] text-white'
                  : 'bg-[#F7F8F5] text-[#687064]'
              }`}
            >
              <Briefcase className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#1A1D1A] truncate">
                B2B 식사
              </div>
              <div className="text-[11px] text-[#687064] truncate">
                법인 단체
              </div>
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === SuperAppTab.ERRAND}
            onClick={() => onChangeTab(SuperAppTab.ERRAND)}
            className={`min-h-[68px] p-3 rounded-2xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
              activeTab === SuperAppTab.ERRAND
                ? 'bg-[#EAF1E2] border-[#4E6E2A]'
                : 'bg-white border-[#E8ECE4] hover:border-[#4E6E2A]/40'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                activeTab === SuperAppTab.ERRAND
                  ? 'bg-[#4E6E2A] text-white'
                  : 'bg-[#F7F8F5] text-[#687064]'
              }`}
            >
              <Footprints className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#1A1D1A] truncate">
                장보기·심부름
              </div>
              <div className="text-[11px] text-[#687064] truncate">
                실비 정산
              </div>
            </div>
          </button>
        </div>

        {/* Active Extension Panel */}
        {activeTab === SuperAppTab.MARKET_BUNDLE && (
          <div className="os-card rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#1A1D1A]">
                  전국 전통시장 · 골목 가게 한 바구니 묶음
                </h3>
                <p className="text-xs text-[#687064] mt-0.5">
                  광장시장·부평깡통시장·서문시장 등 동네 점포 메뉴를 최소주문금액 없이 한 번에 담고 배달비 1회(1,500원)로 받아보세요.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#EAF1E2] text-[#3D5720] text-xs font-bold">
                최소주문 0원
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {marketBundleCatalog.map(({ menu, store, unitPrice }) => {
                const qty = bundleQtyByMenu[menu.id] ?? 0;
                return (
                  <div
                    key={menu.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-2.5 ${
                      qty > 0
                        ? 'bg-[#EAF1E2]/60 border-[#82B440]'
                        : 'bg-[#F7F8F5] border-[#E8ECE4]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#E8ECE4] shrink-0">
                        <FoodImage
                          src={menu.image}
                          alt={menu.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-[#4E6E2A] truncate">
                          {store.name}
                        </p>
                        <p className="text-xs font-bold text-[#1A1D1A] truncate">
                          {menu.name}
                        </p>
                        <p className="text-xs font-mono font-bold text-[#1A1D1A] tabular-nums">
                          {formatWon(unitPrice)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setBundleQtyByMenu((prev) => ({
                            ...prev,
                            [menu.id]: Math.max(0, (prev[menu.id] ?? 0) - 1),
                          }))
                        }
                        className="w-7 h-7 rounded-lg bg-white border border-[#E8ECE4] text-xs font-bold text-[#1A1D1A] cursor-pointer"
                      >
                        -
                      </button>
                      <span className="w-5 text-center text-xs font-mono font-bold text-[#1A1D1A]">
                        {qty}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setBundleQtyByMenu((prev) => ({
                            ...prev,
                            [menu.id]: Math.min(
                              menu.stock,
                              (prev[menu.id] ?? 0) + 1
                            ),
                          }))
                        }
                        className="w-7 h-7 rounded-lg bg-[#4E6E2A] text-white text-xs font-bold cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl space-y-2">
              <div className="flex items-center justify-between text-xs text-[#687064]">
                <span>선택 품목 ({bundleItems.length}개 매장)</span>
                <span className="font-mono font-semibold text-[#1A1D1A]">
                  {formatWon(bundleSubtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-[#687064]">
                <span>이웃 도보 통합 배달비 (1회 정액)</span>
                <span className="font-mono font-semibold text-[#4E6E2A]">
                  +1,500원
                </span>
              </div>
              <div className="pt-2 border-t border-[#E8ECE4] flex items-center justify-between text-sm font-bold text-[#1A1D1A]">
                <span>총 묶음 결제 예상액</span>
                <span className="font-mono text-[#4E6E2A]">
                  {formatWon(bundleSubtotal + (bundleItems.length > 0 ? 1500 : 0))}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={bundleNote}
                onChange={(e) => setBundleNote(e.target.value)}
                placeholder="배달 요청사항 (예: 문 앞 비대면 수령)"
                className="flex-1 min-h-[42px] px-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-xl text-xs text-[#1A1D1A]"
              />
              <button
                type="button"
                disabled={bundleItems.length === 0}
                onClick={() => {
                  const res = onCreateMarketBundleOrder({
                    items: bundleItems.map((i) => ({
                      menuId: i.menu.id,
                      quantity: i.quantity,
                    })),
                    customerNote: bundleNote.trim(),
                  });
                  if (!res.ok) {
                    setBundleError(res.error ?? '묶음 주문에 실패했습니다.');
                  } else {
                    setBundleError(null);
                  }
                }}
                className="min-h-[42px] px-5 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] text-white text-xs sm:text-sm font-bold rounded-xl cursor-pointer shrink-0"
              >
                한 바구니 묶음 주문하기
              </button>
            </div>

            {bundleError && (
              <p className="text-xs font-semibold text-red-700">{bundleError}</p>
            )}
          </div>
        )}

        {activeTab === SuperAppTab.GROUP_BUY && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-[#1A1D1A]">
                진행 중인 이웃 묶음배달
              </h3>
              <span className="text-xs text-[#687064] tabular-nums">
                매칭 가능 {GROUP_BUY_POOLS.length}건
              </span>
            </div>

            <div className="space-y-3">
              {GROUP_BUY_POOLS.map((pool) => {
                const store = storeMap.get(pool.storeId);
                const menu = menuMap.get(pool.menuId);
                if (!store || !menu) return null;
                const unavailable =
                  !store.isOpen || menu.isSoldOut || menu.stock <= 0;
                const pct = Math.min(
                  100,
                  Math.round(
                    (pool.currentParticipants / pool.targetParticipants) * 100
                  )
                );

                return (
                  <article
                    key={pool.id}
                    className="os-card rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 border border-[#E8ECE4]">
                        <FoodImage
                          src={menu.image}
                          alt={menu.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-[11px] text-[#687064]">
                          {pool.areaRadiusLabel} · {pool.remainingTimeLabel} ·{' '}
                          {pool.currentParticipants}/{pool.targetParticipants}명 참여
                        </div>
                        <h4 className="text-sm sm:text-base font-bold text-[#1A1D1A] truncate">
                          {menu.name}
                        </h4>
                        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                          <span className="text-[#919A8D] line-through">
                            {formatWon(pool.originalDeliveryFee)}
                          </span>
                          <span className="font-bold text-[#4E6E2A]">
                            배달비 {formatWon(pool.sharedDeliveryFee)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full max-w-[200px] bg-[#EAF1E2] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#82B440] rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={unavailable}
                      onClick={() => onJoinGroupBuy(menu.id)}
                      className="min-h-[42px] px-4 py-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] disabled:bg-[#F7F8F5] disabled:text-[#919A8D] text-[#4E6E2A] text-xs sm:text-sm font-semibold rounded-xl whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed transition-colors"
                    >
                      {unavailable
                        ? !store.isOpen
                          ? '영업 중단'
                          : '품절 마감'
                        : '함께 주문'}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === SuperAppTab.B2B && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <form
              onSubmit={handleSubmitB2B}
              className="lg:col-span-7 os-card rounded-3xl p-6 space-y-4"
            >
              <div>
                <h3 className="text-base font-bold text-[#1A1D1A]">
                  B2B 오프피크 단체 선주문
                </h3>
                <p className="text-xs text-[#687064] mt-0.5">
                  여유 시간대에 오피스·팀 단체 주문을 미리 예약합니다.
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
                  <label
                    htmlFor="b2b-menu"
                    className="block text-xs font-semibold text-[#1A1D1A] mb-1"
                  >
                    단체 주문 메뉴
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
                    className="w-full min-h-[42px] px-3.5 bg-white border border-[#E8ECE4] rounded-xl text-xs sm:text-sm"
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
                      className="block text-xs font-semibold text-[#1A1D1A] mb-1"
                    >
                      도착 슬롯
                    </label>
                    <select
                      id="b2b-slot"
                      value={b2bSlot}
                      onChange={(e) => setB2bSlot(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 bg-white border border-[#E8ECE4] rounded-xl text-xs sm:text-sm"
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
                      className="block text-xs font-semibold text-[#1A1D1A] mb-1"
                    >
                      수량 (최대 {selectedB2bMenu?.stock ?? 0}개)
                    </label>
                    <input
                      id="b2b-qty"
                      type="number"
                      min={1}
                      max={Math.max(1, selectedB2bMenu?.stock ?? 1)}
                      value={b2bServings}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setB2bServings(
                          Number.isInteger(val) && val >= 1 ? val : 1
                        );
                      }}
                      className="w-full min-h-[42px] px-3.5 border border-[#E8ECE4] rounded-xl font-mono tabular-nums text-sm font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="b2b-note"
                    className="block text-xs font-semibold text-[#1A1D1A] mb-1"
                  >
                    전달 메모
                  </label>
                  <input
                    id="b2b-note"
                    type="text"
                    value={b2bNote}
                    onChange={(e) => setB2bNote(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 border border-[#E8ECE4] rounded-xl text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!selectedB2bMenu || availableMenus.length === 0}
                className="w-full min-h-[46px] py-2.5 px-5 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] text-white text-sm font-semibold rounded-2xl cursor-pointer transition-colors"
              >
                {formatWon(b2bTotal)} 단체 주문 확정
              </button>
            </form>

            <div className="lg:col-span-5 os-card rounded-3xl p-6 space-y-3.5">
              <h4 className="text-sm font-bold text-[#1A1D1A]">
                법인 정산 요약
              </h4>
              {selectedB2bMenu && selectedB2bStore ? (
                <dl className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between text-[#687064]">
                    <dt>매장</dt>
                    <dd className="font-semibold text-[#1A1D1A]">
                      {selectedB2bStore.name}
                    </dd>
                  </div>
                  <div className="flex justify-between text-[#687064]">
                    <dt>
                      메뉴 ({formatWon(getEffectiveMenuPrice(selectedB2bMenu))} ×{' '}
                      {b2bServings})
                    </dt>
                    <dd className="font-mono tabular-nums text-[#1A1D1A]">
                      {formatWon(b2bSubtotal)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-[#687064]">
                    <dt>배달비</dt>
                    <dd className="font-mono tabular-nums">
                      +{formatWon(b2bDeliveryFee)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-[#4E6E2A]">
                    <dt>음식값 중개수수료</dt>
                    <dd className="font-mono tabular-nums font-semibold">0원</dd>
                  </div>
                  <div className="flex justify-between text-[#687064]">
                    <dt>B2B 정산·관제 서비스 이용료 (3.5% · 기업 정산)</dt>
                    <dd className="font-mono tabular-nums font-semibold text-[#1A1D1A]">
                      {formatWon(Math.round(b2bSubtotal * 0.035))}
                    </dd>
                  </div>
                  <div className="pt-3 border-t border-dashed border-[#D4DCD0] flex justify-between font-bold text-[#1A1D1A]">
                    <dt>최종 결제액</dt>
                    <dd className="font-mono tabular-nums text-lg text-[#4E6E2A]">
                      {formatWon(b2bTotal)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-[#687064]">주문 가능한 메뉴가 없습니다.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === SuperAppTab.ERRAND && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <form
              onSubmit={handleSubmitErrand}
              className="lg:col-span-5 os-card rounded-3xl p-5 space-y-4"
            >
              <div>
                <h3 className="text-base font-bold text-[#1A1D1A]">
                  동네 장보기 · 심부름 요청
                </h3>
                <p className="text-xs text-[#687064] mt-0.5">
                  제한 품목 자동 차단 · 영수증 실비 정산
                </p>
              </div>

              {prohibitedMatches.length > 0 && (
                <div
                  role="alert"
                  className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-900"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>요청 불가 품목:</strong> ‘
                    {prohibitedMatches.join(', ')}’
                  </div>
                </div>
              )}

              {errandError && prohibitedMatches.length === 0 && (
                <div
                  role="alert"
                  className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800"
                >
                  {errandError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1A1D1A] mb-1">
                    요청 내용
                  </label>
                  <input
                    type="text"
                    value={errandTitle}
                    onChange={(e) => setErrandTitle(e.target.value)}
                    placeholder="예: 세탁소 정장 수령 또는 약국 상비약 구매"
                    className="w-full min-h-[40px] px-3 border border-[#E8ECE4] rounded-xl text-xs sm:text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-[#1A1D1A] mb-1">
                      카테고리
                    </label>
                    <select
                      value={errandCategory}
                      onChange={(e) => setErrandCategory(e.target.value)}
                      className="w-full min-h-[40px] px-2.5 bg-white border border-[#E8ECE4] rounded-xl text-xs"
                    >
                      <option value="생활/약국 심부름">생활/약국 심부름</option>
                      <option value="세탁물 수령">세탁물 수령</option>
                      <option value="분리수거/문서전달">분리수거/문서전달</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#1A1D1A] mb-1">
                      픽업지
                    </label>
                    <input
                      type="text"
                      value={pickupAlias}
                      onChange={(e) => setPickupAlias(e.target.value)}
                      className="w-full min-h-[40px] px-2.5 border border-[#E8ECE4] rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-[#1A1D1A] mb-1">
                      예상 물품비
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
                      className="w-full min-h-[40px] px-2.5 border border-[#E8ECE4] rounded-xl font-mono tabular-nums text-xs sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#1A1D1A] mb-1">
                      심부름비
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
                      className="w-full min-h-[40px] px-2.5 border border-[#E8ECE4] rounded-xl font-mono tabular-nums text-xs sm:text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold text-[#4E6E2A] pt-1">
                <span>에스크로 선예치</span>
                <span className="font-mono tabular-nums text-sm">
                  {formatWon(estimatedItemCost + errandFee)}
                </span>
              </div>

              <button
                type="submit"
                disabled={prohibitedMatches.length > 0}
                className="w-full min-h-[44px] py-2 px-4 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] text-white text-xs sm:text-sm font-semibold rounded-2xl cursor-pointer disabled:cursor-not-allowed"
              >
                심부름 등록하기
              </button>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {errands.map((err) => {
                const receiptVal =
                  receiptInputs[err.id] ??
                  err.actualReceiptCost ??
                  err.estimatedItemCost;
                const dualOk = dualPhotoChecked[err.id] ?? false;

                return (
                  <article
                    key={err.id}
                    className="os-card rounded-3xl p-5 space-y-3.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-xs text-[#687064]">
                          {err.category} · {err.pickupAlias} → {err.dropoffAlias}
                        </div>
                        <h4 className="text-sm sm:text-base font-bold text-[#1A1D1A] mt-0.5">
                          {err.title}
                        </h4>
                        <p className="text-xs text-[#687064] font-mono tabular-nums mt-0.5">
                          선예치 {formatWon(err.escrowTotal)}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-[#4E6E2A]">
                        {err.status === ErrandStatus.OPEN
                          ? '매칭 대기'
                          : err.status === ErrandStatus.MATCHED
                            ? '안심 보험 적용'
                            : err.status === ErrandStatus.RECEIPT_CHECKED
                              ? '영수증 확인'
                              : '완료됨'}
                      </span>
                    </div>

                    {err.status === ErrandStatus.OPEN && (
                      <div className="pt-2.5 border-t border-[#E8ECE4] flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-[#687064] flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#4E6E2A]" />
                          시간제 안심 보험 적용
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onAdvanceErrand(err.id, ErrandStatus.MATCHED)
                          }
                          className="min-h-[36px] px-3.5 py-1.5 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#4E6E2A] text-xs font-semibold rounded-xl cursor-pointer"
                        >
                          심부름 수락
                        </button>
                      </div>
                    )}

                    {err.status === ErrandStatus.MATCHED && (
                      <div className="pt-2.5 border-t border-[#E8ECE4] space-y-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 font-semibold text-[#1A1D1A]">
                            <Receipt className="w-3.5 h-3.5 text-[#4E6E2A]" />
                            <span>영수증 사진 OCR · 실비 정산</span>
                          </span>
                          <label className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] font-bold inline-flex items-center gap-1 cursor-pointer">
                            <Camera className="w-3.5 h-3.5" />
                            <span>
                              {receiptPhotos[err.id] ? '영수증 재첨부' : '영수증 사진 첨부'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const loaded = await readCompressedEvidencePhotos(e, 0, 1);
                                if (loaded[0]) {
                                  setReceiptPhotos((prev) => ({
                                    ...prev,
                                    [err.id]: loaded[0],
                                  }));
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                        {receiptPhotos[err.id] && (
                          <div className="flex items-center gap-2 p-2 rounded-xl bg-[#F7F8F5] border border-[#D4E1C5]">
                            <img
                              src={receiptPhotos[err.id].dataUrl}
                              alt={receiptPhotos[err.id].name}
                              className="w-12 h-12 rounded-lg object-cover border border-[#D4E1C5] shrink-0"
                            />
                            <div className="min-w-0 text-[11px] text-[#3D5720] font-semibold">
                              ✓ 영수증 첨부 완료 · 실비 금액 확인 후 정산을 확정하세요.
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={receiptVal}
                            onChange={(e) =>
                              setReceiptInputs((prev) => ({
                                ...prev,
                                [err.id]: Math.max(
                                  0,
                                  parseInt(e.target.value, 10) || 0
                                ),
                              }))
                            }
                            className="flex-1 min-h-[38px] px-3 bg-[#F7F8F5] border border-[#E8ECE4] rounded-xl font-mono tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              onAdvanceErrand(
                                err.id,
                                ErrandStatus.RECEIPT_CHECKED,
                                receiptVal,
                                receiptPhotos[err.id]
                              )
                            }
                            className="min-h-[38px] px-4 py-1.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white font-semibold rounded-xl cursor-pointer"
                          >
                            정산 확인
                          </button>
                        </div>
                      </div>
                    )}

                    {err.status === ErrandStatus.RECEIPT_CHECKED && (
                      <div className="pt-2.5 border-t border-[#E8ECE4] space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#1A1D1A]">
                            영수증 {formatWon(err.actualReceiptCost ?? 0)}
                          </span>
                          <span className="font-semibold text-[#4E6E2A]">
                            {(err.refundDifference ?? 0) >= 0
                              ? `차액 환불 ${formatWon(err.refundDifference ?? 0)}`
                              : `추가 차액 ${formatWon(Math.abs(err.refundDifference ?? 0))}`}
                          </span>
                        </div>
                        {err.receiptPhoto && (
                          <img
                            src={err.receiptPhoto.dataUrl}
                            alt={err.receiptPhoto.name}
                            className="w-16 h-16 rounded-xl object-cover border border-[#D4E1C5]"
                          />
                        )}
                        <label className="flex items-center gap-2 text-[#555E52] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={dualOk}
                            onChange={(e) =>
                              setDualPhotoChecked((prev) => ({
                                ...prev,
                                [err.id]: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 accent-[#4E6E2A]"
                          />
                          <Camera className="w-3.5 h-3.5" />
                          <span>물품 외관 및 도착 확인 완료</span>
                        </label>
                        <button
                          type="button"
                          disabled={!dualOk}
                          onClick={() =>
                            onAdvanceErrand(err.id, ErrandStatus.COMPLETED)
                          }
                          className="min-h-[38px] px-4 py-1.5 bg-[#1A1D1A] disabled:bg-[#D4DCD0] text-white font-semibold rounded-xl cursor-pointer disabled:cursor-not-allowed"
                        >
                          완료 확정
                        </button>
                      </div>
                    )}

                    {err.status === ErrandStatus.COMPLETED && (
                      <div className="pt-2.5 border-t border-[#E8ECE4] flex items-center justify-between text-xs text-[#4E6E2A] font-semibold">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          영수증 정산 완료
                        </span>
                        <span className="font-mono tabular-nums">
                          {formatWon(err.actualReceiptCost ?? 0)}
                        </span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
