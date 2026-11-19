import { Cpu, Lock, ShieldCheck, Wallet, X } from 'lucide-react';

interface FutureScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FutureScopeModal({ isOpen, onClose }: FutureScopeModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="future-scope-title"
    >
      <div className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl border border-[#DDE3D7] p-6 max-h-[88vh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="future-scope-title" className="text-lg font-bold text-[#141812]">
              alle 서비스 안내 및 상생 원칙
            </h2>
            <p className="text-xs font-medium text-[#4A5246] mt-0.5">
              매장 동일가격 · 중개수수료 0% · 개인정보 안심 보호
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-[#DDE3D7] text-[#374033] hover:bg-[#F4F6F1] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3.5 text-xs sm:text-sm text-[#374033] leading-relaxed">
          <div className="p-4 bg-[#E9F1E2] border border-[#CBDCC0] rounded-2xl space-y-1.5">
            <h3 className="font-bold text-[#141812] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#2E531A]" />
              <span>투명한 주문 · 취소 원칙</span>
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>
                조리 시작 전에는 즉시 취소 및 재고 복구가 가능하며, 조리 시작 후에는 요청 사유가 기록됩니다.
              </li>
              <li>
                모든 가게·메뉴·가격·리뷰·고객(고객 A / 수령지 A) 정보는 브라우저 내 샘플 데이터로 동작합니다.
              </li>
            </ul>
          </div>

          <div className="p-4 bg-[#F4F6F1] border border-[#DDE3D7] rounded-2xl space-y-1.5">
            <h3 className="font-bold text-[#141812] flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-[#2E531A]" />
              <span>매장 동일가격 & 중개수수료 0%</span>
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>
                매장가 비교 자료가 확인된 메뉴에만 ‘매장 동일 가격’ 배지가 표시되며, 가격 차이 제보는 점주 관리 센터에 전달됩니다.
              </li>
              <li>
                할인 쿠폰은 상품합계를 초과하지 않도록 결제 단계에서 자동 검증됩니다.
              </li>
            </ul>
          </div>

          <div className="p-4 bg-[#F4F6F1] border border-[#DDE3D7] rounded-2xl space-y-1.5">
            <h3 className="font-bold text-[#141812] flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-[#2E531A]" />
              <span>안심 가명 & 반경 20m 위치 보호</span>
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>
                고객과 배달 파트너의 상세 위치는 마스킹 처리되며, 실명 대신 가명 별칭으로 안전하게 연결됩니다.
              </li>
            </ul>
          </div>

          <div className="p-4 bg-[#F4F6F1] border border-[#DDE3D7] rounded-2xl space-y-1.5">
            <h3 className="font-bold text-[#141812] flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-[#2E531A]" />
              <span>AI 음성 주문 & 하이퍼로컬 연결</span>
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>
                음성과 자연어로 조건을 말하면 AI 주문 상담사가 인원·취향·예산·시간을 분석해 맞춤 메뉴를 추천합니다.
              </li>
            </ul>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[46px] py-2.5 bg-[#2E531A] hover:bg-[#234113] text-white text-sm font-semibold rounded-2xl cursor-pointer"
        >
          확인
        </button>
      </div>
    </div>
  );
}
