/**
 * Test Result Aggregation Service
 * 
 * Consolidates test results from multiple sources (Vitest unit/integration tests
 * and Playwright E2E tests) into a unified stakeholder report format.
 * 
 * This ensures accurate reporting of test outcomes across:
 * - 5 Playwright browser configurations (Desktop Chrome/Firefox/Safari, Mobile Chrome/Safari)
 * - Vitest unit and integration tests with V8 coverage
 * - Retry scenarios and failure artifacts
 */

import * as fs from 'fs'
import * as path from 'path'

/**
 * Playwright test result structure (from default HTML reporter JSON)
 */
export interface PlaywrightTestResult {
  status: 'passed' | 'failed' | 'skipped' | 'timedOut'
  duration: number
  attachments?: Array<{
    name: string
    contentType?: string
    path?: string
  }>
  error?: {
    message: string
    stack?: string
  }
}

export interface PlaywrightTest {
  title: string
  results: PlaywrightTestResult[]
  projectName: string
}

export interface PlaywrightReport {
  config?: {
    projects?: Array<{ name: string }>
  }
  suites: Array<{
    title: string
    suites?: Array<any>
    specs?: Array<{
      title: string
      tests: PlaywrightTest[]
    }>
  }>
  errors?: string[]
}

/**
 * Vitest coverage result structure (from V8 provider JSON output)
 */
export interface VitestCoverageResult {
  total?: {
    lines?: { pct?: number }
    statements?: { pct?: number }
    functions?: { pct?: number }
    branches?: { pct?: number }
  }
  numFailedTests?: number
  numPassedTests?: number
  numTotalTests?: number
  testResults?: Array<{
    status?: 'passed' | 'failed'
    name?: string
    assertionResults?: Array<{
      status?: 'passed' | 'failed'
      title?: string
      failureMessages?: string[]
    }>
  }>
}

/**
 * Unified aggregated test result format for stakeholder reporting
 */
export interface AggregatedTestResult {
  success: boolean
  data?: {
    totalTests: number
    passed: number
    failed: number
    skipped: number
    coverage: {
      lines: number
      statements: number
      functions: number
      branches: number
    }
    browserResults: Record<string, {
      passed: number
      failed: number
      skipped: number
      duration: number
    }>
    errors: string[]
    duration: number
  }
  error?: string
}

/**
 * Parse Playwright JSON results from default HTML reporter output
 * 
 * Handles:
 * - Multiple browser projects (chromium, firefox, webkit, Mobile Chrome, Mobile Safari)
 * - Test retries (test.results[] array with multiple attempts)
 * - Failure artifacts (screenshots, traces, videos)
 * 
 * @param jsonPath Path to Playwright JSON report file
 * @returns Parsed Playwright test data or error
 */
