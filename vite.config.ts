import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/**
 * Serves / copies pdf.js character maps and standard fonts so PDFs with
 * non-embedded or CJK/Hebrew fonts render correctly in the in-app viewer.
 */
function pdfjsAssets(): Plugin {
  const src = path.resolve(__dirname, 'node_modules/pdfjs-dist');
  const dirs = ['cmaps', 'standard_fonts'];
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/pdfjs\/(cmaps|standard_fonts)\/([\w.-]+)/);
        const file = m && path.join(src, m[1], m[2]);
        if (!file || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const out = options.dir || path.resolve(__dirname, 'dist');
      for (const d of dirs) {
        fs.cpSync(path.join(src, d), path.join(out, 'pdfjs', d), {recursive: true});
      }
    },
  };
}

export default defineConfig(() => {
  return {
    // Base public path. Set BASE_PATH (e.g. "/GedesAI/") when deploying to GitHub Pages.
    base: process.env.BASE_PATH || '/',
    plugins: [react(), tailwindcss(), pdfjsAssets()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
