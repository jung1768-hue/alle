import { useEffect, useState } from 'react';
import {
  Clock,
  MessageSquare,
  PencilLine,
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

const QUICK_REVIEW_TAGS = [
  '맛있어요',
  '양 넉넉함',
  '빠른 배달',
  '포장 깔끔',
  '따뜻하게 도착',
];

interface MenuDetailReviewModalProps {
  menu: MenuItem | null;
  store: Store | null;
  storeMenuCount?: number;
  reviews: Review[];
  reviewReplies: Record<string, ReviewReply>;
  onAddReview?: (payload: {
    menuId: string;
    rating: number;
    content: string;
    prosTags: string[];
  }) => void;
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
  onAddReview,
  onClose,
  onQuickOrder,
  onOpenStoreMenu,
}: MenuDetailReviewModalProps) {
  const isOpen = Boolean(menu && store);
  const [isWritingReview, setIsWritingReview] = useState(false);
  const [draftRating, setDraftRating] = useState(5);
  const [draftTags, setDraftTags] = useState<string[]>(['맛있어요']);
  const [draftContent, setDraftContent] = useState('');

  useEffect(() => {
    setIsWritingReview(false);
    setDraftRating(5);
    setDraftTags(['맛있어요']);
    setDraftContent('');
  }, [menu?.id]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const prevHtmlOverflow = htmlEl.style.overflow;
    const prevBodyOverflow = bodyEl.style.overflow;
    const prevHtmlOverscroll = htmlEl.style.overscrollBehavior;
    const prevBodyOverscroll = bodyEl.style.overscrollBehavior;
    htmlEl.style.overflow = 'hidden';
    bodyEl.style.overflow = 'hidden';
    htmlEl.style.overscrollBehavior = 'none';
    bodyEl.style.overscrollBehavior = 'none';
    return () => {
      htmlEl.style.overflow = prevHtmlOverflow;
      bodyEl.style.overflow = prevBodyOverflow;
      htmlEl.style.overscrollBehavior = prevHtmlOverscroll;
      bodyEl.style.overscrollBehavior = prevBodyOverscroll;
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
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs flex items-start justify-center p-2 sm:p-3 overscroll-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[calc(100dvh-16px)] sm:max-h-[calc(100dvh-24px)] overflow-y-auto overscroll-contain touch-pan-y bg-white rounded-3xl border border-[#E8ECE4] shadow-2xl p-5 sm:p-6 space-y-4"
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#1A1D1A] flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-[#4E6E2A]" />
              <span>리뷰 ({menuReviews.length}건)</span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#4E6E2A]">
                {summary.headline}
              </span>
              {onAddReview && (
                <button
                  type="button"
                  onClick={() => setIsWritingReview((prev) => !prev)}
                  className="easy-compact min-h-[32px] px-2.5 py-1 rounded-lg bg-[#EAF1E2] hover:bg-[#DCE7CF] text-[#3D5720] text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <PencilLine className="w-3.5 h-3.5" />
                  <span>{isWritingReview ? '작성 닫기' : '리뷰 쓰기'}</span>
                </button>
              )}
            </div>
          </div>

          {isWritingReview && onAddReview && (
            <div className="p-3.5 bg-[#F7F8F5] border border-[#D4E1C5] rounded-2xl space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[#1A1D1A]">별점 선택</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setDraftRating(star)}
                      aria-label={`${star}점 선택`}
                      className="easy-compact p-1 rounded-lg hover:bg-white cursor-pointer"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          star <= draftRating
                            ? 'fill-[#82B440] text-[#4E6E2A]'
                            : 'text-[#C8D0C4]'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-1 font-mono font-bold text-[#3D5720]">
                    {draftRating}.0
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {QUICK_REVIEW_TAGS.map((tag) => {
                  const selected = draftTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setDraftTags((prev) =>
                          selected
                            ? prev.filter((t) => t !== tag)
                            : [...prev, tag]
                        )
                      }
                      className={`easy-compact px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer transition-colors ${
                        selected
                          ? 'bg-[#4E6E2A] border-[#4E6E2A] text-white'
                          : 'bg-white border-[#E8ECE4] text-[#434B40]'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              <textarea
                rows={3}
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder="메뉴의 맛, 양, 포장 상태를 솔직하게 남겨주세요."
                className="w-full p-3 bg-white border border-[#D4E1C5] rounded-xl text-xs sm:text-sm text-[#1A1D1A] placeholder:text-[#687064]"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsWritingReview(false)}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[#E8ECE4] bg-white text-[#555E52] font-semibold cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={!draftContent.trim()}
                  onClick={() => {
                    const trimmed = draftContent.trim();
                    if (!trimmed) return;
                    onAddReview({
                      menuId: menu.id,
                      rating: draftRating,
                      content: trimmed,
                      prosTags: draftTags,
                    });
                    setDraftContent('');
                    setIsWritingReview(false);
                  }}
                  className="min-h-[36px] px-4 py-1.5 rounded-xl bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] text-white font-bold cursor-pointer disabled:cursor-not-allowed"
                >
                  리뷰 등록
                </button>
              </div>
            </div>
          )}

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
                    {reply && reply.text.trim() && (
                      <div className="p-2.5 bg-white border border-[#D4E1C5] rounded-xl text-[#3D5720]">
                        <span className="font-bold">점주 답글:</span>{' '}
                        {reply.text.trim().replace(/^\[점주 답글\]\s*/, '')}
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
