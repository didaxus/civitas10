module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  ignorePatterns: [
    'backend/node_modules/**',
    'node_modules/**',
    'dist/**',
    'frontend/dist/**',
    'frontend/node_modules/**',
    'coverage/**',
  ],
  rules: {},
};
