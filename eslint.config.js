// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'functions/lib/*', 'functions/node_modules/*'],
  },
  {
    // React Native <Text> renders apostrophes as-is; this rule only matters for HTML.
    rules: { 'react/no-unescaped-entities': 'off' },
  },
]);
