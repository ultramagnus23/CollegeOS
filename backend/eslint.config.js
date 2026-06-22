const importPlugin = require('eslint-plugin-import');

module.exports = [
  {
    files: ['src/**/*.js'],
    ignores: ['node_modules/**', 'coverage/**'],
    plugins: {
      import: importPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // 'warn' (not 'error') so the rule is introduced without a flag-day failure:
      // it currently surfaces real pre-existing dead requires in src/app.js
      // (../../scripts/seed*, ../../jobs/orchestrator) that are fixed separately.
      'import/no-unresolved': ['warn', { commonjs: true }],
      'import/named': 'off',
      'import/default': 'off',
      'import/namespace': 'off',
    },
  },
];
