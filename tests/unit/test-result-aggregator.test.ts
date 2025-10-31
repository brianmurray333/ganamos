import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import {
  parsePlaywrightResults,
  parseVitestResults,
  aggregateTestResults,
  type PlaywrightReport,
  type VitestCoverageResult,
} from '../../lib/test-result-aggregator'
import {
  VALID_PLAYWRIGHT_REPORT,
  VALID_VITEST_COVERAGE,
  MULTI_BROWSER_PLAYWRIGHT_REPORT,
  VITEST_COVERAGE_WITH_ERRORS,
  EMPTY_PLAYWRIGHT_REPORT,
  EMPTY_VITEST_COVERAGE,
  createPlaywrightReport,
  createTestWithRetries,
  createVitestCoverage,
} from '../fixtures/test-result-aggregator-fixtures'

// Mock fs module
vi.mock('fs')

describe('Test Result Aggregator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('parsePlaywrightResults', () => {
    const validPlaywrightReport: PlaywrightReport = {
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

    it('should successfully parse valid Playwright JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validPlaywrightReport))

      const result = parsePlaywrightResults('/path/to/playwright-report.json')

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.tests).toHaveLength(1)
      expect(result.data?.projects).toEqual(['chromium', 'firefox', 'webkit'])
      expect(result.data?.errors).toEqual([])
    })

    it('should return error when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = parsePlaywrightResults('/nonexistent/path.json')

      expect(result.success).toBe(false)
      expect(result.error).toContain('file not found')
      expect(result.data).toBeUndefined()
    })

    it('should return error when file is empty', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('')

      const result = parsePlaywrightResults('/path/to/empty.json')

      expect(result.success).toBe(false)
      expect(result.error).toContain('file is empty')
    })

    it('should return error when JSON is malformed', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json }')

      const result = parsePlaywrightResults('/path/to/malformed.json')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to parse Playwright JSON')
    })

    it('should handle empty suites array', () => {
      const emptyReport: PlaywrightReport = {
        config: { projects: [] },
        suites: [],
        errors: [],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(emptyReport))

      const result = parsePlaywrightResults('/path/to/empty-report.json')

      expect(result.success).toBe(true)
      expect(result.data?.tests).toEqual([])
      expect(result.data?.projects).toEqual([])
      expect(result.data?.errors).toEqual([])
    })

    it('should handle missing config.projects', () => {
      const reportWithoutProjects: PlaywrightReport = {
        suites: [],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(reportWithoutProjects))

      const result = parsePlaywrightResults('/path/to/report.json')

      expect(result.success).toBe(true)
      expect(result.data?.projects).toEqual([])
    })

    it('should extract tests from nested suites', () => {
      const nestedReport: PlaywrightReport = {
        suites: [
          {
            title: 'Parent Suite',
            suites: [
              {
                title: 'Child Suite',
                specs: [
                  {
                    title: 'Nested Test',
                    tests: [
                      {
                        title: 'nested test case',
                        projectName: 'firefox',
                        results: [{ status: 'passed', duration: 500 }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(nestedReport))

      const result = parsePlaywrightResults('/path/to/nested.json')

      expect(result.success).toBe(true)
      expect(result.data?.tests).toHaveLength(1)
      expect(result.data?.tests[0].title).toBe('nested test case')
      expect(result.data?.tests[0].projectName).toBe('firefox')
    })

    it('should include report errors in output', () => {
      const reportWithErrors: PlaywrightReport = {
        suites: [],
        errors: ['Error 1: Test timeout', 'Error 2: Browser crash'],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(reportWithErrors))

      const result = parsePlaywrightResults('/path/to/errors.json')

      expect(result.success).toBe(true)
      expect(result.data?.errors).toEqual([
        'Error 1: Test timeout',
        'Error 2: Browser crash',
      ])
    })

    it('should handle tests with retry results (multiple results array entries)', () => {
      const reportWithRetries: PlaywrightReport = {
        suites: [
          {
            title: 'Retry Suite',
            specs: [
              {
                title: 'Flaky Test',
                tests: [
                  {
                    title: 'test with retries',
                    projectName: 'chromium',
                    results: [
                      { status: 'failed', duration: 800 },
                      { status: 'failed', duration: 850 },
                      { status: 'passed', duration: 900 }, // Final attempt passed
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(reportWithRetries))

      const result = parsePlaywrightResults('/path/to/retries.json')

      expect(result.success).toBe(true)
      expect(result.data?.tests).toHaveLength(1)
      expect(result.data?.tests[0].results).toHaveLength(3)
    })

    it('should handle tests with attachments (screenshots, traces, videos)', () => {
      const reportWithAttachments: PlaywrightReport = {
        suites: [
          {
            title: 'Suite',
            specs: [
              {
                title: 'Spec',
                tests: [
                  {
                    title: 'test with artifacts',
                    projectName: 'webkit',
                    results: [
                      {
                        status: 'failed',
                        duration: 1200,
                        attachments: [
                          { name: 'screenshot', contentType: 'image/png', path: '/screenshots/1.png' },
                          { name: 'trace', contentType: 'application/zip', path: '/traces/1.zip' },
                          { name: 'video', contentType: 'video/webm', path: '/videos/1.webm' },
                        ],
                        error: {
                          message: 'Expected value to be true',
                          stack: 'Error: Expected value to be true\n  at test.ts:10',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(reportWithAttachments))

      const result = parsePlaywrightResults('/path/to/attachments.json')

      expect(result.success).toBe(true)
      expect(result.data?.tests[0].results[0].attachments).toHaveLength(3)
      expect(result.data?.tests[0].results[0].error).toBeDefined()
    })

    it('should handle file read errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = parsePlaywrightResults('/path/to/restricted.json')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to parse Playwright results')
      expect(result.error).toContain('Permission denied')
    })
  })

  describe('parseVitestResults', () => {
    const validVitestCoverage: VitestCoverageResult = {
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

    it('should successfully parse valid Vitest JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validVitestCoverage))

      const result = parseVitestResults('/path/to/coverage.json')

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.coverage.lines).toBe(85.5)
      expect(result.data?.coverage.statements).toBe(87.2)
      expect(result.data?.coverage.functions).toBe(75.0)
      expect(result.data?.coverage.branches).toBe(68.3)
      expect(result.data?.passed).toBe(45)
      expect(result.data?.failed).toBe(2)
      expect(result.data?.total).toBe(47)
    })

    it('should return error when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = parseVitestResults('/nonexistent/coverage.json')

      expect(result.success).toBe(false)
      expect(result.error).toContain('file not found')
      expect(result.data).toBeUndefined()
    })

    it('should return error when file is empty', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('')

      const result = parseVitestResults('/path/to/empty.json')

      expect(result.success).toBe(false)
      expect(result.error).toContain('file is empty')
    })

    it('should return error when JSON is malformed', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid: json }')

      const result = parseVitestResults('/path/to/malformed.json')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to parse Vitest JSON')
    })

    it('should fallback to 0 for missing coverage properties', () => {
      const incompleteCoverage: VitestCoverageResult = {
        total: {
          lines: { pct: 80 },
          // Missing statements, functions, branches
        },
        numPassedTests: 10,
        numFailedTests: 0,
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(incompleteCoverage))

      const result = parseVitestResults('/path/to/incomplete.json')

      expect(result.success).toBe(true)
      expect(result.data?.coverage.lines).toBe(80)
      expect(result.data?.coverage.statements).toBe(0)
      expect(result.data?.coverage.functions).toBe(0)
      expect(result.data?.coverage.branches).toBe(0)
    })

    it('should handle missing total coverage object', () => {
      const noTotal: VitestCoverageResult = {
        numPassedTests: 5,
        numFailedTests: 1,
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(noTotal))

      const result = parseVitestResults('/path/to/nototal.json')

      expect(result.success).toBe(true)
      expect(result.data?.coverage).toEqual({
        lines: 0,
        statements: 0,
        functions: 0,
        branches: 0,
      })
    })

    it('should calculate total tests when numTotalTests is missing', () => {
      const missingTotal: VitestCoverageResult = {
        numPassedTests: 20,
        numFailedTests: 3,
        // numTotalTests missing
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(missingTotal))

      const result = parseVitestResults('/path/to/calc-total.json')

      expect(result.success).toBe(true)
      expect(result.data?.total).toBe(23) // 20 + 3
    })

    it('should extract error messages from failed tests', () => {
      const coverageWithErrors: VitestCoverageResult = {
        total: { lines: { pct: 70 } },
        numPassedTests: 3,
        numFailedTests: 2,
        numTotalTests: 5,
        testResults: [
          {
            status: 'failed',
            name: 'test-file-1.test.ts',
            assertionResults: [
              {
                status: 'failed',
                title: 'should validate input',
                failureMessages: ['Expected 5 to equal 10', 'AssertionError at line 25'],
              },
            ],
          },
          {
            status: 'failed',
            name: 'test-file-2.test.ts',
            assertionResults: [
              {
                status: 'failed',
                title: 'should handle edge case',
                failureMessages: ['TypeError: Cannot read property of undefined'],
              },
            ],
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(coverageWithErrors))

      const result = parseVitestResults('/path/to/errors.json')

      expect(result.success).toBe(true)
      expect(result.data?.errors).toHaveLength(3)
      expect(result.data?.errors).toContain('Expected 5 to equal 10')
      expect(result.data?.errors).toContain('AssertionError at line 25')
      expect(result.data?.errors).toContain('TypeError: Cannot read property of undefined')
    })

    it('should handle empty testResults array', () => {
      const emptyResults: VitestCoverageResult = {
        total: { lines: { pct: 90 } },
        numPassedTests: 10,
        numFailedTests: 0,
        numTotalTests: 10,
        testResults: [],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(emptyResults))

      const result = parseVitestResults('/path/to/empty-results.json')

      expect(result.success).toBe(true)
      expect(result.data?.errors).toEqual([])
    })

    it('should handle file read errors gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Disk read error')
      })

      const result = parseVitestResults('/path/to/error.json')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to parse Vitest results')
      expect(result.error).toContain('Disk read error')
    })

    it('should handle boundary values for coverage percentages', () => {
      const boundaryCoverage: VitestCoverageResult = {
        total: {
          lines: { pct: 0 },
          statements: { pct: 100 },
          functions: { pct: 50.5 },
          branches: { pct: 99.99 },
        },
        numPassedTests: 100,
        numFailedTests: 0,
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(boundaryCoverage))

      const result = parseVitestResults('/path/to/boundary.json')

      expect(result.success).toBe(true)
      expect(result.data?.coverage.lines).toBe(0)
      expect(result.data?.coverage.statements).toBe(100)
      expect(result.data?.coverage.functions).toBe(50.5)
      expect(result.data?.coverage.branches).toBe(99.99)
    })
  })

  describe('aggregateTestResults', () => {
    const playwrightJsonPath = '/path/to/playwright.json'
    const vitestJsonPath = '/path/to/vitest.json'

    const mockPlaywrightReport: PlaywrightReport = {
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

    const mockVitestCoverage: VitestCoverageResult = {
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

    it('should successfully aggregate Playwright and Vitest results', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(mockPlaywrightReport))
        .mockReturnValueOnce(JSON.stringify(mockVitestCoverage))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.totalTests).toBe(52) // 5 Playwright + 47 Vitest
      expect(result.data?.passed).toBe(48) // 3 Playwright passed + 45 Vitest passed
      expect(result.data?.failed).toBe(3) // 1 Playwright failed + 2 Vitest failed
      expect(result.data?.skipped).toBe(1) // 1 Playwright skipped
    })

    it('should aggregate results by browser project', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(mockPlaywrightReport))
        .mockReturnValueOnce(JSON.stringify(mockVitestCoverage))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(true)
      expect(result.data?.browserResults).toEqual({
        chromium: { passed: 1, failed: 0, skipped: 0, duration: 1000 },
        firefox: { passed: 1, failed: 0, skipped: 0, duration: 1100 },
        webkit: { passed: 0, failed: 1, skipped: 0, duration: 1200 },
        'Mobile Chrome': { passed: 1, failed: 0, skipped: 0, duration: 1300 },
        'Mobile Safari': { passed: 0, failed: 0, skipped: 1, duration: 0 },
      })
    })

    it('should include coverage metrics from Vitest', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(mockPlaywrightReport))
        .mockReturnValueOnce(JSON.stringify(mockVitestCoverage))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(true)
      expect(result.data?.coverage).toEqual({
        lines: 85.5,
        statements: 87.2,
        functions: 75.0,
        branches: 68.3,
      })
    })

    it('should combine errors from both Playwright and Vitest', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(mockPlaywrightReport))
        .mockReturnValueOnce(JSON.stringify(mockVitestCoverage))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(true)
      expect(result.data?.errors).toHaveLength(2)
      expect(result.data?.errors).toContain('Browser timeout in webkit')
      expect(result.data?.errors).toContain('Expected 5 to equal 10')
    })

    it('should calculate total duration from Playwright tests', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(mockPlaywrightReport))
        .mockReturnValueOnce(JSON.stringify(mockVitestCoverage))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(true)
      // 1000 + 1100 + 1200 + 1300 + 0 = 4600
      expect(result.data?.duration).toBe(4600)
    })

    it('should return error when Playwright parsing fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Playwright')
      expect(result.data).toBeUndefined()
    })

    it('should return error when Vitest parsing fails', () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true) // Playwright file exists
        .mockReturnValueOnce(false) // Vitest file does not exist
      vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify(mockPlaywrightReport))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Vitest')
      expect(result.data).toBeUndefined()
    })

    it('should handle test retries correctly (use final result status)', () => {
      const reportWithRetries: PlaywrightReport = {
        suites: [
          {
            title: 'Retry Suite',
            specs: [
              {
                title: 'Flaky Test',
                tests: [
                  {
                    title: 'flaky test',
                    projectName: 'chromium',
                    results: [
                      { status: 'failed', duration: 800 },
                      { status: 'failed', duration: 850 },
                      { status: 'passed', duration: 900 }, // Final attempt passed
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(reportWithRetries))
        .mockReturnValueOnce(JSON.stringify(mockVitestCoverage))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(true)
      // Should count as passed (final result) not failed
      expect(result.data?.passed).toBe(46) // 1 Playwright passed + 45 Vitest passed
      expect(result.data?.failed).toBe(2) // Only 2 Vitest failed
      // Duration should use final attempt (900ms)
      expect(result.data?.browserResults.chromium.duration).toBe(900)
    })

    it('should handle empty Playwright results', () => {
      const emptyPlaywright: PlaywrightReport = {
        suites: [],
        errors: [],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(emptyPlaywright))
        .mockReturnValueOnce(JSON.stringify(mockVitestCoverage))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(true)
      expect(result.data?.totalTests).toBe(47) // Only Vitest tests
      expect(result.data?.passed).toBe(45)
      expect(result.data?.failed).toBe(2)
      expect(result.data?.browserResults).toEqual({})
    })

    it('should handle empty Vitest results', () => {
      const emptyVitest: VitestCoverageResult = {
        numPassedTests: 0,
        numFailedTests: 0,
        numTotalTests: 0,
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(mockPlaywrightReport))
        .mockReturnValueOnce(JSON.stringify(emptyVitest))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(true)
      expect(result.data?.totalTests).toBe(5) // Only Playwright tests
      expect(result.data?.coverage).toEqual({
        lines: 0,
        statements: 0,
        functions: 0,
        branches: 0,
      })
    })

    it('should handle tests with unknown project names', () => {
      const unknownProject: PlaywrightReport = {
        suites: [
          {
            title: 'Suite',
            specs: [
              {
                title: 'Spec',
                tests: [
                  {
                    title: 'test without project',
                    projectName: '', // Empty project name
                    results: [{ status: 'passed', duration: 500 }],
                  },
                ],
              },
            ],
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(unknownProject))
        .mockReturnValueOnce(JSON.stringify(mockVitestCoverage))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(true)
      expect(result.data?.browserResults).toHaveProperty('unknown')
      expect(result.data?.browserResults.unknown.passed).toBe(1)
    })

    it('should handle timedOut status as failed', () => {
      const timedOutReport: PlaywrightReport = {
        suites: [
          {
            title: 'Suite',
            specs: [
              {
                title: 'Spec',
                tests: [
                  {
                    title: 'slow test',
                    projectName: 'chromium',
                    results: [{ status: 'timedOut', duration: 30000 }],
                  },
                ],
              },
            ],
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(timedOutReport))
        .mockReturnValueOnce(JSON.stringify(mockVitestCoverage))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(true)
      // timedOut should be counted as failed
      expect(result.data?.failed).toBe(3) // 1 Playwright timedOut + 2 Vitest failed
      expect(result.data?.browserResults.chromium.failed).toBe(1)
    })

    it('should handle unexpected errors during aggregation', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Unexpected system error')
      })

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(false)
      // Error comes from parsePlaywrightResults, not from the outer aggregation try-catch
      expect(result.error).toContain('Failed to parse Playwright results')
      expect(result.error).toContain('Unexpected system error')
    })

    it('should handle tests with missing duration', () => {
      const noDurationReport: PlaywrightReport = {
        suites: [
          {
            title: 'Suite',
            specs: [
              {
                title: 'Spec',
                tests: [
                  {
                    title: 'instant test',
                    projectName: 'chromium',
                    results: [
                      {
                        status: 'passed',
                        duration: 0, // Zero duration
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(noDurationReport))
        .mockReturnValueOnce(JSON.stringify(mockVitestCoverage))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(true)
      expect(result.data?.duration).toBe(0)
      expect(result.data?.browserResults.chromium.duration).toBe(0)
    })

    it('should correctly aggregate across all 5 browser projects', () => {
      const allBrowsers: PlaywrightReport = {
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
            title: 'Cross-browser Suite',
            specs: [
              {
                title: 'Login Flow',
                tests: [
                  {
                    title: 'should login successfully',
                    projectName: 'chromium',
                    results: [{ status: 'passed', duration: 1500 }],
                  },
                  {
                    title: 'should login successfully',
                    projectName: 'firefox',
                    results: [{ status: 'passed', duration: 1600 }],
                  },
                  {
                    title: 'should login successfully',
                    projectName: 'webkit',
                    results: [{ status: 'passed', duration: 1700 }],
                  },
                  {
                    title: 'should login successfully',
                    projectName: 'Mobile Chrome',
                    results: [{ status: 'failed', duration: 1800 }],
                  },
                  {
                    title: 'should login successfully',
                    projectName: 'Mobile Safari',
                    results: [{ status: 'passed', duration: 1900 }],
                  },
                ],
              },
            ],
          },
        ],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify(allBrowsers))
        .mockReturnValueOnce(JSON.stringify(mockVitestCoverage))

      const result = aggregateTestResults(playwrightJsonPath, vitestJsonPath)

      expect(result.success).toBe(true)
      expect(Object.keys(result.data!.browserResults)).toHaveLength(5)
      expect(result.data?.browserResults.chromium.passed).toBe(1)
      expect(result.data?.browserResults.firefox.passed).toBe(1)
      expect(result.data?.browserResults.webkit.passed).toBe(1)
      expect(result.data?.browserResults['Mobile Chrome'].failed).toBe(1)
      expect(result.data?.browserResults['Mobile Safari'].passed).toBe(1)
      // Total duration: 1500 + 1600 + 1700 + 1800 + 1900 = 8500
      expect(result.data?.duration).toBe(8500)
    })
  })
})