import { useState } from 'react';
import {
  Check,
  QrCode,
  Share2,
  ShieldCheck,
  Ticket,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import { MOCK_COUPONS } from '../data/seedData';
import { DemoRole, UserPreferences } from '../types/alle';
import { formatWon } from '../utils/parser';

interface MyHubViewProps {
  role: DemoRole;
  walletBalance: number;
  stampCount: number;
  preferences: UserPreferences;
  wishlistCount: number;
  orderCount: number;
  onTopupWalletConfirmed: (amount: number) => void;
  onEarnStamp: () => void;
  onChangeRole: (nextRole: DemoRole) => void;
  onShareDemoSummary: () => void;
  onGoToHomePrefs: () => void;
}

export function MyHubView({
  role,
  walletBalance,
  stampCount,
  preferences,
  wishlistCount,
  orderCount,
  onTopupWalletConfirmed,
  onEarnStamp,
  onChangeRole,
  onShareDemoSummary,
  onGoToHomePrefs,
}: MyHubViewProps) {
  const [confirmTopupAmount, setConfirmTopupAmount] = useState<number | null>(
    null
  );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[#141812]">MY 올이</h1>
        </div>
        <span className="text-xs font-bold text-[#2E531A]">
          고객 A · 수령지 A
        </span>
      </div>

      {/* Encrypted Alias Profile & Mock Wallet */}
      <section className="bg-white border border-[#DDE3D7] rounded-3xl p-5 sm:p-6 space-y-4 shadow-[0_2px_12px_rgba(20,24,18,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#4A5246] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#2E531A]" />
              <span>안심 가명 프로필</span>
            </div>
            <div className="text-lg font-bold text-[#141812] mt-1">
              고객 A · 수령지 A
            </div>
            <p className="text-xs text-[#4A5246] mt-0.5 tabular-nums">
              주문 {orderCount}건 · 찜 {wishlistCount}개 · 스탬프{' '}
              {stampCount}개
            </p>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-xs font-semibold text-[#4A5246] flex items-center sm:justify-end gap-1">
              <Wallet className="w-3.5 h-3.5 text-[#2E531A]" />
              <span>올이페이 잔액</span>
            </div>
            <div className="text-2xl font-bold text-[#2E531A] font-mono tabular-nums mt-0.5">
              {formatWon(walletBalance)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[#E6EBE1]">
          <button
            type="button"
            onClick={() => setConfirmTopupAmount(10000)}
            className="min-h-[44px] px-4 py-2.5 bg-[#2E531A] hover:bg-[#234113] text-white text-sm font-bold rounded-2xl cursor-pointer"
          >
            + 10,000원 충전
          </button>
          <button
            type="button"
            onClick={onShareDemoSummary}
            className="min-h-[44px] px-4 py-2.5 bg-[#E7EFE1] hover:bg-[#D8E6CD] text-[#1F3A11] text-sm font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>내 요약 공유하기</span>
          </button>
        </div>
      </section>

      {/* Role Switcher */}
      <section className="bg-white border border-[#DDE3D7] rounded-3xl p-5 sm:p-6 space-y-3.5 shadow-[0_2px_12px_rgba(20,24,18,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[#141812] flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-[#2E531A]" />
            <span>화면 전환</span>
          </h2>
          <span className="text-xs text-[#4A5246]">
            상단에서도 전환 가능
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 p-1.5 bg-[#EFF2EC] border border-[#DDE3D7] rounded-2xl">
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
                  ? 'bg-[#2E531A] text-white shadow-2xs'
                  : 'text-[#374033] hover:text-[#141812]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      {/* O2O Stamps & Coupons */}
      <section className="bg-white border border-[#DDE3D7] rounded-3xl p-5 sm:p-6 space-y-4 shadow-[0_2px_12px_rgba(20,24,18,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#141812] flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-[#2E531A]" />
              <span>단골 스탬프 & 쿠폰함</span>
            </h2>
            <p className="text-xs text-[#4A5246] mt-0.5">
              주문 시 자동 적용 한도 내에서 할인받을 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onEarnStamp}
            className="min-h-[38px] px-3.5 py-1.5 bg-[#E7EFE1] hover:bg-[#D8E6CD] text-[#1F3A11] text-xs font-bold rounded-xl cursor-pointer"
          >
            QR 스탬프 +1 적립 ({stampCount}개)
          </button>
        </div>

        <div className="space-y-2">
          {MOCK_COUPONS.filter((c) => c.code !== 'NONE').map((cp) => {
            const unlocked = !cp.requiresStamps || stampCount >= cp.requiresStamps;
            return (
              <div
                key={cp.id}
                className="p-3.5 rounded-2xl bg-[#F4F6F1] border border-[#DDE3D7] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#141812] flex items-center gap-1.5">
                    <Ticket className="w-4 h-4 text-[#2E531A] shrink-0" />
                    <span className="truncate">{cp.label}</span>
                  </div>
                  <div className="text-xs text-[#4A5246] mt-0.5">
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
                    unlocked ? 'text-[#2E531A]' : 'text-[#4A5246]'
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
      <section className="bg-white border border-[#DDE3D7] rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs sm:text-sm text-[#374033]">
          <div className="font-bold text-[#141812]">저장된 내 취향 설정</div>
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
          className="min-h-[40px] px-4 py-2 bg-[#E7EFE1] hover:bg-[#D8E6CD] text-[#1F3A11] text-xs font-bold rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
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
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-[#DDE3D7] p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-[#2E531A]">
                  충전 확인
                </span>
                <h2
                  id="topup-confirm-title"
                  className="text-lg font-bold text-[#141812] mt-1"
                >
                  올이페이 {formatWon(confirmTopupAmount)} 충전
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setConfirmTopupAmount(null)}
                aria-label="닫기"
                className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-[#F4F6F1] flex items-center justify-center text-[#4A5246] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-[#F4F6F1] border border-[#DDE3D7] rounded-2xl space-y-1.5 text-sm">
              <div className="flex justify-between text-[#374033]">
                <span>현재 잔액</span>
                <span className="font-mono tabular-nums">
                  {formatWon(walletBalance)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-[#2E531A]">
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
                className="min-h-[46px] px-4 py-2.5 bg-[#EFF2EC] text-[#141812] text-sm font-bold rounded-2xl cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  onTopupWalletConfirmed(confirmTopupAmount);
                  setConfirmTopupAmount(null);
                }}
                className="min-h-[46px] px-4 py-2.5 bg-[#2E531A] hover:bg-[#234113] text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer"
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
