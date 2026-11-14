// SAST: static security rules (injection, unsafe regex, eval, child_process, ...).
// Any "error" finding fails the Code Quality Gate.
import security from 'eslint-plugin-security';
import globals from 'globals';

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    plugins: { security },
    rules: {
      ...Object.fromEntries(Object.keys(security.rules).map((r) => [`security/${r}`, 'error'])),
      // Bracket access on validated objects is common and noisy; keep it visible but non-blocking.
      'security/detect-object-injection': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
];
