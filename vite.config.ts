import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {createHash} from 'crypto';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/**
 * Écrit dans dist/sw.js la liste des fichiers du build et une version tirée de leurs noms :
 * le service worker les met en cache à l'installation et supprime les caches des versions précédentes.
 */
function serviceWorkerManifest(): Plugin {
  let assets: string[] = [];
  let outDir = 'dist';
  return {
    name: 'medj-sw-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      assets = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/'))
        .map((f) => `/${f}`)
        .sort();
    },
    closeBundle() {
      const file = path.join(outDir, 'sw.js');
      if (!existsSync(file)) return;
      const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
      const src = readFileSync(file, 'utf8')
        .replace('__BUILD_VERSION__', version)
        .replace('const BUILD_ASSETS = []; /* __BUILD_ASSETS__ */', `const BUILD_ASSETS = ${JSON.stringify(assets)};`);
      writeFileSync(file, src);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), serviceWorkerManifest()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Cloud Messaging (rappel du matin) reste un morceau à part, chargé seulement à l'activation
            if (id.includes('messaging')) return undefined;
            // Storage (images des cartes) aussi : chargé à la première image lue ou ajoutée
            if (/node_modules\/(@firebase\/storage|firebase\/storage)\//.test(id)) return undefined;
            if (id.includes('node_modules/firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('node_modules/motion') || id.includes('node_modules/canvas-confetti')) {
              return 'vendor-ui';
            }
          },
        },
      },
    },
  };
});
