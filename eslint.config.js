import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Flat config (ESLint 9). Lightweight on purpose: catch real problems, not style.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Underscore-prefixed args/vars are intentional (e.g. autograd `_backward`, `_prev`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // We use `Value` graph mutation and a few controlled non-null assertions.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
