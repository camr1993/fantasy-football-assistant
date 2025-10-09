import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

export default defineConfig(({ mode }) => {
  // Load environment variables based on the mode
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          { src: 'manifest.json', dest: '.' },
          { src: 'public/icon16.png', dest: '.' },
          { src: 'public/icon48.png', dest: '.' },
          { src: 'public/icon128.png', dest: '.' },
        ],
      }),
      {
        name: 'copy-popup-html',
        writeBundle() {
          const srcPath = resolve(__dirname, 'dist/src/popup/popup.html');
          const destPath = resolve(__dirname, 'dist/popup.html');
          if (existsSync(srcPath)) {
            let content = readFileSync(srcPath, 'utf8');
            // Fix absolute paths to relative paths for Chrome extension
            content = content.replace(/src="\//g, 'src="./');
            content = content.replace(/href="\//g, 'href="./');
            writeFileSync(destPath, content);
          }
        },
      },
    ],
    build: {
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/popup/popup.html'),
          background: resolve(__dirname, 'src/background/background.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.html')) {
              return 'popup.html';
            }
            return 'assets/[name]-[hash][extname]';
          },
          manualChunks: (id) => {
            // Bundle content script dependencies inline
            if (
              id.includes('content') ||
              id.includes('react') ||
              id.includes('react-dom')
            ) {
              return 'content';
            }
          },
        },
      },
      outDir: 'dist',
      emptyOutDir: true,
    },
    publicDir: false,
  };
});
