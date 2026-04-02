import { requestJson as apiRequest } from './http';

export type RecommendedAsset = {
  asset_id: number;
  secid: string;
  short_name: string;
  sector: string;
  industry?: string | null;
  weight_pct: number;
  amount_for_budget: number;
  current_price: number;
  lot_size: number;
  estimated_lots: number;
  estimated_quantity: number;
  annual_return_pct: number;
  annualized_volatility_pct: number;
  dividend_profile?: string | null;
  risk_level?: string | null;
  liquidity_level?: string | null;
  rationale?: string | null;
};

export type RecommendedPortfolioSummary = {
  expected_annual_return_pct: number;
  expected_annual_volatility_pct: number;
  weighted_dividend_score: number;
};

export type RecommendedPortfolioItem = {
  theme_key: string;
  title: string;
  description: string;
  risk_profile: string;
  investment_horizon: string;
  budget: number;
  assets: RecommendedAsset[];
  summary: RecommendedPortfolioSummary;
};

export type RecommendedPortfoliosResponse = {
  generated_at: string;
  history_days: number;
  budget: number;
  items: RecommendedPortfolioItem[];
};

/** Один запрос каталога; кэшировать на уровне страницы по budget/history_days/top_assets. */
export async function getRecommendedPortfolios(params: {
  budget: number;
  history_days?: number;
  top_assets?: number;
}): Promise<RecommendedPortfoliosResponse> {
  const q = new URLSearchParams({
    budget: String(params.budget),
    history_days: String(params.history_days ?? 252),
    top_assets: String(params.top_assets ?? 4)
  });
  return apiRequest<RecommendedPortfoliosResponse>(`/api/v1/advisory/recommended-portfolios?${q.toString()}`);
}
