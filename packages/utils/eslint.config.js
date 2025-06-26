import baseConfig from '@treksistem/eslint-config-custom/base.js';

export default [
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js', 'benchmark.ts'],
  },
];
