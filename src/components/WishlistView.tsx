import { Heart, Search, Zap } from 'lucide-react';
import { MenuItem, Store } from '../types/alle';
import { formatWon } from '../utils/parser';
import { FoodImage } from './FoodImage';

interface WishlistViewProps {
  menus: MenuItem[];
  stores: Store[];
  wishlistIds: string[];
  onToggleWishlist: (menuId: string) => void;
  onQuickSelectMenu: (menuId: string) => void;
  onQuickReorderToConfirm: (menuId: string, servings: number) => void;
  onGoToBrowse: () => void;
}

export function WishlistView({
  menus,
  stores,
  wishlistIds,
  onToggleWishlist,
  onQuickSelectMenu,
  onQuickReorderToConfirm,
  onGoToBrowse,
}: WishlistViewProps) {
  const storeMap = new Map(stores.map((s) => [s.id, s]));
  const wishedMenus = menus.filter((m) => wishlistIds.includes(m.id));

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
                        {formatWon(item.pricePerPerson)}
                      </span>
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

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E8ECE4]">
                  <button
                    type="button"
                    disabled={unavailable}
                    onClick={() => onQuickSelectMenu(item.id)}
                    className="min-h-[42px] px-3 py-2 bg-[#F7F8F5] hover:bg-[#EAF1E2] disabled:opacity-50 text-[#1A1D1A] text-xs font-bold rounded-xl cursor-pointer disabled:cursor-not-allowed"
                  >
                    상세 · 리뷰
                  </button>
                  <button
                    type="button"
                    disabled={unavailable}
                    onClick={() => onQuickReorderToConfirm(item.id, 1)}
                    className="min-h-[42px] px-3 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] disabled:text-[#687064] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
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
    </div>
  );
}
