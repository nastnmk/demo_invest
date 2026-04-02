/**
 * Клиент торгового API: активы, котировки (источник на стороне сервера — MOEX),
 * портфель, аналитика, стресс-сценарии (сценарии и % изменений приходят с backend, не зашиты во фронте).
 */
import { PortfolioItem, Stock } from '../types';
import { dividendProfileRu } from '../utils/dividendProfileRu';
import { sectorLabelRu } from '../utils/sectorLabels';
import { requestJson as apiRequest } from './http';

type AssetRead = {
  id: number;
  secid: string;
  short_name: string;
  currency: string;
  is_active: boolean;
};

type AssetPriceRead = {
  id?: number;
  asset_id: number;
  last_price: number;
  open_price?: number | null;
  change_pct?: number | null;
  change_abs?: number | null;
  low_price?: number | null;
  high_price?: number | null;
  snapshot_time?: string | null;
};

type AssetProfileRead = {
  asset_id: number;
  sector?: string | null;
  description?: string | null;
  risk_level?: string | null;
  /** snake_case из FastAPI */
  dividend_profile?: string | null;
  /** на случай camelCase в JSON */
  dividendProfile?: string | null;
  /** альтернативное имя поля в некоторых ответах API */
  dividends?: string | null;
  liquidity_level?: string | null;
};

function dividendProfileFromApi(profile: AssetProfileRead | undefined): string | null {
  if (!profile) return null;
  return profile.dividend_profile ?? profile.dividendProfile ?? profile.dividends ?? null;
}

type PortfolioRead = {
  id: number;
  title: string;
  initial_cash: number;
  cash_balance: number;
  total_value: number;
  currency: string;
};

type PortfolioPositionRead = {
  asset_id: number;
  quantity: number;
  avg_buy_price: number;
};

export type PortfolioHistoryPoint = {
  snapshot_time: string;
  total_value: number;
  cash_balance: number;
};

type PortfolioHistoryRead = {
  portfolio_id: number;
  items: PortfolioHistoryPoint[];
};

export type StressScenarioApi = {
  id: number;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type StressAssetImpactApi = {
  asset_id: number;
  secid: string;
  short_name: string;
  sector: string;
  quantity: number;
  current_price: number;
  scenario_change_pct: number;
  stressed_price: number;
  position_value_before: number;
  position_value_after: number;
  change_abs: number;
  change_pct: number;
  explanation?: string | null;
};

export type SectorBreakdownItem = {
  sector: string;
  value_before: number;
  value_after: number;
  change_abs: number;
  change_pct: number;
};

export type StressTestResultApi = {
  portfolio_id: number;
  scenario: StressScenarioApi;
  summary: {
    value_before: number;
    value_after: number;
    change_abs: number;
    change_pct: number;
    cash_unchanged: number;
  };
  asset_impacts: StressAssetImpactApi[];
  sector_breakdown?: SectorBreakdownItem[];
  highlights?: {
    worst_asset_secid: string;
    best_asset_secid: string;
    worst_sector: string;
  };
};

export type StressScenarioFull = StressScenarioApi & {
  effects?: Array<{
    id: number;
    scenario_id: number;
    asset_id: number;
    change_pct: number;
    explanation?: string | null;
  }>;
};

type ChartPoint = {
  date: string;
  price: number;
  timestamp: number;
};

export type AssetCandlesResponse = {
  points: Array<{
    date: string;
    price: number;
  }>;
  periodLabel?: string;
  dayRange?: string;
};

/** Заглушка для сброса клиентских кэшей при logout (расширяйте при добавлении кэшей). */
export function clearClientCaches(): void {}

const formatDate = (date: Date): string => date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

const parseDateValue = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const str = String(value).trim();
  if (!str) return null;

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const short = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(`${str}T00:00:00`) : null;
  if (short && !Number.isNaN(short.getTime())) {
    return short;
  }

  return null;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const normalizeRiskLabel = (value?: string | null): string => {
  const raw = (value || '').trim();
  const v = raw.toLowerCase();
  if (!v) return 'Не указано';
  if (v.includes('низ') || v.includes('low')) return 'Низкий';
  if (v.includes('сред') || v.includes('medium')) return 'Средний';
  if (v.includes('выс') || v.includes('high')) return 'Высокий';
  return raw;
};

const normalizeLiquidityLabel = (value?: string | null): string => {
  const raw = (value || '').trim();
  const v = raw.toLowerCase();
  if (!v) return 'Не указано';
  if (v.includes('низ') || v.includes('low')) return 'Низкая';
  if (v.includes('сред') || v.includes('medium')) return 'Средняя';
  if (v.includes('выс') || v.includes('high')) return 'Высокая';
  return raw;
};

const extractCandles = (payload: unknown): ChartPoint[] => {
  const candidates: unknown[] = [];

  if (Array.isArray(payload)) {
    candidates.push(...payload);
  } else if (payload && typeof payload === 'object') {
    const asObj = payload as Record<string, unknown>;
    for (const key of ['items', 'candles', 'data', 'results']) {
      if (Array.isArray(asObj[key])) {
        candidates.push(...(asObj[key] as unknown[]));
      }
    }
  }

  const parsed = candidates
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const date = parseDateValue(row.trade_date ?? row.date ?? row.begin ?? row.datetime ?? row.time);
      const price = toNumber(row.close_price);
      if (!date || price == null) return null;
      return {
        date: formatDate(date),
        price: Number(price.toFixed(2)),
        timestamp: date.getTime()
      };
    })
    .filter((point): point is ChartPoint => Boolean(point));

  parsed.sort((a, b) => a.timestamp - b.timestamp);
  const last30 = parsed.length > 30 ? parsed.slice(-30) : parsed;
  return last30;
};

