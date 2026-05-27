export type Quote = {
  id: string;
  code?: string;
  name?: string;
  client_id?: string;
  created_at?: string;
  updated_at?: string;
  estimator_id?: string;
  project_division_ids?: string[];
  client_name?: string;
  client_display_name?: string;
  order_number?: string;
  document_type?: string;
  estimated_value?: number;
  title?: string;
  data?: any;
};

export type QuoteSortKey =
  | 'created_desc'
  | 'created_asc'
  | 'updated_desc'
  | 'updated_asc'
  | 'client_asc'
  | 'client_desc'
  | 'value_desc'
  | 'value_asc'
  | 'estimator_asc'
  | 'estimator_desc';

export type QuoteViewMode = 'cards' | 'table';

export const VALID_SORT_KEYS: QuoteSortKey[] = [
  'created_desc',
  'created_asc',
  'updated_desc',
  'updated_asc',
  'client_asc',
  'client_desc',
  'value_desc',
  'value_asc',
  'estimator_asc',
  'estimator_desc',
];

export const DEFAULT_SORT: QuoteSortKey = 'created_desc';

export const SORT_OPTIONS: { value: QuoteSortKey; label: string }[] = [
  { value: 'created_desc', label: 'Created (newest)' },
  { value: 'created_asc', label: 'Created (oldest)' },
  { value: 'updated_desc', label: 'Updated (newest)' },
  { value: 'updated_asc', label: 'Updated (oldest)' },
  { value: 'client_asc', label: 'Client (A–Z)' },
  { value: 'client_desc', label: 'Client (Z–A)' },
  { value: 'value_desc', label: 'Value (high to low)' },
  { value: 'value_asc', label: 'Value (low to high)' },
  { value: 'estimator_asc', label: 'Estimator (A–Z)' },
  { value: 'estimator_desc', label: 'Estimator (Z–A)' },
];

export type QuoteTableColumn = 'client' | 'created' | 'updated' | 'estimator' | 'value';

const COLUMN_SORT: Record<QuoteTableColumn, { asc: QuoteSortKey; desc: QuoteSortKey }> = {
  client: { asc: 'client_asc', desc: 'client_desc' },
  created: { asc: 'created_asc', desc: 'created_desc' },
  updated: { asc: 'updated_asc', desc: 'updated_desc' },
  estimator: { asc: 'estimator_asc', desc: 'estimator_desc' },
  value: { asc: 'value_asc', desc: 'value_desc' },
};

export function parseSortKey(raw: string | null): QuoteSortKey {
  if (raw && (VALID_SORT_KEYS as string[]).includes(raw)) {
    return raw as QuoteSortKey;
  }
  return DEFAULT_SORT;
}

export function parseViewMode(raw: string | null): QuoteViewMode {
  return raw === 'table' ? 'table' : 'cards';
}

