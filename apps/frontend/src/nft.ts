// NFT detail page + community reviews.
// [VULN: Stored XSS] review author/content rendered via innerHTML (see VULNERABILITIES.md #8).
import { fetchNFT, getReviews, postReview, addToCart, purchase, isAuthenticated } from './api.js';
import type { Review } from './types.js';
import { initNav, updateCartBadge } from './nav.js';

const params = new URLSearchParams(location.search);
const nftId = params.get('id') ?? 'monk-001';

async function loadDetail(): Promise<void> {
  const el = document.getElementById('nftDetail');
  if (!el) return;
  try {
    const nft = await fetchNFT(nftId);
    const traits = nft.traits
      ? Object.entries(nft.traits).map(([k, v]) => `<span class="trait">${k}: ${v}</span>`).join('')
      : '';
    el.innerHTML = `
      <div style="display:flex;gap:2rem;align-items:flex-start;flex-wrap:wrap;">
        <img src="${nft.image}" alt="${nft.name}" width="240" height="240" style="border-radius:8px;">
        <div>
          <h1 style="color:var(--color-text);margin-bottom:.5rem;">${nft.name}</h1>
          <span style="color:var(--color-primary);">${nft.rarity}</span>
          <p style="color:var(--color-text);margin:.5rem 0;">Price: ${nft.price.toLocaleString()} 🪙</p>
          <div class="traits-list" style="margin:.5rem 0;">${traits}</div>
          <div style="display:flex;gap:.5rem;margin-top:1rem;">
            <button id="detailCart" class="btn">Add to Cart</button>
            <button id="detailBuy" class="btn btn--primary">Buy Now</button>
          </div>
        </div>
      </div>`;
    document.getElementById('detailCart')?.addEventListener('click', async () => {
      await addToCart(nftId);
      void updateCartBadge();
    });
    document.getElementById('detailBuy')?.addEventListener('click', async () => {
      if (!isAuthenticated()) return (window.location.href = '/login.html');
      const res = await purchase(nftId);
      alert(res.ok ? 'Purchased!' : res.error === 'insufficient_funds' ? 'Not enough tokens.' : 'Error');
    });
  } catch {
    el.innerHTML = '<p style="color:#f66;">NFT not found</p>';
  }
}

async function loadReviews(): Promise<void> {
  const list = document.getElementById('reviewsList');
  if (!list) return;
  const reviews: Review[] = await getReviews(nftId);
  if (reviews.length === 0) {
    list.innerHTML = '<p style="color:var(--color-text);opacity:.6;">No reviews yet.</p>';
    return;
  }
  // [VULN: Stored XSS] content injected as raw HTML.
  list.innerHTML = reviews
    .map(
      (r) => `<div style="background:var(--color-card);border:1px solid var(--color-border);border-radius:8px;padding:1rem;margin-bottom:.75rem;">
        <strong style="color:var(--color-primary);">${r.author}</strong>
        <div style="color:var(--color-text);margin-top:.4rem;">${r.content}</div>
      </div>`,
    )
    .join('');
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  void loadDetail();
  void loadReviews();
  document.getElementById('reviewForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const author = (document.getElementById('reviewAuthor') as HTMLInputElement).value || 'anonymous';
    const content = (document.getElementById('reviewContent') as HTMLTextAreaElement).value;
    const status = document.getElementById('reviewStatus');
    if (!content) return;
    const ok = await postReview(nftId, author, content);
    if (status) status.textContent = ok ? 'Review posted!' : 'Error posting review.';
    if (ok) {
      (document.getElementById('reviewContent') as HTMLTextAreaElement).value = '';
      void loadReviews();
    }
  });
});
