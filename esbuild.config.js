import esbuild from 'esbuild';
import process from 'process';

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'bundle/jupyterlab-rtc-mcp.mjs',
  format: 'esm',
  target: 'ES2022',
  sourcemap: false,
  minify: true,
  keepNames: false,
  banner: {
    js: `
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
}).catch(() => process.exit(1));
