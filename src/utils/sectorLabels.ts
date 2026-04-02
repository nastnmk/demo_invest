/**
 * Подписи секторов для UI: API часто отдаёт английские названия (GICS/внутренние коды).
 */
const SECTOR_EN_TO_RU: Record<string, string> = {
  finance: 'Финансы',
  financial: 'Финансы',
  financials: 'Финансы',
  'financial services': 'Финансы',
  'financial sector': 'Финансы',
  banking: 'Банки',
  banks: 'Банки',
  insurance: 'Страхование',

  transport: 'Транспорт',
  transportation: 'Транспорт',
  logistics: 'Логистика',

  energy: 'Энергетика',
  'energy sector': 'Энергетика',
  'oil & gas': 'Нефть и газ',
  'oil and gas': 'Нефть и газ',
  oil: 'Нефть и газ',
  gas: 'Газ',
  utilities: 'Электроэнергетика и ЖКХ',
  'electric utilities': 'Электроэнергетика',
  'power utilities': 'Электроэнергетика',

  it: 'IT',
  technology: 'Технологии',
  technologies: 'Технологии',
  tech: 'Технологии',
  'information technology': 'Информационные технологии',
  'info tech': 'Информационные технологии',
  software: 'Программное обеспечение',
  telecommunications: 'Телекоммуникации',
  telecom: 'Телекоммуникации',
  telecoms: 'Телекоммуникации',
  'telecom services': 'Телекоммуникации',
  'communication services': 'Связь и медиа',
  communications: 'Связь и медиа',

  retail: 'Ритейл',
  consumer: 'Потребительский сектор',
  'consumer discretionary': 'Потребительский (необязательные траты)',
  'consumer cyclical': 'Потребительский (циклический)',
  'consumer defensive': 'Потребительский (защитный)',
  'consumer staples': 'Потребительский (товары первой необходимости)',

  healthcare: 'Здравоохранение',
  'health care': 'Здравоохранение',
  health: 'Здравоохранение',
  pharmaceuticals: 'Фармацевтика',
  pharma: 'Фармацевтика',

  materials: 'Сырьё и материалы',
  'basic materials': 'Сырьё и материалы',
  metals: 'Металлургия',
  steel: 'Металлургия',
  mining: 'Добыча',
  chemicals: 'Химия',

  industrials: 'Промышленность',
  industrial: 'Промышленность',
  machinery: 'Машиностроение',

  'real estate': 'Недвижимость',
  realestate: 'Недвижимость',

  agriculture: 'Сельское хозяйство',
  'consumer goods': 'Товары народного потребления',

  media: 'Медиа',
  entertainment: 'Развлечения',

  aerospace: 'Авиакосмос',
  defense: 'Оборона',

  construction: 'Строительство',
  engineering: 'Инжиниринг',

  miscellaneous: 'Прочее',
  other: 'Прочее',
  unknown: 'Не указан',
  diversified: 'Диверсифицированный',
  'capital goods': 'Инвестиционные товары',
  'commercial services': 'Коммерческие услуги',
  electronic: 'Электроника',
  electronics: 'Электроника',
  ecommerce: 'Электронная коммерция',
  'e-commerce': 'Электронная коммерция',
  fintech: 'Финтех',
  'food & beverage': 'Пищевое производство',
  'food and beverage': 'Пищевое производство',
  'food and staples': 'Продукты питания',
  'auto & transport': 'Авто и транспорт',
  automotive: 'Автопром',
  'transportation & logistics': 'Транспорт и логистика',
  'oil gas': 'Нефть и газ',
  'telecom media': 'Телеком и медиа',
  'telecom and media': 'Телеком и медиа',
  'finance services': 'Финансовые услуги'
};

function normalizeKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[_/]+/g, ' ');
}

/**
 * Возвращает русскую подпись сектора для отображения.
 * Уже кириллические строки не меняет.
 */
function lookupSectorRu(normalizedKey: string): string | undefined {
  if (SECTOR_EN_TO_RU[normalizedKey]) return SECTOR_EN_TO_RU[normalizedKey];
  const variants = [
    normalizedKey,
    normalizedKey.replace(/\s*&\s*/g, ' and '),
    normalizedKey.replace(/\s+and\s+/g, ' & '),
    normalizedKey.replace(/-/g, ' ')
  ];
  for (const v of variants) {
    const k = normalizeKey(v);
    if (SECTOR_EN_TO_RU[k]) return SECTOR_EN_TO_RU[k];
  }
  const compact = normalizedKey.replace(/\s/g, '');
  for (const [en, ru] of Object.entries(SECTOR_EN_TO_RU)) {
    if (en.replace(/\s/g, '') === compact) return ru;
  }
  return undefined;
}

export function sectorLabelRu(sector: string | undefined | null): string {
  if (sector == null || !String(sector).trim()) return 'Не указан';
  const raw = String(sector).trim();

  if (/[а-яёА-ЯЁ]/.test(raw)) return raw;

  const key = normalizeKey(raw);
  const found = lookupSectorRu(key);
  if (found) return found;

  // Только латиница — показываем русскую пометку (оригинал в скобках для различия и отладки)
  if (/^[a-zA-Z\s&\-,'/]+$/i.test(raw)) {
    return `Прочее (${raw})`;
  }

  return raw;
}
