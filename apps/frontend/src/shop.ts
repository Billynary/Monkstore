// Shop page: catalog grid with filters, add-to-cart, and buy-with-tokens.
import { fetchNFTs, addToCart, purchase, isAuthenticated } from './api.js';
import type { Nft } from './types.js';
import { initNav, updateCartBadge } from './nav.js';

function debounce<T extends (...args: never[]) => void>(fn: T, wait: number): T {
  let t: ReturnType<typeof setTimeout>;
  return ((...args: never[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  }) as T;
}

function cardHTML(nft: Nft): string {
  const traits = nft.traits ? Object.values(nft.traits).map((v) => `<span class="trait">${v}</span>`).join('') : '';
  return `
    <div class="nft-card" data-nft-id="${nft.id}">
      <div class="nft-card__image">
        <img src="${nft.image}" alt="${nft.name}" loading="lazy" width="250" height="250">
      </div>
      <div class="nft-card__content">
        <div class="nft-card__header">
          <h3 class="nft-card__name">${nft.name}</h3>
          <span class="rarity-badge rarity-badge--${nft.rarity.toLowerCase()}">${nft.rarity}</span>
        </div>
        <div class="nft-card__traits">
          <div class="nft-card__traits-title">Traits:</div>
          <div class="traits-list">${traits}</div>
        </div>
        <div class="nft-card__footer">
          <span class="nft-card__price">${nft.price.toLocaleString()} 🪙</span>
          <div style="display:flex;gap:.4rem;">
            <button class="btn nft-card__add-btn" data-nft-id="${nft.id}">Cart</button>
            <button class="btn btn--primary nft-card__buy-btn" data-nft-id="${nft.id}">Buy</button>
          </div>
        </div>
      </div>
    </div>`;
}

function initShop(): void {
  const searchInput = document.getElementById('searchInput') as HTMLInputElement | null;
  const rarityFilter = document.getElementById('rarityFilter') as HTMLSelectElement | null;
  const priceRange = document.getElementById('priceRange') as HTMLInputElement | null;
  const priceValue = document.getElementById('priceValue');
  const sortBy = document.getElementById('sortBy') as HTMLSelectElement | null;
  const nftGrid = document.getElementById('nftGrid');
  const nftCount = document.getElementById('nftCount');

  function display(nfts: Nft[]): void {
    if (!nftGrid) return;
    if (nfts.length === 0) {
      // [VULN: Reflected XSS] search term rendered via innerHTML without escaping.
      const term = searchInput?.value ?? '';
      nftGrid.innerHTML = `<div class="loading">No results for: <em>${term}</em></div>`;
      return;
    }
    nftGrid.innerHTML = nfts.map(cardHTML).join('');
    nftGrid.querySelectorAll<HTMLButtonElement>('.nft-card__add-btn').forEach((b) =>
      b.addEventListener('click', onAdd),
    );
    nftGrid.querySelectorAll<HTMLButtonElement>('.nft-card__buy-btn').forEach((b) =>
      b.addEventListener('click', onBuy),
    );
    nftGrid.querySelectorAll<HTMLElement>('.nft-card').forEach((card) =>
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        window.location.href = `nft.html?id=${card.dataset.nftId}`;
      }),
    );
  }

  async function onAdd(e: Event): Promise<void> {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLButtonElement;
    const id = btn.dataset.nftId!;
    btn.disabled = true;
    await addToCart(id);
    btn.textContent = '✓';
    void updateCartBadge();
    setTimeout(() => {
      btn.textContent = 'Cart';
      btn.disabled = false;
    }, 1000);
  }

  async function onBuy(e: Event): Promise<void> {
    e.stopPropagation();
    if (!isAuthenticated()) {
      window.location.href = '/login.html';
      return;
    }
    const btn = e.currentTarget as HTMLButtonElement;
    const id = btn.dataset.nftId!;
    btn.disabled = true;
    btn.textContent = '...';
    const res = await purchase(id);
    btn.textContent = res.ok ? 'Owned!' : res.error === 'insufficient_funds' ? 'No 🪙' : 'Error';
    setTimeout(() => {
      btn.textContent = 'Buy';
      btn.disabled = false;
    }, 1500);
  }

  async function load(): Promise<void> {
    const filters: Record<string, string | number> = {
      search: searchInput?.value ?? '',
      rarity: rarityFilter?.value ?? '',
      maxPrice: priceRange ? parseInt(priceRange.value, 10) : 10000,
      sortBy: sortBy?.value ?? 'rarity-desc',
    };
    try {
      const nfts = await fetchNFTs(filters);
      display(nfts);
      if (nftCount) nftCount.textContent = `${nfts.length} NFTs found`;
    } catch {
      if (nftGrid) nftGrid.innerHTML = '<div class="loading">Error loading NFTs</div>';
    }
  }

  searchInput?.addEventListener('input', debounce(load, 300));
  rarityFilter?.addEventListener('change', load);
  sortBy?.addEventListener('change', load);
  priceRange?.addEventListener('input', () => {
    if (priceValue) priceValue.textContent = `0-${priceRange.value}`;
    debounce(load, 300)();
  });

  void load();
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initShop();
});
