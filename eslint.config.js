import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jestDom from 'eslint-plugin-jest-dom';
import testingLibrary from 'eslint-plugin-testing-library';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  unicorn.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.mjs', '*.js', 'vitest.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Build DOM with createElement/textContent.' },
        { property: 'outerHTML', message: 'Build DOM with createElement/textContent.' },
        { property: 'insertAdjacentHTML', message: 'Build DOM with createElement/textContent.' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      'unicorn/name-replacements': 'off',
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/no-null': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    ...testingLibrary.configs['flat/dom'],
  },
  {
    files: ['tests/**/*.ts'],
    ...jestDom.configs['flat/recommended'],
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'unicorn/max-nested-calls': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  prettier,
);