const buildPeriodLabel = (points: ChartPoint[]): string | undefined => {
  if (points.length < 2) return undefined;
  return `${points[0].date} - ${points[points.length - 1].date}`;
};

export async function fetchAssetCandles(assetId: number, limit = 30, interval = '1d'): Promise<AssetCandlesResponse> {
  const candlesRaw = await apiRequest<unknown>(`/api/v1/assets/${assetId}/candles?interval=${interval}&limit=${limit}`);
  const candles = extractCandles(candlesRaw);

  if (candles.length === 0) {
    return { points: [] };
  }

  const low = Math.min(...candles.map(item => item.price));
  const high = Math.max(...candles.map(item => item.price));

  return {
    points: candles.map(({ date, price }) => ({ date, price })),
    periodLabel: buildPeriodLabel(candles),
    dayRange: `${low.toFixed(2)} - ${high.toFixed(2)} ₽`
  };
}

export type RefreshLiveItem = {
  asset_id: number;
  secid: string;
  short_name?: string;
  last_price: number;
  snapshot_time?: string;
};

export type RefreshLiveResponse = {
  cached?: boolean;
  cache_ttl_seconds?: number;
  refreshed_at?: string;
  items?: RefreshLiveItem[];
};

export async function refreshLivePrices(secids: string[]): Promise<RefreshLiveResponse> {
  const body = secids.length > 0 ? JSON.stringify({ secids }) : JSON.stringify({});
  return apiRequest<RefreshLiveResponse>('/api/v1/assets/refresh-live', {
    method: 'POST',
    body
  });
}

/** Подставить свежие last_price из ответа refresh-live в уже загруженный список бумаг. */
export function mergeStocksWithLivePrices(stocks: Stock[], live: RefreshLiveResponse | null | undefined): Stock[] {
  const items = live?.items;
  if (!items?.length) return stocks;
  const bySecid = new Map(items.map(i => [i.secid, i]));
  return stocks.map(s => {
    const row = bySecid.get(s.secid);
    if (!row) return s;
    const p = toNumber(row.last_price);
    if (p == null) return s;
    return { ...s, price: Number(p.toFixed(2)) };
  });
}

/**
 * Обновить котировки только для указанных тикеров (после сделки), без полного fetchStocks().
 */
