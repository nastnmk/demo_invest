import { useEffect, useMemo, useState } from 'react';
import { HelpCircle, RefreshCw } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell
} from 'recharts';
import type { PortfolioAnalyticsHistoryPoint, PortfolioMetrics } from '../api/moex';
import { PortfolioItem, Stock } from '../types';
import { InvestmentGoals } from './InvestmentGoals';
import { PortfolioPositionRow } from './PortfolioPositionRow';
import { IntroModal } from './IntroModal';
import { PortfolioIntroContent } from '../intro/introContents';
import { LS_INTRO_PORTFOLIO } from '../intro/storageKeys';
import { sectorLabelRu } from '../utils/sectorLabels';

interface AnalyticsProps {
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

export function Analytics({
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
  const [showSectorChart, setShowSectorChart] = useState(false);
  const [showIntro, setShowIntro] = useState(false);

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

            <p className="text-zinc-300 font-medium mb-2">График показывает, как менялась стоимость вашего портфеля со временем.</p>
            <p className="text-xs text-zinc-500 mb-4">Ось X: даты. Ось Y: стоимость портфеля в рублях.</p>

            <div className="h-80 w-full mb-6 bg-[#1e1e1e] rounded-xl p-4 border border-zinc-700/50">
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
            </div>

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
            <div className="mb-8">
              <button
                onClick={() => setShowSectorChart(prev => !prev)}
                className="-mt-1 text-zinc-400 hover:text-zinc-200 text-sm font-medium transition-colors"
              >
                {showSectorChart ? 'Скрыть распределение' : 'Посмотреть распределение'}
              </button>

              {showSectorChart && (
                <div className="mt-3 bg-[#1f1f22] rounded-lg border border-zinc-700/40 p-3 max-w-[520px]">
                  {sectorDistribution.length > 0 ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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
                      <div className="space-y-1 text-sm text-zinc-300">
                        {sectorDistribution.slice(0, 5).map((item, index) => (
                          <div key={item.name} className="flex items-center gap-2">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full"
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
              )}
            </div>

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

          <InvestmentGoals portfolioCount={portfolio.length} uniqueSectors={uniqueSectors} />
        </div>
      </div>
    </div>
  );
}
