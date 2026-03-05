'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'

export function DocsChrome() {
  const { setTheme } = useTheme()

  useEffect(() => {
    setTheme('dark')
  }, [setTheme])

  return null
}
