// Profile page: identity, wallet balance, deposit + promo, inventory, tx history.
import {
  isAuthenticated,
  getCurrentUser,
  getWallet,
  getInventory,
  getTransactions,
  createDeposit,
  simulateDepositConfirm,
  depositConfig,
  redeemPromo,
} from './api.js';
import type { InventoryItem, Transaction } from './types.js';
import { initNav } from './nav.js';

const BASE = '/api';

async function loadProfile(): Promise<void> {
  const res = await fetch(`${BASE}/profile`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
  });
  const nameEl = document.querySelector('.profile__name');
  const emailEl = document.querySelector('.profile__email');
  const avatar = document.querySelector('.profile__avatar-placeholder');
  if (res.ok) {
    const { user } = (await res.json()) as { user: { username: string; email: string } };
    if (nameEl) nameEl.textContent = user.username;
    if (emailEl) emailEl.textContent = user.email;
    if (avatar) avatar.textContent = user.username.charAt(0).toUpperCase();
  } else {
    const u = getCurrentUser();
    if (u && nameEl) nameEl.textContent = u.username;
    if (u && emailEl) emailEl.textContent = u.email;
  }
}

async function refreshBalance(): Promise<void> {
  const el = document.getElementById('walletBalance');
  if (!el) return;
  try {
    const w = await getWallet();
    el.textContent = w.balance.toLocaleString();
  } catch {
    el.textContent = '—';
  }
}

async function loadInventory(): Promise<void> {
  const grid = document.getElementById('ownedNFTGrid');
  if (!grid) return;
  const items = await getInventory();
  if (items.length === 0) {
    grid.innerHTML = `<div class="empty-state"><p>No NFTs owned yet</p><a href="shop.html" class="btn btn--primary">Start Collecting</a></div>`;
    return;
  }
  grid.innerHTML = items.map(card).join('');
}

function card(nft: InventoryItem): string {
  const traits = nft.traits ? Object.values(nft.traits).map((v) => `<span class="trait">${v}</span>`).join('') : '';
  return `
    <div class="nft-card">
      <div class="nft-card__image"><img src="${nft.image}" alt="${nft.name}" loading="lazy" width="250" height="250"></div>
      <div class="nft-card__content">
        <div class="nft-card__header">
          <h3 class="nft-card__name">${nft.name}</h3>
          <span class="rarity-badge rarity-badge--${nft.rarity.toLowerCase()}">${nft.rarity}</span>
        </div>
        <div class="nft-card__traits"><div class="traits-list">${traits}</div></div>
        <div class="nft-card__footer"><span class="nft-card__price">${nft.price.toLocaleString()} 🪙</span></div>
      </div>
    </div>`;
}

async function loadTransactions(): Promise<void> {
  const body = document.getElementById('txTableBody');
  if (!body) return;
  const txs = await getTransactions();
  if (txs.length === 0) {
    body.innerHTML = `<tr><td colspan="4">No transactions yet.</td></tr>`;
    return;
  }
  body.innerHTML = txs.map(txRow).join('');
}

function txRow(t: Transaction): string {
  const sign = t.amount >= 0 ? '+' : '';
  const date = new Date(t.createdAt).toLocaleString();
  return `<tr>
    <td>${t.type}</td>
    <td>${date}</td>
    <td>${sign}${t.amount.toLocaleString()} 🪙</td>
    <td>${t.nftId ?? t.reference ?? '—'}</td>
  </tr>`;
}

function setupTabs(): void {
  document.querySelectorAll<HTMLButtonElement>('.tabs__button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab!;
      document.querySelectorAll('.tabs__button').forEach((b) => b.classList.remove('tabs__button--active'));
      btn.classList.add('tabs__button--active');
      document.querySelectorAll('.tabs__panel').forEach((p) => p.classList.remove('tabs__panel--active'));
      document.getElementById(`${tab}Tab`)?.classList.add('tabs__panel--active');
      if (tab === 'orders') void loadTransactions();
      if (tab === 'owned') void loadInventory();
    });
  });
}

function setupWalletControls(): void {
  const status = document.getElementById('walletStatus');
  const setStatus = (msg: string) => {
    if (status) status.textContent = msg;
  };

  document.getElementById('depositForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('depositAmount') as HTMLInputElement;
    const tokens = parseInt(input.value, 10);
    if (!tokens) return;
    setStatus('Creating deposit…');
    const session = await createDeposit(tokens);
    if (session.mode === 'stripe' && session.checkoutUrl) {
      window.location.href = session.checkoutUrl;
      return;
    }
    // Simulate mode: confirm immediately via the (unsigned) webhook.
    const confirmed = await simulateDepositConfirm(session.depositId);
    setStatus(confirmed.received ? `Credited ${confirmed.credited} 🪙` : 'Deposit failed');
    await refreshBalance();
  });

  document.getElementById('promoForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('promoCode') as HTMLInputElement;
    const { ok, data } = await redeemPromo(input.value.trim());
    setStatus(ok ? `Promo applied: +${data.granted} 🪙` : `Promo error: ${data.error}`);
    input.value = '';
    await refreshBalance();
  });

  void depositConfig().then((c) => {
    const modeEl = document.getElementById('depositMode');
    if (modeEl) modeEl.textContent = c.mode === 'stripe' ? 'Stripe (test)' : 'Simulate';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!isAuthenticated()) {
    window.location.href = '/login.html';
    return;
  }
  initNav();
  setupTabs();
  setupWalletControls();
  void loadProfile();
  void refreshBalance();
  void loadInventory();
});
