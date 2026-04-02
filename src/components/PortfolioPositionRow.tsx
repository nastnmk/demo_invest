import { useEffect, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { PortfolioItem } from '../types';

type Props = {
  item: PortfolioItem;
  /** Докупка +1 лот (дебаунс); продажа — через «Продать» ниже */
  onTradeDelta: (stock: PortfolioItem['stock'], delta: number) => void;
  /** Продажа с явным количеством — сразу на сервер */
  onSell: (stock: PortfolioItem['stock'], quantity?: number) => void;
  /** На экране аналитики — без докупки, только продажа */
  allowAddShares?: boolean;
};

export function PortfolioPositionRow({ item, onTradeDelta, onSell, allowAddShares = true }: Props) {
  const { stock, quantity } = item;
  const [sellQty, setSellQty] = useState(1);
  const [sellOpen, setSellOpen] = useState(false);

  useEffect(() => {
    setSellQty(q => Math.min(Math.max(1, q), quantity));
  }, [quantity]);

  useEffect(() => {
    if (quantity === 0) {
      setSellOpen(false);
    }
  }, [quantity]);

  const price = stock.price;
  const positionValue = price * quantity;
  const qSell = Math.min(sellQty, quantity);
  const estimate = price * qSell;

  const closeSellPanel = () => {
    setSellOpen(false);
    setSellQty(1);
  };

  return (
    <div className="bg-[#3a3a3a] p-3 rounded-2xl border border-zinc-700/50 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {stock.logoUrl ? (
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center p-1 shrink-0">
              <img src={stock.logoUrl} alt="" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-10 h-10 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-zinc-300">
              {stock.shortName[0]}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs text-zinc-400 leading-tight">Акция</p>
            <p className="font-semibold text-sm text-zinc-200 leading-tight truncate">{stock.shortName}</p>
            <p className="text-xs text-zinc-500 font-mono">{stock.secid}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-zinc-400">Сейчас</p>
          <p className="font-mono font-semibold text-sm text-zinc-100">
            {price.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
          </p>
          <p className={`text-[10px] ${stock.changePct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {stock.changePct >= 0 ? '+' : ''}
            {stock.changePct}% день
          </p>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-zinc-400">В позиции: {quantity} лот.</p>
          <p className="text-xs text-zinc-500">
            Сумма позиции:{' '}
            <span className="font-mono font-semibold text-zinc-100">
              {positionValue.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽
            </span>
          </p>
        </div>
        {allowAddShares ? (
          <div className="flex items-center gap-1 bg-[#2a2a2a] rounded-lg p-0.5 shrink-0">
            <span className="font-mono font-bold text-xs min-w-[1.5rem] text-center text-zinc-200 px-1">{quantity}</span>
            <button
              type="button"
              onClick={() => onTradeDelta(stock, 1)}
              className="w-7 h-7 flex items-center justify-center bg-zinc-700 hover:bg-zinc-600 rounded text-white transition-colors"
              title="Докупить 1 лот"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="pt-2 border-t border-zinc-600/40 space-y-2">
        {!sellOpen ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSellQty(Math.min(quantity, 1));
                setSellOpen(true);
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-100 leading-tight"
            >
              Продать
            </button>
            <button
              type="button"
              onClick={() => onSell(stock, quantity)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/70 text-red-200 border border-red-800/50 leading-tight"
              title="Продать все лоты по текущей цене"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              Продать всё
            </button>
          </div>
        ) : (
          <div className="rounded-lg bg-[#2a2a2a] border border-zinc-600/60 p-2 space-y-2">
            <p className="text-xs font-medium text-zinc-300 leading-snug">Сколько лотов продать?</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-[#1e1e1e] rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setSellQty(q => Math.max(1, q - 1))}
                  className="w-8 h-8 flex items-center justify-center rounded bg-zinc-700 hover:bg-zinc-600 text-white"
                  aria-label="Меньше"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={quantity}
                  value={sellQty}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isNaN(v)) return;
                    setSellQty(Math.min(quantity, Math.max(1, v)));
                  }}
                  className="w-12 bg-transparent border-0 text-center text-sm font-mono font-bold text-zinc-100 focus:outline-none focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => setSellQty(q => Math.min(quantity, q + 1))}
                  className="w-8 h-8 flex items-center justify-center rounded bg-zinc-700 hover:bg-zinc-600 text-white"
                  aria-label="Больше"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-xs text-zinc-400 leading-tight">
                из {quantity} · ≈{' '}
                <span className="font-mono text-zinc-200">
                  {estimate.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽
                </span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  onSell(stock, qSell);
                  closeSellPanel();
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-100 leading-tight"
              >
                Подтвердить продажу
              </button>
              <button
                type="button"
                onClick={closeSellPanel}
                className="text-xs font-medium px-3 py-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 leading-tight"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
