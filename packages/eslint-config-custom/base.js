import tseslint from 'typescript-eslint';
import eslint from '@eslint/js';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      'prefer-const': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'warn',
      'no-var': 'error',
    },
  }
);
