import { NextRequest } from "next/server"

/**
 * Utilities for extracting and handling device identity safely.
 */

/**
 * Return a masked representation of a deviceId for logs.
 * Examples:
 * - 12345678-90ab-cdef -> 1234…ef
 * - abcdef -> abcd…ef
 */
export function maskDeviceId(deviceId: string | null | undefined): string {
  const id = (deviceId || "").toString()
  if (id.length <= 6) return id ? `${id[0]}…${id.slice(-1)}` : ""
  return `${id.slice(0, 4)}…${id.slice(-2)}`
}

/**
 * Extracts deviceId from headers first, then URL query, then optional body.
 * - Header: X-Device-Id
 * - Query: deviceId
 * - Body: deviceId (when provided by caller)
 */
export function getDeviceIdFromRequest(
  request: NextRequest,
  body?: Record<string, any> | null
): string | null {
  const headerVal = request.headers.get("x-device-id")
  if (headerVal && headerVal.trim()) return headerVal.trim()

  const { searchParams } = new URL(request.url)
  const queryVal = searchParams.get("deviceId")
  if (queryVal && queryVal.trim()) return queryVal.trim()

  const bodyVal =
    body && typeof body === "object" ? (body as any).deviceId : undefined
  if (bodyVal && typeof bodyVal === "string" && bodyVal.trim()) {
    return bodyVal.trim()
  }

  return null
}

/**
 * Extract pairing code from headers first, then URL query, then optional body.
 * - Header: X-Pairing-Code
 * - Query: pairingCode
 * - Body: pairingCode (when provided by caller)
 * Uppercases the value for consistent DB lookups.
 */
export function getPairingCodeFromRequest(
  request: NextRequest,
  body?: Record<string, any> | null
): string | null {
  const headerVal = request.headers.get("x-pairing-code")
  if (headerVal && headerVal.trim()) return headerVal.trim().toUpperCase()

  const { searchParams } = new URL(request.url)
  const queryVal = searchParams.get("pairingCode")
  if (queryVal && queryVal.trim()) return queryVal.trim().toUpperCase()

  const bodyVal =
    body && typeof body === "object" ? (body as any).pairingCode : undefined
  if (bodyVal && typeof bodyVal === "string" && bodyVal.trim()) {
    return bodyVal.trim().toUpperCase()
  }

  return null
}

