import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, HelpCircle, Loader2, RefreshCw } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell
} from 'recharts';
import type { PortfolioAnalyticsHistoryPoint, PortfolioMetrics } from '../api/moex';
import {
  getPortfolioForecast,
  type PortfolioForecastResponse
} from '../api/portfolioForecast';
import { PortfolioItem, Stock } from '../types';
import { InvestmentGoals } from './InvestmentGoals';
import { PortfolioPositionRow } from './PortfolioPositionRow';
import { IntroModal } from './IntroModal';
import { ForecastIntroContent, PortfolioIntroContent } from '../intro/introContents';
import { LS_FORECAST_INTRO, LS_INTRO_PORTFOLIO } from '../intro/storageKeys';
import { sectorLabelRu } from '../utils/sectorLabels';

interface AnalyticsProps {
  portfolioId: number | null;
  portfolio: PortfolioItem[];
  balance: number;
  initialBalance: number;
  maxPositions: number;
  riskTestAvailable: boolean;
  chartPoints: PortfolioAnalyticsHistoryPoint[];
  portfolioMetrics: PortfolioMetrics | null;
  onRiskTest: () => void;
  onSell: (stock: Stock, quantity?: number) => void;
  onTradeDelta: (stock: Stock, delta: number) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  canRefresh: boolean;
}

const PIE_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#14b8a6', '#eab308', '#f97316'];

const FUTURE_MONTHS = 30;

// Три кривые с бэка в одну таблицу для графика
function buildForecastChartRows(f: PortfolioForecastResponse): Array<{
  month: number;
  label: string;
  avg: number;
  max: number;
  min: number;
}> {
  const a = f.average_case.trajectory;
  const b = f.best_case.trajectory;
  const w = f.worst_case.trajectory;
  const n = Math.min(a.length, b.length, w.length);
  const rows: Array<{ month: number; label: string; avg: number; max: number; min: number }> = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      month: a[i].month_index,
      label: a[i].label,
      avg: a[i].projected_value,
      max: b[i].projected_value,
      min: w[i].projected_value
    });
  }
  return rows;
}

// Запасной прогноз на фронте если бэк не ответил, не совет
function computeFutureProjection(
  equityRub: number,
  sharpe: number
): { month: number; min: number; avg: number; max: number }[] {
  const P0 = Math.max(equityRub, 1);
  const s = Number.isFinite(sharpe) ? Math.max(0.2, Math.min(2.5, sharpe)) : 0.85;
  const rAvg = 0.0075 * (0.72 + s * 0.28);
  const rMax = rAvg * 1.52;
  const rMin = rAvg * 0.58;
  const out: { month: number; min: number; avg: number; max: number }[] = [];
  for (let m = 0; m <= FUTURE_MONTHS; m++) {
    const maxV = P0 * (1 + rMax) ** m;
    const avgV = P0 * (1 + rAvg) ** m;
    const dip = m <= 6 ? 1 - 0.055 * Math.sin((m / 6) * (Math.PI / 2)) : 1;
    const minV = P0 * dip * (1 + rMin) ** m;
    out.push({ month: m, min: minV, avg: avgV, max: maxV });
  }
  return out;
}

