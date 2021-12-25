module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '__tests__/migrations/'],
  setupFiles: ['dotenv/config'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)']
}
