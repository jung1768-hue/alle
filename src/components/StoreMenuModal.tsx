import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Heart,
  MapPin,
  MessageSquare,
  Plus,
  ShoppingBag,
  Sparkles,
  Star,
  Store as StoreIcon,
  X,
  Zap,
} from 'lucide-react';
import {
  CartLineItem,
  CartState,
  MenuItem,
  Review,
  ReviewReply,
  Store,
  StoreCoupon,
  StorePromotion,
} from '../types/alle';
import { buildRuleReviewSummary } from '../utils/gemini';
import { formatWon, getEffectiveMenuPrice } from '../utils/parser';
import { calculateStoreDeliveryFee } from '../utils/pricing';
import { FoodImage } from './FoodImage';

interface StoreMenuModalProps {
  store: Store | null;
  storeMenus: MenuItem[];
  storePromotions?: StorePromotion[];
  storeCoupons?: StoreCoupon[];
  highlightMenuId?: string | null;
  initialServings?: number;
  initialOptionIds?: string[];
  preselectHighlight?: boolean;
  reviews: Review[];
  reviewReplies: Record<string, ReviewReply>;
  cart: CartState | null;
  wishlistIds: string[];
  onToggleWishlist: (menuId: string) => void;
  onAddMultipleToCart: (
    storeId: string,
    items: CartLineItem[],
    options?: { replaceSameStore?: boolean }
  ) => void;
  onProceedToConfirmWithItems: (payload: {
    storeId: string;
    items: CartLineItem[];
    couponCode?: string;
  }) => void;
  onClose: () => void;
}

