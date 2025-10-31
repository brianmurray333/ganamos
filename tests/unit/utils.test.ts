import { describe, it, expect } from 'vitest'
import { cn, formatSatsValue, formatTimeAgo } from '@/lib/utils'

describe('cn', () => {
  it('should merge single class string', () => {
    expect(cn('px-2 py-4')).toBe('px-2 py-4')
    expect(cn('text-center')).toBe('text-center')
  })

  it('should merge multiple class strings', () => {
    expect(cn('px-2', 'py-4', 'bg-blue-500')).toBe('px-2 py-4 bg-blue-500')
    expect(cn('flex', 'items-center', 'justify-between')).toBe('flex items-center justify-between')
  })

  it('should handle conditional classes with objects', () => {
    expect(cn('base-class', { 'active': true, 'disabled': false })).toBe('base-class active')
    expect(cn('btn', { 'btn-primary': true, 'btn-disabled': false })).toBe('btn btn-primary')
    expect(cn({ 'visible': true, 'hidden': false })).toBe('visible')
  })

  it('should handle conditional classes with arrays', () => {
    expect(cn(['px-2', 'py-4'])).toBe('px-2 py-4')
    expect(cn(['px-2', false, 'py-4'])).toBe('px-2 py-4')
    expect(cn(['flex', null, 'gap-4'])).toBe('flex gap-4')
  })

  it('should resolve Tailwind class conflicts', () => {
    // tailwind-merge should keep the last value for conflicting utilities
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
    expect(cn('h-10', 'h-full')).toBe('h-full')
    expect(cn('p-4', 'px-6')).toBe('p-4 px-6')
    expect(cn('rounded-md', 'rounded-lg')).toBe('rounded-lg')
  })

  it('should handle empty, null, and undefined inputs', () => {
    expect(cn()).toBe('')
    expect(cn('')).toBe('')
    expect(cn(undefined)).toBe('')
    expect(cn(null)).toBe('')
    expect(cn('px-2', undefined, 'py-4')).toBe('px-2 py-4')
    expect(cn('px-2', null, 'py-4', false)).toBe('px-2 py-4')
  })

  it('should handle complex combinations', () => {
    expect(cn(
      'base-class',
      { 'active': true, 'disabled': false },
      ['px-2', 'py-4'],
      'text-red-500',
      'text-blue-500' // Should override red
    )).toBe('base-class active px-2 py-4 text-blue-500')

    expect(cn(
      'flex items-center',
      { 'gap-4': true },
      ['px-2', 'px-4'], // px-4 should win
      undefined,
      'text-sm'
    )).toBe('flex items-center gap-4 px-4 text-sm')
  })

  it('should handle real-world component usage patterns', () => {
    // Pattern from Skeleton component
    expect(cn('animate-pulse rounded-md bg-muted', 'w-full h-20')).toBe('animate-pulse rounded-md bg-muted w-full h-20')

    // Pattern from Separator component with conditional orientation
    const orientation = 'horizontal'
    expect(cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
      'my-4'
    )).toBe('shrink-0 bg-border h-[1px] w-full my-4')
  })
})

describe('formatSatsValue', () => {
  it('should format small values correctly', () => {
    expect(formatSatsValue(0)).toBe('0 sats')
    expect(formatSatsValue(1)).toBe('1 sats')
    expect(formatSatsValue(999)).toBe('999 sats')
  })

  it('should format thousands correctly', () => {
    expect(formatSatsValue(1000)).toBe('1k sats')
    expect(formatSatsValue(1500)).toBe('1.5k sats')
    expect(formatSatsValue(10000)).toBe('10k sats')
  })

  it('should format millions correctly', () => {
    expect(formatSatsValue(1000000)).toBe('1M sats')
    expect(formatSatsValue(1500000)).toBe('1.5M sats')
    expect(formatSatsValue(10000000)).toBe('10M sats')
  })

  it('should handle edge cases and rounding', () => {
    expect(formatSatsValue(999999)).toBe('999k sats')
    expect(formatSatsValue(1234567)).toBe('1.2M sats')
    expect(formatSatsValue(99900)).toBe('99.9k sats')
    expect(formatSatsValue(100000000)).toBe('100M sats')
    expect(formatSatsValue(1234)).toBe('1.2k sats')
  })
})

