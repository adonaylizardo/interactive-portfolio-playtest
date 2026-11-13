import { defineConfig } from 'vite';

export default defineConfig({
  base: '/interactive-portfolio-playtest/',
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  plugins: [
    (() => {
      let base = '/interactive-portfolio-playtest/';
      return {
        name: 'preload-critical-sprites',
        configResolved(config) {
          base = config.base;
        },
        transformIndexHtml(html) {
          const inject = `
    <link rel="preload" href="${base}sprites/atlas/boot-1x.webp" as="image" type="image/webp" />
    <link rel="preload" href="${base}sprites/atlas/boot-1x.json" as="fetch" crossorigin />`;
          return html.replace('</head>', `${inject}\n  </head>`);
        },
      };
    })(),
  ],
});
