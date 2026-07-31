/**
 * Three code worlds live in this repo and they get different rules:
 *
 *   src/                        Vue 3 + TypeScript, bundled by Vite
 *   public/snippets/           standalone browser ES modules, no build step
 *   scripts/, tests/, *.config  Node
 *
 * Kept type-unaware on purpose: the run stays fast enough for a pre-commit reflex,
 * and vue-tsc already covers the typed checks for src/. What this catches is the
 * other class of defect — leftovers from a removed mechanism, a variable that no
 * longer exists, a duplicate key, a condition that cannot be false.
 */
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/snippets/manifest.json'] },

  // Vue + TypeScript app
  {
    files: ['src/**/*.{ts,vue}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, ...pluginVue.configs['flat/recommended']],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    },
    rules: {
      /* Reine Formatierung aus. Diese drei Regeln fordern einen anderen Umbruchstil,
         als die Templates hier haben — sie melden 79-mal Geschmack und nie einen
         Fehler. Was Fehler findet, bleibt an. */
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
    },
  },

  // Snippets: plain browser ES modules, no bundler, no TypeScript
  {
    files: ['public/snippets/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.browser },
    rules: {
      /* Ein leerer catch ist hier Absicht und dokumentiert: ein gesperrter
         localStorage oder eine stumme Live-Quelle darf den Rechner nicht anhalten. */
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Node: build scripts, the dev-server plugin, tests
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', '*.config.{js,ts}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
)
