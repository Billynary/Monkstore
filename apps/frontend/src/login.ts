// Login / register page.
import { login, register, saveSession, isAuthenticated } from './api.js';
import { initNav } from './nav.js';

function switchTab(tab: 'login' | 'register'): void {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabs = document.querySelectorAll('.auth-tab');
  if (!loginForm || !registerForm) return;
  if (tab === 'login') {
    loginForm.style.display = 'flex';
    registerForm.style.display = 'none';
    tabs[0]?.classList.add('active');
    tabs[1]?.classList.remove('active');
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'flex';
    tabs[0]?.classList.remove('active');
    tabs[1]?.classList.add('active');
  }
}
(window as unknown as { switchTab: typeof switchTab }).switchTab = switchTab;

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  if (isAuthenticated()) {
    window.location.href = 'shop.html';
    return;
  }

  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (document.getElementById('loginUsername') as HTMLInputElement).value;
    const password = (document.getElementById('loginPassword') as HTMLInputElement).value;
    const err = document.getElementById('loginError');
    const { ok, data } = await login(username, password);
    if (ok) {
      saveSession(data.token, data.user);
      window.location.href = 'shop.html';
    } else if (err) {
      err.textContent = data.error === 'invalid_credentials' ? 'Invalid username or password' : 'Login failed.';
      err.style.display = 'block';
    }
  });

  document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (document.getElementById('registerUsername') as HTMLInputElement).value;
    const email = (document.getElementById('registerEmail') as HTMLInputElement).value;
    const password = (document.getElementById('registerPassword') as HTMLInputElement).value;
    const err = document.getElementById('registerError');
    const success = document.getElementById('registerSuccess');
    const { ok, data } = await register(username, email, password);
    if (ok) {
      saveSession(data.token, data.user);
      if (success) {
        success.textContent = 'Registration successful! Redirecting…';
        success.style.display = 'block';
      }
      if (err) err.style.display = 'none';
      setTimeout(() => (window.location.href = 'shop.html'), 1200);
    } else if (err) {
      err.textContent = data.error === 'user_exists' ? 'Username or email already exists' : 'Registration failed.';
      err.style.display = 'block';
    }
  });
});
