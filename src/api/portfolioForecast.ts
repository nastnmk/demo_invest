import { requestJson as apiRequest } from './http';

export type ForecastTrajectoryPoint = {
  month_index: number;
  label: string;
  projected_value: number;
};

export type ForecastCase = {
  final_value: number;
  total_return_pct: number;
  trajectory: ForecastTrajectoryPoint[];
};

export type ForecastDistribution = {
  mean_final_value: number;
  median_final_value: number;
  p10_final_value: number;
  p90_final_value: number;
  probability_positive_pct: number;
  expected_return_pct: number;
};

export type PortfolioForecastResponse = {
  portfolio_id: number;
  current_value: number;
  forecast_months: number;
  trading_days: number;
  historical_days: number;
  simulations: number;
  method: string;
  average_case: ForecastCase;
  best_case: ForecastCase;
  worst_case: ForecastCase;
  distribution: ForecastDistribution;
};

const DEFAULT_MONTHS = 6;
const DEFAULT_SIMULATIONS = 500;
const DEFAULT_HISTORICAL_DAYS = 252;

// Прогноз по портфелю с бэка, не дергать без смены id или параметров
export async function getPortfolioForecast(
  portfolioId: number,
  opts?: { months?: number; simulations?: number; historical_days?: number }
): Promise<PortfolioForecastResponse> {
  const months = opts?.months ?? DEFAULT_MONTHS;
  const simulations = opts?.simulations ?? DEFAULT_SIMULATIONS;
  const historical_days = opts?.historical_days ?? DEFAULT_HISTORICAL_DAYS;
  const q = new URLSearchParams({
    months: String(months),
    simulations: String(simulations),
    historical_days: String(historical_days)
  });
  return apiRequest<PortfolioForecastResponse>(`/api/v1/portfolios/${portfolioId}/forecast?${q.toString()}`);
}
