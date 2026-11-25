import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  DeliveryProgressStage,
  DispatchMode,
  OrderStatus,
} from '../types/alle';
import { BARO_PARTNER_GEAR_SRC } from './AlleBrand';

interface LiveDeliveryMapCardProps {
  orderCode: string;
  storeName: string;
  addressAlias: string;
  status: OrderStatus;
  dispatchMode?: DispatchMode;
  deliveryStage?: DeliveryProgressStage;
  riderName?: string;
  remainingMinutes?: number;
  isFocused?: boolean;
}

function resolveStageStep(
  status: OrderStatus,
  deliveryStage?: DeliveryProgressStage
): number {
  if (deliveryStage === 'ARRIVED' || status === OrderStatus.COMPLETED) return 3;
  if (deliveryStage === 'FIVE_MIN_LEFT') return 2;
  if (deliveryStage === 'DEPARTED' || status === OrderStatus.PICKUP) return 1;
  return 0;
}

export function LiveDeliveryMapCard({
  orderCode,
  storeName,
  addressAlias,
  status,
  dispatchMode,
  deliveryStage,
  riderName,
  remainingMinutes,
  isFocused = false,
}: LiveDeliveryMapCardProps) {
  const liveStep = resolveStageStep(status, deliveryStage);
  const [previewStep, setPreviewStep] = useState<number>(liveStep);

  useEffect(() => {
    setPreviewStep(liveStep);
  }, [liveStep]);

  const effectiveStep = Math.max(liveStep, previewStep);

  const routePoint =
    effectiveStep === 0
      ? { x: 48, y: 78 }
      : effectiveStep === 1
        ? { x: 140, y: 52 }
        : effectiveStep === 2
          ? { x: 218, y: 54 }
          : { x: 268, y: 62 };

  const activeRiderLabel =
    riderName ??
    (dispatchMode === DispatchMode.AGENCY_RIDER
      ? '전문 라이더'
      : '이웃 도보 파트너');

  const stageLabel =
    effectiveStep === 0
      ? `${storeName} 픽업 준비 중`
      : effectiveStep === 1
        ? `${activeRiderLabel} 출발 · ${addressAlias} 방향으로 이동 중`
        : effectiveStep === 2
          ? `${activeRiderLabel} · 도착 5분 전 (인근 접근)`
          : `${addressAlias} 도착 완료`;

  const etaBadgeText =
    effectiveStep >= 3
      ? '도착 완료'
      : effectiveStep === 2
        ? '도착 5분 전'
        : typeof remainingMinutes === 'number' && remainingMinutes > 0
          ? `약 ${remainingMinutes}분 남음`
          : '정시 도착 신뢰도 98%';

  return (
    <div
      className={`p-4 rounded-2xl space-y-3 border transition-all ${
        isFocused
          ? 'bg-[#EAF1E2]/45 border-[#4E6E2A] ring-2 ring-[#82B440]/40'
          : 'bg-[#F7F8F5] border-[#E8ECE4]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A1D1A]">
          <Navigation className="w-3.5 h-3.5 text-[#4E6E2A]" />
          <span>실시간 배달 위치 ({orderCode})</span>
        </div>
        <span className="text-[11px] font-bold text-[#4E6E2A]">
          {activeRiderLabel}
        </span>
      </div>

      {/* Prominent AI Dispatch & Live ETA Banner */}
      <div className="px-3.5 py-2.5 bg-[#EAF1E2] border border-[#DCE7CF] text-[#3D5720] rounded-xl flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 text-xs font-bold min-w-0">
          <img
            src={BARO_PARTNER_GEAR_SRC}
            alt="Baro 모자와 보온 가방"
            className="w-12 h-9 rounded-lg object-cover border border-[#D4E1C5] shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#82B440] shrink-0" />
              <span className="truncate">
                {dispatchMode
                  ? `${activeRiderLabel} 배정 완료`
                  : '라이더 최적 동선 매칭 완료'}
              </span>
            </div>
            <div className="text-[10.5px] font-semibold text-[#555E52]">
              Baro 모자 · 보온 가방 착용
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#4E6E2A] font-mono tabular-nums">
          {effectiveStep >= 3 ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
          )}
          <span>{etaBadgeText}</span>
        </div>
      </div>

      <div className="bg-white border border-[#E8ECE4] rounded-xl p-2.5 overflow-hidden">
        <svg
          viewBox="0 0 320 112"
          className="w-full h-28 block"
          role="img"
          aria-label="배달 경로 지도"
        >
          <rect x="8" y="10" width="76" height="36" rx="6" fill="#EAF1E2" />
          <rect x="96" y="10" width="90" height="28" rx="6" fill="#EAF1E2" />
          <rect x="200" y="10" width="110" height="34" rx="6" fill="#EAF1E2" />
          <rect x="96" y="66" width="110" height="36" rx="6" fill="#EAF1E2" />

          <path
            d="M 48 78 Q 112 78 140 52 T 268 62"
            fill="none"
            stroke="#E8ECE4"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M 48 78 Q 112 78 140 52 T 268 62"
            fill="none"
            stroke="#4E6E2A"
            strokeWidth="3"
            strokeDasharray="6 5"
            strokeLinecap="round"
          />

          <circle
            cx="268"
            cy="62"
            r="22"
            fill="#EAF1E2"
            fillOpacity="0.9"
            stroke="#82B440"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />

          <circle cx="48" cy="78" r="8" fill="#1A1D1A" />
          <text
            x="48"
            y="100"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill="#1A1D1A"
          >
            매장
          </text>

          <circle cx="268" cy="62" r="8" fill="#4E6E2A" />
          <text
            x="268"
            y="96"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill="#3D5720"
          >
            {addressAlias}
          </text>

          <g
            transform={`translate(${routePoint.x}, ${routePoint.y})`}
            style={{ transition: 'transform 450ms ease' }}
          >
            <circle r="12" fill="#82B440" fillOpacity="0.38" />
            <circle r="7.5" fill="#4E6E2A" stroke="#FFFFFF" strokeWidth="2" />
          </g>
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-bold text-[#1A1D1A] flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
          <span>{stageLabel}</span>
        </span>
        <div className="flex items-center gap-1">
          {[
            { idx: 0, label: '픽업' },
            { idx: 1, label: '출발' },
            { idx: 2, label: '5분 전' },
            { idx: 3, label: '도착' },
          ].map((btn) => (
            <button
              key={btn.idx}
              type="button"
              onClick={() => setPreviewStep(btn.idx)}
              className={`min-h-[28px] px-2 py-0.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                effectiveStep === btn.idx
                  ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                  : 'bg-white border-[#E8ECE4] text-[#555E52]'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-[#687064]">
        <ShieldCheck className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
        <span>안심 경로 안내 · 출발 · 도착 5분 전 · 도착 완료 실시간 알림 연동</span>
      </div>
    </div>
  );
}