function formatRubCompact(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

export function Analytics({
  portfolioId,
  portfolio,
  balance,
  initialBalance,
  maxPositions,
  riskTestAvailable,
  chartPoints,
  portfolioMetrics,
  onRiskTest,
  onSell,
  onTradeDelta,
  onRefresh,
  isRefreshing,
  canRefresh
}: AnalyticsProps) {
  const [showIntro, setShowIntro] = useState(false);
  const [showForecastIntro, setShowForecastIntro] = useState(false);
  const [futurePrediction, setFuturePrediction] = useState(false);
  const [forecast, setForecast] = useState<PortfolioForecastResponse | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const forecastCacheRef = useRef<Map<number, PortfolioForecastResponse>>(new Map());

  useEffect(() => {
    if (!portfolioId) {
      setForecast(null);
      setForecastError(null);
      return;
    }
    const cached = forecastCacheRef.current.get(portfolioId);
    setForecast(cached ?? null);
    setForecastError(null);
  }, [portfolioId]);

  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(LS_INTRO_PORTFOLIO) !== '1') {
        setShowIntro(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const dismissIntro = () => {
    try {
      localStorage.setItem(LS_INTRO_PORTFOLIO, '1');
    } catch {
      /* ignore */
    }
    setShowIntro(false);
  };

  const dismissForecastIntro = () => {
    try {
      localStorage.setItem(LS_FORECAST_INTRO, '1');
    } catch {
      /* ignore */
    }
    setShowForecastIntro(false);
  };

  useEffect(() => {
    if (!futurePrediction) {
      setShowForecastIntro(false);
      return;
    }
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(LS_FORECAST_INTRO) !== '1') {
        setShowForecastIntro(true);
      }
    } catch {
      setShowForecastIntro(true);
    }
  }, [futurePrediction]);

  const totalPortfolioValue = portfolio.reduce((sum, item) => sum + item.stock.price * item.quantity, 0);
  const totalEquity = balance + totalPortfolioValue;
  const profit = totalEquity - initialBalance;
  const profitPct = initialBalance > 0 ? (profit / initialBalance) * 100 : 0;

  const chartData = useMemo(() => {
    if (chartPoints.length > 1) {
      return chartPoints.map(p => ({ date: p.date, value: p.value }));
    }

    return Array.from({ length: 30 }).map((_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      const wave = Math.sin(i / 4) * 0.03;
      const trend = (profitPct / 100) * (i / 29);
      return {
        date: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
        value: Number((initialBalance * (1 + trend + wave)).toFixed(2))
      };
    });
  }, [chartPoints, initialBalance, profitPct]);

  const sharpe = useMemo(() => {
    const m = portfolioMetrics?.sharpe_ratio;
    if (m != null && Number.isFinite(m)) return m;
    if (chartData.length < 2) return 0;
    const returns = chartData.slice(1).map((point, idx) => (point.value - chartData[idx].value) / chartData[idx].value);
    const avg = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - avg) ** 2, 0) / returns.length;
    const volatility = Math.sqrt(variance);
    if (volatility === 0) return 0;
    return (avg / volatility) * Math.sqrt(252);
  }, [chartData, portfolioMetrics]);

  const projectionSeries = useMemo(() => computeFutureProjection(totalEquity, sharpe), [totalEquity, sharpe]);

  const projectionEnd = projectionSeries[projectionSeries.length - 1];
  const projectionLegend = useMemo(() => {
    if (!projectionEnd) return null;
    const start = totalEquity;
    const pctOf = (v: number) => (start > 0 ? ((v - start) / start) * 100 : 0);
    return {
      max: {
        label: 'Макс. доход',
        total: projectionEnd.max,
        gain: projectionEnd.max - start,
        color: '#22c55e',
        pct: pctOf(projectionEnd.max)
      },
      avg: {
        label: 'Сред. доход',
        total: projectionEnd.avg,
        gain: projectionEnd.avg - start,
        color: '#f4f4f5',
        pct: pctOf(projectionEnd.avg)
      },
      min: {
        label: 'Мин. доход',
        total: projectionEnd.min,
        gain: projectionEnd.min - start,
        color: '#ef4444',
        pct: pctOf(projectionEnd.min)
      }
    };
  }, [projectionEnd, totalEquity]);

  const loadForecastRemote = useCallback(
    async (force: boolean) => {
      if (!portfolioId || portfolio.length === 0) return;
      if (!force) {
        const cached = forecastCacheRef.current.get(portfolioId);
        if (cached) {
          setForecast(cached);
          setForecastError(null);
          setForecastLoading(false);
          return;
        }
      }
      setForecastLoading(true);
      setForecastError(null);
      try {
        const data = await getPortfolioForecast(portfolioId);
        forecastCacheRef.current.set(portfolioId, data);
        setForecast(data);
      } catch (e) {
        setForecast(null);
        setForecastError(e instanceof Error ? e.message : 'Не удалось загрузить прогноз.');
      } finally {
        setForecastLoading(false);
      }
    },
    [portfolioId, portfolio.length]
  );

  useEffect(() => {
    if (!futurePrediction || !portfolioId || portfolio.length === 0) {
      return;
    }
    void loadForecastRemote(false);
  }, [futurePrediction, portfolioId, portfolio.length, loadForecastRemote]);

  const futureChartData = useMemo(() => {
    if (forecast) return buildForecastChartRows(forecast);
    return projectionSeries.map(r => ({
      ...r,
      label: r.month === 0 ? 'Сейчас' : `${r.month} мес.`
    }));
  }, [forecast, projectionSeries]);

  const monthTicks = useMemo(() => futureChartData.map(r => r.month), [futureChartData]);

  const futureMonthsMax = forecast?.forecast_months ?? FUTURE_MONTHS;

  const apiLegend = useMemo(() => {
    if (!forecast) return null;
    const start = totalEquity;
    return {
      max: {
        label: 'Лучший сценарий',
        total: forecast.best_case.final_value,
        gain: forecast.best_case.final_value - start,
        color: '#22c55e',
        pct: forecast.best_case.total_return_pct
      },
      avg: {
        label: 'Средний сценарий',
        total: forecast.average_case.final_value,
        gain: forecast.average_case.final_value - start,
        color: '#f4f4f5',
        pct: forecast.average_case.total_return_pct
      },
      min: {
        label: 'Худший сценарий',
        total: forecast.worst_case.final_value,
        gain: forecast.worst_case.final_value - start,
        color: '#ef4444',
        pct: forecast.worst_case.total_return_pct
      }
    };
  }, [forecast, totalEquity]);

  const activeLegend = apiLegend ?? projectionLegend;

  const sharpeStatus = sharpe >= 1.2 ? 'Сбалансированный' : sharpe >= 0.7 ? 'Умеренный' : 'Рискованный';

  const sharpeExplanation = useMemo(() => {
    if (sharpe >= 1.2) {
      return 'Это хороший результат: за каждый риск портфель дает неплохую отдачу. Простыми словами, риск оправдан.';
    }
    if (sharpe >= 0.7) {
      return 'Средний результат: доходность есть, но риск тоже заметный. Портфель стоит чуть лучше диверсифицировать.';
    }
    return 'Слабый результат: риска много, а награда за него небольшая. Лучше уменьшить долю самых волатильных активов.';
  }, [sharpe]);

  const uniqueSectors = new Set(portfolio.map(item => sectorLabelRu(item.stock.sector))).size;

  const diversificationStatus = useMemo(() => {
    if (uniqueSectors >= 4) return 'хорошая';
    if (uniqueSectors >= 2) return 'средняя';
    return 'плохая';
  }, [uniqueSectors]);

  const sectorDistribution = useMemo(() => {
    const bySector = new Map<string, number>();
    for (const item of portfolio) {
      const key = sectorLabelRu(item.stock.sector);
      const value = item.stock.price * item.quantity;
      bySector.set(key, (bySector.get(key) || 0) + value);
    }

    const total = Array.from(bySector.values()).reduce((a, b) => a + b, 0);
    return Array.from(bySector.entries()).map(([name, value]) => ({
      name,
      value: Number(value.toFixed(2)),
      percent: total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0
    }));
  }, [portfolio]);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <IntroModal open={showIntro} title="Раздел «Портфель»" onDismiss={dismissIntro}>
        <PortfolioIntroContent />
      </IntroModal>

      <IntroModal open={showForecastIntro} title="Как работает наш прогноз?" onDismiss={dismissForecastIntro}>
        <ForecastIntroContent />
      </IntroModal>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 mb-2 tracking-tight">
            Портфель
            <button
              type="button"
              onClick={() => setShowIntro(true)}
              className="rounded-full p-0.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors"
              title="О чём этот экран"
              aria-label="О чём этот экран"
            >
              <HelpCircle className="w-6 h-6" strokeWidth={2} />
            </button>
          </h1>
          <p className="text-zinc-400 text-lg">Состав, доходность и график стоимости</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!canRefresh || isRefreshing}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200 text-sm font-medium shrink-0 self-start"
          title="Запросить актуальные цены с биржи и обновить суммы в портфеле"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Обновить цены
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#2a2a2a] rounded-3xl p-6 border border-zinc-700/50">
            <div className="flex justify-between items-center mb-6">
              <span className="text-zinc-400 font-medium">Стоимость акций</span>
              <span className="text-xl font-bold font-mono">{totalPortfolioValue.toLocaleString('ru-RU')} ₽</span>
            </div>

            {portfolio.length === 0 ? (
              <div className="text-center text-zinc-500 py-6 mb-6">Портфель пуст</div>
            ) : (
              <div className="max-h-[min(380px,50vh)] overflow-y-auto pr-2 space-y-3 mb-6 custom-scrollbar">
                {portfolio.map(item => (
                  <div key={item.stock.secid}>
                    <PortfolioPositionRow
                      item={item}
                      onTradeDelta={onTradeDelta}
                      onSell={onSell}
                      allowAddShares={false}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 pt-4 border-t border-zinc-700/50 mb-6">
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-400">Доходность</span>
                <span className={`${profit >= 0 ? 'text-green-500' : 'text-red-500'} font-mono font-medium`}>
                  {profit >= 0 ? '+' : ''}
                  {profit.toLocaleString('ru-RU')} ₽
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-400">В процентах</span>
                <span className={`${profitPct >= 0 ? 'text-green-500' : 'text-red-500'} font-mono font-medium`}>
                  {profitPct >= 0 ? '+' : ''}
                  {profitPct.toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="bg-[#3a3a3a] rounded-2xl p-5 relative">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-semibold text-zinc-200 w-2/3 leading-tight">Насколько оправдан риск вашего портфеля?</h3>
                <div className="group relative flex items-center">
                  <HelpCircle className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-help w-5 h-5" />
                  <div className="absolute right-0 top-6 w-64 p-3 bg-zinc-800 text-xs text-zinc-300 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl border border-zinc-700">
                    Коэффициент Шарпа сравнивает доходность и риск: чем выше значение, тем лучше баланс.
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center mb-4">
                <span className="text-zinc-400 text-sm">Sharpe</span>
                <span className="font-bold font-mono text-lg">{sharpe.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="bg-red-900 text-red-100 px-3 py-1 rounded-lg text-sm font-medium">Статус</span>
                <span className="font-semibold text-zinc-200">{sharpeStatus}</span>
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed">{sharpeExplanation}</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#2a2a2a] rounded-3xl p-8 border border-zinc-700/50">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">
                Ваш портфель{' '}
                <span className="text-zinc-500 text-lg bg-zinc-800 px-3 py-1 rounded-full ml-2">
                  {portfolio.length}/{maxPositions}
                </span>
              </h2>
            </div>

            <p
              className={`text-zinc-300 font-medium ${futurePrediction && forecast ? 'mb-4' : 'mb-2'}`}
            >
              {futurePrediction
                ? forecast
                  ? `Прогноз стоимости портфеля на ${forecast.forecast_months} мес. Не является инвестиционной рекомендацией.`
                  : 'Прогноз капитала в трёх сценариях. Если сервер недоступен — показывается упрощённая локальная модель.'
                : 'График показывает, как менялась стоимость вашего портфеля со временем.'}
            </p>
            {!(futurePrediction && forecast) && (
              <p className="text-xs text-zinc-500 mb-4">
                {futurePrediction
                  ? 'Ось X: месяцы. Ось Y: сумма капитала, ₽. Упрощённая модель по Шарпу — только при отсутствии ответа сервера.'
                  : 'Ось X: даты. Ось Y: стоимость портфеля в рублях.'}
              </p>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-4 border-b border-zinc-700/40">
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400">Предсказание будущего</span>
                <button
                  type="button"
                  onClick={() => setShowForecastIntro(true)}
                  className="rounded-full p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors shrink-0"
                  title="Как работает прогноз?"
                  aria-label="Как работает прогноз?"
                >
                  <HelpCircle className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={futurePrediction}
                aria-label="Показать прогноз капитала на несколько месяцев вперёд"
                onClick={() => setFuturePrediction(v => !v)}
                className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 ${
                  futurePrediction ? 'bg-[#b40000]' : 'bg-zinc-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                    futurePrediction ? 'translate-x-[26px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="h-80 w-full mb-4 bg-[#1e1e1e] rounded-xl p-4 border border-zinc-700/50">
              {futurePrediction && portfolio.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-500 text-sm px-4 text-center">
                  Добавьте позиции в портфель — иначе прогноз не строится.
                </div>
              ) : futurePrediction && forecastLoading && !forecast && !forecastError ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400">
                  <Loader2 className="w-10 h-10 animate-spin text-red-500" />
                  <span className="text-sm">Загружаем прогноз…</span>
                </div>
              ) : futurePrediction ? (
                <div className="h-full flex flex-col min-h-0">
                  {forecastError && !forecast && (
                    <div className="shrink-0 mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm">
                      <div className="flex items-start gap-2 text-red-100">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <span>{forecastError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (portfolioId) forecastCacheRef.current.delete(portfolioId);
                          void loadForecastRemote(true);
                        }}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-600"
                      >
                        Повторить запрос
                      </button>
                    </div>
                  )}
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={futureChartData} margin={{ top: 10, right: 16, left: 4, bottom: 28 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis
                          dataKey="month"
                          type="number"
                          domain={[0, futureMonthsMax]}
                          ticks={monthTicks}
                          stroke="#666"
                          tick={{ fill: '#888', fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={v => futureChartData.find(r => r.month === v)?.label ?? String(v)}
                          label={{ value: 'Месяцы', position: 'insideBottom', offset: -2, fill: '#71717a', fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#666"
                          tick={{ fill: '#888', fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={64}
                          tickFormatter={val => `${Math.round(Number(val) / 1000)}k`}
                          domain={['auto', 'auto']}
                          label={{
                            value: 'Сумма капитала, ₽',
                            angle: -90,
                            position: 'insideLeft',
                            fill: '#71717a',
                            fontSize: 11,
                            style: { textAnchor: 'middle' }
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#2a2a2a',
                            border: '1px solid #3f3f46',
                            borderRadius: '8px',
                            color: '#fff'
                          }}
                          formatter={(value: number, name: string) => {
                            const nl =
                              name === 'max' ? 'Лучший' : name === 'avg' ? 'Средний' : name === 'min' ? 'Худший' : name;
                            return [`${value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`, nl];
                          }}
                          labelFormatter={m => {
                            const row = futureChartData.find(r => r.month === m);
                            return row?.label ?? `Месяц ${m}`;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="max"
                          name="max"
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={{ r: 2.5, fill: '#22c55e' }}
                          activeDot={{ r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="avg"
                          name="avg"
                          stroke="#f4f4f5"
                          strokeWidth={2}
                          dot={{ r: 2.5, fill: '#f4f4f5' }}
                          activeDot={{ r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="min"
                          name="min"
                          stroke="#ef4444"
                          strokeWidth={2}
                          dot={{ r: 2.5, fill: '#ef4444' }}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#666"
                      tick={{ fill: '#888', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={18}
                      tickMargin={8}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      stroke="#666"
                      tick={{ fill: '#888', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={58}
                      tickFormatter={val => `${(Number(val) / 1000).toFixed(0)}K`}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #3f3f46', borderRadius: '8px', color: '#fff' }}
                      itemStyle={{ color: '#60a5fa' }}
                      labelStyle={{ color: '#a1a1aa' }}
                      formatter={(value: number) => [`${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`, 'Стоимость']}
                      labelFormatter={label => `Дата: ${label}`}
                    />
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {futurePrediction && portfolio.length > 0 && forecast && (
              <div className="space-y-4 mb-8">
                <p className="text-sm text-zinc-400">
                  Текущая стоимость бумаг (из прогноза):{' '}
                  <span className="text-zinc-100 font-mono tabular-nums">
                    {forecast.current_value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
                  </span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      {
                        title: 'Средний сценарий',
                        c: forecast.average_case,
                        border: 'border-zinc-600/80',
                        line: '#f4f4f5'
                      },
                      {
                        title: 'Лучший сценарий',
                        c: forecast.best_case,
                        border: 'border-emerald-600/50',
                        line: '#22c55e'
                      },
                      {
                        title: 'Худший сценарий',
                        c: forecast.worst_case,
                        border: 'border-red-600/50',
                        line: '#ef4444'
                      }
                    ] as const
                  ).map(({ title, c, border, line }) => (
                    <div
                      key={title}
                      className={`rounded-xl border ${border} bg-[#1f1f22] p-4 flex flex-col gap-2`}
                    >
                      <div className="flex items-center gap-2 text-xs text-zinc-500 uppercase tracking-wide">
                        <span className="inline-block w-8 h-0.5 rounded-full" style={{ backgroundColor: line }} />
                        {title}
                      </div>
                      <div className="text-lg font-bold text-zinc-100 tabular-nums">
                        {c.final_value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽
                      </div>
                      <div
                        className={`text-sm font-medium tabular-nums ${
                          c.total_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {c.total_return_pct >= 0 ? '+' : ''}
                        {c.total_return_pct.toFixed(2)}%
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-zinc-700/50 bg-[#1f1f22] p-4 text-sm">
                  <h4 className="text-zinc-200 font-semibold mb-3">Распределение сценариев</h4>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-zinc-300">
                    <div className="flex justify-between gap-4 border-b border-zinc-700/30 pb-2 sm:border-0 sm:pb-0">
                      <dt className="text-zinc-500">Ожидаемая доходность</dt>
                      <dd
                        className={`font-mono tabular-nums font-medium ${
                          forecast.distribution.expected_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {forecast.distribution.expected_return_pct >= 0 ? '+' : ''}
                        {forecast.distribution.expected_return_pct.toFixed(2)}%
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Вероятность положительного результата</dt>
                      <dd className="font-mono tabular-nums text-zinc-100">
                        {forecast.distribution.probability_positive_pct.toFixed(1)}%
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}

            {futurePrediction && portfolio.length > 0 && !forecast && activeLegend && (
              <div className="space-y-3 mb-8">
                {([activeLegend.max, activeLegend.avg, activeLegend.min] as const).map(row => (
                  <div
                    key={row.label}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm border-b border-zinc-700/30 pb-3 last:border-0 last:pb-0"
                  >
                    <span className="inline-flex items-center gap-2 min-w-[120px]">
                      <span className="inline-block w-6 h-0.5 rounded-full" style={{ backgroundColor: row.color }} />
                      <span className="text-zinc-400">{row.label}</span>
                    </span>
                    <span className="font-bold text-zinc-100 tabular-nums">{formatRubCompact(row.total)}</span>
                    <span
                      className={`font-medium tabular-nums ${
                        row.gain >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {row.gain >= 0 ? '+' : ''}
                      {Math.round(row.gain).toLocaleString('ru-RU')} ₽
                    </span>
                    {'pct' in row && typeof row.pct === 'number' && (
                      <span className={`tabular-nums ${row.pct >= 0 ? 'text-emerald-400/90' : 'text-red-400/90'}`}>
                        ({row.pct >= 0 ? '+' : ''}
                        {row.pct.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-6 mb-4">
              <div className="bg-[#3a3a3a] px-4 py-2 rounded-xl flex items-center gap-3">
                <span className="text-zinc-400 text-sm">Секторов в портфеле</span>
                <span className="font-bold text-lg">{uniqueSectors}</span>
              </div>
              <div className="text-zinc-300">
                Диверсификация:{' '}
                <span className={diversificationStatus === 'хорошая' ? 'text-green-500 font-medium' : 'text-yellow-500 font-medium'}>
                  {diversificationStatus}
                </span>
              </div>
            </div>
            <details className="mb-8 group/sectors">
              <summary className="-mt-1 text-zinc-400 hover:text-zinc-200 text-sm font-medium transition-colors cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center gap-2">
                <span>Распределение по секторам</span>
                <span className="text-zinc-600 text-xs group-open/sectors:hidden">▼</span>
                <span className="text-zinc-600 text-xs hidden group-open/sectors:inline">▲</span>
              </summary>
              <div className="mt-3 bg-[#1f1f22] rounded-lg border border-zinc-700/40 p-3 max-w-[520px]">
                {sectorDistribution.length > 0 ? (
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="h-40 w-full sm:w-52 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={sectorDistribution}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={56}
                            label={false}
                          >
                            {sectorDistribution.map((entry, index) => (
                              <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => `${value.toLocaleString('ru-RU')} ₽`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-1 text-sm text-zinc-300 min-w-0 flex-1">
                      {sectorDistribution.map((item, index) => (
                        <div key={item.name} className="flex items-center gap-2 flex-wrap">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                          />
                          <span className="text-zinc-200">{item.name}</span>
                          <span className="text-zinc-500">— {item.percent}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-zinc-400 text-sm">Добавьте активы в портфель, чтобы увидеть распределение по секторам.</div>
                )}
              </div>
            </details>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              <button
                onClick={onRiskTest}
                disabled={!riskTestAvailable}
                className="bg-[#990000] hover:bg-[#cc0000] text-white px-8 py-4 rounded-xl font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                title={riskTestAvailable ? '' : 'Сначала добавьте позиции на экране Маркет'}
              >
                Риск-тест
              </button>
              <p className="text-zinc-400 text-sm max-w-md leading-tight">
                Протестируйте портфель на исторических сценариях и оцените, как он переносит стрессовые периоды.
              </p>
            </div>
          </div>

          <InvestmentGoals
            portfolioCount={portfolio.length}
            uniqueSectors={uniqueSectors}
            defaultBudget={initialBalance}
          />
        </div>
      </div>
    </div>
  );
}