describe('formatTimeAgo', () => {
  it('should return "1 min ago" for dates less than 60 seconds ago', () => {
    const now = new Date()
    const recentDates = [
      new Date(now.getTime() - 0),           // 0 seconds ago
      new Date(now.getTime() - 30 * 1000),   // 30 seconds ago
      new Date(now.getTime() - 59 * 1000),   // 59 seconds ago
    ]
    
    recentDates.forEach(date => {
      expect(formatTimeAgo(date)).toBe('1 min ago')
    })
  })

  it('should format minutes correctly', () => {
    const now = new Date()
    const oneMinuteAgo = new Date(now.getTime() - 1 * 60 * 1000)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)
    
    expect(formatTimeAgo(oneMinuteAgo)).toBe('1 min ago')
    expect(formatTimeAgo(fiveMinutesAgo)).toBe('5 mins ago')
    expect(formatTimeAgo(tenMinutesAgo)).toBe('10 mins ago')
    expect(formatTimeAgo(thirtyMinutesAgo)).toBe('30 mins ago')
  })

  it('should format hours correctly with abbreviation', () => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000)
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000)
    
    // date-fns returns "about X hour(s) ago", we transform to "X hr(s) ago"
    expect(formatTimeAgo(oneHourAgo)).toBe('1 hr ago')
    expect(formatTimeAgo(twoHoursAgo)).toBe('2 hrs ago')
    expect(formatTimeAgo(fiveHoursAgo)).toBe('5 hrs ago')
  })

  it('should format days correctly', () => {
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    
    expect(formatTimeAgo(oneDayAgo)).toBe('1 day ago')
    expect(formatTimeAgo(twoDaysAgo)).toBe('2 days ago')
    expect(formatTimeAgo(sevenDaysAgo)).toBe('7 days ago')
  })

  it('should format months correctly', () => {
    const now = new Date()
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    
    // date-fns returns "about X month(s) ago"
    const oneMonthResult = formatTimeAgo(oneMonthAgo)
    expect(oneMonthResult).toContain('month ago')
    expect(oneMonthResult).not.toContain('about')
    
    const twoMonthsResult = formatTimeAgo(twoMonthsAgo)
    expect(twoMonthsResult).toContain('months ago')
    expect(twoMonthsResult).not.toContain('about')
  })

  it('should format years correctly', () => {
    const now = new Date()
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000)
    
    const oneYearResult = formatTimeAgo(oneYearAgo)
    expect(oneYearResult).toContain('year ago')
    expect(oneYearResult).not.toContain('about')
    
    const twoYearsResult = formatTimeAgo(twoYearsAgo)
    expect(twoYearsResult).toContain('years ago')
    expect(twoYearsResult).not.toContain('about')
  })

  it('should remove "about" prefix from date-fns output', () => {
    const now = new Date()
    // Hour and month ranges typically include "about" in date-fns output
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    
    const hoursResult = formatTimeAgo(twoHoursAgo)
    expect(hoursResult).not.toContain('about')
    expect(hoursResult).toBe('2 hrs ago')
    
    const monthsResult = formatTimeAgo(oneMonthAgo)
    expect(monthsResult).not.toContain('about')
  })

  it('should abbreviate hours and minutes in output', () => {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
    
    // Should use "hr" not "hour"
    const hourResult = formatTimeAgo(oneHourAgo)
    expect(hourResult).toContain('hr')
    expect(hourResult).not.toContain('hour')
    
    // Should use "mins" not "minutes"
    const minutesResult = formatTimeAgo(fiveMinutesAgo)
    expect(minutesResult).toContain('mins')
    expect(minutesResult).not.toContain('minutes')
  })

  it('should handle boundary between seconds and minutes', () => {
    const now = new Date()
    const fiftyNineSecondsAgo = new Date(now.getTime() - 59 * 1000)
    const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000)
    const sixtyOneSecondsAgo = new Date(now.getTime() - 61 * 1000)
    
    // All should return "1 min ago" due to sub-60-second special handling
    expect(formatTimeAgo(fiftyNineSecondsAgo)).toBe('1 min ago')
    expect(formatTimeAgo(sixtySecondsAgo)).toBe('1 min ago')
    expect(formatTimeAgo(sixtyOneSecondsAgo)).toBe('1 min ago')
  })

  it('should handle edge case of current time', () => {
    const now = new Date()
    
    // Current time should return "1 min ago" (sub-60-second special case)
    expect(formatTimeAgo(now)).toBe('1 min ago')
  })
})