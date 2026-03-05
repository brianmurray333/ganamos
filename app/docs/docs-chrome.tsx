'use client'

import { useEffect } from 'react'

export function DocsChrome() {
  useEffect(() => {
    document.documentElement.classList.add('dark')
    document.body.classList.add('docs-standalone')

    return () => {
      document.body.classList.remove('docs-standalone')
    }
  }, [])

  return (
    <style>{`
      .docs-standalone header.fixed { display: none !important; }
      .docs-standalone #bottom-nav { display: none !important; }
      .docs-standalone main { padding-top: 0 !important; }
    `}</style>
  )
}
