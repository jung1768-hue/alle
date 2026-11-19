import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Sparkles, X } from 'lucide-react';
import {
  checkServerGeminiAvailable,
  getGeminiApiKey,
  isServerProxyAvailable,
  setGeminiApiKey,
} from '../utils/gemini';

interface GeminiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (hasKey: boolean) => void;
}

export function GeminiKeyModal({
  isOpen,
  onClose,
  onSaved,
}: GeminiKeyModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState(() => getGeminiApiKey());
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [serverConnected, setServerConnected] = useState(() =>
    isServerProxyAvailable()
  );

  useEffect(() => {
    if (!isOpen) return;
    void checkServerGeminiAvailable().then((ok) => setServerConnected(ok));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setGeminiApiKey(apiKeyInput);
    setSavedFeedback(true);
    onSaved?.(apiKeyInput.trim().length > 0);
    window.setTimeout(() => {
      setSavedFeedback(false);
      onClose();
    }, 600);
  };

  const handleClear = () => {
    setApiKeyInput('');
    setGeminiApiKey('');
    onSaved?.(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="alle 분석 설정"
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md bg-white border border-[#E8ECE4] rounded-3xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#EAF1E2] flex items-center justify-center text-[#4E6E2A]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A1D1A]">
                alle 분석 연동 설정
              </h2>
              <p className="text-[11px] text-[#687064]">
                자연어 추천 · 리뷰 요약 · 메뉴판 사진 OCR에 사용됩니다
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-xl text-[#687064] hover:bg-[#F7F8F5] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {serverConnected && (
          <div className="p-3 bg-[#EAF1E2] border border-[#82B440] rounded-2xl flex items-start gap-2 text-xs text-[#3D5720]">
            <CheckCircle2 className="w-4 h-4 text-[#4E6E2A] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">alle 분석 서버가 연결되어 있습니다.</p>
              <p className="text-[11px] opacity-90">
                Cloudflare 환경변수 키가 정상 인식되었으므로 별도로 키를 입력하지 않으셔도 됩니다.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label
              htmlFor="gemini-api-key-input"
              className="block text-xs font-semibold text-[#1A1D1A] mb-1.5"
            >
              alle 분석 API Key (브라우저 로컬 저장)
            </label>
            <div className="relative flex items-center">
              <KeyRound className="w-4 h-4 text-[#687064] absolute left-3 pointer-events-none" />
              <input
                id="gemini-api-key-input"
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIza... (미입력 시 로컬 규칙 엔진으로 자동 동작)"
                className="w-full min-h-[44px] pl-9 pr-3 py-2 bg-[#F7F8F5] border border-[#E8ECE4] rounded-xl text-xs text-[#1A1D1A]"
              />
            </div>
            <p className="text-[11px] text-[#687064] mt-1.5 leading-relaxed">
              키가 없어도 모든 시연 기능은 온디바이스 규칙 엔진으로 동작하며, 키를
              입력하면 alle 분석이 복합 문장·리뷰·메뉴판 사진을 직접
              분석합니다.
            </p>
          </div>

          {savedFeedback && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4E6E2A]">
              <CheckCircle2 className="w-4 h-4" />
              <span>설정이 저장되었습니다.</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleClear}
              className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-[#687064] hover:bg-[#F7F8F5] rounded-xl cursor-pointer"
            >
              키 삭제 (로컬 모드)
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-3.5 py-2 border border-[#E8ECE4] text-xs font-semibold text-[#555E52] rounded-xl cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs font-semibold rounded-xl cursor-pointer"
              >
                저장
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
