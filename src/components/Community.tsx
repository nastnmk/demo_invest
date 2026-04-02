import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

type CommunityMode = 'student' | 'teacher';

export function Community() {
  const [mode, setMode] = useState<CommunityMode>('student');
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const teacherCode = useMemo(() => ['1', '2', '3', '4', '5', '6'], []);

  const onChangeSymbol = (index: number, value: string) => {
    const symbol = value.slice(-1).toUpperCase();
    if (!/^[A-Z0-9А-ЯЁ]?$/i.test(symbol)) return;

    setCode(prev => {
      const next = [...prev];
      next[index] = symbol;
      return next;
    });

    if (symbol && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 pt-8 pb-10 relative min-h-[calc(100vh-96px)]">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[35%] w-[920px] h-[620px] bg-red-700/10 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 w-full max-w-[680px] mx-auto bg-[#262629]/95 border-2 border-[#d40000] rounded-[32px] p-6 md:p-8">
        <div className="flex justify-center mb-5">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-1 flex gap-1">
            <button
              onClick={() => setMode('student')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === 'student' ? 'bg-[#b40000] text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
            >
              Ученик
            </button>
            <button
              onClick={() => setMode('teacher')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === 'teacher' ? 'bg-[#b40000] text-white' : 'text-zinc-300 hover:bg-zinc-800'}`}
            >
              Учитель
            </button>
          </div>
        </div>

        <h2 className="text-4xl font-semibold mb-2 text-center tracking-tight">Код класса</h2>
        <p className="text-center text-zinc-500 text-sm mb-6 leading-snug max-w-[560px] mx-auto min-h-[48px]">
          {mode === 'student'
            ? 'Введите пригласительный код от учителя и сравнивайте свои результаты с одногруппниками'
            : 'Раздайте код участникам класса, чтобы видеть их прогресс и результаты'}
        </p>

        <div className="flex justify-center gap-3 mt-6 mb-8">
          {(mode === 'student' ? code : teacherCode).map((value, index) =>
            mode === 'student' ? (
              <input
                key={index}
                ref={el => {
                  inputsRef.current[index] = el;
                }}
                value={value}
                onChange={e => onChangeSymbol(index, e.target.value)}
                onKeyDown={e => onKeyDown(index, e)}
                maxLength={1}
                className="w-14 h-14 md:w-[72px] md:h-[72px] rounded-2xl bg-zinc-300 text-zinc-700 text-xl md:text-2xl text-center font-bold outline-none focus:ring-2 focus:ring-red-500"
              />
            ) : (
              <div
                key={index}
                className="w-14 h-14 md:w-[72px] md:h-[72px] rounded-2xl bg-zinc-300 text-zinc-600 text-xl md:text-2xl font-bold flex items-center justify-center"
              >
                {value}
              </div>
            )
          )}
        </div>

        <button
          type="button"
          className="w-full bg-[#b40000] hover:bg-[#d00000] text-white font-extrabold py-4 rounded-2xl mt-2 text-lg transition-colors shadow-lg shadow-red-900/40"
        >
          {mode === 'student' ? 'Присоединиться' : 'Скопировать код'}
        </button>
      </div>

      <img
        src="/moex-mascot.png"
        alt="Маскот инвест-симулятора"
        className="hidden xl:block absolute right-[-130px] bottom-[-60px] w-[560px] pointer-events-none select-none"
      />
    </div>
  );
}
