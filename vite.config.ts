import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

// Get version from environment, git tag, or package.json
function getVersion(): string {
  // 1. Environment variable (set by GitHub Actions)
  if (process.env.VERSION) {
    return process.env.VERSION;
  }

  // 2. Try git tag
  for (const args of [['describe', '--tags', '--exact-match'], ['describe', '--tags']]) {
    try {
      const gitTag = execSync(`git ${args.join(' ')}`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (gitTag) {
        return gitTag;
      }
    } catch {
      // Git not available, no tags, or not on a tagged commit
    }
  }

  // 3. Fall back to package.json version
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
    if (pkg.version && pkg.version !== '0.0.0') {
      return pkg.version;
    }
  } catch {
    // package.json not readable
  }

  return 'dev';
}

// Vite resolves entry ids through realpath, but `root` defaults to process.cwd().
// When the checkout is reached through a directory junction/symlink those disagree and
// `path.relative(root, id)` produces a "../" fileName that Rollup refuses to emit.
const projectRoot = fs.realpathSync.native(__dirname);

// https://vitejs.dev/config/
export default defineConfig({
  root: projectRoot,
  server: {
    proxy: {
      '/v0/management': {
        target: 'http://127.0.0.1:8317',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    viteSingleFile({
      removeViteModuleLoader: true
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(getVersion())
  },
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, './src'),
    }
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]___[hash:base64:5]'
    },
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/styles/variables.scss" as *;`
      }
    }
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rolldownOptions: {
      output: {
        codeSplitting: false
      }
    }
  }
});
