// 자동 코드 검사 (npm run lint). 개발할 때만 쓰는 도구로, 서버·병원 PC 동작과는 관계없습니다.
// 쓰지 않는 코드, 없는 이름 사용, React 훅 순서 실수(화면이 하얗게 멈추는 원인) 같은 것을 찾아 줍니다.
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const common = {
  'no-undef': 'error',
  // 일부러 빼고 쓰는 값({ a, ...rest })과 catch 의 오류 이름은 봐 줌
  'no-unused-vars': ['error', { ignoreRestSiblings: true, caughtErrors: 'none' }],
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'data/**', 'tests/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, __BUILD_TIME__: 'readonly' },
    },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...common,
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['server.js', 'scripts/**/*.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: common,
  },
];
