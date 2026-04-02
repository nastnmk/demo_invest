const STORAGE_KEY = 'invest_sim_access_token';

let memoryToken: string | null = null;

export function getAccessToken(): string | null {
  if (memoryToken != null) return memoryToken;
  try {
    memoryToken = localStorage.getItem(STORAGE_KEY);
    return memoryToken;
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAccessToken(): void {
  setAccessToken(null);
}

export function hydrateTokenFromStorage(): void {
  try {
    memoryToken = localStorage.getItem(STORAGE_KEY);
  } catch {
    memoryToken = null;
  }
}
