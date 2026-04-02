import { dividendProfileRu } from './dividendProfileRu';

const normalizeLiquidityBucket = (value: string): 'low' | 'medium' | 'high' | 'none' | 'unknown' => {
  const v = value.toLowerCase();
  if (!v) return 'unknown';
  if (v.includes('нет') || v.includes('none')) return 'none';
  if (v.includes('низ')) return 'low';
  if (v.includes('сред')) return 'medium';
  if (v.includes('выс')) return 'high';
  return 'unknown';
};

const normalizeDividendBucket = (value: string): 'low' | 'medium' | 'high' | 'none' | 'growth' | 'unknown' => {
  const v = value.toLowerCase();
  if (!v) return 'unknown';
  if (v.includes('нет') || v === 'no' || v.includes('не выпла')) return 'none';
  if (v.includes('рост') || v.includes('ориентирован') || v.includes('growth')) return 'growth';
  if (v.includes('низ')) return 'low';
  if (v.includes('сред')) return 'medium';
  if (v.includes('высок')) return 'high';
  return 'unknown';
};

/** Одна строка: что такое ликвидность в карточке. */
export const LIQUIDITY_WHAT = 'Насколько легко купить или продать бумагу по цене, близкой к рынку, без сильного проскальзывания на объёме.';

/** Одна строка: что такое блок про дивиденды. */
export const DIVIDENDS_WHAT = 'Оценка ожидаемых выплат части прибыли акционерам по дивидендному профилю в данных приложения.';

export function liquidityValueInterpretation(liquidityLabel: string): string {
  const L = liquidityLabel.trim();
  if (!L || L === 'Не указано') {
    return 'Для этой бумаги значение в профиле не задано.';
  }
  const b = normalizeLiquidityBucket(L);
  if (b === 'low') {
    return 'Здесь: низкая ликвидность — крупные заявки могут заметнее двигать цену; учитывайте объём и спред.';
  }
  if (b === 'medium') {
    return 'Здесь: средняя ликвидность — типичная оборачиваемость, сделки обычно проходят без крайних задержек.';
  }
  if (b === 'high') {
    return 'Здесь: высокая ликвидность — много сделок, проще войти и выйти по цене, близкой к рыночной.';
  }
  return 'Значение взято из профиля эмитента; трактуйте как ориентир, не как гарантию.';
}

export function dividendValueInterpretation(dividendsField: string): string {
  const display = dividendProfileRu(dividendsField) || dividendsField.trim();
  if (!display || display === 'Не указано') {
    return 'Для этой бумаги значение в профиле не задано.';
  }
  const b = normalizeDividendBucket(display);
  if (b === 'none') {
    return 'Здесь: выплаты не предполагаются или считаются несущественными в рамках этого профиля.';
  }
  if (b === 'low') {
    return 'Здесь: низкий дивидендный профиль — относительно скромная доля прибыли уходит на выплаты.';
  }
  if (b === 'medium') {
    return 'Здесь: умеренный профиль — сбалансированные ожидания по выплатам относительно прибыли.';
  }
  if (b === 'high') {
    return 'Здесь: высокий профиль — в оценку заложена существенная доля прибыли на дивиденды.';
  }
  if (b === 'growth') {
    return 'Здесь: акцент на рост бизнеса и капитализации; крупные выплаты не в приоритете.';
  }
  if (display.toLowerCase().includes('стабильн')) {
    return 'Здесь: в профиле заложены относительно предсказуемые и устойчивые выплаты.';
  }
  if (display.toLowerCase().includes('растущ')) {
    return 'Здесь: ожидается рост или увеличение выплат при сохранении политики.';
  }
  return `Здесь: «${display}» — расшифровка из профиля; используйте как ориентир по данным приложения.`;
}
