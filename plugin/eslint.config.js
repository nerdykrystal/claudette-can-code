import tseslint from 'typescript-eslint';
import noDateStringCompare from './eslint-rules/no-date-string-compare.js';

export default tseslint.config(
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    rules: {
      complexity: ['error', 15],
      // Accept underscore-prefixed unused vars as intentional (standard convention).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    plugins: {
      'no-date-string-compare': { rules: { 'no-date-string-compare': noDateStringCompare } },
    },
    rules: {
      'no-date-string-compare/no-date-string-compare': 'error',
    },
  },
);
