// Admin panel — intentionally unprotected (see VULNERABILITIES.md #4, #9).
import { initNav } from './nav.js';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: string;
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();

  document.getElementById('loadUsers')?.addEventListener('click', async () => {
    // [VULN] client sends the trivial bypass header itself.
    const res = await fetch('/api/admin/users', { headers: { 'X-Admin': 'true' } });
    const users = (await res.json()) as AdminUser[];
    const el = document.getElementById('usersTable');
    if (!el) return;
    if (!Array.isArray(users)) {
      el.innerHTML = `<pre style="color:#f66;">${JSON.stringify(users, null, 2)}</pre>`;
      return;
    }
    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse;color:var(--color-text);">
        <thead><tr style="border-bottom:1px solid var(--color-border);">
          <th style="text-align:left;padding:.5rem;">Username</th>
          <th style="text-align:left;padding:.5rem;">Email</th>
          <th style="text-align:left;padding:.5rem;">Password Hash</th>
          <th style="text-align:left;padding:.5rem;">Admin</th>
        </tr></thead>
        <tbody>
          ${users
            .map(
              (u) => `<tr style="border-bottom:1px solid var(--color-border);">
            <td style="padding:.5rem;">${u.username}</td>
            <td style="padding:.5rem;">${u.email}</td>
            <td style="padding:.5rem;font-size:.7rem;font-family:monospace;">${u.passwordHash}</td>
            <td style="padding:.5rem;">${u.isAdmin}</td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>`;
  });

  document.getElementById('loadDebug')?.addEventListener('click', async () => {
    const res = await fetch('/api/debug');
    const data = await res.json();
    const el = document.getElementById('debugOutput') as HTMLElement | null;
    if (el) {
      el.textContent = JSON.stringify(data, null, 2);
      el.style.display = 'block';
    }
  });
});
