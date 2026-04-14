import { execSync } from 'node:child_process'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
  ],
  format: ['cjs'],
  shims: false,
  dts: false,
  external: [
    'vscode',
  ],
  noExternal: [
    'axios',
    'simple-git',
    'reactive-vscode',
  ],
  hooks(hooks) {
    hooks.hookOnce('build:prepare', () => {
      execSync('nr update')
    })
  },
})
