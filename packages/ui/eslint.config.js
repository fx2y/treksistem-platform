import reactConfig from '@treksistem/eslint-config-custom/react.js';

export default [
  ...reactConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // UI component-specific overrides
    },
  },
];
