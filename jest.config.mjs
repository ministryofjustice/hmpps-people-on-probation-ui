export default {
  transform: {
    '^.+\\.tsx?$': ['ts-jest'],
  },
  collectCoverageFrom: ['server/**/*.{ts,js,jsx,mjs}', 'assets/js/lib/**/*.{ts,js}'],
  testMatch: ['<rootDir>/(server|job)/**/?(*.)(cy|test).{ts,js,jsx,mjs}', '<rootDir>/assets/js/**/?(*.)(test).{ts,js}'],
  testEnvironment: 'node',
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test_results/jest/',
      },
    ],
    [
      './node_modules/jest-html-reporter',
      {
        outputPath: 'test_results/unit-test-reports.html',
      },
    ],
  ],
  moduleFileExtensions: ['web.js', 'js', 'json', 'node', 'ts'],
}
