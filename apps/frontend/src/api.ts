// Central typed HTTP client. All pages import from here.
import type {
  CartLine,
  InventoryItem,
  Nft,
  Review,
  Transaction,
  User,
} from './types.js';

const BASE = '/api';

export function getToken(): string | null {
  return localStorage.getItem('authToken');
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getCurrentUser(): User | null {
  const s = localStorage.getItem('user');
  return s ? (JSON.parse(s) as User) : null;
}

export function saveSession(token: string, user: User): void {
  localStorage.setItem('authToken', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function logout(): void {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}

async function asJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---- Auth ----
export async function register(username: string, email: string, password: string) {
  const res = await fetch(`${BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  return { ok: res.ok, data: await asJson<{ user: User; token: string; error?: string }>(res) };
}

export async function login(username: string, password: string) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return { ok: res.ok, data: await asJson<{ user: User; token: string; error?: string }>(res) };
}

// ---- Catalog ----
export async function fetchNFTs(filters: Record<string, string | number> = {}): Promise<Nft[]> {
  const qs = new URLSearchParams(
    Object.entries(filters).map(([k, v]) => [k, String(v)]),
  ).toString();
  const res = await fetch(`${BASE}/monkeys?${qs}`);
  return asJson<Nft[]>(res);
}

export async function fetchNFT(id: string): Promise<Nft> {
  const res = await fetch(`${BASE}/monkeys/${id}`);
  if (!res.ok) throw new Error('not_found');
  return asJson<Nft>(res);
}

// ---- Cart ----
export async function getCart(): Promise<CartLine[]> {
  const res = await fetch(`${BASE}/cart`, { headers: authHeaders() });
  if (res.status === 401) return [];
  return asJson<CartLine[]>(res);
}

export async function addToCart(nftId: string): Promise<boolean> {
  const res = await fetch(`${BASE}/cart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ nftId }),
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    return false;
  }
  return res.ok;
}

export async function removeFromCart(nftId: string): Promise<void> {
  await fetch(`${BASE}/cart/${nftId}`, { method: 'DELETE', headers: authHeaders() });
}

// ---- Wallet / shop ----
export async function getWallet(): Promise<{ userId: string; balance: number }> {
  const res = await fetch(`${BASE}/wallet`, { headers: authHeaders() });
  return asJson(res);
}

export async function purchase(nftId: string): Promise<{ ok: boolean; balance?: number; error?: string }> {
  const res = await fetch(`${BASE}/purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ nftId }),
  });
  return { ok: res.ok, ...(await asJson<{ balance?: number; error?: string }>(res)) };
}

export async function getInventory(): Promise<InventoryItem[]> {
  const res = await fetch(`${BASE}/inventory`, { headers: authHeaders() });
  return asJson<InventoryItem[]>(res);
}

export async function getTransactions(): Promise<Transaction[]> {
  const res = await fetch(`${BASE}/transactions`, { headers: authHeaders() });
  return asJson<Transaction[]>(res);
}

export async function redeemPromo(code: string) {
  const res = await fetch(`${BASE}/promo/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ code }),
  });
  return { ok: res.ok, data: await asJson<{ granted?: number; balance?: number; error?: string }>(res) };
}

// ---- Deposit ----
export async function depositConfig() {
  const res = await fetch(`${BASE}/deposit/config`);
  return asJson<{ mode: string; publishableKey: string | null; centsPerToken: number }>(res);
}

export async function createDeposit(tokens: number) {
  const res = await fetch(`${BASE}/deposit/create-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ tokens }),
  });
  return asJson<{ mode: string; depositId: string; checkoutUrl?: string; hint?: string }>(res);
}

export async function simulateDepositConfirm(depositId: string) {
  const res = await fetch(`${BASE}/deposit/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'checkout.session.completed', data: { object: { metadata: { depositId } } } }),
  });
  return asJson<{ received: boolean; credited?: number }>(res);
}

// ---- Reviews ----
export async function getReviews(nftId: string): Promise<Review[]> {
  const res = await fetch(`${BASE}/reviews?nftId=${encodeURIComponent(nftId)}`);
  return asJson<Review[]>(res);
}

export async function postReview(nftId: string, author: string, content: string): Promise<boolean> {
  const res = await fetch(`${BASE}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ nftId, author, content }),
  });
  return res.ok;
}
