/**
 * Test fixtures for test-result-aggregator tests
 * Provides consistent mock data for Playwright and Vitest result structures
 */

import type {
  PlaywrightReport,
  VitestCoverageResult,
  PlaywrightTest,
} from '../../lib/test-result-aggregator'

/**
 * Valid Playwright report structure with basic test configuration
 */
export const VALID_PLAYWRIGHT_REPORT: PlaywrightReport = {
  config: {
    projects: [
      { name: 'chromium' },
      { name: 'firefox' },
      { name: 'webkit' },
    ],
  },
  suites: [
    {
      title: 'Test Suite',
      specs: [
        {
          title: 'Test Spec',
          tests: [
            {
              title: 'should pass test',
              projectName: 'chromium',
              results: [
                {
                  status: 'passed',
                  duration: 1000,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  errors: [],
}

/**
 * Valid Vitest coverage result structure with typical metrics
 */
export const VALID_VITEST_COVERAGE: VitestCoverageResult = {
  total: {
    lines: { pct: 85.5 },
    statements: { pct: 87.2 },
    functions: { pct: 75.0 },
    branches: { pct: 68.3 },
  },
  numPassedTests: 45,
  numFailedTests: 2,
  numTotalTests: 47,
  testResults: [],
}

/**
 * Playwright report covering all 5 browser projects with mixed results
 */
export const MULTI_BROWSER_PLAYWRIGHT_REPORT: PlaywrightReport = {
  config: {
    projects: [
      { name: 'chromium' },
      { name: 'firefox' },
      { name: 'webkit' },
      { name: 'Mobile Chrome' },
      { name: 'Mobile Safari' },
    ],
  },
  suites: [
    {
      title: 'E2E Tests',
      specs: [
        {
          title: 'Homepage',
          tests: [
            {
              title: 'should load homepage',
              projectName: 'chromium',
              results: [{ status: 'passed', duration: 1000 }],
            },
            {
              title: 'should load homepage',
              projectName: 'firefox',
              results: [{ status: 'passed', duration: 1100 }],
            },
            {
              title: 'should load homepage',
              projectName: 'webkit',
              results: [{ status: 'failed', duration: 1200 }],
            },
            {
              title: 'should load homepage',
              projectName: 'Mobile Chrome',
              results: [{ status: 'passed', duration: 1300 }],
            },
            {
              title: 'should load homepage',
              projectName: 'Mobile Safari',
              results: [{ status: 'skipped', duration: 0 }],
            },
          ],
        },
      ],
    },
  ],
  errors: ['Browser timeout in webkit'],
}

/**
 * Vitest coverage with error messages for failed tests
 */
export const VITEST_COVERAGE_WITH_ERRORS: VitestCoverageResult = {
  total: {
    lines: { pct: 85.5 },
    statements: { pct: 87.2 },
    functions: { pct: 75.0 },
    branches: { pct: 68.3 },
  },
  numPassedTests: 45,
  numFailedTests: 2,
  numTotalTests: 47,
  testResults: [
    {
      status: 'failed',
      name: 'utils.test.ts',
      assertionResults: [
        {
          status: 'failed',
          title: 'should format values',
          failureMessages: ['Expected 5 to equal 10'],
        },
      ],
    },
  ],
}

/**
 * Empty Playwright report with no tests
 */
export const EMPTY_PLAYWRIGHT_REPORT: PlaywrightReport = {
  config: { projects: [] },
  suites: [],
  errors: [],
}

/**
 * Empty Vitest coverage with no tests
 */
export const EMPTY_VITEST_COVERAGE: VitestCoverageResult = {
  numPassedTests: 0,
  numFailedTests: 0,
  numTotalTests: 0,
}

/**
 * Create a Playwright report with custom test data
 * @param tests Array of test definitions
 * @param projects Optional project names
 * @param errors Optional error messages
 */
export function createPlaywrightReport(
  tests: PlaywrightTest[],
  projects?: string[],
  errors?: string[]
): PlaywrightReport {
  return {
    config: projects
      ? { projects: projects.map((name) => ({ name })) }
      : undefined,
    suites: [
      {
        title: 'Test Suite',
        specs: [
          {
            title: 'Test Spec',
            tests,
          },
        ],
      },
    ],
    errors,
  }
}

/**
 * Create a Playwright test with retry results
 * @param projectName Browser project name
 * @param attempts Array of result statuses for each retry attempt
 * @param baseDuration Base duration in ms, incremented for each attempt
 */
export function createTestWithRetries(
  projectName: string,
  attempts: Array<'passed' | 'failed' | 'skipped' | 'timedOut'>,
  baseDuration = 800
): PlaywrightTest {
  return {
    title: 'test with retries',
    projectName,
    results: attempts.map((status, index) => ({
      status,
      duration: baseDuration + index * 50,
    })),
  }
}

/**
 * Create Vitest coverage result with custom values
 * @param params Coverage and test count parameters
 */
export function createVitestCoverage(params: {
  lines?: number
  statements?: number
  functions?: number
  branches?: number
  passed?: number
  failed?: number
  total?: number
}): VitestCoverageResult {
  return {
    total: {
      lines: { pct: params.lines ?? 0 },
      statements: { pct: params.statements ?? 0 },
      functions: { pct: params.functions ?? 0 },
      branches: { pct: params.branches ?? 0 },
    },
    numPassedTests: params.passed ?? 0,
    numFailedTests: params.failed ?? 0,
    numTotalTests: params.total ?? (params.passed ?? 0) + (params.failed ?? 0),
  }
}
