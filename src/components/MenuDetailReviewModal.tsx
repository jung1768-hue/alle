import { useEffect } from 'react';
import {
  Clock,
  MessageSquare,
  Sparkles,
  Star,
  Store as StoreIcon,
  X,
  Zap,
} from 'lucide-react';
import { MenuItem, Review, ReviewReply, Store } from '../types/alle';
import { buildRuleReviewSummary } from '../utils/gemini';
import { formatWon, getEffectiveMenuPrice } from '../utils/parser';
import { FoodImage } from './FoodImage';

interface MenuDetailReviewModalProps {
  menu: MenuItem | null;
  store: Store | null;
  storeMenuCount?: number;
  reviews: Review[];
  reviewReplies: Record<string, ReviewReply>;
  onClose: () => void;
  onQuickOrder: (menuId: string, servings: number) => void;
  onOpenStoreMenu?: () => void;
}

export function MenuDetailReviewModal({
  menu,
  store,
  storeMenuCount = 0,
  reviews,
  reviewReplies,
  onClose,
  onQuickOrder,
  onOpenStoreMenu,
}: MenuDetailReviewModalProps) {
  const isOpen = Boolean(menu && store);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
    };
  }, [isOpen]);

  if (!menu || !store) return null;

  const menuReviews = reviews.filter((r) => r.menuId === menu.id);
  const summary = buildRuleReviewSummary(menuReviews);
  const effectiveMinutes = menu.estimatedMinutes + (store.extraPrepMinutes ?? 0);
  const unavailable = !store.isOpen || menu.isSoldOut || menu.stock <= 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${menu.name} 상세 및 리뷰`}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-none touch-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto overscroll-contain touch-pan-y bg-white rounded-t-3xl sm:rounded-3xl border border-[#E8ECE4] shadow-2xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[#E8ECE4] shrink-0">
              <FoodImage
                src={menu.image}
                alt={menu.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-xs font-medium text-[#687064]">
                <StoreIcon className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
                <span className="truncate">{store.name}</span>
              </div>
              <h2 className="text-lg font-bold text-[#1A1D1A] truncate">
                {menu.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs mt-0.5 tabular-nums">
                <span className="font-mono font-bold text-[#4E6E2A]">
                  {formatWon(getEffectiveMenuPrice(menu))}
                </span>
                {(menu.closingDiscountPercent ?? 0) > 0 && (
                  <span className="text-[11px] font-bold text-amber-800">
                    (-{menu.closingDiscountPercent}%)
                  </span>
                )}
                {menu.storePrice === menu.pricePerPerson && (
                  <span className="px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[11px] font-bold">
                    💚 착한가격 · 매장 동일가
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full bg-[#F7F8F5] border border-[#E8ECE4] text-[#555E52] text-[11px] font-bold">
                  최소주문 없음 · 1개도 배달
                </span>
                <span className="inline-flex items-center gap-1 text-[#687064]">
                  <Clock className="w-3.5 h-3.5 text-[#4E6E2A]" />약{' '}
                  {effectiveMinutes}분
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="상세 팝업 닫기"
            className="p-2 rounded-xl text-[#687064] hover:bg-[#F7F8F5] cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-[#434B40] leading-relaxed">
          {menu.description}
        </p>

        {menu.aiReason && (
          <div className="p-3 bg-[#EAF1E2] border border-[#D4E1C5] rounded-2xl text-xs text-[#3D5720] font-medium flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-[#4E6E2A] shrink-0 mt-0.5" />
            <span>{menu.aiReason}</span>
          </div>
        )}

        <div className="pt-3 border-t border-[#E8ECE4] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1D1A] flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-[#4E6E2A]" />
              <span>리뷰 ({menuReviews.length}건)</span>
            </h3>
            <span className="text-xs font-semibold text-[#4E6E2A]">
              {summary.headline}
            </span>
          </div>

          {menuReviews.length === 0 ? (
            <p className="p-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl text-xs text-[#687064]">
              아직 등록된 상세 리뷰가 없습니다.
            </p>
          ) : (
            <div className="space-y-2.5">
              {menuReviews.map((review) => {
                const reply = reviewReplies[review.id];
                return (
                  <div
                    key={review.id}
                    className="p-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between text-[#687064]">
                      <span className="font-bold text-[#1A1D1A]">
                        {review.author}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-[#4E6E2A]">
                        <Star className="w-3.5 h-3.5 fill-[#82B440] text-[#82B440]" />
                        {review.rating.toFixed(1)} · {review.date}
                      </span>
                    </div>
                    <p className="text-[#1A1D1A] leading-relaxed">
                      {review.content}
                    </p>
                    {reply && (
                      <div className="p-2.5 bg-white border border-[#D4E1C5] rounded-xl text-[#3D5720]">
                        <span className="font-bold">점주 답글:</span>{' '}
                        {reply.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {storeMenuCount > 1 && onOpenStoreMenu && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenStoreMenu();
            }}
            className="w-full min-h-[42px] px-4 py-2 rounded-2xl bg-[#EAF1E2] hover:bg-[#DCE7CF] border border-[#82B440] text-[#3D5720] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <StoreIcon className="w-4 h-4 shrink-0" />
            <span>
              이 가게 다른 메뉴 보기 ({storeMenuCount - 1}개 더 있음) →
            </span>
          </button>
        )}

        <div className="pt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 border border-[#E8ECE4] bg-white hover:bg-[#F7F8F5] text-[#1A1D1A] text-xs sm:text-sm font-bold rounded-xl cursor-pointer"
          >
            닫기
          </button>
          <button
            type="button"
            disabled={unavailable}
            onClick={() => {
              const id = menu.id;
              onClose();
              onQuickOrder(id, 1);
            }}
            className="min-h-[44px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] text-white text-xs sm:text-sm font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            <Zap className="w-4 h-4" />
            <span>{unavailable ? '주문 불가' : '바로 주문'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
