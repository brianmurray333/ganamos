/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

vi.mock('@/components/auth-provider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/supabase', () => ({ createBrowserSupabaseClient: () => ({}) }))
vi.mock('@/components/ui/toast', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))
// Stand-in for the camera scanner: same contract, no camera
vi.mock('@/components/qr-scanner', () => ({
  QRScanner: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="scanner" className="fixed inset-0 z-[60]">
        <button onClick={onClose}>Close scanner</button>
      </div>
    ) : null,
}))

import { AddConnectedAccountDialog } from '@/components/add-connected-account-dialog'

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any
})

describe('AddConnectedAccountDialog (sheet)', () => {
  it('opens the scanner inside the sheet so it stays focusable and clickable', () => {
    const onOpenChange = vi.fn()
    render(<AddConnectedAccountDialog open onOpenChange={onOpenChange} onAccountAdded={vi.fn()} />)
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('Add Connected Account')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Scan QR Code/ }))
    const scanner = screen.getByTestId('scanner')
    expect(sheet.contains(scanner)).toBe(true)

    const closeScanner = within(scanner).getByRole('button', { name: 'Close scanner' })
    closeScanner.focus()
    expect(document.activeElement).toBe(closeScanner)
    fireEvent.click(closeScanner)
    expect(screen.queryByTestId('scanner')).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('Escape over the scanner closes only the scanner', () => {
    const onOpenChange = vi.fn()
    render(<AddConnectedAccountDialog open onOpenChange={onOpenChange} onAccountAdded={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Scan QR Code/ }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByTestId('scanner')).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('title follows the view', () => {
    render(<AddConnectedAccountDialog open onOpenChange={vi.fn()} onAccountAdded={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Child Account' }))
    expect(screen.getByRole('heading', { name: 'Create Child Account' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: /Find by Username/ }))
    expect(screen.getByRole('heading', { name: 'Find User' })).toBeInTheDocument()
  })
})
