import { X } from 'lucide-react';
import type { ReactNode } from 'react';

type IntroModalProps = {
  open: boolean;
  title: string;
  onDismiss: () => void;
  children: ReactNode;
};

export function IntroModal({ open, title, onDismiss, children }: IntroModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-[2px]"
        aria-label="Закрыть"
        onClick={onDismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-modal-title"
        className="relative w-full max-w-[min(100%,420px)] rounded-2xl border border-zinc-700/80 bg-[#1c1c1e] p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          aria-label="Закрыть"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 id="intro-modal-title" className="pr-10 text-xl font-bold tracking-tight text-zinc-50">
          {title}
        </h2>
        <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-zinc-300">{children}</div>
        <p className="mt-5 text-xs leading-snug text-zinc-500">
          Все расчёты носят информационный характер и не являются индивидуальной инвестиционной рекомендацией.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 w-full rounded-xl bg-[#cc0000] py-3.5 text-base font-bold text-white transition-colors hover:bg-[#b00000]"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
