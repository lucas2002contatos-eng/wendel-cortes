import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;

let tokenCache: string | null = null;
let userCache: any = null;

export async function getToken(): Promise<string | null> {
  if (tokenCache) return tokenCache;
  const t = await AsyncStorage.getItem("token");
  tokenCache = t;
  return t;
}

export async function getUser(): Promise<any | null> {
  if (userCache) return userCache;
  const u = await AsyncStorage.getItem("user");
  userCache = u ? JSON.parse(u) : null;
  return userCache;
}

export async function setSession(token: string, user: any) {
  tokenCache = token;
  userCache = user;
  await AsyncStorage.setItem("token", token);
  await AsyncStorage.setItem("user", JSON.stringify(user));
}

export async function clearSession() {
  tokenCache = null;
  userCache = null;
  await AsyncStorage.removeItem("token");
  await AsyncStorage.removeItem("user");
}

export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const token = await getToken();
  const headers: any = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.detail) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export const BACKEND_URL = BASE;
