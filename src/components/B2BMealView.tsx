import { FormEvent, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Search,
  Star,
  X,
} from 'lucide-react';
import { B2B_GENERAL_SLOTS, B2B_OFFPEAK_SLOTS } from '../data/seedData';
import {
  B2BDocumentInfo,
  B2BDocumentType,
  MenuItem,
  Order,
  PaymentMethod,
  Review,
  ReviewReply,
  SavedLocation,
  Store,
} from '../types/alle';
import {
  formatWon,
  getEffectiveMenuPrice,
  isStoreDeliverableToLocation,
} from '../utils/parser';
import { B2B_SERVICE_FEE_RATE } from '../utils/pricing';
import { B2BStatementModal } from './B2BStatementModal';
import { FoodImage } from './FoodImage';
import { MenuDetailReviewModal } from './MenuDetailReviewModal';

interface B2BMealViewProps {
  stores: Store[];
  menus: MenuItem[];
  orders: Order[];
  reviews?: Review[];
  reviewReplies?: Record<string, ReviewReply>;
  activeLocation?: SavedLocation;
  walletBalance: number;
  onBackToHome: () => void;
  onGoToOrderStatus: () => void;
  onCreateB2BOrder: (payload: {
    menuId: string;
    servings: number;
    reservationSlot: string;
    customerNote: string;
    paymentMethod: PaymentMethod;
    paymentMethodLabel: string;
    b2bDocumentInfo?: B2BDocumentInfo | null;
  }) => { ok: boolean; error?: string; order?: Order };
}

type SlotMode = 'offpeak' | 'general' | 'custom';

const CARD_ISSUERS = ['신한카드', '삼성카드', '현대카드', 'KB국민카드', '하나카드'];
const BANK_OPTIONS = ['기업은행', '국민은행', '신한은행', '우리은행', '농협은행'];

