import nextConfig from '@treksistem/eslint-config-custom/next.js';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  ...nextConfig,
  {
    ignores: ['.next/**', 'out/**', 'build/**'],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Disable problematic Next.js rules that are incompatible with ESLint v9
      '@next/next/no-duplicate-head': 'off',
    },
  },
];
