import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/build.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true
});
