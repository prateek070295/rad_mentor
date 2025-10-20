module.exports = {
  extends: ['react-app', 'react-app/jest'],
  plugins: ['import'],
  rules: {
    'import/order': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
};
