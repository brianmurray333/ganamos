/**
 * In-memory store for mock Lightning invoices
 * Manages invoice state and auto-settlement for development/testing
 */

import { serverEnv } from './env'

export interface MockInvoiceState {
  rHash: string
  rHashBase64: string
  paymentRequest: string
  value: number
  memo: string
  createdAt: Date
  settled: boolean
  settledAt?: Date
  preimage?: string
  addIndex: string
}

class MockInvoiceStore {
  private invoices: Map<string, MockInvoiceState> = new Map()
  private addIndexCounter = 1

  /**
   * Create and store a new mock invoice
   */
  createInvoice(value: number, memo: string): MockInvoiceState {
    // Generate a unique r_hash (32 bytes hex)
    const rHash = this.generateRHash()
    const rHashBase64 = this.hexToBase64(rHash)

    // Generate mock BOLT11 invoice
    const paymentRequest = this.generateBolt11(value, memo)

    // Generate preimage (will be revealed when settled)
    const preimage = this.generatePreimage()

    const invoice: MockInvoiceState = {
      rHash,
      rHashBase64,
      paymentRequest,
      value,
      memo,
      createdAt: new Date(),
      settled: false,
      preimage,
      addIndex: String(this.addIndexCounter++),
    }

    this.invoices.set(rHash, invoice)

    // Auto-settle after configured delay
    if (serverEnv?.lightning.mockAutoSettleMs) {
      this.scheduleAutoSettle(rHash, serverEnv.lightning.mockAutoSettleMs)
    }

    return invoice
  }

  /**
   * Get invoice by r_hash (hex or base64)
   */
  getInvoice(rHash: string): MockInvoiceState | undefined {
    // Try hex first
    let invoice = this.invoices.get(rHash)
    if (invoice) return invoice

    // Try converting from base64 to hex
    try {
      const hexHash = this.base64ToHex(rHash)
      invoice = this.invoices.get(hexHash)
      if (invoice) return invoice
    } catch (e) {
      // Not valid base64, continue
    }

    return undefined
  }

  /**
   * Manually settle an invoice
   */
  settleInvoice(rHash: string): boolean {
    const invoice = this.getInvoice(rHash)
    if (!invoice) return false

    if (!invoice.settled) {
      invoice.settled = true
      invoice.settledAt = new Date()
    }

    return true
  }

  /**
   * Get all invoices (for debugging)
   */
  getAllInvoices(): MockInvoiceState[] {
    return Array.from(this.invoices.values())
  }

  /**
   * Clear all invoices (for testing)
   */
  clear(): void {
    this.invoices.clear()
    this.addIndexCounter = 1
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private generateRHash(): string {
    // Generate 32 random bytes as hex string
    const bytes = new Uint8Array(32)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes)
    } else {
      // Fallback for Node.js
      const nodeCrypto = require('crypto')
      nodeCrypto.randomFillSync(bytes)
    }
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  private generatePreimage(): string {
    // Generate 32 random bytes as hex string
    return this.generateRHash()
  }

  private generateBolt11(value: number, memo: string): string {
    // Generate a realistic-looking BOLT11 invoice
    // Format: lnbc<amount><multiplier>1<data><checksum>
    const timestamp = Math.floor(Date.now() / 1000).toString(36)
    const random = this.generateRHash().substring(0, 16)

    // Convert amount to bitcoin denomination
    let amountStr = ''
    if (value > 0) {
      // Convert satoshis to bitcoin and format
      if (value >= 100000000) {
        // 1+ BTC
        amountStr = String(value / 100000000)
      } else if (value >= 100000) {
        // mBTC (millibitcoin)
        amountStr = String(value / 100000) + 'm'
      } else if (value >= 100) {
        // uBTC (microbitcoin)
        amountStr = String(value / 100) + 'u'
      } else {
        // nBTC (nanobitcoin) - 10 satoshis
        amountStr = String(value * 10) + 'n'
      }
    }

    return `lnbc${amountStr}1mock${timestamp}${random}`
  }

  private hexToBase64(hex: string): string {
    const bytes = new Uint8Array(
      hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    )
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64')
    } else {
      // Browser fallback
      return btoa(String.fromCharCode(...bytes))
    }
  }

  private base64ToHex(base64: string): string {
    let bytes: Uint8Array
    if (typeof Buffer !== 'undefined') {
      bytes = new Uint8Array(Buffer.from(base64, 'base64'))
    } else {
      // Browser fallback
      const binary = atob(base64)
      bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
    }
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  private scheduleAutoSettle(rHash: string, delayMs: number): void {
    setTimeout(() => {
      const invoice = this.invoices.get(rHash)
      if (invoice && !invoice.settled) {
        invoice.settled = true
        invoice.settledAt = new Date()
        console.log(`[Mock Lightning] Auto-settled invoice ${rHash.substring(0, 8)}... after ${delayMs}ms`)
      }
    }, delayMs)
  }
}

// Singleton instance that survives Next.js hot reloads and route compilations
// This pattern ensures the same store is used across all route handlers
const globalForInvoices = globalThis as unknown as {
  invoiceStore: MockInvoiceStore | undefined
}

export const mockInvoiceStore = globalForInvoices.invoiceStore ?? new MockInvoiceStore()

// Store reference in globalThis so it survives module reloads
if (!globalForInvoices.invoiceStore) {
  globalForInvoices.invoiceStore = mockInvoiceStore
}
