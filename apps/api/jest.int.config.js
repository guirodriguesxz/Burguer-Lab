/** Testes de integração: sobem a aplicação Nest inteira contra um Postgres real (banco separado). */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: 'test/.*\\.int-spec\\.ts$',
  globalSetup: '<rootDir>/test/global-setup.ts',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  // Os testes compartilham um banco: executam um arquivo por vez.
  maxWorkers: 1,
  testTimeout: 30000,
}
