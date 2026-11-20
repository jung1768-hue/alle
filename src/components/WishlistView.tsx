import { useMemo, useState } from 'react';
import {
  Clock,
  Heart,
  MessageSquare,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Store as StoreIcon,
  X,
  Zap,
} from 'lucide-react';
import { INITIAL_REVIEWS } from '../data/seedData';
import { MenuItem, Review, ReviewReply, Store } from '../types/alle';
import { buildRuleReviewSummary } from '../utils/gemini';
import { formatWon, getEffectiveMenuPrice } from '../utils/parser';
import { FoodImage } from './FoodImage';

interface WishlistViewProps {
  menus: MenuItem[];
  stores: Store[];
  wishlistIds: string[];
  reviews?: Review[];
  reviewReplies?: Record<string, ReviewReply>;
  onToggleWishlist: (menuId: string) => void;
  onQuickSelectMenu?: (menuId: string) => void;
  onAddToCart?: (
    menuId: string,
    quantity?: number,
    selectedOptionIds?: string[]
  ) => void;
  onQuickReorderToConfirm: (menuId: string, servings: number) => void;
  onGoToBrowse: () => void;
}

export function WishlistView({
  menus,
  stores,
  wishlistIds,
  reviews = INITIAL_REVIEWS,
  reviewReplies = {},
  onToggleWishlist,
  onAddToCart,
  onQuickReorderToConfirm,
  onGoToBrowse,
}: WishlistViewProps) {
  const [detailMenuId, setDetailMenuId] = useState<string | null>(null);
  const storeMap = new Map(stores.map((s) => [s.id, s]));
  const wishedMenus = menus.filter((m) => wishlistIds.includes(m.id));

  const detailTarget = useMemo(() => {
    if (!detailMenuId) return null;
    const menu = menus.find((m) => m.id === detailMenuId);
    if (!menu) return null;
    const store = storeMap.get(menu.storeId);
    if (!store) return null;
    const menuReviews = reviews.filter((r) => r.menuId === menu.id);
    const summary = buildRuleReviewSummary(menuReviews);
    return { menu, store, menuReviews, summary };
  }, [detailMenuId, menus, reviews, storeMap]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[#1A1D1A]">찜한 메뉴</h1>
        <span className="text-sm font-bold text-[#4E6E2A] tabular-nums">
          {wishedMenus.length}개
        </span>
      </div>

      {wishedMenus.length === 0 ? (
        <div className="bg-white border border-[#E8ECE4] rounded-3xl p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#EAF1E2] text-[#4E6E2A] flex items-center justify-center mx-auto">
            <Heart className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-[#1A1D1A]">
              찜한 메뉴가 없습니다
            </h2>
            <p className="text-xs sm:text-sm text-[#687064]">
              마음에 드는 메뉴에 하트를 눌러 저장해 보세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToBrowse}
            className="min-h-[44px] px-5 py-2.5 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-sm font-bold rounded-2xl inline-flex items-center gap-2 cursor-pointer"
          >
            <Search className="w-4 h-4" />
            <span>메뉴 둘러보기</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {wishedMenus.map((item) => {
            const store = storeMap.get(item.storeId);
            if (!store) return null;
            const unavailable =
              !store.isOpen || item.isSoldOut || item.stock <= 0;
            const effectiveMinutes =
              item.estimatedMinutes + (store.extraPrepMinutes ?? 0);

            return (
              <article
                key={item.id}
                className="bg-white border border-[#E8ECE4] rounded-3xl p-4 flex flex-col justify-between gap-4 shadow-[0_2px_10px_rgba(26,29,26,0.03)]"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-[#E8ECE4]">
                    <FoodImage
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-[#687064] truncate">
                          {store.name} · 약 {effectiveMinutes}분
                        </p>
                        <h2 className="text-base font-bold text-[#1A1D1A] truncate mt-0.5">
                          {item.name}
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleWishlist(item.id)}
                        aria-label={`${item.name} 찜 해제`}
                        className="min-w-[38px] min-h-[38px] rounded-xl hover:bg-red-50 flex items-center justify-center text-red-500 shrink-0 cursor-pointer"
                      >
                        <Heart className="w-5 h-5 fill-current" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs mt-1.5">
                      <span className="font-mono tabular-nums font-bold text-sm text-[#1A1D1A]">
                        {formatWon(getEffectiveMenuPrice(item))}
                      </span>
                      {(item.closingDiscountPercent ?? 0) > 0 && (
                        <span className="text-[11px] font-bold text-amber-800">
                          (-{item.closingDiscountPercent}%)
                        </span>
                      )}
                      <span aria-hidden="true" className="text-[#D4E1C5]">
                        ·
                      </span>
                      <span
                        className={`font-semibold tabular-nums ${
                          unavailable ? 'text-red-700' : 'text-[#4E6E2A]'
                        }`}
                      >
                        {!store.isOpen
                          ? '영업 중단'
                          : item.isSoldOut || item.stock <= 0
                            ? '품절'
                            : `재고 ${item.stock}개`}
                      </span>
                      {item.storePrice !== null &&
                        item.comparisonDate !== null &&
                        item.storePrice === item.pricePerPerson && (
                          <>
                            <span aria-hidden="true" className="text-[#D4E1C5]">
                              ·
                            </span>
                            <span className="font-semibold text-[#4E6E2A]">
                              매장 동일 가격
                            </span>
                          </>
                        )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E8ECE4]">
                  <button
                    type="button"
                    onClick={() => setDetailMenuId(item.id)}
                    className="min-h-[42px] px-2.5 py-2 bg-[#F7F8F5] hover:bg-[#EAF1E2] text-[#1A1D1A] text-xs font-bold rounded-xl cursor-pointer"
                  >
                    상세 · 리뷰
                  </button>
                  {onAddToCart && (
                    <button
                      type="button"
                      disabled={unavailable}
                      onClick={() => onAddToCart(item.id, 1, [])}
                      className="min-h-[42px] px-2.5 py-2 bg-[#EAF1E2] hover:bg-[#DCE7CF] disabled:bg-[#F7F8F5] disabled:text-[#687064] text-[#3D5720] text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>담기</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={unavailable}
                    onClick={() => onQuickReorderToConfirm(item.id, 1)}
                    className={`${
                      onAddToCart ? '' : 'col-span-2'
                    } min-h-[42px] px-2.5 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] disabled:text-[#687064] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{unavailable ? '주문 불가' : '바로 주문'}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {detailTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${detailTarget.menu.name} 상세 및 리뷰`}
          onClick={() => setDetailMenuId(null)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl border border-[#E8ECE4] shadow-2xl p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[#E8ECE4] shrink-0">
                  <FoodImage
                    src={detailTarget.menu.image}
                    alt={detailTarget.menu.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-xs font-medium text-[#687064]">
                    <StoreIcon className="w-3.5 h-3.5 text-[#4E6E2A] shrink-0" />
                    <span className="truncate">{detailTarget.store.name}</span>
                  </div>
                  <h2 className="text-lg font-bold text-[#1A1D1A] truncate">
                    {detailTarget.menu.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs mt-0.5 tabular-nums">
                    <span className="font-mono font-bold text-[#4E6E2A]">
                      {formatWon(getEffectiveMenuPrice(detailTarget.menu))}
                    </span>
                    {detailTarget.menu.storePrice ===
                      detailTarget.menu.pricePerPerson && (
                      <span className="px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] text-[11px] font-bold">
                        매장 동일가 ✓
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[#687064]">
                      <Clock className="w-3.5 h-3.5 text-[#4E6E2A]" />약{' '}
                      {detailTarget.menu.estimatedMinutes}분
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailMenuId(null)}
                aria-label="상세 팝업 닫기"
                className="p-2 rounded-xl text-[#687064] hover:bg-[#F7F8F5] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[#434B40] leading-relaxed">
              {detailTarget.menu.description}
            </p>

            {detailTarget.menu.aiReason && (
              <div className="p-3 bg-[#EAF1E2] border border-[#D4E1C5] rounded-2xl text-xs text-[#3D5720] font-medium flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-[#4E6E2A] shrink-0 mt-0.5" />
                <span>{detailTarget.menu.aiReason}</span>
              </div>
            )}

            <div className="pt-3 border-t border-[#E8ECE4] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1A1D1A] flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-[#4E6E2A]" />
                  <span>리뷰 ({detailTarget.menuReviews.length}건)</span>
                </h3>
                <span className="text-xs font-semibold text-[#4E6E2A]">
                  {detailTarget.summary.headline}
                </span>
              </div>

              {detailTarget.menuReviews.length === 0 ? (
                <p className="p-3.5 bg-[#F7F8F5] border border-[#E8ECE4] rounded-2xl text-xs text-[#687064]">
                  아직 등록된 상세 리뷰가 없습니다.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {detailTarget.menuReviews.map((review) => {
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

            <div className="pt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDetailMenuId(null)}
                className="min-h-[44px] px-4 py-2 border border-[#E8ECE4] bg-white hover:bg-[#F7F8F5] text-[#1A1D1A] text-xs sm:text-sm font-bold rounded-xl cursor-pointer"
              >
                닫기
              </button>
              <button
                type="button"
                disabled={
                  !detailTarget.store.isOpen ||
                  detailTarget.menu.isSoldOut ||
                  detailTarget.menu.stock <= 0
                }
                onClick={() => {
                  const id = detailTarget.menu.id;
                  setDetailMenuId(null);
                  onQuickReorderToConfirm(id, 1);
                }}
                className="min-h-[44px] px-4 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] text-white text-xs sm:text-sm font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>바로 주문</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
