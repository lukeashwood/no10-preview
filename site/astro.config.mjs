// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// SITE_URL / SITE_BASE let the same build serve a custom domain ("/") or a GitHub Pages preview ("/repo-name/").
const site = process.env.SITE_URL || 'https://lukeashwood.github.io';
const base = process.env.SITE_BASE || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  integrations: [react(), sitemap()],
  // Pre-bundle the heavier libraries up front so the local dev server never serves a half-optimised copy.
  vite: { plugins: [tailwindcss()], optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'd3-scale', 'd3-shape'] } },
});
