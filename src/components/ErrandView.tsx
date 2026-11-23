import { FormEvent, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Footprints,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import { PROHIBITED_ERRAND_KEYWORDS } from '../data/seedData';
import {
  ErrandRequest,
  ErrandStatus,
  SavedLocation,
} from '../types/alle';
import { formatWon } from '../utils/parser';
import { MATCHING_FEE_PER_CASE } from '../utils/pricing';

interface ErrandViewProps {
  errands: ErrandRequest[];
  activeLocation?: SavedLocation;
  onBackToHome: () => void;
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
    nextStatus: ErrandStatus
  ) => void;
  onOpenPartnerDemo?: () => void;
}

export function ErrandView({
  errands,
  activeLocation,
  onBackToHome,
  onCreateErrand,
  onAdvanceErrand,
  onOpenPartnerDemo,
}: ErrandViewProps) {
  const activeOrigin =
    activeLocation?.detailAddress ?? '대구 북구 산격동 수령지 A';

  const [errandTitle, setErrandTitle] = useState<string>(
    '동네 마트 우유 · 두부 · 계란 장보기 대행'
  );
  const [errandCategory, setErrandCategory] =
    useState<string>('동네 장보기/편의점');
  const [pickupAlias, setPickupAlias] = useState<string>('동네 마트 A');
  const [dropoffAlias, setDropoffAlias] = useState<string>(activeOrigin);
  const [estimatedItemCost, setEstimatedItemCost] = useState<number>(8000);
  const [errandFee, setErrandFee] = useState<number>(2000);
  const [errandError, setErrandError] = useState<string | null>(null);
  const [dualPhotoChecked, setDualPhotoChecked] = useState<
    Record<string, boolean>
  >({});

  const prohibitedMatches = useMemo(
    () =>
      PROHIBITED_ERRAND_KEYWORDS.filter((kw) => errandTitle.includes(kw)),
    [errandTitle]
  );

  const handleSubmitErrand = (e: FormEvent) => {
    e.preventDefault();
    if (!errandTitle.trim()) {
      setErrandError('심부름 내용을 입력해 주세요.');
      return;
    }
    if (prohibitedMatches.length > 0) {
      setErrandError(
        `금지 품목(${prohibitedMatches.join(', ')})은 접수할 수 없습니다.`
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
        '예상 물품비는 0원 이상, 심부름비는 500원 이상이어야 합니다.'
      );
      return;
    }
    const res = onCreateErrand({
      title: errandTitle.trim(),
      category: errandCategory,
      pickupAlias: pickupAlias.trim() || '동네 상가 A',
      dropoffAlias: dropoffAlias.trim() || activeOrigin,
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

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#1A1D1A] text-white rounded-3xl p-5 sm:p-6 border border-[#3A4038] space-y-1.5">
        <button
          type="button"
          onClick={onBackToHome}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4E1C5] hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>홈으로 돌아가기</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full bg-[#4E6E2A] text-xs font-extrabold inline-flex items-center gap-1">
            <Footprints className="w-3.5 h-3.5" />
            <span>생활 심부름</span>
          </span>
          <span className="text-xs text-[#C8D0C4]">
            금지 품목 자동 차단 · 영수증 실비 정산 · 매칭 수수료{' '}
            {formatWon(MATCHING_FEE_PER_CASE)}
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
          동네 장보기 · 세탁물 · 생활 심부름 대행
        </h1>
        <p className="text-xs sm:text-sm text-[#C8D0C4]">
          가까운 이웃 도보·개인 파트너가 심부름을 대신 처리하고, 영수증 실비 차액은 즉시 환불됩니다.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <form
          onSubmit={handleSubmitErrand}
          className="lg:col-span-5 os-card rounded-3xl p-5 space-y-4"
        >
          <div>
            <h2 className="text-base font-extrabold text-[#1A1D1A]">
              새 심부름 요청하기
            </h2>
            <p className="text-xs text-[#687064] mt-0.5">
              제한 품목 자동 차단 · 에스크로 안전 예치 후 실비 정산
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
                placeholder="예: 동네 마트 우유·두부 장보기 또는 세탁소 정장 수령"
                className="w-full min-h-[42px] px-3 border border-[#E8ECE4] rounded-xl text-sm"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  {
                    label: '동네 마트 장보기',
                    title: '동네 마트 우유 · 두부 · 계란 장보기 대행',
                    category: '동네 장보기/편의점',
                    pickup: '동네 마트 A',
                    cost: 8000,
                  },
                  {
                    label: '편의점 생수·생필품',
                    title: '편의점 생수 2L · 컵라면 · 휴지 구매 대행',
                    category: '동네 장보기/편의점',
                    pickup: '24시 동네 편의점',
                    cost: 7000,
                  },
                  {
                    label: '세탁소 정장 수령',
                    title: '세탁소 드라이클리닝 정장 수령 및 전달',
                    category: '세탁물 수령',
                    pickup: '동네 크린 세탁소',
                    cost: 0,
                  },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setErrandTitle(preset.title);
                      setErrandCategory(preset.category);
                      setPickupAlias(preset.pickup);
                      setEstimatedItemCost(preset.cost);
                    }}
                    className="easy-compact px-2.5 py-1 rounded-full bg-[#F7F8F5] hover:bg-[#EAF1E2] border border-[#E8ECE4] text-xs font-semibold text-[#3D5720] cursor-pointer transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
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
                  <option value="동네 장보기/편의점">동네 장보기/편의점</option>
                  <option value="세탁물 수령">세탁물 수령</option>
                  <option value="빵집/꽃집 픽업">빵집/꽃집 픽업</option>
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

            <div>
              <label className="block text-xs font-semibold text-[#1A1D1A] mb-1">
                도착 수령지
              </label>
              <input
                type="text"
                value={dropoffAlias}
                onChange={(e) => setDropoffAlias(e.target.value)}
                className="w-full min-h-[40px] px-2.5 border border-[#E8ECE4] rounded-xl text-xs"
              />
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

          <div className="rounded-xl bg-[#F7F8F5] border border-[#E8ECE4] p-3 space-y-1 text-xs">
            <div className="flex items-center justify-between text-[#687064]">
              <span>예상 물품비 + 심부름비</span>
              <span className="font-mono tabular-nums">
                {formatWon(estimatedItemCost + errandFee)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[#687064]">
              <span>플랫폼 매칭 수수료 (건당 정액)</span>
              <span className="font-mono tabular-nums">
                +{formatWon(MATCHING_FEE_PER_CASE)}
              </span>
            </div>
            <div className="flex items-center justify-between font-bold text-[#4E6E2A] pt-1 border-t border-[#E8ECE4]">
              <span>에스크로 선예치 총액</span>
              <span className="font-mono tabular-nums text-sm">
                {formatWon(estimatedItemCost + errandFee + MATCHING_FEE_PER_CASE)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={prohibitedMatches.length > 0}
            className="w-full min-h-[46px] py-2.5 px-4 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] text-white text-sm font-extrabold rounded-2xl cursor-pointer disabled:cursor-not-allowed"
          >
            심부름 등록하기
          </button>
        </form>

        <div className="lg:col-span-7 space-y-3">
          {errands.map((err) => {
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
                      {err.partnerName ? ` · 파트너: ${err.partnerName}` : ''}
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-[#1A1D1A] mt-0.5">
                      {err.title}
                    </h3>
                    <p className="text-xs text-[#687064] font-mono tabular-nums mt-0.5">
                      선예치 {formatWon(err.escrowTotal)} (예상 물품비{' '}
                      {formatWon(err.estimatedItemCost)} · 심부름비{' '}
                      {formatWon(err.errandFee)})
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      err.status === ErrandStatus.COMPLETED
                        ? 'bg-[#4E6E2A] text-white'
                        : err.status === ErrandStatus.RECEIPT_CHECKED
                          ? 'bg-amber-100 text-amber-900'
                          : err.status === ErrandStatus.MATCHED
                            ? 'bg-[#EAF1E2] text-[#3D5720]'
                            : 'bg-[#F7F8F5] border border-[#E8ECE4] text-[#434B40]'
                    }`}
                  >
                    {err.status === ErrandStatus.OPEN
                      ? '매칭 대기'
                      : err.status === ErrandStatus.MATCHED
                        ? '파트너 진행 중'
                        : err.status === ErrandStatus.RECEIPT_CHECKED
                          ? '영수증 확인 대기'
                          : '승인 · 정산 완료'}
                  </span>
                </div>

                {err.status === ErrandStatus.OPEN && (
                  <div className="pt-2.5 border-t border-[#E8ECE4] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[#555E52] inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
                      <span>
                        배달 파트너 앱에 심부름이 등록되었습니다. 파트너가 확인 후 수락하면 매칭됩니다.
                      </span>
                    </span>
                    {onOpenPartnerDemo && (
                      <button
                        type="button"
                        onClick={onOpenPartnerDemo}
                        className="easy-compact text-xs font-bold text-[#4E6E2A] hover:underline shrink-0 cursor-pointer"
                      >
                        파트너 앱에서 수락 확인 →
                      </button>
                    )}
                  </div>
                )}

                {err.status === ErrandStatus.MATCHED && (
                  <div className="pt-2.5 border-t border-[#E8ECE4] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[#3D5720] font-semibold inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#4E6E2A] shrink-0" />
                      <span>
                        배달 파트너({err.partnerName ?? '이웃 배달 파트너'})가 심부름을 진행 중입니다. 배송 완료 후 영수증이 도착하면 확인·승인해 주세요.
                      </span>
                    </span>
                    {onOpenPartnerDemo && (
                      <button
                        type="button"
                        onClick={onOpenPartnerDemo}
                        className="easy-compact text-xs font-bold text-[#4E6E2A] hover:underline shrink-0 cursor-pointer"
                      >
                        파트너 앱에서 영수증 첨부 →
                      </button>
                    )}
                  </div>
                )}

                {err.status === ErrandStatus.RECEIPT_CHECKED && (
                  <div className="pt-2.5 border-t border-[#E8ECE4] space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-bold text-[#1A1D1A]">
                        <Receipt className="w-4 h-4 text-[#4E6E2A]" />
                        <span>
                          파트너 영수증 실비 {formatWon(err.actualReceiptCost ?? 0)}
                        </span>
                      </span>
                      <span className="font-semibold text-[#4E6E2A]">
                        {(err.refundDifference ?? 0) >= 0
                          ? `차액 환불 ${formatWon(err.refundDifference ?? 0)}`
                          : `추가 차액 ${formatWon(Math.abs(err.refundDifference ?? 0))}`}
                      </span>
                    </div>
                    {err.receiptPhoto && (
                      <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#F7F8F5] border border-[#D4E1C5]">
                        <img
                          src={err.receiptPhoto.dataUrl}
                          alt={err.receiptPhoto.name}
                          className="w-16 h-16 rounded-xl object-cover border border-[#D4E1C5] shrink-0"
                        />
                        <span className="text-[11px] text-[#3D5720] font-semibold">
                          배달 파트너가 첨부한 구매 영수증입니다. 금액과 물품을 확인한 뒤 승인해 주세요.
                        </span>
                      </div>
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
                      <span>물품 외관 및 영수증 금액 확인 완료</span>
                    </label>
                    <button
                      type="button"
                      disabled={!dualOk}
                      onClick={() =>
                        onAdvanceErrand(err.id, ErrandStatus.COMPLETED)
                      }
                      className="min-h-[38px] px-4 py-1.5 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] text-white font-bold rounded-xl cursor-pointer disabled:cursor-not-allowed"
                    >
                      확인 · 승인 완료
                    </button>
                  </div>
                )}

                {err.status === ErrandStatus.COMPLETED && (
                  <div className="pt-2.5 border-t border-[#E8ECE4] flex items-center justify-between text-xs text-[#4E6E2A] font-semibold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      고객 확인 승인 · 영수증 정산 완료
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
    </div>
  );
}