/** Strip UI-only params before calling GET /quotes */
export function buildQuotesApiQuery(searchParams: URLSearchParams): string {
  const params = new URLSearchParams(searchParams);
  params.delete('view');
  params.delete('sort');
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function preserveUiParams(
  params: URLSearchParams,
  view: QuoteViewMode,
  sort: QuoteSortKey
): URLSearchParams {
  if (view === 'table') {
    params.set('view', 'table');
  } else {
    params.delete('view');
  }
  if (sort !== DEFAULT_SORT) {
    params.set('sort', sort);
  } else {
    params.delete('sort');
  }
  return params;
}

export function formatQuoteCurrency(n: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatQuoteValueDisplay(value: number): string {
  if (value > 0) {
    return formatQuoteCurrency(value);
  }
  return '—';
}

export function getQuoteClientName(quote: Quote): string {
  return quote.client_display_name || quote.client_name || '';
}

export function getQuoteDocumentType(quote: Quote): string {
  if (quote.document_type && String(quote.document_type).trim()) {
    return String(quote.document_type);
  }
  return quote.data?.cover_title || quote.title || 'Quotation';
}

export function getEstimatorName(quote: Quote, employees?: any[]): string {
  const estimator = employees?.find((e: any) => String(e.id) === String(quote.estimator_id));
  return estimator?.name || estimator?.username || '—';
}

/** Prefer server estimated_value; fall back to data blob when present */
export function getQuoteValue(quote: Quote): number {
  if (quote.estimated_value !== undefined && quote.estimated_value !== null) {
    const v = Number(quote.estimated_value);
    if (!isNaN(v) && v > 0) return v;
  }
  if (!quote.data) return 0;
  const data = quote.data;

  const pricingSections = data.pricing_sections;
  if (pricingSections && Array.isArray(pricingSections) && pricingSections.length > 0) {
    const maxTotal = pricingSections.reduce((max: number, section: any) => {
      const sectionTotal = Number(section.total || 0);
      if (!isNaN(sectionTotal) && sectionTotal > max) {
        return sectionTotal;
      }
      return max;
    }, 0);
    if (maxTotal > 0) return maxTotal;
  }

  if (data.display_total !== undefined && data.display_total !== null && data.display_total !== '') {
    const displayTotal = Number(data.display_total);
    if (!isNaN(displayTotal) && displayTotal > 0) return displayTotal;
  }

  const totalNum = Number(data.total || 0);
  const pstRate = Number(data.pst_rate || 0);
  const gstRate = Number(data.gst_rate || 0);
  const additionalCosts = Array.isArray(data.additional_costs) ? data.additional_costs : [];

  if (additionalCosts.length === 0) {
    if (totalNum > 0) return totalNum;
    return Number(data.bid_price || data.estimate_total_estimate || 0);
  }

  const totalForPst = additionalCosts
    .filter((c: any) => c.pst === true)
    .reduce((a: number, c: any) => a + Number(c.value || 0), 0);
  const pst = totalForPst * (pstRate / 100);

  const totalForGst = additionalCosts
    .filter((c: any) => c.gst === true)
    .reduce((a: number, c: any) => a + Number(c.value || 0), 0);
  const gst = totalForGst * (gstRate / 100);

  const subtotal = totalNum + pst;
  const grandTotal = subtotal + gst;

  if (!isNaN(grandTotal) && grandTotal > 0) return grandTotal;
  if (totalNum > 0) return totalNum;
  return Number(data.bid_price || data.estimate_total_estimate || 0);
}

export function summarizeQuotes(quotes: Quote[]): { count: number; total: number; average: number } {
  const count = quotes.length;
  const total = quotes.reduce((sum, q) => sum + getQuoteValue(q), 0);
  const average = count > 0 ? total / count : 0;
  return { count, total, average };
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function compareDates(a?: string, b?: string): number {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return ta - tb;
}

export function sortQuotes(
  quotes: Quote[],
  sortKey: QuoteSortKey,
  employees?: any[]
): Quote[] {
  const copy = [...quotes];
  copy.sort((a, b) => {
    switch (sortKey) {
      case 'created_desc':
        return compareDates(b.created_at, a.created_at);
      case 'created_asc':
        return compareDates(a.created_at, b.created_at);
      case 'updated_desc':
        return compareDates(b.updated_at, a.updated_at);
      case 'updated_asc':
        return compareDates(a.updated_at, b.updated_at);
      case 'client_asc':
        return compareStrings(getQuoteClientName(a), getQuoteClientName(b));
      case 'client_desc':
        return compareStrings(getQuoteClientName(b), getQuoteClientName(a));
      case 'value_desc':
        return getQuoteValue(b) - getQuoteValue(a);
      case 'value_asc':
        return getQuoteValue(a) - getQuoteValue(b);
      case 'estimator_asc':
        return compareStrings(getEstimatorName(a, employees), getEstimatorName(b, employees));
      case 'estimator_desc':
        return compareStrings(getEstimatorName(b, employees), getEstimatorName(a, employees));
      default:
        return 0;
    }
  });
  return copy;
}

export function toggleColumnSort(current: QuoteSortKey, column: QuoteTableColumn): QuoteSortKey {
  const { asc, desc } = COLUMN_SORT[column];
  if (current === desc) return asc;
  return desc;
}

export function sortIndicator(current: QuoteSortKey, column: QuoteTableColumn): string {
  const { asc, desc } = COLUMN_SORT[column];
  if (current === asc) return ' ↑';
  if (current === desc) return ' ↓';
  return '';
}

export const QUOTES_LIST_CAP = 500;
