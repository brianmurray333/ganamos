"use client"

import { usePathname } from "next/navigation"
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes"
import * as React from "react"

export function ConditionalThemeProvider({
  children,
  ...props
}: { children: React.ReactNode } & ThemeProviderProps) {
  const pathname = usePathname()

  // On docs.ganamos.earth, middleware rewrites / → /docs on the server, but
  // usePathname() returns "/" (browser URL) on the client after hydration.
  // Without this hostname check, pathname === "/" triggers forcedTheme="light",
  // overriding the dark theme the docs page needs.
  const isDocsDomain = typeof window !== 'undefined' &&
    window.location.hostname === 'docs.ganamos.earth'
  const isDocsPage = pathname === "/docs" || pathname.startsWith("/docs/")

  if (isDocsPage || isDocsDomain) {
    return (
      <NextThemesProvider {...props} forcedTheme="dark">
        {children}
      </NextThemesProvider>
    )
  }

  const isLightModePage = pathname.startsWith("/auth") || pathname === "/new"

  if (isLightModePage) {
    return (
      <NextThemesProvider {...props} forcedTheme="light">
        {children}
      </NextThemesProvider>
    )
  }

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
