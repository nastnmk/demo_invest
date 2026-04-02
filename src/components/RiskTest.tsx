import React, { useEffect, useMemo, useState } from 'react';
import { PortfolioItem } from '../types';
import { ApiError } from '../api/http';
import {
  StressAssetImpactApi,
  StressTestResultApi,
  SectorBreakdownItem,
  executeStressTest,
  fetchStressScenariosFull,
  type StressScenarioFull
} from '../api/moex';
import { sectorLabelRu } from '../utils/sectorLabels';
import { AlertTriangle, ChevronDown, ChevronUp, HelpCircle, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

interface RiskTestProps {
  portfolioId: number | null;
  portfolio: PortfolioItem[];
  balance: number;
}

const formatRuDate = (value?: string | null, fallback = '-') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('ru-RU');
};

/** Подпись даты на оси между start/end сценария (для дробления шкалы). */
function dateLabelAlongScenario(
  isoStart: string | null | undefined,
  isoEnd: string | null | undefined,
  step: number,
  totalSteps: number
): string {
  if (!isoStart || !isoEnd) return '';
  const a = new Date(isoStart).getTime();
  const b = new Date(isoEnd).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return '';
  const t = step / totalSteps;
  const d = new Date(a + t * (b - a));
  const y0 = new Date(isoStart).getFullYear();
  const y1 = new Date(isoEnd).getFullYear();
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    ...(y0 !== y1 ? { year: '2-digit' as const } : {})
  });
}

/** Равномерные индексы точек на оси (0 … totalSteps), чтобы показать больше дат. */
function stressChartAxisTicks(totalSteps: number, desiredCount: number): number[] {
  const n = Math.max(2, Math.min(desiredCount, totalSteps + 1));
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    out.push(Math.round((k / (n - 1)) * totalSteps));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Точек на линии «стоимость акций в сценарии» — больше = плавнее и заметнее динамика */
const PORTFOLIO_STRESS_CHART_STEPS = 120;

/** Сколько подписей-дат на оси X у общего графика портфеля */
const PORTFOLIO_AXIS_DATE_TICKS = 11;

/** Точек на мини-графике цены по одной бумаге (раскрытая строка таблицы) */
const STOCK_ROW_CHART_STEPS = 72;

/** Подписей-дат на мини-графике по бумаге */
const STOCK_ROW_AXIS_DATE_TICKS = 9;

const fmtMoney = (n: number, maxFrac = 2) =>
  n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: maxFrac });

/** Путь цены «сейчас → после стресса» с промежуточной волатильностью (как на общем графике) */
function buildStockStressPath(current: number, stressed: number, steps: number): { idx: number; price: number }[] {
  const delta = stressed - current;
  const amp1 = Math.max(Math.abs(delta) * 0.1, Math.abs(current) * 0.018, 0.01);
  const amp2 = amp1 * 0.45;
  const rows: { idx: number; price: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const linear = current + t * delta;
    const envelope = (1 - t) * t * 4;
    const ripple =
      amp1 * Math.sin(t * Math.PI * 7) * envelope + amp2 * Math.sin(t * Math.PI * 17) * envelope;
    const price = i === 0 ? current : i === steps ? stressed : linear + ripple;
    rows.push({ idx: i, price: Number(price.toFixed(4)) });
  }
  rows[0].price = Number(current.toFixed(4));
  rows[rows.length - 1].price = Number(stressed.toFixed(4));
  return rows;
}

function buildSectorBreakdownFromImpacts(impacts: StressAssetImpactApi[]): SectorBreakdownItem[] {
  const map = new Map<string, { vb: number; va: number }>();
  for (const i of impacts) {
    const key = sectorLabelRu(i.sector || 'Не указан');
    const cur = map.get(key) ?? { vb: 0, va: 0 };
    cur.vb += i.position_value_before;
    cur.va += i.position_value_after;
    map.set(key, cur);
  }
  const rows: SectorBreakdownItem[] = [];
  for (const [sector, v] of map) {
    const change_abs = Number((v.va - v.vb).toFixed(2));
    const change_pct = v.vb > 0 ? Number(((change_abs / v.vb) * 100).toFixed(4)) : 0;
    rows.push({ sector, value_before: v.vb, value_after: v.va, change_abs, change_pct });
  }
  return rows.sort((a, b) => a.change_pct - b.change_pct);
}

