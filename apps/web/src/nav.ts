// Shared navigation: auth-aware links + cart badge. Imported by every page.
import { isAuthenticated, getCurrentUser, logout, getCart } from './api.js';

export function updateAuthUI(): void {
  const loggedIn = isAuthenticated();
  const user = getCurrentUser();

  document.querySelectorAll<HTMLAnchorElement>('.login-link').forEach((link) => {
    if (loggedIn) {
      link.textContent = 'Logout';
      link.href = '#';
      link.onclick = (e) => {
        e.preventDefault();
        logout();
      };
    } else {
      link.textContent = 'Login';
      link.href = 'login.html';
      link.onclick = null;
    }
  });

  document.querySelectorAll<HTMLAnchorElement>('a[href="profile.html"]').forEach((link) => {
    if (loggedIn && user && link.classList.contains('nav__link')) {
      // Keep label as "Profile"; username shown on the profile page itself.
    }
  });
}

export async function updateCartBadge(): Promise<void> {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  try {
    const cart = await getCart();
    badge.textContent = String(cart.length);
  } catch {
    badge.textContent = '0';
  }
}

export function initNav(): void {
  updateAuthUI();
  void updateCartBadge();
}
