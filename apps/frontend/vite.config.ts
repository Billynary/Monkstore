import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Multi-page app. Each HTML file is an entry point.
export default defineConfig({
  build: {
    // [HIDDEN] source maps are shipped to production, leaking the TS source.
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        shop: resolve(__dirname, 'shop.html'),
        cart: resolve(__dirname, 'cart.html'),
        profile: resolve(__dirname, 'profile.html'),
        login: resolve(__dirname, 'login.html'),
        nft: resolve(__dirname, 'nft.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Local `vite dev` convenience — proxy API to the backend.
      '/api': 'http://localhost:3000',
    },
  },
});
