import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const forbiddenFromCore = [
  '**/render',
  '**/render/**',
  '**/ui',
  '**/ui/**',
  '**/app',
  '**/app/**',
  '**/audio',
  '**/audio/**',
  '**/solver',
  '**/solver/**',
];

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'node_modules', '.claude'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  // Architektur: engine und schema sind reiner, deterministischer Kern.
  {
    files: ['src/engine/**/*.ts', 'src/schema/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: forbiddenFromCore,
              message: 'engine/schema duerfen nicht aus render/ui/app/audio/solver importieren.',
            },
          ],
          paths: [{ name: 'pixi.js', message: 'engine/schema duerfen pixi.js nicht importieren.' }],
        },
      ],
    },
  },
  // Determinismus: kein Math.random, keine Zeit in der Engine.
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Engine ist deterministisch: kein Date.' },
        { name: 'performance', message: 'Engine ist deterministisch: kein performance.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Engine ist deterministisch: eigenen PRNG nutzen.',
        },
        { object: 'Date', property: 'now', message: 'Engine ist deterministisch: kein Date.' },
        {
          object: 'performance',
          property: 'now',
          message: 'Engine ist deterministisch: kein performance.',
        },
        {
          object: 'globalThis',
          property: 'Date',
          message: 'Engine ist deterministisch: kein Date.',
        },
        {
          object: 'globalThis',
          property: 'performance',
          message: 'Engine ist deterministisch: kein performance.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Engine ist deterministisch: kein Date.',
        },
        {
          selector: "MemberExpression[object.name='Math'][property.value='random']",
          message: 'Engine ist deterministisch: eigenen PRNG nutzen.',
        },
      ],
    },
  },
  prettier,
);
