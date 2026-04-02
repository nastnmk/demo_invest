import { API_BASE } from './config';
import { getAccessToken } from '../auth/token';
import { httpStatusTextRu, translateUserErrorMessage } from '../utils/apiErrorRu';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(translateUserErrorMessage(message));
    this.name = 'ApiError';
  }
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** FastAPI / Pydantic validation error item */
type ValidationErrItem = {
  type?: string;
  loc?: (string | number)[];
  msg?: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
};

const FIELD_LABEL_RU: Record<string, string> = {
  password: 'Пароль',
  email: 'Email',
  name: 'Имя',
  quantity: 'Количество',
  asset_id: 'Актив',
  portfolio_id: 'Портфель',
  body: 'Данные',
  query: 'Запрос',
  path: 'Путь'
};

function humanizeValidationMsg(msg: string, item: ValidationErrItem): string {
  const m = msg.toLowerCase();
  if (m.includes('string should have at least') && m.includes('character')) {
    const min = typeof item.ctx?.min_length === 'number' ? item.ctx.min_length : undefined;
    if (min != null) return `не менее ${min} символов`;
  }
  if (m.includes('value is not a valid email')) return 'некорректный email';
  if (m.includes('field required')) return 'обязательное поле';
  if (m.includes('none is not an allowed value')) return 'укажите значение';
  if (m.includes('ensure this value has at least') && m.includes('character')) {
    const min = typeof item.ctx?.min_length === 'number' ? item.ctx.min_length : undefined;
    if (min != null) return `не менее ${min} символов`;
  }
  if (m.includes('input should be a valid string')) return 'ожидается строка';
  if (m.includes('input should be greater than')) return 'значение слишком мало';
  if (m.includes('input should be less than')) return 'значение слишком велико';
  return msg;
}

function formatValidationDetailArray(items: unknown[]): string {
  const lines: string[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as ValidationErrItem;
    const loc = item.loc;
    const fieldKey =
      Array.isArray(loc) && loc.length > 0 ? String(loc[loc.length - 1]) : '';
    const label = FIELD_LABEL_RU[fieldKey] ?? (fieldKey ? fieldKey : '');
    const msg = typeof item.msg === 'string' ? item.msg : '';
    if (!msg) continue;
    const human = humanizeValidationMsg(msg, item);
    lines.push(label ? `${label}: ${human}` : human);
  }
  return lines.length > 0 ? lines.join('\n') : JSON.stringify(items);
}

function messageFromParsedBody(parsed: unknown): string | null {
  if (parsed == null) return null;
  if (typeof parsed === 'string') return parsed;

  if (Array.isArray(parsed)) {
    return formatValidationDetailArray(parsed);
  }

  if (typeof parsed === 'object') {
    const j = parsed as Record<string, unknown>;
    if (typeof j.detail === 'string') return j.detail;
    if (Array.isArray(j.detail)) return formatValidationDetailArray(j.detail);
    if (typeof j.message === 'string') return j.message;
  }
  return null;
}

async function errorMessageFromResponse(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) {
    return res.statusText?.trim() ? res.statusText : httpStatusTextRu(res.status);
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    const fromBody = messageFromParsedBody(parsed);
    if (fromBody) return fromBody;
    return text;
  } catch {
    return text;
  }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const method = (init?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init?.body != null && method !== 'GET' && method !== 'HEAD' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ApiError(0, reason);
  }

  if (response.status === 401 && token) {
    onUnauthorized?.();
  }

  if (!response.ok) {
    const message = await errorMessageFromResponse(response);
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const ct = response.headers.get('Content-Type');
  if (ct && !ct.includes('json')) {
    return (await response.text()) as T;
  }

  return response.json() as Promise<T>;
}
