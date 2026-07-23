// @ts-check

import { defineConfig, globalIgnores } from 'eslint/config';
import stf from '@shrinktofit/eslint-config';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

export default defineConfig([
  globalIgnores([
    'node_modules',
    'packages/*/dist',
    'packages/*/.deploy',
    'packages/*/lib',
  ]),
  {
    settings: {
      node: {
        version: '>=22.7.0',
      },
    },
  },
  ...stf.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: [
            'eslint.config.js',
            'packages/preview-shell/public/assets/*.js',
            'packages/*/vite.config.ts',
            'packages/*/vitest.config.ts',
          ],
        },
      },
    },
  },
  {
    files: ['*.vue', '**/*.vue'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        Editor: 'readonly',
      },
      parserOptions: {
        parser: '@typescript-eslint/parser',
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'vue/html-indent': ['error', 2],
      'vue/script-indent': ['error', 2, {
        switchCase: 0,
      }],
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
  {
    files: [
      'packages/preview-shell/public/assets/*.js',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        System: 'readonly',
      },
    },
  },
  {
    rules: {
      'n/no-extraneous-import': 'off',
      'n/no-unpublished-import': 'off',
    },
  },
  {
    files: [
      '**/*.vue',
    ],
    rules: {
      'n/no-unsupported-features/node-builtins': 'off',
    },
  },
  {
    files: [
      '**/*.ts',
    ],
    rules: {
      '@typescript-eslint/explicit-member-accessibility': ['error', {
        accessibility: 'no-public',
      }],
      '@typescript-eslint/member-ordering': ['error', {
        default: [
          'public-static-field',
          'public-static-accessor',
          'public-static-method',
          'public-constructor',
          'signature',
          'call-signature',
          'public-instance-field',
          'public-instance-accessor',
          'public-instance-method',
          'protected-static-field',
          'protected-static-accessor',
          'protected-static-method',
          'protected-constructor',
          'protected-instance-field',
          ['protected-instance-get', 'protected-instance-set'],
          'protected-instance-accessor',
          'protected-instance-method',
          'private-static-field',
          ['private-static-get', 'private-static-set'],
          'private-static-accessor',
          'private-static-method',
          'private-constructor',
          'private-instance-field',
          ['private-instance-get', 'private-instance-set'],
          'private-instance-accessor',
          'private-instance-method',
          'static-initialization',
        ],
      }],
      '@typescript-eslint/naming-convention': ['error', {
        selector: 'memberLike',
        modifiers: ['private'],
        format: ['camelCase'],
        leadingUnderscore: 'require',
      }],
    },
  },
]);
