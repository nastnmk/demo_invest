import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import {
  getRecommendedPortfolios,
  type RecommendedPortfoliosResponse,
  type RecommendedPortfolioItem
} from '../api/advisoryApi';

function fmtRub(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

function fmtPct(n: number, digits = 1) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

const THEME_ORDER = ['dream', 'growth', 'income'];

function sortItems(items: RecommendedPortfolioItem[]) {
  return [...items].sort((a, b) => {
    const ia = THEME_ORDER.indexOf(a.theme_key);
    const ib = THEME_ORDER.indexOf(b.theme_key);
    if (ia === -1 && ib === -1) return a.title.localeCompare(b.title, 'ru');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export type AdvisoryThemeKey = 'dream' | 'growth' | 'income';

type Props = {
  defaultBudget: number;
  /** Показать только одну тему (например, выбранную цель в «Мечты и цели»). */
  focusThemeKey?: AdvisoryThemeKey | null;
  /** Вложенный вид без внешней «карточки» (внутри блока целей). */
  embedded?: boolean;
};

/** Кэш по ключу — один запрос на комбинацию budget/history/top. */
const responseCache = new Map<string, RecommendedPortfoliosResponse>();

export function RecommendedPortfolios({
  defaultBudget,
  focusThemeKey = null,
  embedded = false
}: Props) {
  const [budget, setBudget] = useState(() => Math.max(1000, Math.round(defaultBudget)));
  const [historyDays, setHistoryDays] = useState(252);
  const [topAssets, setTopAssets] = useState(4);
  const [data, setData] = useState<RecommendedPortfoliosResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = `${budget}|${historyDays}|${topAssets}`;

  useEffect(() => {
    const cached = responseCache.get(cacheKey);
    if (cached) {
      setData(cached);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await getRecommendedPortfolios({
          budget,
          history_days: historyDays,
          top_assets: topAssets
        });
        if (cancelled) return;
        responseCache.set(cacheKey, res);
        setData(res);
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : 'Не удалось загрузить рекомендации.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, budget, historyDays, topAssets]);

  const items = data ? sortItems(data.items) : [];
  const visibleItems = focusThemeKey ? items.filter(i => i.theme_key === focusThemeKey) : items;

  const forceRefresh = () => {
    responseCache.delete(cacheKey);
    setData(null);
    setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await getRecommendedPortfolios({
            budget,
            history_days: historyDays,
            top_assets: topAssets
          });
          responseCache.set(cacheKey, res);
          setData(res);
        } catch (e) {
          setData(null);
          setError(e instanceof Error ? e.message : 'Не удалось загрузить рекомендации.');
        } finally {
          setLoading(false);
        }
      })();
    }, 0);
  };

  const shellClass = embedded
    ? 'w-full'
    : 'bg-[#2a2a2a] rounded-3xl p-6 md:p-8 border border-zinc-700/50';

  return (
    <div className={shellClass}>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
        <div>
          <h2 className={`font-bold text-zinc-100 tracking-tight ${embedded ? 'text-xl' : 'text-2xl'}`}>
            {focusThemeKey ? 'Рекомендованный портфель под эту цель' : 'Рекомендованные портфели'}
          </h2>
          {!focusThemeKey && (
            <p className="text-zinc-500 text-sm mt-1">
              Три темы — один запрос к advisory, без догрузки цен по каждой бумаге.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Бюджет, ₽
            <input
              type="number"
              min={1000}
              step={1000}
              value={budget}
              onChange={e => setBudget(Math.max(1000, Number(e.target.value) || 0))}
              className="w-36 rounded-xl bg-zinc-800 border border-zinc-600 px-3 py-2 text-zinc-100 font-mono text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            История, дн.
            <select
              value={historyDays}
              onChange={e => setHistoryDays(Number(e.target.value))}
              className="rounded-xl bg-zinc-800 border border-zinc-600 px-3 py-2 text-zinc-100 text-sm"
            >
              <option value={126}>126</option>
              <option value={252}>252</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Топ активов
            <select
              value={topAssets}
              onChange={e => setTopAssets(Number(e.target.value))}
              className="rounded-xl bg-zinc-800 border border-zinc-600 px-3 py-2 text-zinc-100 text-sm"
            >
              {[3, 4, 5, 6].map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={forceRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm border border-zinc-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Сбросить кэш
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-800/60 bg-red-950/30 text-red-200 px-4 py-3 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-zinc-400">
          <Loader2 className="w-10 h-10 animate-spin text-red-500" />
          <span className="text-sm">Загружаем подборки…</span>
        </div>
      )}

      {!loading && !error && data && visibleItems.length === 0 && (
        <p className="text-zinc-500 text-center py-12">
          {focusThemeKey ? 'Нет подборки для этой темы в ответе сервера.' : 'Нет данных в ответе.'}
        </p>
      )}

      <div
        className={`grid gap-6 ${focusThemeKey ? 'grid-cols-1 max-w-3xl' : 'grid-cols-1 xl:grid-cols-3'}`}
      >
        {visibleItems.map(theme => (
          <article
            key={theme.theme_key}
            className="bg-[#1e1e22] rounded-2xl border border-zinc-700/50 p-5 flex flex-col min-h-0"
          >
            <h3 className="text-lg font-bold text-zinc-100 leading-snug mb-2">{theme.title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed mb-4 flex-1">{theme.description}</p>
            <div className="flex flex-wrap gap-2 text-xs mb-4">
              <span className="px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300">{theme.risk_profile}</span>
              <span className="px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300">{theme.investment_horizon}</span>
              <span className="px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 font-mono">{fmtRub(theme.budget)}</span>
            </div>
            <div className="rounded-xl bg-zinc-900/50 border border-zinc-700/40 p-3 mb-4 text-xs space-y-1">
              <div className="flex justify-between gap-2">
                <span className="text-zinc-500">Ожид. доходность (год)</span>
                <span className={`font-mono font-medium ${theme.summary.expected_annual_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtPct(theme.summary.expected_annual_return_pct, 2)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-500">Волатильность (год)</span>
                <span className="font-mono text-zinc-300">{theme.summary.expected_annual_volatility_pct.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-500">Дивидендный score</span>
                <span className="font-mono text-zinc-300">{theme.summary.weighted_dividend_score.toFixed(2)}</span>
              </div>
              <p className="text-[11px] text-zinc-600 leading-snug pt-2 mt-2 border-t border-zinc-800/80">
                <span className="text-zinc-500">Волатильность</span> — насколько сильно может колебаться доходность портфеля за год; чем выше процент, тем сильнее возможные просадки и скачки.{' '}
                <span className="text-zinc-500">Дивидендный score</span> — сводная оценка дивидендной привлекательности: учитываются доли бумаг и их дивидендный профиль.
              </p>
            </div>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-left text-xs min-w-[320px]">
                <thead>
                  <tr className="text-zinc-500 border-b border-zinc-700/60">
                    <th className="py-2 pr-2 font-medium">Тикер</th>
                    <th className="py-2 pr-2 font-medium">Вес</th>
                    <th className="py-2 pr-2 font-medium text-right">Сумма</th>
                    <th className="py-2 pr-2 font-medium text-right hidden sm:table-cell">Цена</th>
                    <th className="py-2 pr-2 font-medium text-right hidden sm:table-cell">Доход</th>
                    <th className="py-2 font-medium text-right hidden md:table-cell">Волат.</th>
                  </tr>
                </thead>
                <tbody>
                  {theme.assets.map(a => (
                    <tr key={`${theme.theme_key}-${a.secid}`} className="border-b border-zinc-800/80 align-top">
                      <td className="py-2 pr-2">
                        <div className="font-mono text-zinc-200">{a.secid}</div>
                        <div className="text-zinc-500 truncate max-w-[120px]">{a.short_name}</div>
                      </td>
                      <td className="py-2 pr-2 text-zinc-300">{a.weight_pct.toFixed(1)}%</td>
                      <td className="py-2 pr-2 text-right font-mono text-zinc-200">{fmtRub(a.amount_for_budget)}</td>
                      <td className="py-2 pr-2 text-right font-mono text-zinc-400 hidden sm:table-cell">{a.current_price.toFixed(2)}</td>
                      <td className="py-2 pr-2 text-right hidden sm:table-cell">
                        <span className={a.annual_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {fmtPct(a.annual_return_pct, 1)}
                        </span>
                      </td>
                      <td className="py-2 text-right text-zinc-400 hidden md:table-cell">{a.annualized_volatility_pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </div>

      {data?.generated_at && (
        <p className="text-zinc-600 text-xs mt-6 text-center">Выводится: {data.generated_at}</p>
      )}
    </div>
  );
}
