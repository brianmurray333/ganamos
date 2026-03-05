'use client'

import { useEffect } from 'react'

export function DocsChrome() {
  useEffect(() => {
    document.documentElement.classList.add('dark')
    localStorage.setItem('theme', 'dark')
  }, [])

  return null
}
