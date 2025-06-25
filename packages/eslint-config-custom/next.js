import reactConfig from './react.js';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  ...reactConfig,
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      '@next/next/no-img-element': 'error',
      '@next/next/no-page-custom-font': 'warn',
      '@next/next/no-unwanted-polyfillio': 'error',
    },
  },
];
