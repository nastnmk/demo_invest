import { PortfolioItem } from '../types';
import { Briefcase } from 'lucide-react';
import { PortfolioPositionRow } from './PortfolioPositionRow';

interface PortfolioSidebarProps {
  portfolio: PortfolioItem[];
  balance: number;
  initialBalance: number;
  maxPositions: number;
  onTradeDelta: (stock: PortfolioItem['stock'], delta: number) => void;
  onSell: (stock: PortfolioItem['stock'], quantity?: number) => void;
  onRiskTest: () => void;
  onReset: () => void;
}

export function PortfolioSidebar({
  portfolio,
  balance,
  initialBalance,
  maxPositions,
  onTradeDelta,
  onSell,
  onRiskTest,
  onReset
}: PortfolioSidebarProps) {
  const totalInvested = portfolio.reduce((sum, item) => sum + item.stock.price * item.quantity, 0);
  const totalEquity = balance + totalInvested;
  const profit = totalEquity - initialBalance;
  const profitPct = (profit / initialBalance) * 100;
  const isProfit = profit >= 0;

  return (
    <div className="bg-[#2a2a2a] rounded-3xl p-6 border border-zinc-700/50 flex flex-col h-full shadow-2xl">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold tracking-tight">
          Ваш портфель <span className="text-zinc-500 text-lg bg-zinc-800 px-3 py-1 rounded-full ml-2">{portfolio.length}/{maxPositions}</span>
        </h2>
      </div>

      <div className="space-y-4 mb-8">
        <div className="flex justify-between items-center">
          <span className="text-zinc-400 font-medium">Стоимость акций</span>
          <span className="font-mono text-xl font-bold text-zinc-100">{totalInvested.toLocaleString('ru-RU')} ₽</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-zinc-400 font-medium">Свободные деньги</span>
          <span className="font-mono text-lg font-medium text-zinc-300">{balance.toLocaleString('ru-RU')} ₽</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-3 mb-6 max-h-[28rem] custom-scrollbar">
        {portfolio.length === 0 ? (
          <div className="min-h-[200px] flex flex-col items-center justify-center text-zinc-500 text-sm text-center py-8 px-4">
            <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mb-4">
              <Briefcase size={24} className="text-zinc-600" />
            </div>
            <p className="font-medium text-zinc-400">У вас пока нет акций</p>
            <p className="mt-2 text-xs">Выберите акции слева и нажмите Купить.</p>
          </div>
        ) : (
          portfolio.map(item => (
            <div key={item.stock.secid}>
              <PortfolioPositionRow item={item} onTradeDelta={onTradeDelta} onSell={onSell} />
            </div>
          ))
        )}
      </div>

      <div className="border-t border-zinc-700/50 pt-6 mb-6">
        <div className="flex justify-between items-center mb-3">
          <span className="text-zinc-400 text-sm">Доходность</span>
          <div className={`flex items-center gap-1.5 font-mono font-bold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
            {isProfit ? '+' : ''}
            {profit.toLocaleString('ru-RU')} ₽
          </div>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-zinc-400">В процентах</span>
          <span className={`font-mono font-medium ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
            {isProfit ? '+' : ''}
            {profitPct.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={onRiskTest}
          disabled={portfolio.length === 0}
          className="w-full bg-[#cc0000] hover:bg-[#990000] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-red-900/20"
        >
          Подтвердить портфель
        </button>
      </div>
    </div>
  );
}
