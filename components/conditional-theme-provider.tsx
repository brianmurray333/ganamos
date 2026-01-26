"use client"

import { usePathname } from "next/navigation"
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes"
import * as React from "react"

export function ConditionalThemeProvider({
  children,
  ...props
}: { children: React.ReactNode } & ThemeProviderProps) {
  const pathname = usePathname()

  // Force light mode on home, login, and public job posting pages
  const isLightModePage = pathname === "/" || pathname.startsWith("/auth") || pathname === "/new"

  if (isLightModePage) {
    return (
      <NextThemesProvider {...props} forcedTheme="light">
        {children}
      </NextThemesProvider>
    )
  }

  // Use default theme provider with dark mode default for all other pages
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
