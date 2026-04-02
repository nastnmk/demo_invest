import { useState, type FormEvent } from 'react';
import type { UserRole } from '../api/authApi';
import { ApiError } from '../api/http';
import { useAuth } from '../auth/AuthContext';

export function Login() {
  const { login, register, authView, setAuthView } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (authView === 'register') {
        await register(name.trim(), email.trim(), password, role);
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Ошибка запроса');
      } else {
        setError('Не удалось выполнить вход. Проверьте сеть.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#18181b] text-zinc-50 relative overflow-hidden px-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[42%] w-[980px] h-[760px] bg-red-700/20 rounded-full blur-[160px]" />
        <div className="absolute left-[8%] bottom-[8%] w-[420px] h-[280px] bg-red-700/15 rounded-full blur-[120px]" />
      </div>

      <div className="z-10 flex flex-col items-center mb-8">
        <h1 className="text-4xl md:text-7xl font-black tracking-tight text-center uppercase">СИМУЛЯТОР ИНВЕСТИЦИЙ</h1>
        <p className="text-zinc-300 mt-3 text-center text-lg md:text-xl max-w-2xl font-medium">
          Это твой надежный помощник в обучении инвестициям!
        </p>
      </div>

      <div className="w-full max-w-[660px] bg-[#262629]/90 backdrop-blur-xl p-8 md:p-10 rounded-[34px] border-2 border-[#d40000] shadow-2xl z-10">
        <h2 className="text-4xl font-semibold mb-2 text-center tracking-tight">
          {authView === 'register' ? 'Регистрация' : 'Вход'}
        </h2>
        <p className="text-center text-zinc-500 text-sm mb-6">
          {authView === 'register' ? 'Создайте аккаунт для работы с портфелем.' : 'Войдите по email и паролю.'}
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-red-700/60 bg-red-950/40 text-red-200 px-4 py-3 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {authView === 'register' && (
            <>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Имя</label>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="Ваше имя"
                  className="w-full bg-zinc-300 border border-zinc-400 rounded-2xl px-5 py-4 text-zinc-800 placeholder-zinc-500 text-base focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/40 transition-colors"
                />
              </div>
              <div>
                <span className="block text-sm text-zinc-400 mb-2">Выберите роль</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('student')}
                    className={`rounded-2xl px-4 py-3.5 text-base font-semibold transition-colors border-2 ${
                      role === 'student'
                        ? 'bg-red-900/50 border-red-500 text-white'
                        : 'bg-zinc-300 border-zinc-400 text-zinc-700 hover:border-zinc-300'
                    }`}
                  >
                    Ученик
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('teacher')}
                    className={`rounded-2xl px-4 py-3.5 text-base font-semibold transition-colors border-2 ${
                      role === 'teacher'
                        ? 'bg-red-900/50 border-red-500 text-white'
                        : 'bg-zinc-300 border-zinc-400 text-zinc-700 hover:border-zinc-300'
                    }`}
                  >
                    Учитель
                  </button>
                </div>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="Ваш email"
              className="w-full bg-zinc-300 border border-zinc-400 rounded-2xl px-5 py-4 text-zinc-800 placeholder-zinc-500 text-base focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/40 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Пароль</label>
            <input
              type="password"
              autoComplete={authView === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={authView === 'register' ? 8 : 6}
              placeholder="Пароль"
              className="w-full bg-zinc-300 border border-zinc-400 rounded-2xl px-5 py-4 text-zinc-800 placeholder-zinc-500 text-base focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/40 transition-colors"
            />
          </div>

          <div className="pt-1 text-center text-base text-zinc-400">
            {authView === 'register' ? (
              <>
                Уже есть аккаунт?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthView('login');
                    setError(null);
                    setRole('student');
                  }}
                  className="text-zinc-200 hover:text-white font-medium transition-colors"
                >
                  Войти
                </button>
              </>
            ) : (
              <>
                Нет аккаунта?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setAuthView('register');
                    setError(null);
                    setRole('student');
                  }}
                  className="text-zinc-200 hover:text-white font-medium transition-colors"
                >
                  Зарегистрироваться
                </button>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#b40000] hover:bg-[#d00000] disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold py-4 rounded-2xl mt-2 text-lg transition-colors shadow-lg shadow-red-900/40 uppercase"
          >
            {submitting ? 'Подождите…' : authView === 'register' ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </form>
      </div>

      <img
        src="/login-mascot.png"
        alt=""
        className="hidden lg:block absolute right-[-100px] bottom-[-60px] w-[520px] xl:w-[640px] pointer-events-none select-none opacity-90"
      />
    </div>
  );
}
