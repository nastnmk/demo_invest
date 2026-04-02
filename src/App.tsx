/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Корневой экран: загрузка портфеля, refresh котировок (в т.ч. refresh-live на backend),
 * сделки с проверкой баланса/лимита позиций, дебаунс быстрых докупок (queueTradeDelta).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { RiskTest } from './components/RiskTest';
import { Analytics } from './components/Analytics';
import { Community } from './components/Community';
import { Stock, PortfolioItem } from './types';
import { useAuth } from './auth/AuthContext';
import { ApiError } from './api/http';
import {
  buyAsset,
  createPortfolio,
  fetchStocks,
  getPortfolio,
  getPortfolioAnalyticsHistory,
  getPortfolioAnalyticsMetrics,
  getPortfolioPositions,
  listPortfolios,
  mapPositionsToPortfolioItems,
  patchStocksPricesForSecids,
  refreshLivePrices,
  sellAsset,
  type PortfolioAnalyticsHistoryPoint,
  type PortfolioMetrics
} from './api/moex';
import { LogOut } from 'lucide-react';

const INITIAL_BALANCE = 1000000;
const MAX_PORTFOLIO_ITEMS = 15;

export default function App() {
  const { isAuthenticated, isAuthLoading, user, logout } = useAuth();
  const [currentView, setCurrentView] = useState<'dashboard' | 'analytics' | 'risk-test' | 'community'>('dashboard');
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [balance, setBalance] = useState(INITIAL_BALANCE);
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const [portfolioChartPoints, setPortfolioChartPoints] = useState<PortfolioAnalyticsHistoryPoint[]>([]);
  const [portfolioMetrics, setPortfolioMetrics] = useState<PortfolioMetrics | null>(null);
  /** Только ручное «Обновить цены» — не путать с первичной загрузкой после F5 */
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [hasSeenAnalyticsWithPortfolio, setHasSeenAnalyticsWithPortfolio] = useState(false);

  const portfolioBootRef = useRef(false);
  const stocksRef = useRef(stocks);
  const portfolioRef = useRef(portfolio);
  const balanceRef = useRef(balance);
  const tradeDeltaRef = useRef<Map<string, number>>(new Map());
  const tradeFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stocksRef.current = stocks;
  }, [stocks]);
  useEffect(() => {
    portfolioRef.current = portfolio;
  }, [portfolio]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    if (!isAuthenticated) {
      portfolioBootRef.current = false;
      setPortfolioId(null);
      setPortfolio([]);
      setStocks([]);
      setPortfolioChartPoints([]);
      setPortfolioMetrics(null);
      setBalance(INITIAL_BALANCE);
      setHasSeenAnalyticsWithPortfolio(false);
      setCurrentView('dashboard');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || isAuthLoading || !user) return;
    if (portfolioBootRef.current) return;
    portfolioBootRef.current = true;

    let cancelled = false;
    (async () => {
      setIsBootstrapping(true);
      setApiError(null);
      try {
        const portfolios = await listPortfolios();
        const ensured = portfolios.length > 0 ? portfolios[0] : await createPortfolio(INITIAL_BALANCE);
        if (cancelled) return;
        setPortfolioId(ensured.id);
        const stocksData = await loadStocks();
        if (cancelled) return;
        await refreshPortfolioFn(ensured.id, stocksData);
      } catch (e) {
        console.error(e);
        portfolioBootRef.current = false;
        if (!cancelled) setApiError('Не удалось загрузить данные. Проверьте соединение и вход в аккаунт.');
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
      portfolioBootRef.current = false;
    };
  }, [isAuthenticated, isAuthLoading, user?.id]);

  useEffect(() => {
    if (portfolio.length === 0) {
      setHasSeenAnalyticsWithPortfolio(false);
      if (currentView === 'risk-test') {
        setCurrentView('dashboard');
      }
    }
  }, [portfolio.length, currentView]);

  const riskTestAvailable = portfolio.length > 0 && hasSeenAnalyticsWithPortfolio;

  const openAnalytics = () => {
    if (portfolio.length > 0) {
      setHasSeenAnalyticsWithPortfolio(true);
    }
    setCurrentView('analytics');
  };

  const loadStocks = async () => {
    const data = await fetchStocks();
    setStocks(data);
    return data;
  };

  const refreshPortfolioFn = async (pid: number, currentStocks: Stock[]) => {
    const [portfolioRead, positions, chartPts, metrics] = await Promise.all([
      getPortfolio(pid),
      getPortfolioPositions(pid),
      getPortfolioAnalyticsHistory(pid, 300).catch(() => [] as PortfolioAnalyticsHistoryPoint[]),
      getPortfolioAnalyticsMetrics(pid, 300).catch(() => null as PortfolioMetrics | null)
    ]);
    setBalance(portfolioRead.cash_balance);
    setPortfolio(mapPositionsToPortfolioItems(positions, currentStocks));
    setPortfolioChartPoints(chartPts);
    setPortfolioMetrics(metrics);
  };

  /** Полное обновление маркета — только по кнопке «Обновить цены». */
  const reloadMarketData = useCallback(async () => {
    if (!portfolioId) return;
    const secids = new Set<string>();
    stocksRef.current.forEach(s => secids.add(s.secid));
    portfolioRef.current.forEach(p => secids.add(p.stock.secid));
    await refreshLivePrices([...secids]).catch(() => null);
    const latestStocks = await fetchStocks();
    setStocks(latestStocks);
    await refreshPortfolioFn(portfolioId, latestStocks);
  }, [portfolioId]);

  /** После сделки: только портфель + цены по затронутым тикерам (без полного fetchStocks). */
  const syncPortfolioAfterTrade = useCallback(
    async (touchedSecids: string[]) => {
      if (!portfolioId) return;
      const uniq = [...new Set(touchedSecids)].filter(Boolean);
      if (uniq.length === 0) return;
      const latestStocks = await patchStocksPricesForSecids(stocksRef.current, uniq);
      setStocks(latestStocks);
      await refreshPortfolioFn(portfolioId, latestStocks);
    },
    [portfolioId]
  );

  /** Только кнопка «Обновить цены» */
  const refreshPrices = useCallback(async () => {
    if (!portfolioId) return;
    setIsRefreshingPrices(true);
    setApiError(null);
    try {
      await reloadMarketData();
    } catch (error) {
      console.error('Failed to refresh prices:', error);
      setApiError('Не удалось обновить котировки.');
    } finally {
      setIsRefreshingPrices(false);
    }
  }, [portfolioId, reloadMarketData]);

  const handleBuy = async (stock: Stock, quantity: number = 1) => {
    if (!portfolioId || stock.assetId == null) return;
    const totalCost = stock.price * quantity;
    if (balance < totalCost) {
      setApiError('Недостаточно средств для покупки.');
      return;
    }
    const existingItem = portfolio.find(item => item.stock.secid === stock.secid);
    if (!existingItem && portfolio.length >= MAX_PORTFOLIO_ITEMS) {
      setApiError(`В портфеле не больше ${MAX_PORTFOLIO_ITEMS} разных позиций.`);
      return;
    }
    try {
      await buyAsset(portfolioId, stock.assetId, quantity);
      setApiError(null);
      await syncPortfolioAfterTrade([stock.secid]);
    } catch (e) {
      if (e instanceof ApiError) {
        setApiError(e.message);
      } else {
        setApiError('Не удалось выполнить покупку.');
      }
    }
  };

  const handleSell = async (stock: Stock, quantity: number = 1) => {
    if (!portfolioId || stock.assetId == null) return;
    const existingItem = portfolio.find(item => item.stock.secid === stock.secid);
    if (!existingItem) {
      setApiError('Нет такой позиции в портфеле.');
      return;
    }
    const sellQuantity = Math.min(existingItem.quantity, quantity);
    if (sellQuantity <= 0) {
      setApiError('Некорректное количество для продажи.');
      return;
    }
    try {
      await sellAsset(portfolioId, stock.assetId, sellQuantity);
      setApiError(null);
      await syncPortfolioAfterTrade([stock.secid]);
    } catch (e) {
      if (e instanceof ApiError) {
        setApiError(e.message);
      } else {
        setApiError('Не удалось выполнить продажу.');
      }
    }
  };

  const flushTradeDeltas = useCallback(async () => {
    if (!portfolioId) return;
    const buf = tradeDeltaRef.current;
    if (buf.size === 0) return;
    const touchedSecids = [...buf.entries()].filter(([, net]) => net !== 0).map(([secid]) => secid);
    tradeDeltaRef.current = new Map();
    let lastError: string | null = null;
    for (const [secid, net] of buf) {
      if (net === 0) continue;
      const stock = stocksRef.current.find(s => s.secid === secid);
      if (!stock?.assetId) continue;
      try {
        if (net > 0) {
          const cost = stock.price * net;
          if (balanceRef.current < cost) {
            lastError = 'Недостаточно средств для покупки.';
            continue;
          }
          const existing = portfolioRef.current.find(p => p.stock.secid === secid);
          if (!existing && portfolioRef.current.length >= MAX_PORTFOLIO_ITEMS) {
            lastError = `В портфеле не больше ${MAX_PORTFOLIO_ITEMS} разных позиций.`;
            continue;
          }
          await buyAsset(portfolioId, stock.assetId, net);
        } else {
          const q = -net;
          const existing = portfolioRef.current.find(p => p.stock.secid === secid);
          if (!existing) continue;
          const sellQty = Math.min(existing.quantity, q);
          if (sellQty <= 0) continue;
          await sellAsset(portfolioId, stock.assetId, sellQty);
        }
      } catch (e) {
        lastError = e instanceof ApiError ? e.message : 'Ошибка при сделке.';
      }
    }
    if (lastError) setApiError(lastError);
    try {
      await syncPortfolioAfterTrade(touchedSecids);
    } catch (e) {
      console.error(e);
      setApiError('Не удалось обновить после сделки.');
    }
  }, [portfolioId, syncPortfolioAfterTrade]);

  const queueTradeDelta = useCallback(
    (stock: Stock, delta: number) => {
      if (!stock.assetId || !portfolioId) return;
      const k = stock.secid;
      const prev = tradeDeltaRef.current.get(k) ?? 0;
      tradeDeltaRef.current.set(k, prev + delta);
      if (tradeFlushTimerRef.current) clearTimeout(tradeFlushTimerRef.current);
      tradeFlushTimerRef.current = setTimeout(() => {
        tradeFlushTimerRef.current = null;
        void flushTradeDeltas();
      }, 450);
    },
    [portfolioId, flushTradeDeltas]
  );

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center gap-3 text-zinc-400">
        <div className="h-10 w-10 border-2 border-zinc-600 border-t-red-500 rounded-full animate-spin" />
        <p className="text-sm">Загрузка сессии…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-[#121212] text-zinc-50 font-sans selection:bg-red-500/30 selection:text-red-200">
      <header className="bg-[#1c1c1e] border-b border-zinc-800 p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="font-bold text-xl tracking-tight text-zinc-100 flex items-center gap-3 min-w-0">
            <img
              src="/logo-pug.png"
              width={40}
              height={40}
              alt=""
              aria-hidden
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl object-contain shrink-0 ring-1 ring-zinc-700/70 bg-zinc-900/60"
              decoding="async"
            />
            <span className="truncate">Инвест-симулятор</span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`hover:text-zinc-100 transition-colors ${currentView === 'dashboard' ? 'text-zinc-100' : ''}`}
            >
              Маркет
            </button>
            <button
              onClick={openAnalytics}
              className={`hover:text-zinc-100 transition-colors ${currentView === 'analytics' ? 'text-zinc-100' : ''}`}
            >
              Портфель
            </button>
            <button
              onClick={() => {
                if (riskTestAvailable) setCurrentView('risk-test');
              }}
              className={`transition-colors ${riskTestAvailable ? 'hover:text-zinc-100' : 'opacity-50 cursor-not-allowed'} ${currentView === 'risk-test' ? 'text-zinc-100' : ''}`}
              disabled={!riskTestAvailable}
              title={riskTestAvailable ? '' : 'Сначала соберите портфель и зайдите в раздел Портфель'}
            >
              Риск-тест
            </button>
            <button
              onClick={() => setCurrentView('community')}
              className={`hover:text-zinc-100 transition-colors ${currentView === 'community' ? 'text-[#cc0000]' : ''}`}
            >
              Сообщество
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <div className="text-sm text-zinc-400 flex flex-col items-end">
              <span className="text-zinc-500 text-xs hidden sm:block max-w-[160px] truncate">{user?.name}</span>
              <span className="text-zinc-100 font-mono text-lg font-bold">{balance.toLocaleString('ru-RU')} ₽</span>
            </div>
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </div>
        </div>
      </header>

      <main className="pb-12 pt-6">
        {apiError && (
          <div className="max-w-7xl mx-auto px-6 mb-4">
            <div className="rounded-xl border border-red-700/60 bg-red-950/30 text-red-200 px-4 py-3 text-sm">{apiError}</div>
          </div>
        )}
        {currentView === 'dashboard' && (
          <Dashboard
            stocks={stocks}
            portfolio={portfolio}
            balance={balance}
            initialBalance={INITIAL_BALANCE}
            maxPositions={MAX_PORTFOLIO_ITEMS}
            onBuy={handleBuy}
            onSell={handleSell}
            onTradeDelta={queueTradeDelta}
            onRiskTest={openAnalytics}
            onReset={() => {
              setPortfolio([]);
              setBalance(INITIAL_BALANCE);
              setHasSeenAnalyticsWithPortfolio(false);
            }}
            onRefresh={refreshPrices}
            isRefreshing={isRefreshingPrices}
            canRefresh={Boolean(portfolioId) && stocks.length > 0 && !isBootstrapping}
          />
        )}
        {currentView === 'analytics' && (
          <Analytics
            portfolioId={portfolioId}
            portfolio={portfolio}
            balance={balance}
            initialBalance={INITIAL_BALANCE}
            maxPositions={MAX_PORTFOLIO_ITEMS}
            riskTestAvailable={riskTestAvailable}
            chartPoints={portfolioChartPoints}
            portfolioMetrics={portfolioMetrics}
            onSell={handleSell}
            onTradeDelta={queueTradeDelta}
            onRefresh={refreshPrices}
            isRefreshing={isRefreshingPrices}
            canRefresh={Boolean(portfolioId) && stocks.length > 0 && !isBootstrapping}
            onRiskTest={() => {
              if (riskTestAvailable) {
                setCurrentView('risk-test');
              }
            }}
          />
        )}
        {currentView === 'risk-test' && (
          <RiskTest portfolioId={portfolioId} portfolio={portfolio} balance={balance} />
        )}
        {currentView === 'community' && <Community stocks={stocks} />}
      </main>
    </div>
  );
}
