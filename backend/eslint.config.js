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
      'import/no-unresolved': ['error', { commonjs: true }],
      'import/named': 'off',
      'import/default': 'off',
      'import/namespace': 'off',
    },
  },
];