export function StoreMenuModal({
  store,
  storeMenus,
  storePromotions = [],
  storeCoupons = [],
  highlightMenuId,
  initialServings = 1,
  initialOptionIds = [],
  preselectHighlight = false,
  reviews,
  reviewReplies,
  cart,
  wishlistIds,
  onToggleWishlist,
  onAddMultipleToCart,
  onProceedToConfirmWithItems,
  onClose,
}: StoreMenuModalProps) {
  const isOpen = Boolean(store);
  const [activeTab, setActiveTab] = useState<'menus' | 'reviews'>('menus');
  const [draftItems, setDraftItems] = useState<CartLineItem[]>([]);
  const [expandedOptionsMenuId, setExpandedOptionsMenuId] = useState<string | null>(
    null
  );
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      htmlEl.style.overflow = prevHtmlOverflow;
      bodyEl.style.overflow = prevBodyOverflow;
      htmlEl.style.overscrollBehavior = prevHtmlOverscroll;
      bodyEl.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    scrollBodyRef.current?.scrollTo({ top: 0 });
  }, [isOpen, store?.id, activeTab]);

  useEffect(() => {
    if (!store) return;
    setActiveTab('menus');
    setExpandedOptionsMenuId(highlightMenuId ?? null);

    const baseItems: CartLineItem[] =
      cart && cart.storeId === store.id
        ? cart.items.map((it) => ({
            menuId: it.menuId,
            quantity: it.quantity,
            selectedOptionIds: [...it.selectedOptionIds],
          }))
        : [];

    if (preselectHighlight && highlightMenuId) {
      const targetMenu = storeMenus.find((m) => m.id === highlightMenuId);
      if (
        targetMenu &&
        !targetMenu.isSoldOut &&
        targetMenu.stock > 0 &&
        !baseItems.some((it) => it.menuId === highlightMenuId)
      ) {
        baseItems.unshift({
          menuId: highlightMenuId,
          quantity: Math.min(Math.max(1, initialServings), targetMenu.stock),
          selectedOptionIds: [...initialOptionIds],
        });
      }
    }

    setDraftItems(baseItems);
  }, [store?.id, highlightMenuId, preselectHighlight]);

  const menuById = useMemo(
    () => new Map(storeMenus.map((m) => [m.id, m])),
    [storeMenus]
  );

  const availableMenus = useMemo(
    () => storeMenus.filter((m) => !m.isSoldOut && m.stock >= 1),
    [storeMenus]
  );

  const soldOutMenus = useMemo(
    () => storeMenus.filter((m) => m.isSoldOut || m.stock < 1),
    [storeMenus]
  );

  const highlightMenu = useMemo(
    () =>
      highlightMenuId
        ? storeMenus.find((m) => m.id === highlightMenuId) ?? null
        : null,
    [storeMenus, highlightMenuId]
  );

  const otherMainMenus = useMemo(
    () =>
      availableMenus.filter(
        (m) => m.id !== highlightMenu?.id && !m.isSideMenu
      ),
    [availableMenus, highlightMenu]
  );

  const sideMenus = useMemo(
    () =>
      availableMenus.filter(
        (m) => m.id !== highlightMenu?.id && Boolean(m.isSideMenu)
      ),
    [availableMenus, highlightMenu]
  );

  const storeReviews = useMemo(() => {
    const ids = new Set(storeMenus.map((m) => m.id));
    return reviews.filter((r) => ids.has(r.menuId));
  }, [storeMenus, reviews]);

  const storeReviewSummary = useMemo(
    () => buildRuleReviewSummary(storeReviews),
    [storeReviews]
  );

  const activeStorePromos = useMemo(
    () =>
      store
        ? storePromotions.filter((p) => p.storeId === store.id && p.isActive)
        : [],
    [storePromotions, store?.id]
  );

  const activeStoreCoupons = useMemo(
    () =>
      store
        ? storeCoupons.filter((c) => c.storeId === store.id && c.isActive)
        : [],
    [storeCoupons, store?.id]
  );

  const totals = useMemo(() => {
    let menuSubtotal = 0;
    let optionsSubtotal = 0;
    let totalQty = 0;

    for (const item of draftItems) {
      const m = menuById.get(item.menuId);
      if (!m) continue;
      const unit = getEffectiveMenuPrice(m);
      const optDelta = m.options
        .filter((o) => item.selectedOptionIds.includes(o.id))
        .reduce((s, o) => s + o.priceDelta, 0);
      menuSubtotal += unit * item.quantity;
      optionsSubtotal += optDelta * item.quantity;
      totalQty += item.quantity;
    }

    const feeCalc = store
      ? calculateStoreDeliveryFee(store, menuSubtotal, 'partner_direct')
      : null;
    const deliveryFee = feeCalc?.finalDeliveryFee ?? 0;
    const grandTotal =
      draftItems.length > 0 ? menuSubtotal + optionsSubtotal + deliveryFee : 0;

    return {
      menuSubtotal,
      optionsSubtotal,
      totalQty,
      deliveryFee,
      nextTierLabel: feeCalc?.nextTierLabel ?? null,
      tierSavings: feeCalc?.tierSavings ?? 0,
      grandTotal,
    };
  }, [draftItems, menuById, store]);

  if (!store) return null;

  const adjustMenuQuantity = (menu: MenuItem, delta: number) => {
    if (!store.isOpen || menu.isSoldOut || menu.stock < 1) return;
    setDraftItems((prev) => {
      const idx = prev.findIndex((it) => it.menuId === menu.id);
      if (idx === -1) {
        if (delta <= 0) return prev;
        return [
          ...prev,
          {
            menuId: menu.id,
            quantity: Math.min(delta, menu.stock),
            selectedOptionIds: [],
          },
        ];
      }
      const nextQty = prev[idx].quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return prev.map((it, i) =>
        i === idx
          ? { ...it, quantity: Math.min(menu.stock, nextQty) }
          : it
      );
    });
  };

  const toggleMenuOption = (menu: MenuItem, optionId: string) => {
    if (!store.isOpen || menu.isSoldOut || menu.stock < 1) return;
    setDraftItems((prev) => {
      const idx = prev.findIndex((it) => it.menuId === menu.id);
      if (idx === -1) {
        return [
          ...prev,
          {
            menuId: menu.id,
            quantity: 1,
            selectedOptionIds: [optionId],
          },
        ];
      }
      const curOpts = prev[idx].selectedOptionIds;
      const exists = curOpts.includes(optionId);
      const nextOpts = exists
        ? curOpts.filter((id) => id !== optionId)
        : [...curOpts, optionId];
      return prev.map((it, i) =>
        i === idx ? { ...it, selectedOptionIds: nextOpts } : it
      );
    });
  };

  const renderMenuRow = (menu: MenuItem, isHighlighted = false) => {
    const lineItem = draftItems.find((it) => it.menuId === menu.id);
    const qty = lineItem?.quantity ?? 0;
    const selectedOpts = lineItem?.selectedOptionIds ?? [];
    const effectivePrice = getEffectiveMenuPrice(menu);
    const hasClosing = (menu.closingDiscountPercent ?? 0) > 0;
    const isSameStore =
      menu.storePrice !== null && menu.storePrice === menu.pricePerPerson;
    const wished = wishlistIds.includes(menu.id);
    const unavailable = !store.isOpen || menu.isSoldOut || menu.stock < 1;
    const optsExpanded = expandedOptionsMenuId === menu.id;

    return (
      <div
        key={menu.id}
        className={`rounded-2xl border p-3.5 space-y-2.5 transition-colors ${
          isHighlighted
            ? 'bg-[#EAF1E2]/70 border-[#4E6E2A]'
            : qty > 0
              ? 'bg-[#FAFCF8] border-[#82B440]'
              : 'bg-white border-[#E8ECE4]'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl overflow-hidden border border-[#E8ECE4] shrink-0 bg-[#F7F8F5]">
            <FoodImage
              src={menu.image}
              alt={menu.name}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1 mb-0.5">
                  {isHighlighted && (
                    <span className="px-2 py-0.5 rounded-full bg-[#4E6E2A] text-white text-[10px] font-bold inline-flex items-center gap-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      추천 메뉴
                    </span>
                  )}
                  {isSameStore && (
                    <span className="px-1.5 py-0.5 rounded-md bg-[#EAF1E2] text-[#3D5720] text-[10px] font-bold">
                      💚 착한가격 · 매장 동일가
                    </span>
                  )}
                  {hasClosing && (
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-600 text-white text-[10px] font-bold">
                      마감 -{menu.closingDiscountPercent}%
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-[#1A1D1A] leading-snug">
                  {menu.name}
                </h4>
              </div>

              <button
                type="button"
                onClick={() => onToggleWishlist(menu.id)}
                aria-label={`${menu.name} 찜하기`}
                className="easy-compact p-1 rounded-lg hover:bg-[#F7F8F5] shrink-0 cursor-pointer"
              >
                <Heart
                  className={`w-4 h-4 ${
                    wished ? 'fill-red-500 text-red-500' : 'text-[#919A8D]'
                  }`}
                />
              </button>
            </div>

            <p className="text-xs text-[#687064] line-clamp-2 leading-snug">
              {menu.description}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="tabular-nums">
                {hasClosing && (
                  <span className="text-xs text-[#687064] line-through mr-1.5">
                    {formatWon(menu.pricePerPerson)}
                  </span>
                )}
                <span className="text-sm font-extrabold font-mono text-[#1A1D1A]">
                  {formatWon(effectivePrice)}
                </span>
                <span className="text-[11px] text-[#687064] ml-1.5">
                  · 재고 {menu.stock}개
                </span>
              </div>

              {unavailable ? (
                <span className="px-2.5 py-1 rounded-xl bg-[#F0F3EC] text-[#687064] text-xs font-semibold">
                  {!store.isOpen ? '영업 중단' : '품절'}
                </span>
              ) : qty === 0 ? (
                <button
                  type="button"
                  onClick={() => adjustMenuQuantity(menu, 1)}
                  className="easy-compact min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#EAF1E2] hover:bg-[#DCE7CF] border border-[#82B440] text-[#3D5720] text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>추가</span>
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => adjustMenuQuantity(menu, -1)}
                    aria-label={`${menu.name} 수량 감소`}
                    className="easy-compact w-8 h-8 rounded-lg border border-[#D4E1C5] bg-white hover:bg-[#EAF1E2] text-[#1A1D1A] text-sm font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-6 text-center font-mono tabular-nums text-sm font-extrabold text-[#3D5720]">
                    {qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustMenuQuantity(menu, 1)}
                    aria-label={`${menu.name} 수량 증가`}
                    className="easy-compact w-8 h-8 rounded-lg border border-[#4E6E2A] bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-sm font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {menu.options.length > 0 && !unavailable && (
          <div className="pt-2 border-t border-[#E8ECE4]/80 space-y-2">
            <button
              type="button"
              onClick={() =>
                setExpandedOptionsMenuId((prev) =>
                  prev === menu.id ? null : menu.id
                )
              }
              className="easy-compact text-[11px] font-bold text-[#4E6E2A] inline-flex items-center gap-1 cursor-pointer"
            >
              <span>
                추가 옵션 {menu.options.length}개
                {selectedOpts.length > 0 && ` (${selectedOpts.length}개 선택됨)`}
              </span>
              {optsExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {optsExpanded && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {menu.options.map((opt) => {
                  const checked = selectedOpts.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className={`px-2.5 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer ${
                        checked
                          ? 'bg-[#EAF1E2] border-[#4E6E2A] text-[#1A1D1A]'
                          : 'bg-[#F7F8F5] border-[#E8ECE4] text-[#434B40]'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMenuOption(menu, opt.id)}
                          className="w-4 h-4 accent-[#4E6E2A] shrink-0"
                        />
                        <span className="truncate font-medium">{opt.name}</span>
                      </span>
                      <span className="font-mono text-[11px] font-bold text-[#4E6E2A] shrink-0">
                        +{formatWon(opt.priceDelta)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${store.name} 전체 메뉴`}
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[2px] flex items-start justify-center p-2 sm:p-3 overscroll-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl max-h-[calc(100dvh-16px)] sm:max-h-[calc(100dvh-24px)] bg-white rounded-3xl border border-[#E8ECE4] shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Compact Sticky Store Header */}
        <div className="px-4 sm:px-5 py-3 bg-white border-b border-[#E8ECE4] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#E8ECE4] shrink-0">
              <FoodImage
                src={store.image}
                alt={store.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[#4E6E2A]">
                <span className="inline-flex items-center gap-1">
                  <StoreIcon className="w-3.5 h-3.5" />
                  {store.category}
                </span>
                {!store.singlePriceRevoked && (
                  <span className="px-2 py-0.5 rounded-full bg-[#EAF1E2] text-[#3D5720] font-bold">
                    💚 착한가격 · 매장 동일가
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#1A1D1A] truncate mt-0.5">
                {store.name}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="가게 메뉴 창 닫기"
            className="easy-compact w-9 h-9 rounded-xl bg-[#F7F8F5] hover:bg-[#EAF1E2] text-[#687064] flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Unified Scrollable Body (Store Metadata + Sticky Tabs + Menu List) */}
        <div
          ref={scrollBodyRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-[#F7F8F5]"
        >
          <div className="bg-white px-4 sm:px-5 py-3 border-b border-[#E8ECE4] space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#687064] tabular-nums">
              <span className="inline-flex items-center gap-1 font-bold text-[#1A1D1A]">
                <Star className="w-3.5 h-3.5 fill-[#82B440] text-[#82B440]" />
                {(store.rating ?? 4.9).toFixed(1)} (
                {(store.reviewCount ?? 850).toLocaleString('ko-KR')})
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#4E6E2A]" />
                약 {store.basePrepMinutes + 8 + (store.extraPrepMinutes ?? 0)}분
              </span>
              <span>·</span>
              <span>
                배달비 {store.deliveryFee === 0 ? '무료' : formatWon(store.deliveryFee)}
              </span>
              <span>·</span>
              <span className="font-bold text-[#3D5720]">
                최소주문 없음 · 1개도 배달
              </span>
            </div>

            {store.deliveryFeeTiers && store.deliveryFeeTiers.length > 0 && (
              <p className="text-[11px] font-semibold text-[#4E6E2A] bg-[#F7F8F5] px-2.5 py-1 rounded-lg inline-block">
                🤝 점주 상생 배달비:{' '}
                {[...store.deliveryFeeTiers]
                  .sort((a, b) => a.minSubtotal - b.minSubtotal)
                  .map(
                    (t) =>
                      `${formatWon(t.minSubtotal)}↑ ${
                        t.deliveryFee === 0 ? '무료' : formatWon(t.deliveryFee)
                      }`
                  )
                  .join(' · ')}
              </p>
            )}

            {(activeStorePromos.length > 0 || activeStoreCoupons.length > 0) && (
              <div className="space-y-1.5 pt-0.5">
                {activeStorePromos.map((promo) => (
                  <div
                    key={promo.id}
                    className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950"
                  >
                    <span className="font-extrabold mr-1.5">
                      🎉 [{promo.badgeText ?? '가게 이벤트'}]
                    </span>
                    <span className="font-bold">{promo.title}</span>
                    {promo.description && (
                      <p className="text-[11px] text-amber-900 mt-0.5">
                        {promo.description}
                      </p>
                    )}
                  </div>
                ))}
                {activeStoreCoupons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {activeStoreCoupons.map((cp) => (
                      <span
                        key={cp.id}
                        className="px-2.5 py-1 rounded-lg bg-[#EAF1E2] border border-[#82B440] text-[#3D5720] text-[11px] font-bold"
                      >
                        🎟️ {cp.label} (결제 시 자동 적용)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-1 text-[11px] text-[#687064]">
              <MapPin className="w-3 h-3 text-[#4E6E2A] shrink-0" />
              <span className="truncate">{store.areaLabel}</span>
            </div>
          </div>

          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xs px-4 sm:px-5 py-2.5 border-b border-[#E8ECE4]">
            <div className="grid grid-cols-2 p-1 bg-[#F0F3EC] rounded-xl border border-[#E8ECE4]">
              <button
                type="button"
                onClick={() => setActiveTab('menus')}
                className={`easy-compact min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  activeTab === 'menus'
                    ? 'bg-[#4E6E2A] text-white'
                    : 'text-[#555E52] hover:text-[#1A1D1A]'
                }`}
              >
                전체 메뉴 ({availableMenus.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('reviews')}
                className={`easy-compact min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  activeTab === 'reviews'
                    ? 'bg-[#4E6E2A] text-white'
                    : 'text-[#555E52] hover:text-[#1A1D1A]'
                }`}
              >
                가게 리뷰 ({storeReviews.length})
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-5">
          {activeTab === 'menus' ? (
            <>
              {highlightMenu && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-[#3D5720] flex items-center gap-1.5 px-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#4E6E2A]" />
                    <span>방금 선택한 추천 메뉴</span>
                  </h3>
                  {renderMenuRow(highlightMenu, true)}
                </div>
              )}

              {otherMainMenus.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-[#1A1D1A] px-1">
                    🍽️ {highlightMenu ? '이 가게의 다른 메인 메뉴' : '대표 메뉴'} (
                    {otherMainMenus.length})
                  </h3>
                  <div className="space-y-2.5">
                    {otherMainMenus.map((m) => renderMenuRow(m, false))}
                  </div>
                </div>
              )}

              {sideMenus.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-[#1A1D1A] px-1">
                    🍟 함께 즐기기 좋은 사이드 · 추가 메뉴 ({sideMenus.length})
                  </h3>
                  <div className="space-y-2.5">
                    {sideMenus.map((m) => renderMenuRow(m, false))}
                  </div>
                </div>
              )}

              {soldOutMenus.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-[#687064] px-1">
                    품절 · 준비 중 메뉴 ({soldOutMenus.length})
                  </h3>
                  <div className="space-y-2 opacity-75">
                    {soldOutMenus.map((m) => renderMenuRow(m, false))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 bg-[#EAF1E2] border border-[#D4E1C5] rounded-2xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#3D5720]">
                  <MessageSquare className="w-4 h-4 text-[#4E6E2A]" />
                  <span>{storeReviewSummary.headline}</span>
                </div>
                <p className="text-xs text-[#3D5720]">
                  💡 {storeReviewSummary.recommendationTip}
                </p>
              </div>

              {storeReviews.length === 0 ? (
                <div className="p-6 bg-white border border-[#E8ECE4] rounded-2xl text-center text-xs text-[#687064]">
                  아직 등록된 메뉴별 상세 리뷰가 없습니다.
                </div>
              ) : (
                storeReviews.map((rev) => {
                  const m = menuById.get(rev.menuId);
                  const reply = reviewReplies[rev.id];
                  return (
                    <div
                      key={rev.id}
                      className="p-3.5 bg-white border border-[#E8ECE4] rounded-2xl space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 text-[#687064]">
                        <span className="font-bold text-[#1A1D1A]">
                          {rev.author}
                          {m && (
                            <span className="font-normal text-[#4E6E2A] ml-1.5">
                              · {m.name}
                            </span>
                          )}
                        </span>
                        <span className="font-mono font-bold text-[#4E6E2A] shrink-0">
                          ★ {rev.rating.toFixed(1)} · {rev.date}
                        </span>
                      </div>
                      <p className="text-[#1A1D1A] leading-relaxed">
                        {rev.content}
                      </p>
                      {rev.photos && rev.photos.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {rev.photos.map((photo, pIdx) => (
                            <img
                              key={`${photo.name}-${pIdx}`}
                              src={photo.dataUrl}
                              alt={photo.name}
                              className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-[#E8ECE4]"
                            />
                          ))}
                        </div>
                      )}
                      {reply && reply.text && (
                        <div className="p-2.5 bg-[#EAF1E2]/70 border border-[#D4E1C5] rounded-xl text-[#3D5720]">
                          <span className="font-bold">점주 답글:</span>{' '}
                          {reply.text}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
          </div>
        </div>

        {/* Sticky Bottom Action Bar */}
        <div className="px-4 sm:px-5 py-3 bg-white border-t border-[#E8ECE4] space-y-2.5 shrink-0">
          {draftItems.length > 0 && totals.nextTierLabel && (
            <p className="text-[11px] font-bold text-[#3D5720] bg-[#EAF1E2] px-3 py-1 rounded-xl text-center">
              💡 {totals.nextTierLabel}
            </p>
          )}
          {draftItems.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#1A1D1A]">
                선택 메뉴{' '}
                <strong className="text-[#4E6E2A]">{draftItems.length}종</strong>{' '}
                ({totals.totalQty}개) · 배달비{' '}
                {totals.deliveryFee === 0
                  ? '무료'
                  : formatWon(totals.deliveryFee)}
                {totals.tierSavings > 0 && (
                  <strong className="ml-1 text-[#4E6E2A]">
                    (상생 -{formatWon(totals.tierSavings)})
                  </strong>
                )}
              </span>
              <span className="font-mono font-extrabold text-base text-[#4E6E2A] tabular-nums">
                총 {formatWon(totals.grandTotal)}
              </span>
            </div>
          ) : (
            <p className="text-xs text-[#687064] text-center">
              원하시는 메뉴의 <strong className="text-[#3D5720]">+ 추가</strong>{' '}
              버튼을 눌러 한 번에 담아보세요.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={draftItems.length === 0 || !store.isOpen}
              onClick={() => {
                onAddMultipleToCart(store.id, draftItems, {
                  replaceSameStore: true,
                });
                onClose();
              }}
              className="min-h-[46px] px-3 py-2.5 rounded-2xl border border-[#82B440] bg-[#EAF1E2] hover:bg-[#DCE7CF] disabled:bg-[#F7F8F5] disabled:border-[#E8ECE4] disabled:text-[#919A8D] text-[#3D5720] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span>장바구니 담기</span>
            </button>
            <button
              type="button"
              disabled={draftItems.length === 0 || !store.isOpen}
              onClick={() => {
                onProceedToConfirmWithItems({
                  storeId: store.id,
                  items: draftItems,
                });
                onClose();
              }}
              className="min-h-[46px] px-3 py-2.5 rounded-2xl bg-[#4E6E2A] hover:bg-[#3F5A21] disabled:bg-[#D4DCD0] text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              <Zap className="w-4 h-4 shrink-0" />
              <span>
                {draftItems.length > 0
                  ? `${formatWon(totals.grandTotal)} 바로 주문`
                  : '메뉴를 선택하세요'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
