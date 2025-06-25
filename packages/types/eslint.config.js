import baseConfig from '@treksistem/eslint-config-custom/base.js';

export default [
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Types-specific overrides
    },
  },
];
