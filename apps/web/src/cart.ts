// Cart page: list items, adjust, and checkout by spending tokens.
import { getCart, removeFromCart, purchase, getWallet, isAuthenticated } from './api.js';
import type { CartLine } from './types.js';
import { initNav, updateCartBadge } from './nav.js';

function render(items: CartLine[]): void {
  const content = document.getElementById('cartContent');
  const summary = document.getElementById('cartSummary');
  const total = document.getElementById('cartTotal');
  if (!content) return;

  if (items.length === 0) {
    content.innerHTML = `
      <div class="cart__empty">
        <p>Your cart is empty</p>
        <a href="shop.html" class="btn btn--primary">Browse Collection</a>
      </div>`;
    if (summary) summary.style.display = 'none';
    return;
  }

  content.innerHTML = items
    .map(
      (item) => `
    <div class="cart-item" data-id="${item.id}">
      <div class="cart-item__image"><img src="${item.image}" alt="${item.name}" width="80" height="80"></div>
      <div class="cart-item__info">
        <h3 class="cart-item__name">${item.name}</h3>
        <p class="cart-item__price">${item.price.toLocaleString()} 🪙 × ${item.quantity}</p>
      </div>
      <button class="btn cart-item__remove" data-id="${item.id}">Remove</button>
    </div>`,
    )
    .join('');

  content.querySelectorAll<HTMLButtonElement>('.cart-item__remove').forEach((b) =>
    b.addEventListener('click', async () => {
      await removeFromCart(b.dataset.id!);
      void updateCartBadge();
      void load();
    }),
  );

  const sum = items.reduce((s, i) => s + i.price * i.quantity, 0);
  if (total) total.textContent = `${sum.toLocaleString()} 🪙`;
  if (summary) summary.style.display = 'block';
}

async function load(): Promise<void> {
  render(await getCart());
}

async function checkout(): Promise<void> {
  const btn = document.getElementById('checkoutBtn') as HTMLButtonElement | null;
  if (!btn) return;
  if (!isAuthenticated()) {
    window.location.href = '/login.html';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Processing...';
  try {
    const items = await getCart();
    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        const res = await purchase(item.id);
        if (!res.ok) {
          alert(res.error === 'insufficient_funds' ? 'Not enough tokens.' : 'Checkout failed.');
          btn.disabled = false;
          btn.textContent = 'Proceed to Checkout';
          return;
        }
      }
      await removeFromCart(item.id);
    }
    const wallet = await getWallet();
    alert(`🎉 Purchase complete! Remaining balance: ${wallet.balance.toLocaleString()} 🪙`);
    void updateCartBadge();
    void load();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Proceed to Checkout';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  document.getElementById('checkoutBtn')?.addEventListener('click', checkout);
  void load();
});