function priceDeltaPerLot(item: StressAssetImpactApi): number {
  return Number((item.stressed_price - item.current_price).toFixed(4));
}

/** Для сортировки сценариев: новее событие (позже дата окончания / начала) — выше в списке. */
function stressScenarioTimeMs(s: StressScenarioFull): number {
  const end = s.end_date ? new Date(s.end_date).getTime() : NaN;
  const start = s.start_date ? new Date(s.start_date).getTime() : NaN;
  if (!Number.isNaN(end)) return end;
  if (!Number.isNaN(start)) return start;
  return 0;
}

function sortScenariosByDateDesc(items: StressScenarioFull[]): StressScenarioFull[] {
  return [...items].sort((a, b) => stressScenarioTimeMs(b) - stressScenarioTimeMs(a));
}

export function RiskTest({ portfolioId, portfolio, balance }: RiskTestProps) {
  const [scenarios, setScenarios] = useState<StressScenarioFull[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<number | null>(null);
  const [stressResult, setStressResult] = useState<StressTestResultApi | null>(null);
  const [expandedStock, setExpandedStock] = useState<string | null>(null);
  const [showInterpretation, setShowInterpretation] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setScenariosLoading(true);
      setScenariosError(null);
      try {
        const res = await fetchStressScenariosFull();
        if (cancelled) return;
        const items = sortScenariosByDateDesc(res.items ?? []);
        setScenarios(items);
        if (items.length > 0) setActiveScenarioId(prev => prev ?? items[0].id);
      } catch {
        if (!cancelled) setScenariosError('Не удалось загрузить сценарии.');
      } finally {
        if (!cancelled) setScenariosLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setStressResult(null);
    setRunError(null);
    setShowInterpretation(false);
  }, [activeScenarioId]);

  const handleRun = async () => {
    if (!portfolioId || activeScenarioId == null) return;
    setRunLoading(true);
    setRunError(null);
    setStressResult(null);
    try {
      const result = await executeStressTest(portfolioId, activeScenarioId);
      setStressResult(result);
    } catch (e) {
      setRunError(e instanceof ApiError ? e.message : 'Не удалось выполнить стресс-тест.');
    } finally {
      setRunLoading(false);
    }
  };

  const scenario = useMemo(
    () =>
      scenarios.find(s => s.id === activeScenarioId) || stressResult?.scenario || scenarios[0],
    [scenarios, activeScenarioId, stressResult]
  );

  const summary = stressResult?.summary;
  const impacts = stressResult?.asset_impacts ?? [];
  const uniqueSectors = new Set(portfolio.map(item => sectorLabelRu(item.stock.sector))).size;

  const sectorBreakdown = useMemo(() => {
    const withRu = (rows: SectorBreakdownItem[]) =>
      rows.map(r => ({ ...r, sector: sectorLabelRu(r.sector) })).sort((a, b) => a.change_pct - b.change_pct);
    if (stressResult?.sector_breakdown && stressResult.sector_breakdown.length > 0) {
      return withRu([...stressResult.sector_breakdown]);
    }
    return buildSectorBreakdownFromImpacts(impacts);
  }, [stressResult?.sector_breakdown, impacts]);

  const highlights = useMemo(() => {
    if (stressResult?.highlights && impacts.length > 0) {
      const h = stressResult.highlights;
      return {
        ...h,
        worst_sector: sectorLabelRu(h.worst_sector)
      };
    }
    if (impacts.length === 0) return null;
    const byPct = [...impacts].sort((a, b) => a.scenario_change_pct - b.scenario_change_pct);
    const worst = byPct[0];
    const best = byPct[byPct.length - 1];
    const worstSec = sectorLabelRu((sectorBreakdown[0]?.sector ?? worst.sector) || '—');
    return {
      worst_asset_secid: worst.secid,
      best_asset_secid: best.secid,
      worst_sector: worstSec
    };
  }, [stressResult?.highlights, impacts, sectorBreakdown]);

  const sectorChartData = useMemo(
    () => sectorBreakdown.map(s => ({ name: sectorLabelRu(s.sector), change: s.change_pct })),
    [sectorBreakdown]
  );

  const worstSecids = useMemo(() => {
    const sorted = [...impacts].sort((a, b) => a.scenario_change_pct - b.scenario_change_pct);
    return new Set(sorted.slice(0, 3).map(i => i.secid));
  }, [impacts]);

  const bestSecids = useMemo(() => {
    const sorted = [...impacts].sort((a, b) => b.scenario_change_pct - a.scenario_change_pct);
    return new Set(sorted.slice(0, 3).map(i => i.secid));
  }, [impacts]);

  const stockFallback = portfolio.reduce((s, i) => s + i.stock.price * i.quantity, 0);
  const initialTotal = summary?.value_before ?? stockFallback;
  const newTotal = summary?.value_after ?? stockFallback;
  const totalChangeAbs = summary?.change_abs ?? 0;
  const totalChangePct = summary?.change_pct ?? 0;
  const isPositive = totalChangePct >= 0;
  const cashUnchanged = summary?.cash_unchanged ?? balance;

  const start = formatRuDate(scenario?.start_date);
  const end = formatRuDate(scenario?.end_date);

  const chartData = useMemo(() => {
    const v0 = Number(initialTotal.toFixed(2));
    const v1 = Number(newTotal.toFixed(2));
    const delta = v1 - v0;
    const amp1 = Math.max(Math.abs(delta) * 0.1, v0 * 0.018, 1);
    const amp2 = amp1 * 0.45;
    const isoStart = scenario?.start_date;
    const isoEnd = scenario?.end_date;
    const rows: { idx: number; value: number }[] = [];
    for (let i = 0; i <= PORTFOLIO_STRESS_CHART_STEPS; i++) {
      const t = i / PORTFOLIO_STRESS_CHART_STEPS;
      const linear = v0 + t * delta;
      const envelope = (1 - t) * t * 4;
      const ripple =
        amp1 * Math.sin(t * Math.PI * 8) * envelope + amp2 * Math.sin(t * Math.PI * 18) * envelope;
      const value = i === 0 ? v0 : i === PORTFOLIO_STRESS_CHART_STEPS ? v1 : linear + ripple;
      rows.push({ idx: i, value: Number(value.toFixed(2)) });
    }
    rows[0].value = v0;
    rows[rows.length - 1].value = v1;
    return { points: rows, isoStart, isoEnd };
  }, [initialTotal, newTotal, scenario?.start_date, scenario?.end_date]);

  const interpretationText = useMemo(() => {
    if (totalChangePct <= -20) {
      return 'Портфель просел сильно. Добавьте разные отрасли, чтобы снизить зависимость от одного события.';
    }
    if (totalChangePct < -5) return 'Портфель чувствителен к кризису. Стоит пересмотреть волатильные позиции.';
    if (totalChangePct < 5) return 'Сценарий пережит умеренно.';
    return 'По этому сценарию портфель ведёт себя устойчиво.';
  }, [totalChangePct]);

  if (scenariosLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 flex items-center gap-3 text-zinc-400">
        <Loader2 className="animate-spin" size={22} />
        Загружаем сценарии…
      </div>
    );
  }

  if (scenariosError || !scenario) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-[#2a2a2a] p-6 rounded-2xl border border-zinc-700/50">
          <h1 className="text-2xl font-bold mb-2">Риск-тест</h1>
          <p className="text-zinc-400">{scenariosError || 'Нет доступных сценариев.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3 mb-3 tracking-tight">
          Риск-тест
          <div className="group relative flex items-center">
            <HelpCircle className="text-zinc-500 hover:text-zinc-300 cursor-help" size={24} />
            <div className="absolute left-full ml-2 w-72 p-3 bg-zinc-800 text-xs text-zinc-300 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl border border-zinc-700">
              Симуляция влияния кризиса на ваши акции. Кэш в расчёте не участвует.
            </div>
          </div>
        </h1>
        <p className="text-zinc-400 text-lg">Проверка портфеля на устойчивость по событиям из прошлого.</p>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4 tracking-tight">Выберите сценарий</h2>
        <p className="mb-4 text-sm text-zinc-400 leading-relaxed max-w-3xl">
          Здесь вы смотрите, как исторический кризис мог бы повлиять на ваши акции: сценарии основаны на реальных периодах
          рынка. Выберите сценарий, нажмите «Запустить стресс-тест» — расчёт покажет, как изменилась бы стоимость позиций
          и по секторам. Свободные деньги на счёте в стресс не включаются, они считаются отдельно в итогах.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {scenarios.map(item => {
            const d0 = formatRuDate(item.start_date);
            const d1 = formatRuDate(item.end_date);
            const selected = activeScenarioId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveScenarioId(item.id);
                  setExpandedStock(null);
                }}
                className={`text-left rounded-xl border px-4 py-3 transition-all ${
                  selected
                    ? 'bg-[#cc0000] text-white border-[#cc0000]'
                    : 'bg-[#2a2a2a] text-zinc-300 hover:bg-[#333335] border-zinc-700/50'
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{item.name}</span>
                  <ChevronDown className={`w-4 h-4 shrink-0 mt-0.5 ${selected ? 'opacity-90' : 'opacity-50'}`} />
                </div>
                <div className={`mt-2 text-xs font-mono ${selected ? 'text-red-100/90' : 'text-zinc-500'}`}>
                  {d0} — {d1}
                </div>
              </button>
            );
          })}
        </div>

        <div className="bg-[#2a2a2a] p-6 rounded-2xl border border-zinc-700/50 mb-8">
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <h3 className="text-xl font-bold text-zinc-100">{scenario.name}</h3>
            <span className="bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-sm font-mono">
              {start} — {end}
            </span>
          </div>
          <p className="text-zinc-400 leading-relaxed">{scenario.description || 'Описание не заполнено.'}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleRun}
              disabled={runLoading || !portfolioId || portfolio.length === 0 || activeScenarioId == null}
              className="inline-flex items-center gap-2 bg-[#cc0000] hover:bg-[#b00000] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-3 rounded-xl"
            >
              {runLoading ? <Loader2 className="animate-spin" size={18} /> : null}
              {runLoading ? 'Считаем…' : 'Запустить стресс-тест'}
            </button>
            {portfolio.length === 0 && (
              <span className="text-sm text-amber-400">Добавьте акции в портфель.</span>
            )}
          </div>
          {runError && <p className="text-sm text-red-400 mt-3">{runError}</p>}
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-2xl font-bold tracking-tight mb-4">Ваш портфель</h2>
        <div className="mb-5 text-sm text-zinc-400">
          Активов: <span className="text-zinc-200 font-semibold">{portfolio.length}</span> • Секторов:{' '}
          <span className="text-zinc-200 font-semibold">{uniqueSectors}</span>
        </div>

        {stressResult ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div className="bg-[#2a2a2a] p-5 rounded-2xl border border-zinc-700/50">
                <p className="text-xs text-zinc-500 mb-2 leading-snug">Стоимость акций до сценария</p>
                <p className="text-xl font-mono font-bold">{fmtMoney(initialTotal, 2)} ₽</p>
              </div>
              <div className="bg-[#2a2a2a] p-5 rounded-2xl border border-zinc-700/50">
                <p className="text-xs text-zinc-500 mb-2 leading-snug">Стоимость акций после сценария</p>
                <p className="text-xl font-mono font-bold">{fmtMoney(newTotal, 2)} ₽</p>
              </div>
              <div className="bg-[#2a2a2a] p-5 rounded-2xl border border-zinc-700/50">
                <p className="text-xs text-zinc-500 mb-2">Изменение</p>
                <p className={`text-xl font-mono font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                  {isPositive ? '+' : ''}
                  {totalChangePct.toFixed(2)}%
                </p>
                <p className={`text-sm font-mono mt-1 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}
                  {fmtMoney(totalChangeAbs, 2)} ₽
                </p>
              </div>
              <div className="bg-[#2a2a2a] p-5 rounded-2xl border border-zinc-700/50">
                <p className="text-xs text-zinc-500 mb-2 leading-snug">Свободные деньги (не участвуют в стресс-тесте)</p>
                <p className="text-xl font-mono font-bold text-zinc-200">{fmtMoney(cashUnchanged, 2)} ₽</p>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mb-6">Период: {start} — {end}</p>
          </>
        ) : (
          <div className="mb-6 rounded-2xl border border-zinc-700/40 bg-zinc-800/20 px-4 py-3 text-sm text-zinc-400">
            Нажмите «Запустить стресс-тест», чтобы увидеть влияние на стоимость акций. Сводка считается только по позициям, кэш — отдельно.
          </div>
        )}

        {stressResult && impacts.length > 0 && highlights && (
          <>
            <h2 className="text-xl font-bold tracking-tight mb-4">Главное</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-[#2a2a2a] p-5 rounded-2xl border border-red-500/20 flex gap-3">
                <TrendingDown className="text-red-400 shrink-0" size={22} />
                <div>
                  <p className="text-[11px] text-zinc-500 uppercase mb-1">Хуже всего</p>
                  <p className="font-bold font-mono">{highlights.worst_asset_secid}</p>
                  {impacts.find(i => i.secid === highlights.worst_asset_secid) && (
                    <p className="text-sm text-zinc-400">{impacts.find(i => i.secid === highlights.worst_asset_secid)!.short_name}</p>
                  )}
                </div>
              </div>
              <div className="bg-[#2a2a2a] p-5 rounded-2xl border border-green-500/20 flex gap-3">
                <TrendingUp className="text-green-400 shrink-0" size={22} />
                <div>
                  <p className="text-[11px] text-zinc-500 uppercase mb-1">Лучше всего</p>
                  <p className="font-bold font-mono">{highlights.best_asset_secid}</p>
                  {impacts.find(i => i.secid === highlights.best_asset_secid) && (
                    <p className="text-sm text-zinc-400">{impacts.find(i => i.secid === highlights.best_asset_secid)!.short_name}</p>
                  )}
                </div>
              </div>
              <div className="bg-[#2a2a2a] p-5 rounded-2xl border border-amber-500/25 flex gap-3">
                <AlertTriangle className="text-amber-400 shrink-0" size={22} />
                <div>
                  <p className="text-[11px] text-zinc-500 uppercase mb-1">Худший сектор</p>
                  <p className="font-bold">{sectorLabelRu(highlights.worst_sector)}</p>
                </div>
              </div>
            </div>
          </>
        )}

        {stressResult && sectorBreakdown.length > 0 && (
          <>
            <h2 className="text-xl font-bold tracking-tight mb-4">По секторам</h2>
            <div className="bg-[#2a2a2a] rounded-2xl border border-zinc-700/50 p-6 mb-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="text-zinc-500 text-[11px] uppercase border-b border-zinc-700/50">
                        <th className="pb-3 pr-3">Сектор</th>
                        <th className="pb-3 pr-3 text-right">До</th>
                        <th className="pb-3 pr-3 text-right">После</th>
                        <th className="pb-3 text-right">Изм.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectorBreakdown.map(s => (
                        <tr key={s.sector} className="border-b border-zinc-800/60">
                          <td className="py-3 pr-3 text-zinc-200">{sectorLabelRu(s.sector)}</td>
                          <td className="py-3 pr-3 text-right font-mono text-zinc-400">{fmtMoney(s.value_before, 0)} ₽</td>
                          <td className="py-3 pr-3 text-right font-mono">{fmtMoney(s.value_after, 0)} ₽</td>
                          <td className={`py-3 text-right font-mono ${s.change_pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {s.change_pct > 0 ? '+' : ''}
                            {s.change_pct.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="h-56 min-h-[14rem]">
                  <p className="text-xs text-zinc-500 mb-2">Изменение по секторам (%)</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sectorChartData} margin={{ top: 4, right: 8, bottom: 28, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                      <XAxis
                        dataKey="name"
                        stroke="#71717a"
                        tick={{ fill: '#a1a1aa', fontSize: 10 }}
                        angle={-16}
                        textAnchor="end"
                        height={48}
                      />
                      <YAxis stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 11 }} tickFormatter={v => `${v}%`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                        labelFormatter={(label: string | number) => sectorLabelRu(String(label))}
                        formatter={(v: number) => [`${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, '']}
                      />
                      <Bar dataKey="change" radius={[4, 4, 0, 0]}>
                        {sectorChartData.map((e, i) => (
                          <Cell key={i} fill={e.change >= 0 ? '#22c55e' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </>
        )}

        {stressResult && (
          <>
            <h2 className="text-xl font-bold tracking-tight mb-1">По каждой бумаге</h2>
            <p className="text-xs text-zinc-500 mb-3">Список можно прокручивать внутри блока — не нужно листать всю страницу.</p>
            <div className="bg-[#2a2a2a] rounded-2xl border border-zinc-700/50 mb-8 overflow-hidden flex flex-col">
              <div className="max-h-[min(72vh,560px)] overflow-y-auto overflow-x-auto overscroll-y-contain [scrollbar-gutter:stable]">
                <table className="w-full text-left border-collapse min-w-[720px]">
                  <thead className="sticky top-0 z-10 bg-[#2a2a2a] shadow-[inset_0_-1px_0_0_rgba(63,63,70,0.9)]">
                    <tr className="text-zinc-400 text-sm border-b border-zinc-700/50">
                    <th className="py-4 px-4">Акция</th>
                    <th className="py-4 px-4 hidden sm:table-cell">Сектор</th>
                    <th className="py-4 px-4">Вложено</th>
                    <th className="py-4 px-4">Результат</th>
                    <th className="py-4 px-4">Изм.</th>
                    <th className="py-4 px-4 whitespace-nowrap">Изм. всего, ₽</th>
                    <th className="py-4 px-4">Статус</th>
                    <th className="py-4 px-4">Пояснение</th>
                    <th className="py-4 px-4" />
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {impacts.map(item => {
                    const deltaPerLot = priceDeltaPerLot(item);
                    return (
                      <React.Fragment key={item.secid}>
                        <tr
                          className={`border-b border-zinc-700/50 hover:bg-[#3a3a3a] ${
                            worstSecids.has(item.secid) ? 'bg-red-500/10' : bestSecids.has(item.secid) ? 'bg-green-500/5' : ''
                          }`}
                        >
                          <td className="py-4 px-4">
                            <span className="font-semibold block">{item.short_name}</span>
                            <span className="text-[10px] font-mono text-zinc-500">{item.secid}</span>
                          </td>
                          <td className="py-4 px-4 text-zinc-400 text-xs hidden sm:table-cell">{sectorLabelRu(item.sector) || '—'}</td>
                          <td className="py-4 px-4 font-mono">{fmtMoney(item.position_value_before, 2)} ₽</td>
                          <td className="py-4 px-4 font-mono">{fmtMoney(item.position_value_after, 2)} ₽</td>
                          <td className={`py-4 px-4 font-mono ${item.scenario_change_pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {item.scenario_change_pct > 0 ? '+' : ''}
                            {item.scenario_change_pct.toFixed(2)}%
                          </td>
                          <td className={`py-4 px-4 font-mono ${item.change_abs >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {item.change_abs >= 0 ? '+' : ''}
                            {fmtMoney(item.change_abs, 2)} ₽
                          </td>
                          <td className="py-4 px-4">
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                item.scenario_change_pct >= 0
                                  ? 'bg-green-500/10 text-green-400'
                                  : item.scenario_change_pct > -25
                                    ? 'bg-zinc-800 text-zinc-300'
                                    : 'bg-red-500/10 text-red-400'
                              }`}
                            >
                              {item.scenario_change_pct >= 0 ? 'Выросла' : item.scenario_change_pct > -25 ? 'Удержался' : 'Под ударом'}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-zinc-400 text-xs max-w-[140px]">{item.explanation || '—'}</td>
                          <td className="py-4 px-4">
                            <button
                              type="button"
                              onClick={() => setExpandedStock(expandedStock === item.secid ? null : item.secid)}
                              className="p-2 hover:bg-zinc-700 rounded-full"
                            >
                              {expandedStock === item.secid ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </button>
                          </td>
                        </tr>
                        {expandedStock === item.secid && (
                          <tr className="bg-[#1e1e1e]">
                            <td colSpan={9} className="p-6">
                              <p className="text-zinc-200 font-semibold mb-4">
                                Детали по {item.short_name}
                              </p>
                              <div className="grid md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm items-baseline">
                                    <dt className="text-zinc-500">Кол-во</dt>
                                    <dd className="font-mono text-zinc-100">
                                      {item.quantity.toLocaleString('ru-RU')} шт.
                                    </dd>
                                    <dt className="text-zinc-500">Цена в начале</dt>
                                    <dd className="font-mono text-zinc-100">{fmtMoney(item.current_price, 2)} ₽</dd>
                                    <dt className="text-zinc-500">Цена в конце</dt>
                                    <dd className="font-mono text-zinc-100">{fmtMoney(item.stressed_price, 2)} ₽</dd>
                                    <dt className="text-zinc-500">Изм. позиции (1 лот)</dt>
                                    <dd
                                      className={`font-mono ${
                                        deltaPerLot >= 0 ? 'text-green-400' : 'text-red-400'
                                      }`}
                                    >
                                      {deltaPerLot >= 0 ? '+' : ''}
                                      {fmtMoney(deltaPerLot, 2)} ₽
                                    </dd>
                                  </dl>
                                  {item.explanation ? (
                                    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300 leading-relaxed">
                                      {item.explanation}
                                    </div>
                                  ) : null}
                                </div>
                                <div>
                                  <p className="text-xs text-zinc-500 mb-2">Цена: до — после сценария (модельная динамика)</p>
                                  <div className="h-56">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart
                                        data={buildStockStressPath(
                                          item.current_price,
                                          item.stressed_price,
                                          STOCK_ROW_CHART_STEPS
                                        )}
                                        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                                      >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                                        <XAxis
                                          dataKey="idx"
                                          type="number"
                                          domain={[0, STOCK_ROW_CHART_STEPS]}
                                          ticks={stressChartAxisTicks(STOCK_ROW_CHART_STEPS, STOCK_ROW_AXIS_DATE_TICKS)}
                                          tickFormatter={(idx: number) => {
                                            const i = Number(idx);
                                            const S = STOCK_ROW_CHART_STEPS;
                                            const isoStart = scenario?.start_date;
                                            const isoEnd = scenario?.end_date;
                                            if (!isoStart || !isoEnd) {
                                              if (i === 0) return 'До';
                                              if (i === S) return 'После';
                                              return '';
                                            }
                                            if (i === 0) return formatRuDate(isoStart);
                                            if (i === S) return formatRuDate(isoEnd);
                                            return dateLabelAlongScenario(isoStart, isoEnd, i, S);
                                          }}
                                          stroke="#71717a"
                                          tick={{ fill: '#a1a1aa', fontSize: 8 }}
                                          angle={-30}
                                          textAnchor="end"
                                          height={36}
                                        />
                                        <YAxis
                                          domain={['auto', 'auto']}
                                          tickFormatter={v => `${Number(v).toFixed(0)} ₽`}
                                          stroke="#71717a"
                                          tick={{ fill: '#a1a1aa', fontSize: 11 }}
                                          width={52}
                                        />
                                        <Tooltip
                                          contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46' }}
                                          labelFormatter={(idx: number) => {
                                            const i = Number(idx);
                                            const S = STOCK_ROW_CHART_STEPS;
                                            const isoStart = scenario?.start_date;
                                            const isoEnd = scenario?.end_date;
                                            if (!isoStart || !isoEnd) {
                                              if (i === 0) return 'До сценария';
                                              if (i === S) return 'После сценария';
                                              return `Шаг ${i} / ${S}`;
                                            }
                                            if (i === 0) return `Начало · ${formatRuDate(isoStart)}`;
                                            if (i === S) return `Конец · ${formatRuDate(isoEnd)}`;
                                            return dateLabelAlongScenario(isoStart, isoEnd, i, S);
                                          }}
                                          formatter={(v: number) => [`${fmtMoney(v, 2)} ₽`, 'Цена']}
                                        />
                                        <Line
                                          type="monotone"
                                          dataKey="price"
                                          stroke={item.scenario_change_pct >= 0 ? '#22c55e' : '#ef4444'}
                                          strokeWidth={2}
                                          dot={false}
                                          activeDot={{ r: 4 }}
                                          isAnimationActive={false}
                                        />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            <div className="h-80 w-full bg-[#2a2a2a] rounded-2xl p-6 border border-zinc-700/50 mb-6">
              <h3 className="text-lg font-bold mb-4">Стоимость акций в стресс-сценарии</h3>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={chartData.points} margin={{ top: 10, right: 20, bottom: 52, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                  <XAxis
                    dataKey="idx"
                    type="number"
                    domain={[0, PORTFOLIO_STRESS_CHART_STEPS]}
                    ticks={stressChartAxisTicks(PORTFOLIO_STRESS_CHART_STEPS, PORTFOLIO_AXIS_DATE_TICKS)}
                    tickFormatter={(idx: number) => {
                      const i = Number(idx);
                      const S = PORTFOLIO_STRESS_CHART_STEPS;
                      if (i === 0) return formatRuDate(chartData.isoStart);
                      if (i === S) return formatRuDate(chartData.isoEnd);
                      return dateLabelAlongScenario(chartData.isoStart, chartData.isoEnd, i, S);
                    }}
                    stroke="#71717a"
                    tick={{ fill: '#a1a1aa', fontSize: 9 }}
                    interval={0}
                    angle={-32}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis
                    tickFormatter={v => `${Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}`}
                    stroke="#71717a"
                    tick={{ fill: '#a1a1aa', fontSize: 12 }}
                    width={56}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
                    labelFormatter={(idx: number) => {
                      const i = Number(idx);
                      const S = PORTFOLIO_STRESS_CHART_STEPS;
                      if (i === 0) return `Начало · ${formatRuDate(chartData.isoStart)}`;
                      if (i === S) return `Конец · ${formatRuDate(chartData.isoEnd)}`;
                      return dateLabelAlongScenario(chartData.isoStart, chartData.isoEnd, i, S);
                    }}
                    formatter={(v: number) => [`${fmtMoney(v, 0)} ₽`, 'Акции']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                  <Label value="Стоимость акций, ₽" angle={-90} position="insideLeft" fill="#a1a1aa" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-[#2a2a2a] rounded-2xl border border-zinc-700/50 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <p className="text-zinc-300 text-sm">График показывает динамику суммарной стоимости акций (без кэша).</p>
              <button
                type="button"
                onClick={() => setShowInterpretation(p => !p)}
                className="bg-[#b40000] hover:bg-[#d00000] text-white font-bold px-6 py-3 rounded-xl shrink-0"
              >
                Интерпретировать результат
              </button>
            </div>
            {showInterpretation && (
              <div className="mt-4 bg-[#222225] rounded-2xl border border-zinc-700/50 p-5">
                <h4 className="text-zinc-100 font-semibold mb-2">Простыми словами</h4>
                <p className="text-zinc-300 leading-relaxed">{interpretationText}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
