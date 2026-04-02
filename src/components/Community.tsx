import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction
} from 'react';
import {
  Briefcase,
  Copy,
  Layers,
  Loader2,
  Mail,
  PieChart,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  User,
  Users,
  Wallet
} from 'lucide-react';
import { ApiError } from '../api/http';
import {
  fetchClassroomCompare,
  fetchClassroomStudents,
  type ClassroomCompareResponse,
  type ClassroomPortfolioSummary,
  type ClassroomStudentsResponse,
  type StudentWithPortfolios
} from '../api/classroomApi';
import { getPortfolioPositions, mapPositionsToPortfolioItems } from '../api/moex';
import { useAuth } from '../auth/AuthContext';
import type { Stock } from '../types';
import { sectorLabelRu } from '../utils/sectorLabels';

/** Длина кода учителя */
const TEACHER_CODE_LEN = 6;

/** Текст из apiErrorRu при нераспознанной англ. ошибке — показываем вместо него смысл про класс */
const GENERIC_API_FALLBACK = 'Не удалось выполнить операцию';

function messageForJoinFailure(err: unknown): string {
  if (err instanceof ApiError) {
    const m = err.message;
    if (
      m.includes(GENERIC_API_FALLBACK) ||
      m.includes('Попробуйте позже') ||
      (m.includes('Попробуйте') && m.includes('соединение'))
    ) {
      return 'Произошла ошибка при присоединении к классу. Проверьте код учителя и соединение с сервером.';
    }
    return `Произошла ошибка при присоединении: ${m}`;
  }
  return 'Произошла ошибка при присоединении к классу.';
}

