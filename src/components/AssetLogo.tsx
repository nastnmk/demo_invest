import { useState } from 'react';

type AssetLogoProps = {
  logoUrl?: string | null;
  secid: string;
  shortName: string;
  size?: 'sm' | 'md';
};

const sizes = {
  sm: { box: 'w-10 h-10', text: 'text-xs', imgPad: 'p-1' },
  md: { box: 'w-16 h-16', text: 'text-2xl', imgPad: 'p-2' }
};

function monogram(secid: string, shortName: string): string {
  const name = shortName.trim();
  if (name.length >= 2) return name.slice(0, 2).toUpperCase();
  if (name.length === 1) return name.toUpperCase();
  const t = secid.trim().toUpperCase();
  if (t.length >= 2) return t.slice(0, 2);
  return t.slice(0, 1) || '?';
}

export function AssetLogo({ logoUrl, secid, shortName, size = 'md' }: AssetLogoProps) {
  const [failed, setFailed] = useState(false);
  const dim = sizes[size];
  const roundClass = secid === 'MOEX' && size === 'md' ? 'rounded-xl' : 'rounded-full';
  const trimmed = typeof logoUrl === 'string' ? logoUrl.trim() : '';
  const showImg = trimmed.length > 0 && !failed;

  if (showImg) {
    return (
      <div className={`${dim.box} bg-white flex items-center justify-center shrink-0 ${dim.imgPad} ${roundClass}`}>
        <img
          src={trimmed}
          alt=""
          className="w-full h-full object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${dim.box} bg-zinc-800 text-zinc-300 ${roundClass} flex items-center justify-center font-bold shrink-0 border border-zinc-700 ${dim.text}`}
      aria-hidden
    >
      {monogram(secid, shortName)}
    </div>
  );
}
