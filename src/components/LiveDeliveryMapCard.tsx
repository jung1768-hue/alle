import { useState } from 'react';
import {
  CheckCircle2,
  MapPin,
  Navigation,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { DispatchMode, OrderStatus } from '../types/alle';

interface LiveDeliveryMapCardProps {
  orderCode: string;
  storeName: string;
  addressAlias: string;
  status: OrderStatus;
  dispatchMode?: DispatchMode;
}

export function LiveDeliveryMapCard({
  orderCode,
  storeName,
  addressAlias,
  status,
  dispatchMode,
}: LiveDeliveryMapCardProps) {
  const defaultStage =
    status === OrderStatus.COMPLETED
      ? 2
      : status === OrderStatus.PICKUP
        ? 1
        : 0;

  const [previewStep, setPreviewStep] = useState<number>(defaultStage);

  const effectiveStep =
    status === OrderStatus.COMPLETED
      ? 2
      : status === OrderStatus.PICKUP
        ? Math.max(1, previewStep)
        : previewStep;

  const avatarX = effectiveStep === 0 ? 52 : effectiveStep === 1 ? 160 : 262;
  const avatarY = effectiveStep === 0 ? 78 : effectiveStep === 1 ? 46 : 62;

  const stageLabel =
    effectiveStep === 0
      ? `${storeName} 픽업 준비 중`
      : effectiveStep === 1
        ? `${addressAlias} 방향으로 이동 중`
        : `${addressAlias} 인근 도착`;

  return (
    <div className="p-4 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A1D1A]">
          <Navigation className="w-3.5 h-3.5 text-[#4E6E2A]" />
          <span>배달 경로 ({orderCode})</span>
        </div>
        <span className="text-[11px] font-bold text-[#4E6E2A]">
          {dispatchMode === DispatchMode.AGENCY_RIDER
            ? '전문 라이더'
            : '이웃 도보 파트너'}
        </span>
      </div>

      {/* Prominent AI Dispatch & On-Time Reliability Status Banner */}
      <div className="px-3.5 py-2.5 bg-[#EAF1E2] border border-[#DCE7CF] text-[#3D5720] rounded-xl flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold">
          <Sparkles className="w-3.5 h-3.5 text-[#82B440] shrink-0" />
          <span>AI 라이더 최적 동선 매칭 완료</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#4E6E2A] font-mono tabular-nums">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#82B440] shrink-0" />
          <span>정시 도착 신뢰도 98%</span>
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

          <g transform={`translate(${avatarX}, ${avatarY})`}>
            <circle r="11" fill="#82B440" fillOpacity="0.35" />
            <circle r="7" fill="#4E6E2A" stroke="#FFFFFF" strokeWidth="2" />
          </g>
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-bold text-[#1A1D1A] flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-[#4E6E2A]" />
          {stageLabel}
        </span>
        <div className="flex items-center gap-1">
          {[
            { idx: 0, label: '픽업' },
            { idx: 1, label: '이동' },
            { idx: 2, label: '도착' },
          ].map((btn) => (
            <button
              key={btn.idx}
              type="button"
              onClick={() => setPreviewStep(btn.idx)}
              className={`min-h-[28px] px-2.5 py-0.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
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
        <span>안심 경로 안내 · 반경 20m 위치 보호 적용</span>
      </div>
    </div>
  );
}
