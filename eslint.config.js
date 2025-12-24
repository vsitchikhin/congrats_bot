import antfu from '@antfu/eslint-config';

export default antfu(
  // Global options for antfu's config
  {
    // Explicitly provide path to tsconfig.json for type-aware linting
    typescript: {
      tsconfigPath: 'tsconfig.json',
    },

    // Disable features not used in this project
    vue: false,
    markdown: false,

    // Configure stylistic rules
    stylistic: {
      indent: 2,
      quotes: 'single',
      semi: true,
      braceStyle: '1tbs',
    },

    // Custom ignores
    ignores: [
      'dist',
      'node_modules',
      '.vscode',
    ],
  },

  // Rules for TypeScript files (BEHAVIORAL rules)
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },

  // General rules (BEHAVIORAL rules)
  {
    rules: {
      'prefer-promise-reject-errors': 'off',
      'node/prefer-global/process': 'off',
      'node/prefer-global/buffer': 'off',
    },
  },
);
