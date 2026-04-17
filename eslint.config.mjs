import { globalIgnores } from 'eslint/config'
import hmppsConfig from '@ministryofjustice/eslint-config-hmpps'

export default [
  globalIgnores([
    '.next/**',
    'public/generated/**',
    'public/assets/**',
    'next-env.d.ts',
    'scripts/**/*.mjs',
    '.DS_Store',
    '**/.DS_Store',
  ]),
  {
    settings: {
      'import/core-modules': ['server-only'],
    },
  },
  ...hmppsConfig(),
  {
    files: ['src/app/**/route.ts'],
    rules: {
      'import/prefer-default-export': 'off',
    },
  },
  {
    files: ['src/lib/server/**/*.ts'],
    rules: {
      'import/prefer-default-export': 'off',
    },
  },
  {
    files: ['eslint.config.mjs'],
    rules: {
      'import/no-extraneous-dependencies': 'off',
    },
  },
]
