const viteBaseUrl = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL as string | undefined) || '';
const isDev = Boolean((import.meta as unknown as { env?: Record<string, string> }).env?.DEV);
const defaultBaseUrl = isDev ? '' : 'http://213.155.14.44:8000';

export const API_BASE = (viteBaseUrl || defaultBaseUrl).replace(/\/+$/, '');
