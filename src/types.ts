export interface Stock {
  assetId?: number;
  secid: string;
  shortName: string;
  price: number;
  changePct: number;
  sector: string;
  riskLevel: string;
  liquidity: string;
  dividends: string;
  description: string;
  /** из asset profile (image_url), иначе UI — монограмма */
  logoUrl?: string;
  dayRange?: string;
  periodLabel?: string;
  chartPoints?: Array<{
    date: string;
    price: number;
  }>;
}

export interface PortfolioItem {
  stock: Stock;
  quantity: number;
  avgPrice: number;
}

export interface StressScenario {
  id: string;
  name: string;
  dateRange: string;
  description: string;
  effects: Record<string, number>;
  explanations: Record<string, string>;
}

