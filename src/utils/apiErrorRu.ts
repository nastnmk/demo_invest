/**
 * Перевод типичных сообщений об ошибках (API, fetch, браузер) на русский для показа пользователю.
 */

const CYRILLIC = /[\u0400-\u04FF]/;

export function hasCyrillic(s: string): boolean {
  return CYRILLIC.test(s);
}

const HTTP_STATUS_RU: Record<number, string> = {
  400: 'Неверный запрос',
  401: 'Требуется авторизация',
  403: 'Доступ запрещён',
  404: 'Не найдено',
  405: 'Метод не разрешён',
  408: 'Истекло время ожидания запроса',
  409: 'Конфликт данных',
  413: 'Слишком большой объём данных',
  422: 'Ошибка проверки данных',
  429: 'Слишком много запросов',
  500: 'Внутренняя ошибка сервера',
  502: 'Сервер недоступен',
  503: 'Сервис временно недоступен',
  504: 'Превышено время ожидания шлюза'
};

export function httpStatusTextRu(status: number): string {
  return HTTP_STATUS_RU[status] ?? `Ошибка (${status})`;
}

/**
 * Технические формулировки от API на русском — заменяем на нейтральные для пользователя.
 */
const RU_SERVICE_PHRASE_REPLACEMENTS: [RegExp, string][] = [
  [/нет доступных записей(?:\s+в\s+(?:api|API))?\.?/gi, 'Пока нет данных']
];

/** Замены фраз (длинные и специфичные — раньше). */
const PHRASE_REPLACEMENTS: [RegExp, string][] = [
  [/NetworkError when attempting to fetch resource\.?/gi, 'ошибка сети при обращении к серверу'],
  [/Failed to fetch/gi, 'не удалось выполнить запрос к серверу'],
  [/Load failed/gi, 'не удалось загрузить данные'],
  [/The user aborted a request\.?/gi, 'запрос отменён'],
  [/The operation was aborted\.?/gi, 'операция прервана'],
  [/Could not validate credentials/gi, 'неверный email или пароль'],
  [/Incorrect (username|email) or password/gi, 'неверный email или пароль'],
  [/Not authenticated/gi, 'требуется авторизация'],
  [/Insufficient funds?/gi, 'недостаточно средств'],
  [/Not enough cash/gi, 'недостаточно средств'],
  [/Internal server error/gi, 'внутренняя ошибка сервера'],
  [/Bad request/gi, 'неверный запрос'],
  [/Unprocessable [Ee]ntity/gi, 'ошибка проверки данных'],
  [/ECONNREFUSED/gi, 'соединение отклонено'],
  [/ETIMEDOUT/gi, 'истекло время ожидания'],
  [/ENOTFOUND/gi, 'адрес сервера не найден']
];

/** Целые строки (после trim). */
const FULL_LINE_REPLACEMENTS: [RegExp, string][] = [
  [/^(Not Found|NOT FOUND)$/i, 'Не найдено.'],
  [/^(Unauthorized|UNAUTHORIZED)$/i, 'Требуется авторизация.'],
  [/^(Forbidden|FORBIDDEN)$/i, 'Доступ запрещён.'],
  [/^(Bad Request|BAD REQUEST)$/i, 'Неверный запрос.'],
  [/^(Internal Server Error)$/i, 'Внутренняя ошибка сервера.'],
  [/^(Service Unavailable)$/i, 'Сервис временно недоступен.'],
  [/^(Gateway Timeout)$/i, 'Превышено время ожидания.'],
];

/**
 * Приводит текст ошибки к виду, удобному для пользователя: перевод с английского
 * и замена технических русских формулировок API.
 */
export function translateUserErrorMessage(message: string): string {
  let s = message.trim();
  if (!s) return 'Произошла ошибка.';
  for (const [re, ru] of RU_SERVICE_PHRASE_REPLACEMENTS) {
    s = s.replace(re, ru);
  }
  s = s.replace(/\s{2,}/g, ' ').trim();
  if (!s) return 'Пока нет данных.';
  if (!/[a-zA-Z]/.test(s)) return s;

  for (const [re, ru] of PHRASE_REPLACEMENTS) {
    s = s.replace(re, ru);
  }

  const lines = s.split('\n').map(line => {
    const t = line.trim();
    for (const [re, ru] of FULL_LINE_REPLACEMENTS) {
      if (re.test(t)) return ru;
    }
    return line;
  });
  s = lines.join('\n').trim();

  const oneLine = s.replace(/\s+/g, ' ');
  for (const [re, ru] of FULL_LINE_REPLACEMENTS) {
    if (re.test(oneLine)) return ru;
  }

  if (hasCyrillic(s)) return s;

  if (s.length <= 200) {
    return 'Не удалось выполнить операцию. Попробуйте ещё раз или проверьте соединение с сервером.';
  }
  return 'Не удалось выполнить операцию. Попробуйте позже.';
}
