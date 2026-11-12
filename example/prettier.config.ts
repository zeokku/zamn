import type { Config } from 'prettier'

export default {
  semi: false,
  singleQuote: false,
  printWidth: 100,
  // Formats <template lang="zamn">.
  plugins: ['prettier-plugin-zamn'],
} satisfies Config
