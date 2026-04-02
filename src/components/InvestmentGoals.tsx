import { useState } from 'react';
import { RecommendedPortfolios, type AdvisoryThemeKey } from './RecommendedPortfolios';

export type InvestmentGoalId = 'dream' | 'passive' | 'grow';

function goalToAdvisoryTheme(id: InvestmentGoalId): AdvisoryThemeKey {
  if (id === 'dream') return 'dream';
  if (id === 'grow') return 'growth';
  return 'income';
}

type GoalDef = {
  id: InvestmentGoalId;
  title: string;
  description: string;
  icon: string;
};

const GOALS: GoalDef[] = [
  {
    id: 'dream',
    title: 'Накопить на мечту',
    description: 'Поможем рассчитать, как достичь конкретной финансовой цели.',
    icon: '🚀'
  },
  {
    id: 'passive',
    title: 'Создать пассивный доход',
    description: 'Сформируем капитал, который будет приносить вам стабильный доход.',
    icon: '💰'
  },
  {
    id: 'grow',
    title: 'Приумножить капитал',
    description: 'Простой способ вложить деньги и получать прогнозируемый доход.',
    icon: '📈'
  }
];

type Props = {
  portfolioCount: number;
  uniqueSectors: number;
  // Сумма для подсказок подборки, как стартовый баланс
  defaultBudget: number;
  className?: string;
};

export function InvestmentGoals({ portfolioCount, uniqueSectors, defaultBudget, className = '' }: Props) {
  const [selectedGoal, setSelectedGoal] = useState<InvestmentGoalId | null>(null);

  const extraHint =
    portfolioCount === 0
      ? 'В портфеле нет позиций — начните с «Маркет».'
      : uniqueSectors < 2
        ? 'Мало секторов — добавьте бумаги из других отраслей.'
        : null;

  return (
    <div className={`w-full ${className}`}>
      <div className="w-full bg-[#2a2a2a] rounded-3xl p-5 sm:p-6 border border-zinc-700/50 text-zinc-100">
        <div className="flex flex-col items-start text-left gap-2.5 mb-5">
          <div className="bg-[#3a3a3a] px-3 py-1.5 rounded-xl border border-zinc-700/50 inline-flex">
            <span className="text-sm font-semibold tracking-tight text-zinc-100">Ваша цель</span>
          </div>
          <p className="text-zinc-400 text-sm leading-snug max-w-lg">
            Выберите одну из целей, чтобы мы могли сориентировать вас, как доработать ваш портфель
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GOALS.map(goal => (
            <button
              key={goal.id}
              type="button"
              onClick={() => setSelectedGoal(goal.id)}
              aria-pressed={selectedGoal === goal.id}
              className={`flex flex-col gap-2 p-3.5 rounded-2xl transition-all duration-200 text-left border ${
                selectedGoal === goal.id
                  ? 'bg-[#1a1a1a] border-[#cc0000] ring-1 ring-red-600/25'
                  : 'bg-[#1e1e1e] border-zinc-700/60 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 w-full">
                <div className="w-9 h-9 bg-zinc-900 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-zinc-800">
                  <span className="text-lg leading-none" aria-hidden>
                    {goal.icon}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-zinc-100 leading-tight text-left min-w-0 flex-1">
                  {goal.title}
                </h3>
              </div>
              <p className="text-zinc-500 text-[11px] sm:text-xs leading-snug w-full">
                {goal.description}
              </p>
            </button>
          ))}
        </div>

        {selectedGoal && (
          <div
            className="mt-4 pt-4 border-t border-zinc-700/50 animate-in fade-in slide-in-from-bottom-2 duration-200"
            role="region"
            aria-label="Рекомендованный портфель по выбранной цели"
          >
            {extraHint && (
              <p className="text-amber-200/85 text-xs bg-amber-950/20 border border-amber-800/30 rounded-lg px-2.5 py-1.5 mb-4 text-left">
                {extraHint}
              </p>
            )}

            <RecommendedPortfolios
              defaultBudget={defaultBudget}
              focusThemeKey={goalToAdvisoryTheme(selectedGoal)}
              embedded
            />
          </div>
        )}
      </div>
    </div>
  );
}