export async function patchStocksPricesForSecids(stocks: Stock[], secids: string[]): Promise<Stock[]> {
  const uniq = [...new Set(secids)].filter(Boolean);
  if (uniq.length === 0) return stocks;
  const live = await refreshLivePrices(uniq).catch(() => null);
  let merged = mergeStocksWithLivePrices(stocks, live ?? undefined);
  const needFallback = uniq.filter(secid => {
    const row = live?.items?.find(i => i.secid === secid);
    return !row || toNumber(row.last_price) == null;
  });
  if (needFallback.length === 0) return merged;

  const bySecid = new Map(merged.map(s => [s.secid, s]));
  for (const secid of needFallback) {
    const s = bySecid.get(secid);
    if (!s?.assetId) continue;
    try {
      const price = await apiRequest<AssetPriceRead>(`/api/v1/assets/${s.assetId}/price`);
      const lp = toNumber(price.last_price);
      if (lp == null) continue;
      const ch = toNumber(price.change_pct) ?? 0;
      bySecid.set(secid, {
        ...s,
        price: Number(lp.toFixed(2)),
        changePct: Number(ch.toFixed(2))
      });
    } catch {
      /* ignore */
    }
  }
  return merged.map(s => bySecid.get(s.secid) ?? s);
}

export type PortfolioAnalyticsHistoryPoint = {
  date: string;
  value: number;
};

export type PortfolioMetrics = {
  total_return_pct?: number;
  annualized_return_pct?: number;
  avg_daily_return_pct?: number;
  daily_volatility_pct?: number;
  annualized_volatility_pct?: number;
  sharpe_ratio?: number;
  max_drawdown_pct?: number;
  best_day_return_pct?: number;
  worst_day_return_pct?: number;
};

function parseAnalyticsHistoryRaw(raw: unknown): PortfolioAnalyticsHistoryPoint[] {
  const items: unknown[] = [];
  if (Array.isArray(raw)) {
    items.push(...raw);
  } else if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.items)) items.push(...o.items);
    else if (Array.isArray(o.data)) items.push(...o.data);
  }

  const tmp: { t: number; value: number }[] = [];
  for (const row of items) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const d = parseDateValue(r.trade_date ?? r.date ?? r.snapshot_time ?? r.day);
    const v = toNumber(
      r.stocks_value ?? r.total_value ?? r.portfolio_value ?? r.value ?? r.equity ?? r.close
    );
    if (!d || v == null) continue;
    tmp.push({ t: d.getTime(), value: Number(v.toFixed(2)) });
  }
  tmp.sort((a, b) => a.t - b.t);
  return tmp.map(x => ({
    date: new Date(x.t).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
    value: x.value
  }));
}

export async function getPortfolioAnalyticsHistory(
  portfolioId: number,
  days = 300
): Promise<PortfolioAnalyticsHistoryPoint[]> {
  const raw = await apiRequest<unknown>(
    `/api/v1/portfolios/${portfolioId}/analytics/history?days=${days}`
  );
  return parseAnalyticsHistoryRaw(raw);
}

export async function getPortfolioAnalyticsMetrics(
  portfolioId: number,
  days = 300
): Promise<PortfolioMetrics> {
  return apiRequest<PortfolioMetrics>(`/api/v1/portfolios/${portfolioId}/analytics/metrics?days=${days}`);
}

export async function fetchStocks(): Promise<Stock[]> {
  const assets = await apiRequest<AssetRead[]>('/api/v1/assets');
  const profiles = await apiRequest<AssetProfileRead[]>('/api/v1/asset-profiles').catch(() => [] as AssetProfileRead[]);

  const activeAssetsRaw = assets.filter(asset => asset.is_active);
  const activeAssets = activeAssetsRaw.length > 0 ? activeAssetsRaw : assets;
  if (activeAssets.length === 0) return [];

  const profileMap = new Map<number, AssetProfileRead>(profiles.map(profile => [profile.asset_id, profile]));

  const stocks = await Promise.all(
    activeAssets.map(async asset => {
      const profile = profileMap.get(asset.id);
      const description = profile?.description?.trim();

      if (!description) {
        return null;
      }

      let price: AssetPriceRead;
      try {
        price = await apiRequest<AssetPriceRead>(`/api/v1/assets/${asset.id}/price`);
      } catch {
        return null;
      }

      const lastPrice = toNumber(price.last_price);
      if (lastPrice == null) {
        return null;
      }

      const low = price.low_price ?? undefined;
      const high = price.high_price ?? undefined;

      return {
        assetId: asset.id,
        secid: asset.secid,
        shortName: asset.short_name,
        price: Number(lastPrice.toFixed(2)),
        changePct: Number((toNumber(price.change_pct) ?? 0).toFixed(2)),
        sector: profile?.sector?.trim()
          ? sectorLabelRu(profile.sector.trim())
          : asset.currency,
        riskLevel: normalizeRiskLabel(profile?.risk_level),
        liquidity: normalizeLiquidityLabel(profile?.liquidity_level),
        dividends: dividendProfileRu(dividendProfileFromApi(profile)),
        description,
        logoUrl: undefined,
        dayRange: low != null && high != null ? `${Number(low).toFixed(2)} - ${Number(high).toFixed(2)} ₽` : undefined,
        periodLabel: undefined,
        chartPoints: undefined
      } satisfies Stock;
    })
  );

  return stocks.filter((stock): stock is NonNullable<typeof stock> => Boolean(stock));
}

