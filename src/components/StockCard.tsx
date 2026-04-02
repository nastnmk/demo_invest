import { useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ApiError } from '../api/http';
import { fetchAssetCandles } from '../api/moex';
import { translateUserErrorMessage } from '../utils/apiErrorRu';
import { dividendProfileRu } from '../utils/dividendProfileRu';
import {
  DIVIDENDS_WHAT,
  LIQUIDITY_WHAT,
  dividendValueInterpretation,
  liquidityValueInterpretation
} from '../utils/stockMetricHintsRu';
import { Stock } from '../types';
import { AssetLogo } from './AssetLogo';

interface StockCardProps {
  key?: string | number;
  stock: Stock;
  onBuy: (stock: Stock, quantity: number) => void;
}

function MetricHintIcon({ text, label }: { text: string; label: string }) {
  return (
    <span className="relative inline-flex shrink-0 align-middle group">
      <button
        type="button"
        className="rounded-full p-0.5 text-zinc-500 transition-colors hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
        aria-label={label}
      >
        <HelpCircle className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 w-[min(18rem,calc(100vw-2rem))] max-w-[min(18rem,calc(100vw-3rem))] -translate-y-1/2 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-left text-xs leading-relaxed text-zinc-200 shadow-xl opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

const normalizeLevel = (value: string): 'low' | 'medium' | 'high' | 'none' | 'unknown' => {
  const v = value.toLowerCase();
  if (!v) return 'unknown';
  if (v.includes('нет') || v.includes('none')) return 'none';
  if (v.includes('низ')) return 'low';
  if (v.includes('сред')) return 'medium';
  if (v.includes('выс')) return 'high';
  return 'unknown';
};

const getColorClass = (value: string) => {
  const level = normalizeLevel(value);
  if (level === 'low') return 'text-green-500';
  if (level === 'medium') return 'text-yellow-500';
  if (level === 'high' || level === 'none') return 'text-red-500';
  return 'text-zinc-400';
};

export function StockCard({ stock, onBuy }: StockCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [buyMode, setBuyMode] = useState(false);
  const [chartData, setChartData] = useState<Array<{ date: string; price: number }>>([]);
  const [periodLabel, setPeriodLabel] = useState<string | undefined>(stock.periodLabel);
  const [dayRange, setDayRange] = useState<string | undefined>(stock.dayRange);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  const isPositive = stock.changePct >= 0;

  useEffect(() => {
    if (!expanded || stock.assetId == null) return;

    let cancelled = false;

    const loadChart = async () => {
      setIsChartLoading(true);
      setChartError(null);

      try {
        const response = await fetchAssetCandles(stock.assetId, 30, '1d');
        if (cancelled) return;
        setChartData(response.points);
        setPeriodLabel(response.periodLabel);
        setDayRange(response.dayRange);
      } catch (e) {
        if (cancelled) return;
        setChartData([]);
        const msg =
          e instanceof ApiError
            ? e.message
            : translateUserErrorMessage(e instanceof Error ? e.message : 'Ошибка загрузки');
        setChartError(msg || 'Не удалось загрузить график с сервера');
      } finally {
        if (!cancelled) {
          setIsChartLoading(false);
        }
      }
    };

    loadChart();

    return () => {
      cancelled = true;
    };
  }, [expanded, stock.assetId, stock.price, stock.changePct]);

  return (
    <div className="bg-[#2a2a2a] rounded-3xl p-6 text-zinc-100 shadow-lg flex flex-col border border-zinc-700/50 hover:border-zinc-600 transition-colors">
      <div className="flex items-center gap-4 mb-4">
        <AssetLogo logoUrl={stock.logoUrl} secid={stock.secid} shortName={stock.shortName} size="md" />

        <div className="flex-1">
          <h3 className="text-lg font-medium leading-tight">{stock.shortName}</h3>
          <p className="text-sm text-zinc-400 font-mono">{stock.secid}</p>
        </div>

        <div className="text-right">
          <p className="text-lg font-bold font-mono">{stock.price} ₽</p>
          <p className={`text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}
            {stock.changePct}%
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <span className="text-zinc-400 text-sm">Риск:</span>
        <span className={`text-sm font-medium ${getColorClass(stock.riskLevel)}`}>{stock.riskLevel || 'Не указано'}</span>
      </div>

      {expanded && (
        <div className="space-y-6 mb-6 animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-[15px] leading-snug text-zinc-300">{stock.description}</p>

          <div className="h-40 w-full bg-[#1e1e1e] rounded-xl border border-zinc-700/50 p-2">
            {isChartLoading ? (
              <div className="h-full w-full flex items-center justify-center text-sm text-zinc-500">Загрузка графика...</div>
            ) : chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 6, left: 0, bottom: 6 }}>
                  <defs>
                    <linearGradient id={`colorPrice-${stock.secid}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis domain={['dataMin', 'dataMax']} hide />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #3f3f46', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#f4f4f5' }}
                    labelStyle={{ color: '#a1a1aa', marginBottom: '2px' }}
                    formatter={(value: number) => [`${value.toLocaleString('ru-RU')} ₽`, 'Цена']}
                    labelFormatter={label => `Дата: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke={isPositive ? '#22c55e' : '#ef4444'}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill={`url(#colorPrice-${stock.secid})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-sm text-zinc-500">
                {chartError || 'Нет данных свечей за период'}
              </div>
            )}
          </div>

          <p className="text-xs text-zinc-500 -mt-3">
            Период: {periodLabel || 'не указан'}
            {dayRange ? ` • Диапазон: ${dayRange}` : ''}
          </p>

          <div className="overflow-visible rounded-xl border border-zinc-700/50 bg-[#252525] p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-zinc-200">Ликвидность</p>
              <MetricHintIcon text={LIQUIDITY_WHAT} label="Что такое ликвидность" />
            </div>
            <div className="flex flex-wrap items-baseline gap-2 pt-1">
              <span className="text-xs text-zinc-500 shrink-0">В профиле:</span>
              <span className={`text-base font-semibold ${getColorClass(stock.liquidity)}`}>
                {stock.liquidity || 'Не указано'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">{liquidityValueInterpretation(stock.liquidity)}</p>
          </div>

          <div className="overflow-visible rounded-xl border border-zinc-700/50 bg-[#252525] p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-zinc-200">Дивиденды</p>
              <MetricHintIcon text={DIVIDENDS_WHAT} label="Что такое дивидендный профиль" />
            </div>
            <div className="flex flex-wrap items-baseline gap-2 pt-1">
              <span className="text-xs text-zinc-500 shrink-0">В профиле:</span>
              <span className={`text-base font-semibold ${getColorClass(dividendProfileRu(stock.dividends) || stock.dividends)}`}>
                {dividendProfileRu(stock.dividends) || 'Не указано'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">{dividendValueInterpretation(stock.dividends)}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-zinc-700/50">
        {buyMode ? (
          <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between bg-[#3a3a3a] rounded-2xl p-2 border border-zinc-700/50">
              <span className="text-zinc-400 text-sm ml-2 font-medium">Количество (лотов):</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 rounded-xl bg-[#2a2a2a] flex items-center justify-center hover:bg-zinc-700 text-zinc-300 transition-colors font-bold text-xl"
                >
                  -
                </button>
                <span className="font-mono text-xl font-bold w-8 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 rounded-xl bg-[#2a2a2a] flex items-center justify-center hover:bg-zinc-700 text-zinc-300 transition-colors font-bold text-xl"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setBuyMode(false);
                  setQuantity(1);
                }}
                className="flex-1 bg-[#3a3a3a] hover:bg-zinc-700 text-zinc-100 text-lg font-semibold py-3 rounded-2xl transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  onBuy(stock, quantity);
                  setBuyMode(false);
                  setQuantity(1);
                }}
                className="flex-1 bg-[#cc0000] hover:bg-[#990000] text-white text-lg font-semibold py-3 rounded-2xl transition-colors shadow-lg shadow-red-900/20"
              >
                На {Number(stock.price * quantity).toLocaleString('ru-RU')} ₽
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-1 bg-[#3a3a3a] hover:bg-zinc-700 text-zinc-100 text-lg font-semibold py-3 rounded-2xl transition-colors"
            >
              {expanded ? 'Скрыть' : 'Подробнее'}
            </button>
            <button
              onClick={() => setBuyMode(true)}
              className="flex-1 bg-[#cc0000] hover:bg-[#990000] text-white text-lg font-semibold py-3 rounded-2xl transition-colors shadow-lg shadow-red-900/20"
            >
              Купить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
