import { useEffect, useState } from 'react';
import { Stock, PortfolioItem } from '../types';
import { StockCard } from './StockCard';
import { PortfolioSidebar } from './PortfolioSidebar';
import { IntroModal } from './IntroModal';
import { MarketIntroContent } from '../intro/introContents';
import { LS_INTRO_MARKET } from '../intro/storageKeys';
import { HelpCircle, AlertTriangle, RefreshCw } from 'lucide-react';

interface DashboardProps {
  stocks: Stock[];
  portfolio: PortfolioItem[];
  balance: number;
  initialBalance: number;
  maxPositions: number;
  onBuy: (stock: Stock, quantity?: number) => void;
  onSell: (stock: Stock, quantity?: number) => void;
  onTradeDelta: (stock: Stock, delta: number) => void;
  onRiskTest: () => void;
  onReset: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  canRefresh: boolean;
}

export function Dashboard({
  stocks,
  portfolio,
  balance,
  initialBalance,
  maxPositions,
  onBuy,
  onSell,
  onTradeDelta,
  onRiskTest,
  onReset,
  onRefresh,
  isRefreshing,
  canRefresh
}: DashboardProps) {
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(LS_INTRO_MARKET) !== '1') {
        setShowIntro(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const dismissIntro = () => {
    try {
      localStorage.setItem(LS_INTRO_MARKET, '1');
    } catch {
      /* ignore */
    }
    setShowIntro(false);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      <IntroModal open={showIntro} title="Добро пожаловать в симулятор" onDismiss={dismissIntro}>
        <MarketIntroContent />
      </IntroModal>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-3xl font-bold flex flex-wrap items-center gap-3 tracking-tight">
          Настройка демо-портфеля
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

      <div className="bg-[#2a2a2a] border border-zinc-700/50 p-5 rounded-2xl mb-8 flex gap-4 items-start shadow-inner relative overflow-hidden">
        <div className="bg-red-600 p-2 rounded-full text-white shrink-0 mt-0.5 relative z-10">
          <AlertTriangle size={20} />
        </div>
        <div className="relative z-10">
          <p className="text-sm text-zinc-200 leading-relaxed font-medium">
            Старайтесь не собирать портфель только из одной отрасли (например, только банки или только нефть). Если у них начнутся проблемы, вы потеряете много денег. 
            Лучше покупать акции разных компаний — это называется диверсификация.
          </p>
        </div>
        {/* Mascot inside the tip box or floating? Let's put it floating on the screen */}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6 items-start">
            {stocks.map(stock => (
              <StockCard key={stock.secid} stock={stock} onBuy={onBuy} />
            ))}
            {stocks.length === 0 && (
              <div className="md:col-span-2 bg-[#2a2a2a] border border-zinc-700/50 rounded-2xl p-6 text-zinc-300">
                Нет доступных компаний из API.
                <br />
                Показываем только те активы, у которых есть описание компании и рыночные данные.
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 h-[calc(100vh-200px)] sticky top-24">
          <PortfolioSidebar
            portfolio={portfolio}
            balance={balance}
            maxPositions={maxPositions}
            initialBalance={initialBalance}
            onTradeDelta={onTradeDelta}
            onSell={onSell}
            onRiskTest={onRiskTest}
            onReset={onReset}
          />
        </div>
      </div>
    </div>
  );
}
