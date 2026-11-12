import { fileURLToPath } from 'node:url'

import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import skipFormatting from 'eslint-config-prettier/flat'

const zamnTokenizer = fileURLToPath(
  import.meta.resolve('vue-eslint-parser-template-tokenizer-zamn'),
)

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommended,

  {
    name: 'app/zamn-templates',
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        // Lets the rules above read <template lang="zamn">. Given as a path
        // so that vue-eslint-parser finds it from wherever it is installed,
        // and so that the config can be serialized for `--cache`.
        templateTokenizer: { zamn: zamnTokenizer },
      },
    },
  },

  // Formatting is Prettier's job. This also turns off the rules about how
  // HTML is laid out, which mean nothing in a zamn template.
  skipFormatting,
)
