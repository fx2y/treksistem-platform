import baseConfig from '@treksistem/eslint-config-custom/base.js';

export default [
  ...baseConfig,
  {
    ignores: ['.wrangler/', 'dist/'],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // API-specific overrides
    },
  },
];
