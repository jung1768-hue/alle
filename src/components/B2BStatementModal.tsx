import { Download, FileText, Printer, X } from 'lucide-react';
import { B2BDocumentType, Order } from '../types/alle';
import { formatWon } from '../utils/parser';
import { B2B_SERVICE_FEE_RATE } from '../utils/pricing';

interface B2BStatementModalProps {
  order: Order | null;
  onClose: () => void;
  onGoToOrders?: () => void;
}

const DOC_TYPE_LABEL: Record<B2BDocumentType, string> = {
  transaction_statement: '거래명세표',
  tax_invoice: '전자세금계산서 발행 요청',
  expense_receipt: '법인 지출결의서 영수증',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitSupplyAndVat(grossAmount: number): { supply: number; vat: number } {
  const safe = Math.max(0, Math.round(grossAmount));
  const supply = Math.round(safe / 1.1);
  return { supply, vat: safe - supply };
}

export function B2BStatementModal({
  order,
  onClose,
  onGoToOrders,
}: B2BStatementModalProps) {
  if (!order) return null;

  const doc = order.b2bDocumentInfo;
  const statementNumber = doc?.statementNumber ?? `STMT-${order.orderCode}`;
  const issuedAt = doc?.issuedAt ?? order.createdAt;
  const buyerCompany = doc?.companyName || order.customerAlias || '법인 고객';
  const buyerBizNo = doc?.businessNumber || '미입력 (사후 등록 가능)';
  const buyerDept = doc?.representativeOrDept || '총무/경영지원팀';
  const buyerEmail = doc?.contactEmail || 'finance@alle.kr';
  const requestedDocs: B2BDocumentType[] =
    doc?.requestedDocs && doc.requestedDocs.length > 0
      ? doc.requestedDocs
      : ['transaction_statement'];

  const serviceFee =
    order.b2bServiceFee ?? Math.round(order.menuSubtotal * B2B_SERVICE_FEE_RATE);

  const lineRows = [
    {
      name: `${order.menuName} (${order.storeName})`,
      spec: `${order.servings}인분 · 매장 동일가`,
      gross: order.menuSubtotal,
    },
    {
      name: '배달 배송비',
      spec: order.reservationSlot || 'B2B 예약 배송',
      gross: order.deliveryFee,
    },
    {
      name: 'B2B 정산·관제 서비스 이용료 (3.5%)',
      spec: '법인 증빙·예약 관제',
      gross: serviceFee,
    },
  ];

  const itemized = lineRows.map((row) => ({
    ...row,
    ...splitSupplyAndVat(row.gross),
  }));

  const totalSupply = itemized.reduce((sum, r) => sum + r.supply, 0);
  const totalVat = itemized.reduce((sum, r) => sum + r.vat, 0);
  const grandTotal = order.totalAmount;

  const buildPrintableHtml = (): string => {
    const rowsHtml = itemized
      .map(
        (row, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.spec)}</td>
        <td style="text-align:right;">${formatWon(row.supply)}</td>
        <td style="text-align:right;">${formatWon(row.vat)}</td>
        <td style="text-align:right;font-weight:700;">${formatWon(row.gross)}</td>
      </tr>`
      )
      .join('');

    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>거래명세표_${escapeHtml(order.orderCode)}</title>
  <style>
    body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; color: #1A1D1A; padding: 28px; margin: 0; }
    .sheet { max-width: 780px; margin: 0 auto; border: 2px solid #1A1D1A; padding: 24px; }
    h1 { margin: 0 0 6px; font-size: 22px; text-align: center; letter-spacing: 4px; }
    .sub { text-align: center; font-size: 12px; color: #555E52; margin-bottom: 18px; }
    .meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 14px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .box { border: 1px solid #C8D0C4; padding: 10px 12px; font-size: 12px; line-height: 1.6; }
    .box-title { font-weight: 700; color: #3D5720; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
    th, td { border: 1px solid #C8D0C4; padding: 8px 10px; }
    th { background: #F7F8F5; font-weight: 700; }
    .total-row { background: #EAF1E2; font-weight: 700; }
    .foot { font-size: 11px; color: #555E52; line-height: 1.6; border-top: 1px dashed #C8D0C4; padding-top: 10px; }
    @media print { body { padding: 0; } .sheet { border-width: 1px; } }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>거 래 명 세 표</h1>
    <div class="sub">(공급받는자 보관용 · 올레 B2B 기업 식대)</div>
    <div class="meta">
      <div>문서번호: <strong>${escapeHtml(statementNumber)}</strong> (주문 ${escapeHtml(order.orderCode)})</div>
      <div>발행일시: ${escapeHtml(issuedAt)}</div>
    </div>
    <div class="grid">
      <div class="box">
        <div class="box-title">공급자 (플랫폼 · 판매처)</div>
        <div>상호: (주)올레 (alle) · 판매매장: ${escapeHtml(order.storeName)}</div>
        <div>사업자등록번호: 504-86-01928</div>
        <div>중개수수료 정책: 음식값 중개수수료 0% (착한가격)</div>
      </div>
      <div class="box">
        <div class="box-title">공급받는자 (법인 · 단체)</div>
        <div>회사/기관명: <strong>${escapeHtml(buyerCompany)}</strong></div>
        <div>사업자등록번호: ${escapeHtml(buyerBizNo)}</div>
        <div>담당/부서: ${escapeHtml(buyerDept)} · 수신: ${escapeHtml(buyerEmail)}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:42px;">No</th>
          <th>품목 / 내역</th>
          <th>규격 / 비고</th>
          <th style="width:95px;">공급가액</th>
          <th style="width:80px;">세액(VAT)</th>
          <th style="width:100px;">합계금액</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="total-row">
          <td colspan="3" style="text-align:center;">합 계</td>
          <td style="text-align:right;">${formatWon(totalSupply)}</td>
          <td style="text-align:right;">${formatWon(totalVat)}</td>
          <td style="text-align:right;font-size:14px;">${formatWon(grandTotal)}</td>
        </tr>
      </tbody>
    </table>
    <div class="foot">
      <div>• 결제수단: ${escapeHtml(order.paymentMethodLabel || '법인 결제 완료')} · 도착예약: ${escapeHtml(order.reservationSlot || '예약 배송')}</div>
      <div>• 요청 증빙서류: ${escapeHtml(requestedDocs.map((d) => DOC_TYPE_LABEL[d]).join(', '))}</div>
    </div>
  </div>
</body>
</html>`;
  };

  const handlePrint = () => {
    const html = buildPrintableHtml();
    const popup = window.open('', '_blank', 'width=860,height=780');
    if (popup) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      window.setTimeout(() => {
        popup.print();
      }, 250);
    } else {
      window.print();
    }
  };

  const handleDownload = () => {
    const html = buildPrintableHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `거래명세표_${order.orderCode}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="법인 거래명세표 및 증빙 서류"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div className="w-full max-w-2xl bg-white border border-[#D4E1C5] rounded-3xl shadow-2xl overflow-hidden my-auto">
        <div className="bg-[#1A1D1A] text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-5 h-5 text-[#82B440] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
                거래명세표 · 법인 증빙 서류
              </h3>
              <p className="text-xs text-[#C8D0C4] font-mono truncate">
                {statementNumber} · {issuedAt}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="거래명세표 닫기"
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 max-h-[76vh] overflow-y-auto">
          {/* Requested docs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {requestedDocs.map((d) => (
              <span
                key={d}
                className="px-2.5 py-1 rounded-full bg-[#EAF1E2] border border-[#D4E1C5] text-[#3D5720] text-xs font-bold"
              >
                ✓ {DOC_TYPE_LABEL[d]}
              </span>
            ))}
          </div>

          {/* Supplier / Buyer Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-1">
              <div className="font-extrabold text-[#3D5720]">
                공급자 (플랫폼 · 판매처)
              </div>
              <p className="font-bold text-[#1A1D1A]">
                (주)올레 (alle) · {order.storeName}
              </p>
              <p className="text-[#555E52] font-mono">
                사업자번호: 504-86-01928
              </p>
              <p className="text-[#555E52]">음식값 중개수수료 0% (착한가격)</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] space-y-1">
              <div className="font-extrabold text-[#3D5720]">
                공급받는자 (법인 · 단체)
              </div>
              <p className="font-bold text-[#1A1D1A]">{buyerCompany}</p>
              <p className="text-[#555E52] font-mono">
                사업자번호: {buyerBizNo}
              </p>
              <p className="text-[#555E52] truncate">
                {buyerDept} · {buyerEmail}
              </p>
            </div>
          </div>

          {/* Statement Table */}
          <div className="overflow-x-auto rounded-2xl border border-[#E8ECE4]">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#F7F8F5] text-[#555E52] border-b border-[#E8ECE4]">
                  <th className="py-2.5 px-3 font-bold">품목 / 내역</th>
                  <th className="py-2.5 px-2 font-bold text-right">공급가액</th>
                  <th className="py-2.5 px-2 font-bold text-right">부가세</th>
                  <th className="py-2.5 px-3 font-bold text-right">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8ECE4]">
                {itemized.map((row) => (
                  <tr key={row.name}>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-[#1A1D1A]">{row.name}</div>
                      <div className="text-[11px] text-[#687064]">{row.spec}</div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#555E52]">
                      {formatWon(row.supply)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[#555E52]">
                      {formatWon(row.vat)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[#1A1D1A]">
                      {formatWon(row.gross)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#EAF1E2]/70 font-extrabold text-[#1A1D1A]">
                  <td className="py-3 px-3">총 합계 (VAT 포함)</td>
                  <td className="py-3 px-2 text-right font-mono tabular-nums">
                    {formatWon(totalSupply)}
                  </td>
                  <td className="py-3 px-2 text-right font-mono tabular-nums">
                    {formatWon(totalVat)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-sm text-[#4E6E2A]">
                    {formatWon(grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-3 rounded-2xl bg-[#F7F8F5] border border-[#E8ECE4] text-xs text-[#555E52] space-y-1">
            <div>
              결제 수단:{' '}
              <strong className="text-[#1A1D1A]">
                {order.paymentMethodLabel || '법인 결제 완료'}
              </strong>
            </div>
            <div>
              도착 예약:{' '}
              <strong className="text-[#1A1D1A]">
                {order.reservationSlot || '예약 배송'}
              </strong>{' '}
              · 수령지: {order.addressAlias}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 bg-[#F7F8F5] border-t border-[#E8ECE4] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[40px] px-3.5 py-2 bg-[#4E6E2A] hover:bg-[#3F5A21] text-white text-xs sm:text-sm font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>인쇄 / PDF 저장</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[40px] px-3.5 py-2 bg-white hover:bg-[#EAF1E2] border border-[#D4E1C5] text-[#3D5720] text-xs sm:text-sm font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>거래명세표 저장 (.html)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onGoToOrders && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGoToOrders();
                }}
                className="min-h-[40px] px-3.5 py-2 bg-[#1A1D1A] text-white text-xs sm:text-sm font-bold rounded-xl cursor-pointer"
              >
                주문 현황 보기
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3.5 py-2 bg-white border border-[#E8ECE4] text-[#555E52] text-xs sm:text-sm font-semibold rounded-xl cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