function formatNowDisplay(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function B2BMealView({
  stores,
  menus,
  orders,
  reviews = [],
  reviewReplies = {},
  activeLocation,
  walletBalance,
  onBackToHome,
  onGoToOrderStatus,
  onCreateB2BOrder,
}: B2BMealViewProps) {
  const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const menuMap = useMemo(() => new Map(menus.map((m) => [m.id, m])), [menus]);

  const availableMenus = useMemo(
    () =>
      menus.filter((m) => {
        const st = storeMap.get(m.storeId);
        return Boolean(st?.isOpen && !m.isSoldOut && m.stock >= 1);
      }),
    [menus, storeMap]
  );

  const [b2bSearch, setB2bSearch] = useState<string>('');
  const [b2bCategory, setB2bCategory] = useState<string>('전체');
  const [b2bNearbyOnly, setB2bNearbyOnly] = useState<boolean>(true);
  const [detailMenuId, setDetailMenuId] = useState<string | null>(null);

  const b2bCategories = useMemo(
    () => [
      '전체',
      '한식/국밥/찜',
      '분식/야식',
      '중식/아시안',
      '일식/돈가스',
      '치킨/피자/버거',
      '카페/디저트',
    ],
    []
  );

  const filteredB2bMenus = useMemo(() => {
    const q = b2bSearch.trim().toLowerCase();
    return availableMenus.filter((m) => {
      const st = storeMap.get(m.storeId);
      if (!st) return false;
      if (
        b2bNearbyOnly &&
        activeLocation &&
        !isStoreDeliverableToLocation(st, activeLocation)
      ) {
        return false;
      }
      if (b2bCategory !== '전체' && st.categoryGroup !== b2bCategory) {
        return false;
      }
      if (q) {
        const hay = `${m.name} ${st.name} ${st.category} ${st.areaLabel} ${m.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [availableMenus, storeMap, b2bNearbyOnly, activeLocation, b2bCategory, b2bSearch]);

  const [b2bMenuId, setB2bMenuId] = useState<string>(availableMenus[0]?.id ?? 'm1');
  const selectedB2bMenu =
    filteredB2bMenus.find((m) => m.id === b2bMenuId) ??
    filteredB2bMenus[0] ??
    availableMenus.find((m) => m.id === b2bMenuId) ??
    availableMenus[0];
  const selectedB2bStore = selectedB2bMenu
    ? storeMap.get(selectedB2bMenu.storeId)
    : undefined;

  const [b2bServings, setB2bServings] = useState<number>(
    Math.min(5, Math.max(1, selectedB2bMenu?.stock ?? 1))
  );

  // Flexible Arrival Time Slot State
  const [slotMode, setSlotMode] = useState<SlotMode>('general');
  const [offpeakSlot, setOffpeakSlot] = useState<string>(B2B_OFFPEAK_SLOTS[0]);
  const [generalSlot, setGeneralSlot] = useState<string>(B2B_GENERAL_SLOTS[0]);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [customDate, setCustomDate] = useState<string>(todayIso);
  const [customTime, setCustomTime] = useState<string>('12:00');

  const resolvedReservationSlot =
    slotMode === 'offpeak'
      ? offpeakSlot
      : slotMode === 'general'
        ? generalSlot
        : `${customDate} ${customTime} 도착 (직접 지정)`;

  const [b2bNote, setB2bNote] = useState<string>(
    `${activeLocation?.detailAddress ?? '오피스 로비'} 앞 수령`
  );

  // Direct Payment State
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('corporate_card');
  const [cardIssuer, setCardIssuer] = useState<string>(CARD_ISSUERS[0]);
  const [bankName, setBankName] = useState<string>(BANK_OPTIONS[0]);

  // Corporate Document Support State
  const [requestedDocs, setRequestedDocs] = useState<B2BDocumentType[]>([
    'transaction_statement',
  ]);
  const [companyName, setCompanyName] = useState<string>('(주)바로테크');
  const [businessNumber, setBusinessNumber] = useState<string>('123-45-67890');
  const [representativeOrDept, setRepresentativeOrDept] =
    useState<string>('경영지원팀');
  const [contactEmail, setContactEmail] = useState<string>('finance@baro.kr');

  const [b2bError, setB2bError] = useState<string | null>(null);
  const [statementOrder, setStatementOrder] = useState<Order | null>(null);

  const detailMenu = detailMenuId ? menuMap.get(detailMenuId) ?? null : null;
  const detailStore = detailMenu ? storeMap.get(detailMenu.storeId) ?? null : null;

  const b2bSubtotal = selectedB2bMenu
    ? getEffectiveMenuPrice(selectedB2bMenu) * b2bServings
    : 0;
  const b2bDeliveryFee = selectedB2bStore?.deliveryFee ?? 0;
  const b2bServiceFee = Math.round(b2bSubtotal * B2B_SERVICE_FEE_RATE);
  const b2bTotal = b2bSubtotal + b2bDeliveryFee + b2bServiceFee;

  const paymentOptions: Array<{
    id: PaymentMethod;
    title: string;
    desc: string;
  }> = [
    { id: 'corporate_card', title: '법인카드', desc: '즉시 승인 · 전표' },
    { id: 'personal_card', title: '개인카드', desc: '일반 신용/체크' },
    { id: 'bank_transfer', title: '계좌이체', desc: '실시간 이체' },
    { id: 'b2b_meal_point', title: '기업 식대 포인트', desc: '월말 법인 정산' },
    {
      id: 'alle_pay',
      title: 'Baro페이',
      desc: `잔액 ${formatWon(walletBalance)} · 1.5%`,
    },
  ];

  const resolvedPaymentLabel = useMemo(() => {
    if (paymentMethod === 'corporate_card') return `법인카드 (${cardIssuer})`;
    if (paymentMethod === 'personal_card') return `개인카드 (${cardIssuer})`;
    if (paymentMethod === 'bank_transfer') return `계좌이체 (${bankName})`;
    if (paymentMethod === 'b2b_meal_point') return '기업 식대 포인트';
    return 'Baro페이 잔액';
  }, [paymentMethod, cardIssuer, bankName]);

  const allePayInsufficient =
    paymentMethod === 'alle_pay' && walletBalance < b2bTotal;

  const toggleDocType = (docType: B2BDocumentType) => {
    setRequestedDocs((prev) =>
      prev.includes(docType)
        ? prev.filter((d) => d !== docType)
        : [...prev, docType]
    );
  };

  const b2bOrders = useMemo(
    () => orders.filter((o) => o.isB2B),
    [orders]
  );

  const handleSubmitB2B = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedB2bMenu) {
      setB2bError('주문 가능한 메뉴를 선택해 주세요.');
      return;
    }
    if (!Number.isInteger(b2bServings) || b2bServings < 1) {
      setB2bError('수량은 1 이상의 정수로 입력해 주세요.');
      return;
    }
    if (b2bServings > selectedB2bMenu.stock) {
      setB2bError(`남은 재고(${selectedB2bMenu.stock}개) 이하로 입력해 주세요.`);
      return;
    }
    if (slotMode === 'custom' && (!customDate || !customTime)) {
      setB2bError('희망 도착 날짜와 시간을 모두 선택해 주세요.');
      return;
    }
    if (allePayInsufficient) {
      setB2bError(
        `Baro페이 잔액(${formatWon(walletBalance)})이 부족합니다. 다른 결제 수단을 선택해 주세요.`
      );
      return;
    }
    if (
      requestedDocs.length > 0 &&
      (!companyName.trim() || !businessNumber.trim())
    ) {
      setB2bError(
        '거래명세표·법인 서류 발급을 위해 회사/기관명과 사업자등록번호를 입력해 주세요.'
      );
      return;
    }

    const docInfo: B2BDocumentInfo | null =
      requestedDocs.length > 0
        ? {
            companyName: companyName.trim(),
            businessNumber: businessNumber.trim(),
            representativeOrDept: representativeOrDept.trim() || undefined,
            contactEmail: contactEmail.trim() || 'finance@baro.kr',
            requestedDocs,
            issuedAt: formatNowDisplay(),
            statementNumber: `STMT-${Date.now().toString().slice(-6)}`,
          }
        : null;

    const res = onCreateB2BOrder({
      menuId: selectedB2bMenu.id,
      servings: b2bServings,
      reservationSlot: resolvedReservationSlot,
      customerNote: b2bNote,
      paymentMethod,
      paymentMethodLabel: resolvedPaymentLabel,
      b2bDocumentInfo: docInfo,
    });

    if (!res.ok) {
      setB2bError(res.error ?? 'B2B 주문 등록에 실패했습니다.');
    } else {
      setB2bError(null);
      if (res.order) {
        setStatementOrder(res.order);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#1A1D1A] text-white rounded-3xl p-5 sm:p-6 border border-[#3A4038] flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4E1C5] hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>홈으로 돌아가기</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#4E6E2A] text-xs font-extrabold">
              🏢 B2B 기업 식사
            </span>
            <span className="text-xs text-[#C8D0C4]">
              중개수수료 0% 매장 동일가 · 원하는 시간 예약 · 즉시 결제
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
            B2B 기업 단체 선주문 · 법인 증빙 센터
          </h1>
          <p className="text-xs sm:text-sm text-[#C8D0C4]">
            오프피크부터 점심·저녁 원하는 시간 지정까지 자유롭게 예약하고, 결제와 동시에 거래명세표·지출 증빙을 확인하세요.
          </p>
        </div>

        <button
          type="button"
          onClick={onGoToOrderStatus}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Briefcase className="w-4 h-4 text-[#82B440]" />
          <span>전체 주문 내역</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Form */}
        <form
          onSubmit={handleSubmitB2B}
          className="lg:col-span-7 os-card rounded-3xl p-5 sm:p-6 space-y-5"
        >
          <div>
            <h2 className="text-lg font-extrabold text-[#1A1D1A]">
              1. 메뉴 · 도착 시간 · 결제 · 법인 서류 설정
            </h2>
            <p className="text-xs sm:text-sm text-[#687064] mt-0.5">
              주문 확정 전에 결제 수단과 거래명세표 발급 정보를 바로 지정해 즉시 결제합니다.
            </p>
          </div>

          {b2bError && (
            <div
              role="alert"
              className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs sm:text-sm font-medium text-red-800"
            >
              {b2bError}
            </div>
          )}

          {/* Menu Search & List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="b2b-menu-search"
                className="block text-sm font-bold text-[#1A1D1A]"
              >
                단체 주문 메뉴 선택 ({filteredB2bMenus.length}개)
              </label>
              <button
                type="button"
                onClick={() => setB2bNearbyOnly((prev) => !prev)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                  b2bNearbyOnly
                    ? 'bg-[#EAF1E2] border-[#4E6E2A] text-[#3D5720]'
                    : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#687064]'
                }`}
              >
                {b2bNearbyOnly
                  ? `내 주변(${activeLocation?.areaName.split(' ').slice(-1)[0] ?? '기본'})만`
                  : '전체 지역'}
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-[#687064] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="b2b-menu-search"
                type="text"
                value={b2bSearch}
                onChange={(e) => setB2bSearch(e.target.value)}
                placeholder="메뉴명 · 매장명 · 동네 검색 (예: 김치찌개, 국밥, 도시락)"
                className="w-full min-h-[42px] pl-9 pr-9 bg-white border border-[#E8ECE4] rounded-xl text-sm focus:outline-none focus:border-[#4E6E2A]"
              />
              {b2bSearch && (
                <button
                  type="button"
                  onClick={() => setB2bSearch('')}
                  aria-label="검색어 지우기"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#687064] hover:text-[#1A1D1A] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {b2bCategories.map((cat) => {
                const active = b2bCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setB2bCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                        : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#555E52] hover:border-[#82B440]'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            <div className="max-h-56 overflow-y-auto pr-1 space-y-2 rounded-2xl border border-[#E8ECE4] bg-[#F7F8F5] p-2">
              {filteredB2bMenus.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#687064] space-y-2">
                  <p>조건에 맞는 단체 주문 메뉴가 없습니다.</p>
                  {b2bNearbyOnly && (
                    <button
                      type="button"
                      onClick={() => setB2bNearbyOnly(false)}
                      className="px-3 py-1.5 rounded-xl bg-white border border-[#DCE7CF] text-[#3D5720] font-bold cursor-pointer"
                    >
                      전체 지역에서 찾기
                    </button>
                  )}
                </div>
              ) : (
                filteredB2bMenus.slice(0, 60).map((m) => {
                  const st = storeMap.get(m.storeId);
                  if (!st) return null;
                  const isSelected = selectedB2bMenu?.id === m.id;
                  const reviewCnt = reviews.filter((r) => r.menuId === m.id).length;
                  return (
                    <div
                      key={m.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setB2bMenuId(m.id);
                        setB2bServings((prev) =>
                          Math.min(Math.max(1, prev), Math.max(1, m.stock))
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setB2bMenuId(m.id);
                          setB2bServings((prev) =>
                            Math.min(Math.max(1, prev), Math.max(1, m.stock))
                          );
                        }
                      }}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#EAF1E2] border-[#4E6E2A] ring-1 ring-[#4E6E2A]/25'
                          : 'bg-white border-[#E8ECE4] hover:border-[#82B440]'
                      }`}
                    >
                      <FoodImage
                        src={m.image}
                        alt={m.name}
                        className="w-12 h-12 rounded-xl object-cover shrink-0 border border-[#E8ECE4]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-xs text-[#687064]">
                          <span className="truncate font-semibold">{st.name}</span>
                          <span className="inline-flex items-center gap-0.5 text-[#1A1D1A] font-bold shrink-0">
                            <Star className="w-3 h-3 fill-[#82B440] text-[#82B440]" />
                            {(st.rating ?? 4.9).toFixed(1)}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-[#1A1D1A] truncate">
                          {m.name}
                        </div>
                        <div className="text-xs text-[#4E6E2A] font-bold tabular-nums">
                          {formatWon(getEffectiveMenuPrice(m))} · 재고 {m.stock}개
                          {reviewCnt > 0 ? ` · 리뷰 ${reviewCnt}건` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailMenuId(m.id);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#F0F3EC] border border-[#DCE7CF] text-xs font-bold text-[#3D5720] shrink-0 cursor-pointer"
                      >
                        상세 · 리뷰
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Flexible Arrival Time Selector */}
          <div className="p-4 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-[#1A1D1A] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#4E6E2A]" />
                <span>도착 시간 선택 (자유 예약)</span>
              </span>
              <span className="text-xs font-bold text-[#4E6E2A]">
                {resolvedReservationSlot}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'general', label: '점심·저녁 일반' },
                  { id: 'offpeak', label: '오프피크' },
                  { id: 'custom', label: '직접 시간 지정' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSlotMode(m.id)}
                  className={`min-h-[40px] px-2.5 py-1.5 rounded-xl border text-xs sm:text-sm font-bold cursor-pointer transition-colors ${
                    slotMode === m.id
                      ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                      : 'bg-white border-[#E8ECE4] text-[#555E52] hover:border-[#82B440]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {slotMode === 'general' && (
              <select
                aria-label="점심·저녁 일반 도착 시간"
                value={generalSlot}
                onChange={(e) => setGeneralSlot(e.target.value)}
                className="w-full min-h-[42px] px-3.5 bg-white border border-[#D4E1C5] rounded-xl text-sm font-semibold text-[#1A1D1A]"
              >
                {B2B_GENERAL_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            )}

            {slotMode === 'offpeak' && (
              <select
                aria-label="오프피크 도착 시간"
                value={offpeakSlot}
                onChange={(e) => setOffpeakSlot(e.target.value)}
                className="w-full min-h-[42px] px-3.5 bg-white border border-[#D4E1C5] rounded-xl text-sm font-semibold text-[#1A1D1A]"
              >
                {B2B_OFFPEAK_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            )}

            {slotMode === 'custom' && (
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="b2b-custom-date"
                    className="block text-xs font-semibold text-[#555E52] mb-1"
                  >
                    도착 날짜
                  </label>
                  <input
                    id="b2b-custom-date"
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 bg-white border border-[#D4E1C5] rounded-xl text-sm font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="b2b-custom-time"
                    className="block text-xs font-semibold text-[#555E52] mb-1"
                  >
                    도착 시간
                  </label>
                  <input
                    id="b2b-custom-time"
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full min-h-[42px] px-3 bg-white border border-[#D4E1C5] rounded-xl text-sm font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Quantity & Delivery Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="b2b-qty"
                className="block text-xs sm:text-sm font-bold text-[#1A1D1A] mb-1"
              >
                단체 수량 (최대 {selectedB2bMenu?.stock ?? 0}개)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setB2bServings((q) => Math.max(1, q - 1))}
                  aria-label="수량 감소"
                  className="w-10 h-10 rounded-xl border border-[#E8ECE4] bg-[#F7F8F5] font-bold text-base cursor-pointer"
                >
                  -
                </button>
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
                  className="flex-1 min-h-[42px] px-3 border border-[#E8ECE4] rounded-xl text-center font-mono tabular-nums text-sm font-bold"
                />
                <button
                  type="button"
                  onClick={() =>
                    setB2bServings((q) =>
                      Math.min(Math.max(1, selectedB2bMenu?.stock ?? 1), q + 1)
                    )
                  }
                  aria-label="수량 증가"
                  className="w-10 h-10 rounded-xl border border-[#E8ECE4] bg-[#F7F8F5] font-bold text-base cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="b2b-note"
                className="block text-xs sm:text-sm font-bold text-[#1A1D1A] mb-1"
              >
                전달 메모 · 수령 장소
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

          {/* Direct Payment Selection */}
          <div className="p-4 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#1A1D1A] flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-[#4E6E2A]" />
                <span>결제 수단 선택 (주문 확정과 동시에 바로 결제)</span>
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {paymentOptions.map((opt) => {
                const active = paymentMethod === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPaymentMethod(opt.id)}
                    aria-pressed={active}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-[#EAF1E2] border-[#4E6E2A] ring-1 ring-[#4E6E2A]/25'
                        : 'bg-white border-[#E8ECE4] hover:border-[#82B440]'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-extrabold text-[#1A1D1A]">
                      {opt.title}
                    </div>
                    <div className="text-[11px] text-[#555E52] mt-0.5">
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            {(paymentMethod === 'corporate_card' ||
              paymentMethod === 'personal_card') && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs font-bold text-[#555E52] mr-1">
                  카드사 선택:
                </span>
                {CARD_ISSUERS.map((issuer) => (
                  <button
                    key={issuer}
                    type="button"
                    onClick={() => setCardIssuer(issuer)}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer ${
                      cardIssuer === issuer
                        ? 'bg-[#1A1D1A] border-[#1A1D1A] text-white'
                        : 'bg-white border-[#E8ECE4] text-[#555E52]'
                    }`}
                  >
                    {issuer}
                  </button>
                ))}
              </div>
            )}

            {paymentMethod === 'bank_transfer' && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs font-bold text-[#555E52] mr-1">
                  이체 은행:
                </span>
                {BANK_OPTIONS.map((bank) => (
                  <button
                    key={bank}
                    type="button"
                    onClick={() => setBankName(bank)}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer ${
                      bankName === bank
                        ? 'bg-[#1A1D1A] border-[#1A1D1A] text-white'
                        : 'bg-white border-[#E8ECE4] text-[#555E52]'
                    }`}
                  >
                    {bank}
                  </button>
                ))}
              </div>
            )}

            {allePayInsufficient && (
              <p className="text-xs font-bold text-red-700">
                Baro페이 잔액({formatWon(walletBalance)})이 결제 금액(
                {formatWon(b2bTotal)})보다 부족합니다.
              </p>
            )}
          </div>

          {/* Corporate Documents Section */}
          <div className="p-4 rounded-2xl bg-white border border-[#D4E1C5] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-[#1A1D1A] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#4E6E2A]" />
                <span>법인 증빙 서류 지원 (거래명세표 등)</span>
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'transaction_statement', label: '거래명세표 자동 발급' },
                  { id: 'tax_invoice', label: '전자세금계산서 발행 요청' },
                  { id: 'expense_receipt', label: '법인 지출결의서 영수증' },
                ] as const
              ).map((docOpt) => {
                const checked = requestedDocs.includes(docOpt.id);
                return (
                  <button
                    key={docOpt.id}
                    type="button"
                    onClick={() => toggleDocType(docOpt.id)}
                    aria-pressed={checked}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                      checked
                        ? 'bg-[#EAF1E2] border-[#4E6E2A] text-[#3D5720]'
                        : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#687064]'
                    }`}
                  >
                    {checked ? '✓ ' : '+ '}
                    {docOpt.label}
                  </button>
                );
              })}
            </div>

            {requestedDocs.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label
                    htmlFor="b2b-company-name"
                    className="block text-xs font-semibold text-[#555E52] mb-1"
                  >
                    회사 / 기관명 *
                  </label>
                  <input
                    id="b2b-company-name"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="예: (주)바로테크"
                    className="w-full min-h-[40px] px-3 border border-[#E8ECE4] rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="b2b-biz-no"
                    className="block text-xs font-semibold text-[#555E52] mb-1"
                  >
                    사업자등록번호 *
                  </label>
                  <input
                    id="b2b-biz-no"
                    type="text"
                    value={businessNumber}
                    onChange={(e) => setBusinessNumber(e.target.value)}
                    placeholder="예: 123-45-67890"
                    className="w-full min-h-[40px] px-3 border border-[#E8ECE4] rounded-xl text-sm font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="b2b-dept"
                    className="block text-xs font-semibold text-[#555E52] mb-1"
                  >
                    담당자 / 부서명
                  </label>
                  <input
                    id="b2b-dept"
                    type="text"
                    value={representativeOrDept}
                    onChange={(e) => setRepresentativeOrDept(e.target.value)}
                    placeholder="예: 경영지원팀"
                    className="w-full min-h-[40px] px-3 border border-[#E8ECE4] rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="b2b-email"
                    className="block text-xs font-semibold text-[#555E52] mb-1"
                  >
                    서류 수신 이메일
                  </label>
                  <input
                    id="b2b-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="예: finance@company.co.kr"
                    className="w-full min-h-[40px] px-3 border border-[#E8ECE4] rounded-xl text-sm font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={
              !selectedB2bMenu || availableMenus.length === 0 || allePayInsufficient
            }
            className="w-full min-h-[50px] py-3 px-5 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] text-white text-sm sm:text-base font-extrabold rounded-2xl cursor-pointer transition-colors"
          >
            {formatWon(b2bTotal)} ({resolvedPaymentLabel}) 바로 결제 · 주문 확정
          </button>
        </form>

        {/* Right Summary & Statements Archive */}
        <div className="lg:col-span-5 space-y-4">
          <div className="os-card rounded-3xl p-5 sm:p-6 space-y-4">
            <h3 className="text-base font-extrabold text-[#1A1D1A]">
              선택 메뉴 & 법인 정산 요약
            </h3>
            {selectedB2bMenu && selectedB2bStore ? (
              <>
                <div className="p-3 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] flex items-center gap-3">
                  <FoodImage
                    src={selectedB2bMenu.image}
                    alt={selectedB2bMenu.name}
                    className="w-16 h-16 rounded-xl object-cover shrink-0 border border-[#E8ECE4]"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-xs font-medium text-[#687064] truncate">
                      {selectedB2bStore.name} · ★{' '}
                      {(selectedB2bStore.rating ?? 4.9).toFixed(1)}
                    </div>
                    <div className="text-sm sm:text-base font-bold text-[#1A1D1A] truncate">
                      {selectedB2bMenu.name}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailMenuId(selectedB2bMenu.id)}
                      className="text-xs font-bold text-[#4E6E2A] hover:underline cursor-pointer"
                    >
                      이미지 · 리뷰 자세히 보기 →
                    </button>
                  </div>
                </div>

                <dl className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between text-[#687064]">
                    <dt>도착 예약 시간</dt>
                    <dd className="font-bold text-[#1A1D1A]">
                      {resolvedReservationSlot}
                    </dd>
                  </div>
                  <div className="flex justify-between text-[#687064]">
                    <dt>결제 수단</dt>
                    <dd className="font-bold text-[#3D5720]">
                      {resolvedPaymentLabel}
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
                    <dd className="font-mono tabular-nums font-bold">0원</dd>
                  </div>
                  <div className="flex justify-between text-[#687064]">
                    <dt>B2B 정산·관제 이용료 (3.5%)</dt>
                    <dd className="font-mono tabular-nums font-semibold text-[#1A1D1A]">
                      +{formatWon(b2bServiceFee)}
                    </dd>
                  </div>
                  <div className="pt-3 border-t border-dashed border-[#D4DCD0] flex justify-between font-extrabold text-[#1A1D1A]">
                    <dt>최종 결제액</dt>
                    <dd className="font-mono tabular-nums text-lg sm:text-xl text-[#4E6E2A]">
                      {formatWon(b2bTotal)}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-xs text-[#687064]">주문 가능한 메뉴가 없습니다.</p>
            )}
          </div>

          {/* Past / Recent B2B Orders & Statements */}
          <div className="os-card rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-[#1A1D1A]">
                최근 B2B 단체 주문 · 거래명세표
              </h4>
              <span className="text-xs font-mono text-[#687064]">
                {b2bOrders.length}건
              </span>
            </div>

            {b2bOrders.length === 0 ? (
              <p className="text-xs text-[#687064] py-2">
                주문을 확정하면 이 곳과 주문내역에서 거래명세표를 바로 발급·출력할 수 있습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {b2bOrders.slice(0, 5).map((ord) => (
                  <div
                    key={ord.id}
                    className="p-3 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] flex items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A1D1A] truncate">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
                        <span className="truncate">
                          {ord.menuName} ({ord.servings}개)
                        </span>
                      </div>
                      <div className="text-[11px] text-[#687064] truncate mt-0.5">
                        {ord.orderCode} · {formatWon(ord.totalAmount)} ·{' '}
                        {ord.paymentMethodLabel || '법인 결제'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStatementOrder(ord)}
                      className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white hover:bg-[#EAF1E2] border border-[#D4E1C5] text-[#3D5720] text-xs font-bold shrink-0 cursor-pointer"
                    >
                      📄 거래명세표
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <MenuDetailReviewModal
        menu={detailMenu}
        store={detailStore}
        reviews={reviews}
        reviewReplies={reviewReplies}
        onClose={() => setDetailMenuId(null)}
        onQuickOrder={(menuId, servings) => {
          setB2bMenuId(menuId);
          setB2bServings(servings);
          setDetailMenuId(null);
        }}
      />

      <B2BStatementModal
        order={statementOrder}
        onClose={() => setStatementOrder(null)}
        onGoToOrders={onGoToOrderStatus}
      />
    </div>
  );
}
