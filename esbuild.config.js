import esbuild from 'esbuild';

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'bundle/jupyterlab-rtc-mcp.js',
  format: 'esm',
  target: 'ES2022',
  sourcemap: false,
  minify: true,
  keepNames: false,
}).catch(() => process.exit(1));