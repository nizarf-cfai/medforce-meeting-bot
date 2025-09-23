import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

await build({
  entryPoints: [join(__dirname, 'client/main.js')],
  bundle: true,
  outfile: join(__dirname, 'public/app.js'),
  format: 'iife',
  target: 'es2020',
  sourcemap: true,
  globalName: 'App',
  define: {
    'process.env.NODE_ENV': '"production"'
  }
});

console.log('Build complete: public/app.js');