export async function listPortfolios(): Promise<PortfolioRead[]> {
  return apiRequest<PortfolioRead[]>('/api/v1/portfolios');
}

export async function createPortfolio(initialCash: number): Promise<PortfolioRead> {
  const title = `Портфель ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return apiRequest<PortfolioRead>('/api/v1/portfolios', {
    method: 'POST',
    body: JSON.stringify({
      title,
      initial_cash: initialCash,
      currency: 'RUB'
    })
  });
}

export async function ensurePortfolio(initialCash: number): Promise<PortfolioRead> {
  const portfolios = await listPortfolios();
  if (portfolios.length > 0) return portfolios[0];
  return createPortfolio(initialCash);
}

export async function getPortfolio(portfolioId: number): Promise<PortfolioRead> {
  return apiRequest<PortfolioRead>(`/api/v1/portfolios/${portfolioId}`);
}

export async function getPortfolioPositions(portfolioId: number): Promise<PortfolioPositionRead[]> {
  return apiRequest<PortfolioPositionRead[]>(`/api/v1/portfolios/${portfolioId}/positions`);
}

export async function getPortfolioHistory(portfolioId: number, limit = 120): Promise<PortfolioHistoryPoint[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const history = await apiRequest<PortfolioHistoryRead>(`/api/v1/portfolios/${portfolioId}/history?${params.toString()}`);
  return history.items;
}

export async function buyAsset(portfolioId: number, assetId: number, quantity: number): Promise<void> {
  await apiRequest(`/api/v1/portfolios/${portfolioId}/buy`, {
    method: 'POST',
    body: JSON.stringify({ asset_id: assetId, quantity })
  });
}

export async function sellAsset(portfolioId: number, assetId: number, quantity: number): Promise<void> {
  await apiRequest(`/api/v1/portfolios/${portfolioId}/sell`, {
    method: 'POST',
    body: JSON.stringify({ asset_id: assetId, quantity })
  });
}

export function mapPositionsToPortfolioItems(positions: PortfolioPositionRead[], stocks: Stock[]): PortfolioItem[] {
  const stocksByAssetId = new Map<number, Stock>();
  stocks.forEach(stock => {
    if (stock.assetId != null) {
      stocksByAssetId.set(stock.assetId, stock);
    }
  });

  return positions
    .map(position => {
      const stock = stocksByAssetId.get(position.asset_id);
      if (!stock) return null;
      return {
        stock,
        quantity: position.quantity,
        avgPrice: position.avg_buy_price
      };
    })
    .filter((item): item is PortfolioItem => Boolean(item));
}

export async function fetchStressScenarios(): Promise<StressScenarioApi[]> {
  return apiRequest<StressScenarioApi[]>('/api/v1/stress-scenarios');
}

export async function fetchStressScenariosFull(): Promise<{ items: StressScenarioFull[] }> {
  return apiRequest<{ items: StressScenarioFull[] }>('/api/v1/stress-scenarios/full');
}

export async function executeStressTest(portfolioId: number, scenarioId: number): Promise<StressTestResultApi> {
  return apiRequest<StressTestResultApi>(`/api/v1/portfolios/${portfolioId}/stress-test/${scenarioId}`, {
    method: 'POST'
  });
}
