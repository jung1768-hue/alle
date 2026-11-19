import { useState } from 'react';
import {
  CalendarClock,
  Check,
  ChevronDown,
  MapPin,
  QrCode,
  Share2,
  ShieldCheck,
  Sparkles,
  Ticket,
  UserCheck,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { MOCK_COUPONS } from '../data/seedData';
import { DemoRole, SavedLocation, UserPreferences } from '../types/alle';
import { formatWon } from '../utils/parser';

interface MyHubViewProps {
  role: DemoRole;
  walletBalance: number;
  stampCount: number;
  preferences: UserPreferences;
  wishlistCount: number;
  orderCount: number;
  regularMenuId?: string;
  regularMenuName?: string;
  regularStoreName?: string;
  regularServings?: number;
  activeLocation?: SavedLocation;
  onTopupWalletConfirmed: (amount: number) => void;
  onEarnStamp: () => void;
  onChangeRole: (nextRole: DemoRole) => void;
  onShareDemoSummary: () => void;
  onGoToHomePrefs: () => void;
  onQuickReorderToConfirm?: (menuId: string, servings: number) => void;
  onOpenAiChat?: (initialPrompt?: string) => void;
  onOpenLocationPicker?: () => void;
}

export function MyHubView({
  role,
  walletBalance,
  stampCount,
  preferences,
  wishlistCount,
  orderCount,
  regularMenuId = 'm1',
  regularMenuName = '얼큰 소고기국밥',
  regularStoreName = '수성 범어 소고기국밥',
  regularServings = 2,
  activeLocation,
  onTopupWalletConfirmed,
  onEarnStamp,
  onChangeRole,
  onShareDemoSummary,
  onGoToHomePrefs,
  onQuickReorderToConfirm,
  onOpenAiChat,
  onOpenLocationPicker,
}: MyHubViewProps) {
  const [confirmTopupAmount, setConfirmTopupAmount] = useState<number | null>(
    null
  );
  const [fridayRoutineEnabled, setFridayRoutineEnabled] =
    useState<boolean>(true);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1D1A]">MY 올이</h1>
        </div>
        <button
          type="button"
          onClick={() => onOpenLocationPicker?.()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#EAF1E2] border border-[#E8ECE4] text-xs font-bold text-[#4E6E2A] cursor-pointer transition-colors"
        >
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>
            {activeLocation
              ? `${activeLocation.label} · ${activeLocation.areaName}`
              : '고객 A · 대구 수성구 범어동'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        </button>
      </div>

      {/* Encrypted Alias Profile & Mock Wallet */}
      <section className="bg-white border border-[#E8ECE4] rounded-3xl p-5 sm:p-6 space-y-4 shadow-[0_2px_12px_rgba(26,29,26,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#687064] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#4E6E2A]" />
              <span>안심 가명 프로필</span>
            </div>
            <div className="text-lg font-bold text-[#1A1D1A] mt-1">
              고객 A · {activeLocation?.detailAddress ?? '수령지 A'}
            </div>
            <p className="text-xs text-[#687064] mt-0.5 tabular-nums">
              주문 {orderCount}건 · 찜 {wishlistCount}개 · 스탬프{' '}
              {stampCount}개
            </p>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-xs font-semibold text-[#687064] flex items-center sm:justify-end gap-1">
              <Wallet className="w-3.5 h-3.5 text-[#4E6E2A]" />
              <span>올이페이 잔액</span>
            </div>
            <div className="text-2xl font-bold text-[#4E6E2A] font-mono tabular-nums mt-0.5">
              {formatWon(walletBalance)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[#E8ECE4]">
          <button
            type="button"
            onClick={() => setConfirmTopupAmount(10000)}
            className="min-h-[44px] px-4 py-2.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-sm font-bold rounded-2xl cursor-pointer"
          >
            + 10,000원 충전
          </button>
          <button
            type="button"
            onClick={onShareDemoSummary}
            className="min-h-[44px] px-4 py-2.5 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-sm font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>내 요약 공유하기</span>
          </button>
        </div>
      </section>

      {/* 나의 Zero-Click 단골 루틴 (Retention Without Subsidy Coupons) */}
      <section
        aria-label="나의 Zero-Click 단골 루틴"
        className="bg-white border border-[#D4E1C5] rounded-3xl p-5 sm:p-6 space-y-4 shadow-[0_2px_12px_rgba(26,29,26,0.03)]"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#1A1D1A] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#4E6E2A]" />
              <span>나의 Zero-Click 단골 루틴</span>
            </h2>
            <p className="text-xs text-[#687064] mt-0.5">
              할인 쿠폰 없이도 생활 패턴 기반 자동 제안으로 3초 재주문을 유지합니다
            </p>
          </div>
          <span className="text-xs font-bold text-[#4E6E2A] tabular-nums">
            쿠폰 무의존 리텐션
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Card 1: 매주 금요일 퇴근길 자동 제안 */}
          <div className="p-4 bg-[#F7F8F5] border border-[#D4E1C5] rounded-2xl flex flex-col justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#4E6E2A]">
                  <CalendarClock className="w-4 h-4 shrink-0" />
                  <span>금요일 18:30 자동 알림</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={fridayRoutineEnabled}
                  onClick={() => setFridayRoutineEnabled((prev) => !prev)}
                  className={`min-h-[28px] px-2.5 py-0.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    fridayRoutineEnabled
                      ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                      : 'bg-white border-[#E8ECE4] text-[#687064]'
                  }`}
                >
                  {fridayRoutineEnabled ? '자동 ON' : '꺼짐'}
                </button>
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#1A1D1A]">
                  매주 금요일 퇴근길 자동 제안
                </h3>
                <p className="text-xs text-[#555E52] mt-1 leading-relaxed">
                  야근·날씨 패턴에 맞춰 도착 25분 전 ‘{regularMenuName}’ 등 맞춤
                  메뉴를 먼저 제안합니다.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onOpenAiChat
                  ? onOpenAiChat(
                      '성인 2명, 얼큰한 국물, 총액 25,000원 이하, 30분 이내'
                    )
                  : onGoToHomePrefs()
              }
              className="w-full min-h-[42px] px-3.5 py-2 bg-white hover:bg-[#EAF1E2] border border-[#D4E1C5] text-[#3D5720] text-xs font-bold rounded-xl cursor-pointer transition-colors"
            >
              오늘 퇴근길 제안 바로 보기
            </button>
          </div>

          {/* Card 2: 원탭 3초 재주문 */}
          <div className="p-4 bg-[#EAF1E2] text-[#1A1D1A] border border-[#D4E1C5] rounded-2xl flex flex-col justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-[#3D5720] flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-[#82B440] fill-[#82B440] shrink-0" />
                  <span>탐색 0단계 · 단골 고정</span>
                </span>
                <span className="font-mono font-semibold text-[#4E6E2A] tabular-nums">
                  평균 3초
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#1A1D1A]">
                  원탭 3초 재주문
                </h3>
                <p className="text-xs text-[#3D5720] mt-1 leading-relaxed">
                  {regularStoreName} ·{' '}
                  <strong className="text-[#1A1D1A] font-semibold">
                    {regularMenuName} ({regularServings}인)
                  </strong>{' '}
                  이전 옵션과 요청사항 그대로 즉시 주문합니다.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onQuickReorderToConfirm
                  ? onQuickReorderToConfirm(regularMenuId, regularServings)
                  : onGoToHomePrefs()
              }
              className="w-full min-h-[42px] px-3.5 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>원탭 3초 재주문 실행</span>
            </button>
          </div>
        </div>
      </section>

      {/* Role Switcher */}
      <section className="bg-white border border-[#E8ECE4] rounded-3xl p-5 sm:p-6 space-y-3.5 shadow-[0_2px_12px_rgba(26,29,26,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[#1A1D1A] flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-[#4E6E2A]" />
            <span>화면 전환</span>
          </h2>
          <span className="text-xs text-[#687064]">
            상단에서도 전환 가능
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 p-1.5 bg-[#F0F3EC] border border-[#E8ECE4] rounded-2xl">
          {(
            [
              { id: DemoRole.CONSUMER, label: '고객' },
              { id: DemoRole.OWNER, label: '점주 · 관리자' },
              { id: DemoRole.PARTNER, label: '배달 파트너' },
            ] as const
          ).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onChangeRole(r.id)}
              className={`min-h-[42px] px-2 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                role === r.id
                  ? 'bg-[#4E6E2A] text-white shadow-2xs'
                  : 'text-[#555E52] hover:text-[#1A1D1A]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      {/* O2O Stamps & Coupons */}
      <section className="bg-white border border-[#E8ECE4] rounded-3xl p-5 sm:p-6 space-y-4 shadow-[0_2px_12px_rgba(26,29,26,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1A1D1A] flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-[#4E6E2A]" />
              <span>단골 스탬프 & 쿠폰함</span>
            </h2>
            <p className="text-xs text-[#687064] mt-0.5">
              주문 시 자동 적용 한도 내에서 할인받을 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onEarnStamp}
            className="min-h-[38px] px-3.5 py-1.5 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs font-bold rounded-xl cursor-pointer"
          >
            QR 스탬프 +1 적립 ({stampCount}개)
          </button>
        </div>

        {/* Stamp Progress Bar (#EAF1E2 track + #82B440 fill) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs tabular-nums">
            <span className="font-semibold text-[#3D5720]">
              단골 스탬프 달성률
            </span>
            <span className="font-mono font-bold text-[#4E6E2A]">
              {Math.min(stampCount, 5)} / 5개
            </span>
          </div>
          <div className="h-2 w-full bg-[#EAF1E2] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#82B440] rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.round((stampCount / 5) * 100))}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          {MOCK_COUPONS.filter((c) => c.code !== 'NONE').map((cp) => {
            const unlocked = !cp.requiresStamps || stampCount >= cp.requiresStamps;
            return (
              <div
                key={cp.id}
                className="p-3.5 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#1A1D1A] flex items-center gap-1.5">
                    <Ticket className="w-4 h-4 text-[#4E6E2A] shrink-0" />
                    <span className="truncate">{cp.label}</span>
                  </div>
                  <div className="text-xs text-[#687064] mt-0.5">
                    코드: {cp.code}
                    {cp.requiresStamps
                      ? ` · 스탬프 ${cp.requiresStamps}개 필요 (${
                          unlocked ? '사용 가능' : '미달'
                        })`
                      : ' · 즉시 사용 가능'}
                  </div>
                </div>
                <span
                  className={`font-mono tabular-nums text-sm font-bold shrink-0 ${
                    unlocked ? 'text-[#4E6E2A]' : 'text-[#687064]'
                  }`}
                >
                  -{formatWon(cp.discountAmount)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Saved Preferences Shortcut */}
      <section className="bg-white border border-[#E8ECE4] rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs sm:text-sm text-[#555E52]">
          <div className="font-bold text-[#1A1D1A]">저장된 내 취향 설정</div>
          <p className="mt-1 tabular-nums">
            {preferences.defaultServings}인 ·{' '}
            {preferences.favoriteTags.join(', ') || '태그 없음'} ·{' '}
            {formatWon(preferences.defaultMaxBudget)} 이하 ·{' '}
            {preferences.defaultMaxMinutes}분 이내
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToHomePrefs}
          className="min-h-[40px] px-4 py-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs font-bold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
        >
          홈에서 취향 수정
        </button>
      </section>

      {/* Final Confirmation Modal for Mock Wallet Top-Up */}
      {confirmTopupAmount !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-2xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="topup-confirm-title"
        >
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-[#E8ECE4] p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-[#4E6E2A]">
                  충전 확인
                </span>
                <h2
                  id="topup-confirm-title"
                  className="text-lg font-bold text-[#1A1D1A] mt-1"
                >
                  올이페이 {formatWon(confirmTopupAmount)} 충전
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirmTopupAmount(null)}
                aria-label="닫기"
                className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-[#F7F8F5] flex items-center justify-center text-[#687064] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl space-y-1.5 text-sm">
              <div className="flex justify-between text-[#555E52]">
                <span>현재 잔액</span>
                <span className="font-mono tabular-nums">
                  {formatWon(walletBalance)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-[#4E6E2A]">
                <span>충전 후 잔액</span>
                <span className="font-mono tabular-nums">
                  {formatWon(walletBalance + confirmTopupAmount)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmTopupAmount(null)}
                className="min-h-[46px] px-4 py-2.5 bg-[#F0F3EC] text-[#1A1D1A] text-sm font-bold rounded-2xl cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  onTopupWalletConfirmed(confirmTopupAmount);
                  setConfirmTopupAmount(null);
                }}
                className="min-h-[46px] px-4 py-2.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>충전 확정</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