function fmtMoney(n: number) {
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

type PortfolioStyleLabel = 'Агрессивный' | 'Умеренный' | 'Консервативный';

function portfolioStyleFromSharpe(sharpe: number | null | undefined): PortfolioStyleLabel {
  if (sharpe == null || Number.isNaN(sharpe)) return 'Умеренный';
  if (sharpe >= 1.1) return 'Агрессивный';
  if (sharpe <= 0.55) return 'Консервативный';
  return 'Умеренный';
}

function mergeUniqueSectorLabels(raw: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const s of raw) {
    if (s == null || !String(s).trim()) continue;
    set.add(sectorLabelRu(String(s).trim()));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
}

export type ClassroomHoldingLine = { secid: string; shortName: string };

/** Сектора и тикеры по позициям портфелей — справочник бумаг из уже загруженного маркета (без повторного fetch списка активов). */
async function collectClassroomPortfolioMeta(
  students: StudentWithPortfolios[],
  marketStocks: Stock[]
): Promise<{
  sectorsByStudentId: Record<number, string[]>;
  holdingsByStudentId: Record<number, ClassroomHoldingLine[]>;
}> {
  const portfolioIds = [...new Set(students.flatMap(s => s.portfolios.map(p => p.portfolio_id)))];
  if (portfolioIds.length === 0) {
    return { sectorsByStudentId: {}, holdingsByStudentId: {} };
  }
  if (marketStocks.length === 0) {
    return { sectorsByStudentId: {}, holdingsByStudentId: {} };
  }

  const byPortfolio = new Map<number, { sectors: string[]; holdings: ClassroomHoldingLine[] }>();
  await Promise.all(
    portfolioIds.map(async pid => {
      try {
        const positions = await getPortfolioPositions(pid);
        const items = mapPositionsToPortfolioItems(positions, marketStocks);
        const sectorSet = new Set<string>();
        const holdingMap = new Map<string, ClassroomHoldingLine>();
        for (const it of items) {
          sectorSet.add(sectorLabelRu(it.stock.sector));
          holdingMap.set(it.stock.secid, { secid: it.stock.secid, shortName: it.stock.shortName });
        }
        byPortfolio.set(pid, {
          sectors: Array.from(sectorSet).sort((a, b) => a.localeCompare(b, 'ru')),
          holdings: Array.from(holdingMap.values()).sort((a, b) => a.shortName.localeCompare(b.shortName, 'ru'))
        });
      } catch {
        byPortfolio.set(pid, { sectors: [], holdings: [] });
      }
    })
  );

  const sectorsByStudentId: Record<number, string[]> = {};
  const holdingsByStudentId: Record<number, ClassroomHoldingLine[]> = {};

  for (const row of students) {
    const mergedSectors = new Set<string>();
    const mergedHoldings = new Map<string, ClassroomHoldingLine>();
    for (const p of row.portfolios) {
      const meta = byPortfolio.get(p.portfolio_id);
      if (!meta) continue;
      meta.sectors.forEach(s => mergedSectors.add(s));
      meta.holdings.forEach(h => mergedHoldings.set(h.secid, h));
    }
    sectorsByStudentId[row.student.id] = Array.from(mergedSectors).sort((a, b) => a.localeCompare(b, 'ru'));
    holdingsByStudentId[row.student.id] = Array.from(mergedHoldings.values()).sort((a, b) =>
      a.shortName.localeCompare(b.shortName, 'ru')
    );
  }

  return { sectorsByStudentId, holdingsByStudentId };
}

/** Убираем время из подписи вида «Портфель …, 12:34:56». */
function displayPortfolioTableTitle(title: string): string {
  const t = title.trim();
  const i = t.indexOf(',');
  if (i > 0 && /^портфель\s/i.test(t)) {
    return t.slice(0, i).trim();
  }
  return t;
}

/** Сектора: без дублей; при >2 — свёртка, по клику только полный список (без дубля сверху). */
function SectorsExpandable({ sectors }: { sectors: string[] }) {
  const list = mergeUniqueSectorLabels(sectors);
  const [expanded, setExpanded] = useState(false);

  if (list.length === 0) {
    return <span className="text-xs text-zinc-500">—</span>;
  }
  if (list.length <= 2) {
    return (
      <div className="flex flex-wrap gap-1">
        {list.map(sec => (
          <span
            key={sec}
            className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 border border-zinc-700 max-w-[100px] truncate"
            title={sec}
          >
            {sec}
          </span>
        ))}
      </div>
    );
  }

  return (
    <details
      onToggle={e => {
        setExpanded(e.currentTarget.open);
      }}
    >
      <summary className="cursor-pointer list-none flex flex-wrap gap-1 items-center min-h-[1.5rem] [&::-webkit-details-marker]:hidden">
        {!expanded ? (
          <span className="inline-flex flex-wrap gap-1 items-center">
            {list.slice(0, 2).map(sec => (
              <span
                key={`prev-${sec}`}
                className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 border border-zinc-700 max-w-[100px] truncate"
                title={sec}
              >
                {sec}
              </span>
            ))}
            <span className="text-[10px] text-zinc-500 tabular-nums">+{list.length - 2}</span>
            <span className="text-[10px] text-red-500/80">· все</span>
          </span>
        ) : (
          <span className="text-[10px] text-zinc-500">Свернуть</span>
        )}
      </summary>
      <div className="mt-2 pt-2 border-t border-zinc-800/80 flex flex-wrap gap-1">
        {list.map(sec => (
          <span
            key={sec}
            className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 border border-zinc-700 max-w-[120px]"
            title={sec}
          >
            {sec}
          </span>
        ))}
      </div>
    </details>
  );
}

function aggregatePortfolios(ps: ClassroomPortfolioSummary[], positionSectors?: string[]) {
  if (ps.length === 0) {
    return {
      capital: 0,
      profitability: 0,
      portfolioType: 'Умеренный' as PortfolioStyleLabel,
      sectors: [] as string[],
      sharpeAvg: null as number | null
    };
  }
  const capital = ps.reduce((s, p) => s + p.total_value, 0);
  const w = ps.reduce((s, p) => s + p.total_value, 0);
  const profitability =
    w > 0
      ? ps.reduce((s, p) => s + p.total_return_pct * (p.total_value / w), 0)
      : ps.reduce((s, p) => s + p.total_return_pct, 0) / ps.length;
  const sharpeVals = ps.map(p => p.sharpe_ratio).filter((x): x is number => x != null && !Number.isNaN(x));
  const sharpeAvg =
    sharpeVals.length > 0 ? sharpeVals.reduce((a, b) => a + b, 0) / sharpeVals.length : null;
  const portfolioType = portfolioStyleFromSharpe(sharpeAvg);
  const fromApi = mergeUniqueSectorLabels(ps.flatMap(p => p.sectors ?? []));
  const sectors = mergeUniqueSectorLabels([...fromApi, ...(positionSectors ?? [])]);
  return { capital, profitability, portfolioType, sectors, sharpeAvg };
}

function ClassmateCard({
  name,
  email,
  capital,
  profitability,
  portfolioType,
  sectors,
  holdings,
  isMe,
  footer
}: {
  name: string;
  email: string;
  capital: number;
  profitability: number;
  portfolioType: PortfolioStyleLabel;
  sectors: string[];
  holdings: ClassroomHoldingLine[];
  isMe?: boolean;
  footer?: ReactNode;
}) {
  const pos = profitability >= 0;
  return (
    <div
      className={`bg-[#2a2a2a] rounded-3xl p-6 border-2 transition-all group relative overflow-hidden ${
        isMe
          ? 'border-red-600/60 ring-1 ring-red-500/25 shadow-lg shadow-red-950/20'
          : 'border-transparent hover:border-red-900/50'
      }`}
    >
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-600/5 rounded-full blur-3xl group-hover:bg-red-600/10 transition-all" />

      <div className="flex items-start justify-between mb-6 relative z-10">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 shrink-0 bg-zinc-800 rounded-2xl flex items-center justify-center border border-zinc-700 group-hover:border-red-900/30 transition-colors">
            <User className="text-zinc-400 group-hover:text-red-500 transition-colors" size={28} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl font-bold text-zinc-100 truncate">{name}</h3>
              {isMe && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-red-400 bg-red-950/50 px-2 py-0.5 rounded-lg shrink-0">
                  Вы
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-zinc-500 text-sm mt-0.5">
              <Mail size={14} className="shrink-0" />
              <span className="truncate">{email}</span>
            </div>
          </div>
        </div>
        <div
          className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
            pos ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
          }`}
        >
          {pos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {profitability > 0 ? '+' : ''}
          {profitability.toFixed(2)}%
        </div>
      </div>

      <div className="space-y-4 relative z-10">
        <div className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-wider font-bold">
            <Wallet size={14} className="text-red-500 shrink-0" />
            Капитал
          </div>
          <div className="text-lg font-mono font-bold text-zinc-100 tabular-nums">
            {capital.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-zinc-900/50 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2 text-zinc-400 text-[10px] uppercase tracking-wider font-bold mb-1">
              <Briefcase size={12} className="text-red-500 shrink-0" />
              Тип
            </div>
            <div className="text-sm font-bold text-zinc-200 leading-tight">{portfolioType}</div>
          </div>
          <div className="p-3 bg-zinc-900/50 rounded-xl border border-zinc-800 min-h-[4.5rem]">
            <div className="flex items-center gap-2 text-zinc-400 text-[10px] uppercase tracking-wider font-bold mb-1">
              <PieChart size={12} className="text-red-500 shrink-0" />
              Сектора
            </div>
            <SectorsExpandable sectors={sectors} />
          </div>
        </div>

        <details
          className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 ${holdings.length === 0 ? 'opacity-80' : ''}`}
        >
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-zinc-400 text-[10px] uppercase tracking-wider font-bold [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <Layers size={12} className="text-red-500 shrink-0" />
              Акции в портфеле
            </span>
            <span className="text-zinc-500 normal-case font-mono tabular-nums">{holdings.length}</span>
          </summary>
          {holdings.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">Пока нет открытых позиций.</p>
          ) : (
            <ul className="mt-2 max-h-36 overflow-y-auto custom-scrollbar space-y-1.5 text-sm text-zinc-300 pr-1">
              {holdings.map(h => (
                <li key={h.secid} className="flex justify-between gap-2 min-w-0">
                  <span className="truncate">{h.shortName}</span>
                  <span className="text-zinc-500 font-mono text-xs shrink-0">{h.secid}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>

      {footer != null && <div className="mt-4 relative z-10">{footer}</div>}
    </div>
  );
}

function PortfolioRows({
  portfolios,
  emptyLabel
}: {
  portfolios: ClassroomPortfolioSummary[];
  emptyLabel: string;
}) {
  if (portfolios.length === 0) {
    return (
      <tr>
        <td colSpan={5} className="py-4 px-3 text-zinc-500 text-sm">
          {emptyLabel}
        </td>
      </tr>
    );
  }
  return (
    <>
      {portfolios.map(p => (
        <tr key={p.portfolio_id} className="border-b border-zinc-800/80">
          <td className="py-2.5 px-3 text-zinc-200">{displayPortfolioTableTitle(p.title)}</td>
          <td className="py-2.5 px-3 text-right font-mono text-zinc-100">{fmtMoney(p.total_value)}</td>
          <td className="py-2.5 px-3 text-right font-mono text-zinc-400">{fmtMoney(p.cash_balance)}</td>
          <td className={`py-2.5 px-3 text-right font-mono ${p.total_return_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmtPct(p.total_return_pct)}
          </td>
          <td className="py-2.5 px-3 text-right font-mono text-zinc-300">
            {p.sharpe_ratio == null || Number.isNaN(p.sharpe_ratio) ? '—' : p.sharpe_ratio.toFixed(2)}
          </td>
        </tr>
      ))}
    </>
  );
}

function TeacherDashboard({
  teacherCode,
  studentsCount,
  data,
  loading,
  onRefresh,
  copyHint,
  onCopy,
  sectorsByStudentId,
  holdingsByStudentId
}: {
  teacherCode: string | null | undefined;
  studentsCount: number;
  data: ClassroomStudentsResponse | null;
  loading: boolean;
  onRefresh: () => void;
  copyHint: string | null;
  onCopy: () => void;
  sectorsByStudentId: Record<number, string[]>;
  holdingsByStudentId: Record<number, ClassroomHoldingLine[]>;
}) {
  return (
    <div className="w-full space-y-10">
      <div className="w-full max-w-[680px] mx-auto bg-[#262629]/95 backdrop-blur-xl border-2 border-[#d40000] rounded-[32px] p-6 md:p-8 shadow-2xl shadow-red-900/20">
        <h2 className="text-4xl font-semibold mb-2 text-center tracking-tight text-zinc-100">Код класса</h2>
        <p className="text-center text-zinc-500 text-sm mb-6 leading-snug">
          Раздайте код участникам класса, чтобы видеть их прогресс и результаты
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {Array.from({ length: TEACHER_CODE_LEN }, (_, i) => {
            const ch = teacherCode?.[i];
            return (
              <div
                key={i}
                className="w-11 h-11 sm:w-14 sm:h-14 md:w-[56px] md:h-[56px] rounded-2xl bg-zinc-300 text-zinc-700 text-lg sm:text-xl md:text-2xl font-bold flex items-center justify-center font-mono"
              >
                {ch ?? ''}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap justify-center gap-3 mt-8">
          <button
            type="button"
            onClick={onCopy}
            disabled={!teacherCode}
            className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl bg-[#b40000] hover:bg-[#d00000] disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-lg transition-colors shadow-lg shadow-red-900/40 w-full max-w-md"
          >
            <Copy className="w-4 h-4" />
            Скопировать код
          </button>
        </div>
        {copyHint && <p className="text-sm text-zinc-400 mt-4 text-center">{copyHint}</p>}
        <p className="text-sm text-zinc-500 mt-6 text-center">
          Учеников в классе: <span className="text-zinc-200 font-semibold">{studentsCount}</span>
        </p>
      </div>

      <div className="w-full max-w-7xl mx-auto p-0">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-4xl font-black tracking-tight uppercase text-zinc-100">Мои ученики</h2>
              {loading && <Loader2 className="w-7 h-7 animate-spin text-zinc-500" />}
            </div>
            <p className="text-zinc-400 text-lg mt-1">Сводка портфелей и детали по каждому ученику</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 md:gap-6">
            <div className="bg-[#2a2a2a] px-6 py-2 rounded-xl border border-zinc-700/50">
              <span className="text-zinc-300 font-bold">В классе: {studentsCount}</span>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm disabled:opacity-50 border border-zinc-700/50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </button>
          </div>
        </div>

        <div className="bg-[#1c1c1e] rounded-[40px] p-6 md:p-8 border border-zinc-800/50 min-h-[400px]">
          {loading && !data && (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-zinc-400">
              <Loader2 className="w-10 h-10 animate-spin text-red-500" />
              <span className="text-sm">Загружаем список учеников…</span>
            </div>
          )}

          {!loading && data && data.students.length === 0 && (
            <p className="text-zinc-500 text-sm py-16 text-center px-4">Пока нет учеников в классе.</p>
          )}

          {data && data.students.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
              {data.students.map((row: StudentWithPortfolios) => {
                const agg = aggregatePortfolios(row.portfolios, sectorsByStudentId[row.student.id]);
                return (
                  <ClassmateCard
                    key={row.student.id}
                    name={row.student.name}
                    email={row.student.email}
                    capital={agg.capital}
                    profitability={agg.profitability}
                    portfolioType={agg.portfolioType}
                    sectors={agg.sectors}
                    holdings={holdingsByStudentId[row.student.id] ?? []}
                    footer={
                      <details className="rounded-xl border border-zinc-700/50 bg-zinc-950/50 open:pb-2">
                        <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 flex items-center justify-between gap-2">
                          <span>Портфели</span>
                          <Users className="w-4 h-4 opacity-60" />
                        </summary>
                        <div className="overflow-x-auto px-2 pb-2">
                          <table className="w-full text-sm text-left min-w-[520px]">
                            <thead>
                              <tr className="text-zinc-500 text-[10px] uppercase border-b border-zinc-800">
                                <th className="py-2 px-2 font-medium">Портфель</th>
                                <th className="py-2 px-2 font-medium text-right">Стоимость</th>
                                <th className="py-2 px-2 font-medium text-right">Кэш</th>
                                <th className="py-2 px-2 font-medium text-right">Доходность</th>
                                <th className="py-2 px-2 font-medium text-right">Шарп</th>
                              </tr>
                            </thead>
                            <tbody>
                              <PortfolioRows
                                portfolios={row.portfolios}
                                emptyLabel="Нет портфелей — ученик ещё не торгует."
                              />
                            </tbody>
                          </table>
                        </div>
                      </details>
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StudentJoinForm({
  joinCells,
  setJoinCells,
  submitting,
  error,
  onSubmit,
  inputsRef
}: {
  joinCells: string[];
  setJoinCells: Dispatch<SetStateAction<string[]>>;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: FormEvent) => void;
  inputsRef: MutableRefObject<Array<HTMLInputElement | null>>;
}) {
  const onChangeSymbol = (index: number, value: string) => {
    const symbol = value.slice(-1).toUpperCase();
    if (symbol && !/^[A-Z0-9]$/.test(symbol)) return;

    setJoinCells(prev => {
      const next = [...prev];
      next[index] = symbol;
      return next;
    });

    if (symbol && index < TEACHER_CODE_LEN - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !joinCells[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const full = joinCells.every(c => c.length === 1);

  return (
    <div className="w-full max-w-[680px] mx-auto bg-[#262629]/95 backdrop-blur-xl border-2 border-[#d40000] rounded-[32px] p-6 md:p-8 shadow-2xl shadow-red-900/20">
      <h2 className="text-4xl font-semibold mb-2 text-center tracking-tight text-zinc-100">Код класса</h2>
      <p className="text-center text-zinc-500 text-sm mb-8 leading-snug min-h-[48px] max-w-[560px] mx-auto">
        Введите пригласительный код от учителя и сравнивайте свои результаты с одногруппниками
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-700/60 bg-red-950/40 text-red-200 px-4 py-3 text-sm">{error}</div>
      )}

      <form onSubmit={onSubmit}>
        <div className="flex justify-center gap-2 sm:gap-3 flex-wrap mb-8">
          {joinCells.map((value, index) => (
            <input
              key={index}
              ref={el => {
                inputsRef.current[index] = el;
              }}
              value={value}
              onChange={e => onChangeSymbol(index, e.target.value)}
              onKeyDown={e => onKeyDown(index, e)}
              maxLength={1}
              disabled={submitting}
              className="w-11 h-11 sm:w-14 sm:h-14 md:w-[56px] md:h-[56px] rounded-2xl bg-zinc-300 text-zinc-700 text-lg sm:text-xl text-center font-bold outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60"
              autoComplete="off"
              aria-label={`Символ ${index + 1}`}
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={submitting || !full}
          className="w-full bg-[#b40000] hover:bg-[#d00000] disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold py-4 rounded-2xl text-lg transition-colors shadow-lg shadow-red-900/40"
        >
          {submitting ? 'Подождите…' : 'Присоединиться'}
        </button>
      </form>
    </div>
  );
}

function StudentCompareView({
  data,
  loading,
  onRefresh,
  classmatesCount,
  teacherName,
  sectorsByStudentId,
  holdingsByStudentId
}: {
  data: ClassroomCompareResponse | null;
  loading: boolean;
  onRefresh: () => void;
  classmatesCount: number;
  teacherName?: string | null;
  sectorsByStudentId: Record<number, string[]>;
  holdingsByStudentId: Record<number, ClassroomHoldingLine[]>;
}) {
  const displayTeacher = data?.teacher?.name ?? teacherName ?? null;

  return (
    <div className="w-full max-w-7xl mx-auto p-0">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="text-4xl font-black tracking-tight mb-2 uppercase text-zinc-100">Сообщество</h2>
          <p className="text-zinc-400 text-lg">Сравнение портфелей с группой</p>
          {displayTeacher && (
            <p className="text-sm text-zinc-500 mt-2">
              Учитель: <span className="text-zinc-300 font-medium">{displayTeacher}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 md:gap-6">
          <div className="bg-[#2a2a2a] px-6 py-2 rounded-xl border border-zinc-700/50">
            <span className="text-zinc-300 font-bold">Класс</span>
          </div>
          <div className="text-zinc-400 font-medium">
            Одноклассников:{' '}
            <span className="text-zinc-100 font-bold tabular-nums">{classmatesCount}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm disabled:opacity-50 border border-zinc-700/50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>
      </div>

      <div className="bg-[#1c1c1e] rounded-[40px] p-6 md:p-8 border border-zinc-800/50 min-h-[600px]">
        {loading && !data && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-zinc-400">
            <Loader2 className="w-10 h-10 animate-spin text-red-500" />
            <span className="text-sm">Загружаем данные…</span>
          </div>
        )}

        {!loading && data && data.students.length === 0 && (
          <p className="text-zinc-500 text-center py-20 px-4">Нет данных для сравнения.</p>
        )}

        {data && data.students.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {data.students.map((row: StudentWithPortfolios) => {
              const isMe = row.student.id === data.current_student_id;
              const agg = aggregatePortfolios(row.portfolios, sectorsByStudentId[row.student.id]);
              return (
                <ClassmateCard
                  key={row.student.id}
                  name={row.student.name}
                  email={row.student.email}
                  capital={agg.capital}
                  profitability={agg.profitability}
                  portfolioType={agg.portfolioType}
                  sectors={agg.sectors}
                  holdings={holdingsByStudentId[row.student.id] ?? []}
                  isMe={isMe}
                  footer={
                    <details className="rounded-xl border border-zinc-700/50 bg-zinc-950/50 open:pb-2">
                        <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 flex items-center justify-between gap-2">
                          <span>Портфели</span>
                          <PieChart className="w-4 h-4 opacity-60" />
                        </summary>
                        <div className="overflow-x-auto px-2 pb-2">
                          <table className="w-full text-sm text-left min-w-[520px]">
                            <thead>
                              <tr className="text-zinc-500 text-[10px] uppercase border-b border-zinc-800">
                                <th className="py-2 px-2 font-medium">Портфель</th>
                                <th className="py-2 px-2 font-medium text-right">Стоимость</th>
                                <th className="py-2 px-2 font-medium text-right">Кэш</th>
                                <th className="py-2 px-2 font-medium text-right">Доходность</th>
                                <th className="py-2 px-2 font-medium text-right">Шарп</th>
                              </tr>
                            </thead>
                            <tbody>
                              <PortfolioRows
                                portfolios={row.portfolios}
                                emptyLabel="Портфель пуст — начните с раздела «Маркет»."
                              />
                            </tbody>
                          </table>
                        </div>
                      </details>
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function Community({ stocks }: { stocks: Stock[] }) {
  const { user, classroomSummary, joinClassroomByCode, refreshSession } = useAuth();
  const [teacherData, setTeacherData] = useState<ClassroomStudentsResponse | null>(null);
  const [compareData, setCompareData] = useState<ClassroomCompareResponse | null>(null);
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [joinCells, setJoinCells] = useState<string[]>(() => Array(TEACHER_CODE_LEN).fill(''));
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [sectorsByStudentId, setSectorsByStudentId] = useState<Record<number, string[]>>({});
  const [holdingsByStudentId, setHoldingsByStudentId] = useState<Record<number, ClassroomHoldingLine[]>>({});
  const joinInputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const isTeacher = user?.role?.toLowerCase() === 'teacher';
  const isStudent = user?.role?.toLowerCase() === 'student';
  const studentHasTeacher = user != null && user.teacher_id != null;

  const joinCodeStr = joinCells.join('');

  const loadTeacherStudents = useCallback(async () => {
    if (!isTeacher) return;
    setTeacherLoading(true);
    try {
      const d = await fetchClassroomStudents();
      setTeacherData(d);
    } catch {
      setTeacherData(null);
    } finally {
      setTeacherLoading(false);
    }
  }, [isTeacher]);

  const loadCompare = useCallback(async () => {
    if (!isStudent || !studentHasTeacher) return;
    setCompareLoading(true);
    try {
      const d = await fetchClassroomCompare();
      setCompareData(d);
    } catch {
      setCompareData(null);
    } finally {
      setCompareLoading(false);
    }
  }, [isStudent, studentHasTeacher]);

  useEffect(() => {
    void loadTeacherStudents();
  }, [loadTeacherStudents, user?.id]);

  useEffect(() => {
    void loadCompare();
  }, [loadCompare, user?.id]);

  useEffect(() => {
    const students =
      isTeacher && teacherData?.students
        ? teacherData.students
        : isStudent && studentHasTeacher && compareData?.students
          ? compareData.students
          : null;
    if (!students?.length) {
      setSectorsByStudentId({});
      setHoldingsByStudentId({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const map = await collectClassroomPortfolioMeta(students, stocks);
        if (!cancelled) {
          setSectorsByStudentId(map.sectorsByStudentId);
          setHoldingsByStudentId(map.holdingsByStudentId);
        }
      } catch {
        if (!cancelled) {
          setSectorsByStudentId({});
          setHoldingsByStudentId({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTeacher, isStudent, studentHasTeacher, teacherData, compareData, stocks]);

  const handleCopyCode = async () => {
    const code = user?.teacher_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopyHint('Код скопирован');
      window.setTimeout(() => setCopyHint(null), 2000);
    } catch {
      setCopyHint('Не удалось скопировать');
      window.setTimeout(() => setCopyHint(null), 2000);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    if (joinCodeStr.length !== TEACHER_CODE_LEN) {
      setJoinError('Введите полный код учителя.');
      return;
    }
    setJoinSubmitting(true);
    try {
      await joinClassroomByCode(joinCodeStr);
      setJoinCells(Array(TEACHER_CODE_LEN).fill(''));
      await refreshSession();
    } catch (err) {
      setJoinError(messageForJoinFailure(err));
    } finally {
      setJoinSubmitting(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-10 relative min-h-[calc(100vh-96px)]">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[35%] w-[920px] h-[620px] bg-red-700/10 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10">
        {!(isStudent && studentHasTeacher) && (
          <>
            <div className="mb-8 text-center md:text-left">
              <h1 className="text-3xl md:text-4xl font-semibold mb-2 tracking-tight text-zinc-100">Сообщество</h1>
              <p className="text-zinc-500 text-sm md:text-base max-w-2xl mx-auto md:mx-0">
                {isTeacher && 'Код класса и прогресс учеников.'}
                {isStudent && !studentHasTeacher && 'Присоединитесь к классу по коду учителя.'}
              </p>
            </div>

            {classroomSummary && (
              <div className="flex flex-wrap justify-center md:justify-start gap-4 text-sm text-zinc-500 mb-6">
                {isTeacher && (
                  <span>
                    Учеников: <strong className="text-zinc-300">{classroomSummary.students_count}</strong>
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {isTeacher && (
          <TeacherDashboard
            teacherCode={user.teacher_code}
            studentsCount={classroomSummary?.students_count ?? 0}
            data={teacherData}
            loading={teacherLoading}
            onRefresh={() => void loadTeacherStudents()}
            copyHint={copyHint}
            onCopy={handleCopyCode}
            sectorsByStudentId={sectorsByStudentId}
            holdingsByStudentId={holdingsByStudentId}
          />
        )}

        {isStudent && !studentHasTeacher && (
          <StudentJoinForm
            joinCells={joinCells}
            setJoinCells={setJoinCells}
            submitting={joinSubmitting}
            error={joinError}
            onSubmit={handleJoin}
            inputsRef={joinInputsRef}
          />
        )}

        {isStudent && studentHasTeacher && (
          <StudentCompareView
            data={compareData}
            loading={compareLoading}
            onRefresh={() => void loadCompare()}
            classmatesCount={classroomSummary?.classmates_count ?? 0}
            teacherName={user.teacher_name}
            sectorsByStudentId={sectorsByStudentId}
            holdingsByStudentId={holdingsByStudentId}
          />
        )}

        {!isTeacher && !isStudent && (
          <p className="text-zinc-500 text-center py-12">Роль аккаунта не поддерживается для класса.</p>
        )}
      </div>
    </div>
  );
}