export function parsePlaywrightResults(jsonPath: string): {
  success: boolean
  data?: {
    tests: PlaywrightTest[]
    projects: string[]
    errors: string[]
  }
  error?: string
} {
  try {
    // Validate file exists
    if (!fs.existsSync(jsonPath)) {
      return {
        success: false,
        error: `Playwright results file not found: ${jsonPath}`,
      }
    }

    // Read and parse JSON
    const fileContent = fs.readFileSync(jsonPath, 'utf-8')
    if (!fileContent || fileContent.trim() === '') {
      return {
        success: false,
        error: 'Playwright results file is empty',
      }
    }

    let report: PlaywrightReport
    try {
      report = JSON.parse(fileContent)
    } catch (parseError) {
      return {
        success: false,
        error: `Failed to parse Playwright JSON: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`,
      }
    }

    // Extract project names
    const projects = report.config?.projects?.map(p => p.name) || []

    // Flatten test hierarchy (suites -> specs -> tests)
    const tests: PlaywrightTest[] = []
    const errors: string[] = report.errors || []

    const extractTests = (suites: Array<any>): void => {
      for (const suite of suites || []) {
        // Process specs in this suite
        if (suite.specs) {
          for (const spec of suite.specs) {
            if (spec.tests) {
              tests.push(...spec.tests)
            }
          }
        }
        // Recursively process nested suites
        if (suite.suites) {
          extractTests(suite.suites)
        }
      }
    }

    extractTests(report.suites || [])

    return {
      success: true,
      data: {
        tests,
        projects,
        errors,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse Playwright results: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Parse Vitest JSON results from V8 coverage provider output
 * 
 * Handles:
 * - Coverage metrics (lines, statements, functions, branches)
 * - Test pass/fail counts
 * - Individual test results with failure messages
 * 
 * @param jsonPath Path to Vitest JSON coverage file
 * @returns Parsed Vitest test data or error
 */
export function parseVitestResults(jsonPath: string): {
  success: boolean
  data?: {
    coverage: {
      lines: number
      statements: number
      functions: number
      branches: number
    }
    passed: number
    failed: number
    total: number
    errors: string[]
  }
  error?: string
} {
  try {
    // Validate file exists
    if (!fs.existsSync(jsonPath)) {
      return {
        success: false,
        error: `Vitest results file not found: ${jsonPath}`,
      }
    }

    // Read and parse JSON
    const fileContent = fs.readFileSync(jsonPath, 'utf-8')
    if (!fileContent || fileContent.trim() === '') {
      return {
        success: false,
        error: 'Vitest results file is empty',
      }
    }

    let result: VitestCoverageResult
    try {
      result = JSON.parse(fileContent)
    } catch (parseError) {
      return {
        success: false,
        error: `Failed to parse Vitest JSON: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`,
      }
    }

    // Extract coverage metrics with fallback to 0
    const coverage = {
      lines: result.total?.lines?.pct ?? 0,
      statements: result.total?.statements?.pct ?? 0,
      functions: result.total?.functions?.pct ?? 0,
      branches: result.total?.branches?.pct ?? 0,
    }

    // Extract test counts
    const passed = result.numPassedTests ?? 0
    const failed = result.numFailedTests ?? 0
    const total = result.numTotalTests ?? passed + failed

    // Extract error messages from failed tests
    const errors: string[] = []
    if (result.testResults) {
      for (const testResult of result.testResults) {
        if (testResult.status === 'failed' && testResult.assertionResults) {
          for (const assertion of testResult.assertionResults) {
            if (assertion.status === 'failed' && assertion.failureMessages) {
              errors.push(...assertion.failureMessages)
            }
          }
        }
      }
    }

    return {
      success: true,
      data: {
        coverage,
        passed,
        failed,
        total,
        errors,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse Vitest results: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Aggregate test results from Playwright and Vitest into unified stakeholder report
 * 
 * Consolidates:
 * - Playwright E2E results across 5 browser configurations
 * - Vitest unit/integration test results with coverage
 * - Retry scenarios (uses final result status for each test)
 * - All error messages for stakeholder visibility
 * 
 * @param playwrightJsonPath Path to Playwright JSON report
 * @param vitestJsonPath Path to Vitest JSON coverage file
 * @returns Aggregated test result with success/failure breakdown
 */
export function aggregateTestResults(
  playwrightJsonPath: string,
  vitestJsonPath: string
): AggregatedTestResult {
  try {
    // Parse Playwright results
    const playwrightResult = parsePlaywrightResults(playwrightJsonPath)
    if (!playwrightResult.success || !playwrightResult.data) {
      return {
        success: false,
        error: playwrightResult.error || 'Failed to parse Playwright results',
      }
    }

    // Parse Vitest results
    const vitestResult = parseVitestResults(vitestJsonPath)
    if (!vitestResult.success || !vitestResult.data) {
      return {
        success: false,
        error: vitestResult.error || 'Failed to parse Vitest results',
      }
    }

    const { tests: playwrightTests, errors: playwrightErrors } = playwrightResult.data
    const { coverage, passed: vitestPassed, failed: vitestFailed, errors: vitestErrors } = vitestResult.data

    // Aggregate Playwright results by browser project
    const browserResults: Record<string, {
      passed: number
      failed: number
      skipped: number
      duration: number
    }> = {}

    let playwrightPassed = 0
    let playwrightFailed = 0
    let playwrightSkipped = 0
    let totalDuration = 0

    for (const test of playwrightTests) {
      const projectName = test.projectName || 'unknown'
      
      if (!browserResults[projectName]) {
        browserResults[projectName] = {
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
        }
      }

      // Use final result status (last attempt in results array for retry scenarios)
      const finalResult = test.results[test.results.length - 1]
      if (!finalResult) continue

      const duration = finalResult.duration || 0
      browserResults[projectName].duration += duration
      totalDuration += duration

      switch (finalResult.status) {
        case 'passed':
          browserResults[projectName].passed++
          playwrightPassed++
          break
        case 'failed':
        case 'timedOut':
          browserResults[projectName].failed++
          playwrightFailed++
          break
        case 'skipped':
          browserResults[projectName].skipped++
          playwrightSkipped++
          break
      }
    }

    // Combine all errors
    const allErrors = [...playwrightErrors, ...vitestErrors]

    // Calculate totals
    const totalTests = playwrightTests.length + vitestResult.data.total
    const totalPassed = playwrightPassed + vitestPassed
    const totalFailed = playwrightFailed + vitestFailed
    const totalSkipped = playwrightSkipped

    return {
      success: true,
      data: {
        totalTests,
        passed: totalPassed,
        failed: totalFailed,
        skipped: totalSkipped,
        coverage,
        browserResults,
        errors: allErrors,
        duration: totalDuration,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to aggregate test results: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}