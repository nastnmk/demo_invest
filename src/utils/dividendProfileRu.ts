/**
 * Профиль дивидендов с бэкенда часто приходит на английском или в виде enum — показываем по-русски.
 */

const CYR = /[а-яё]/i;

/** Точные совпадения после нормализации (нижний регистр, без лишних пробелов). */
const EXACT_RU: Record<string, string> = {
  high: 'Высокие',
  medium: 'Средние',
  low: 'Низкие',
  none: 'Нет',
  no: 'Нет',
  yes: 'Есть',
  'n/a': 'Нет',
  na: 'Нет',
  'high yield': 'Высокие',
  'medium yield': 'Средние',
  'low yield': 'Низкие',
  'high dividends': 'Высокие',
  'medium dividends': 'Средние',
  'low dividends': 'Низкие',
  'no dividends': 'Нет',
  'non dividend': 'Нет',
  'non-dividend': 'Нет',
  'does not pay': 'Нет',
  'does not pay dividends': 'Нет',
  'pays dividends': 'Выплачивает',
  stable: 'Стабильные',
  growing: 'Растущие',
  attractive: 'Привлекательные',
  generous: 'Высокие',
  limited: 'Низкие',
  moderate: 'Средние',
  average: 'Средние',
  unspecified: 'Не указано',
  unknown: 'Не указано'
};

function normKey(s: string): string {
  return s
    .trim()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function enWord(raw: string, w: string): boolean {
  return new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(raw);
}

/**
 * Переводит строку профиля дивидендов для UI.
 */
export function dividendProfileRu(value?: string | null): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';

  const key = normKey(raw);
  if (EXACT_RU[key]) return EXACT_RU[key];

  const v = key;
  const hasRu = CYR.test(raw);

  if (
    v === '—' ||
    v === '-' ||
    v === 'n/a' ||
    v === 'na' ||
    v === 'none' ||
    v === 'no' ||
    v === 'нет' ||
    raw === 'Нет' ||
    v.includes('no dividend') ||
    v.includes('non-dividend') ||
    v.includes('non dividend') ||
    v.includes('zero dividend') ||
    v.includes('does not pay') ||
    v.includes('без дивиденд') ||
    v.includes('не выплачива')
  ) {
    return 'Нет';
  }

  if (
    v.includes('высок') ||
    enWord(raw, 'high') ||
    v.includes('generous') ||
    v.includes('aristocrat') ||
    v.includes('attractive') ||
    (v.includes('yield') && (v.includes('high') || enWord(raw, 'high')))
  ) {
    return 'Высокие';
  }

  if (
    v.includes('средн') ||
    enWord(raw, 'medium') ||
    v.includes('moderate') ||
    v.includes('average') ||
    enWord(raw, 'stable') ||
    v.includes('стабильн')
  ) {
    return 'Средние';
  }

  if (v.includes('низк') || enWord(raw, 'low') || v.includes('скромн') || v.includes('limited')) {
    return 'Низкие';
  }

  if (v.includes('рост') || v.includes('growth')) return 'Ориентированы на рост';
  if (v.includes('dividend') && v.includes('yield')) return 'Доходные';

  if (hasRu) return raw;

  if (v.includes('unspecified') || v.includes('unknown')) return 'Не указано';

  // Последняя попытка: заменить типичные англ. слова в короткой фразе
  let t = raw;
  t = t.replace(/\bhigh\b/gi, 'высокие');
  t = t.replace(/\bmedium\b/gi, 'средние');
  t = t.replace(/\blow\b/gi, 'низкие');
  t = t.replace(/\bdividends?\b/gi, 'дивиденды');
  t = t.replace(/\byield\b/gi, 'доходность');
  if (CYR.test(t)) {
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  return raw;
}
