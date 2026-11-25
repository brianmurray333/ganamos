/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// jsdom has no PointerEvent; without it clientY/pointerType are dropped
if (typeof (window as any).PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    pointerType: string
    constructor(type: string, init: any = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'mouse'
    }
  }
  ;(window as any).PointerEvent = PointerEventPolyfill
}

const createDonationInvoice = vi.fn()
const checkDonationPayment = vi.fn()
vi.mock('@/app/actions/donation-actions', () => ({
  createDonationInvoice: (...a: any[]) => createDonationInvoice(...a),
  checkDonationPayment: (...a: any[]) => checkDonationPayment(...a),
}))
vi.mock('@/lib/supabase', () => ({
  createBrowserSupabaseClient: () => {
    const q: any = {}
    for (const m of ['from', 'select', 'order', 'eq', 'neq', 'is']) q[m] = () => q
    q.then = (r: any) => r({ data: [], error: null })
    return q
  },
}))
vi.mock('@/components/qr-code', () => ({ default: () => <div data-testid="qr" /> }))
// The map: a plain gesture surface
vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="map" /> }))

import { DonationModal } from '@/components/donation-modal'

beforeEach(() => {
  createDonationInvoice.mockReset()
  checkDonationPayment.mockReset().mockResolvedValue({ success: true, settled: false })
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any
})

function drag(el: Element, distance: number) {
  fireEvent.pointerDown(el, { clientY: 100, pointerType: 'touch', button: 0, pointerId: 1 })
  fireEvent.pointerMove(el, { clientY: 100 + distance, pointerType: 'touch', pointerId: 1 })
  fireEvent.pointerUp(el, { clientY: 100 + distance, pointerType: 'touch', pointerId: 1 })
}

describe('DonationModal (sheet)', () => {
  it('has the short title and orange Bitcoin logos on the amounts', () => {
    render(<DonationModal open onOpenChange={vi.fn()} preSelectedLocation="Mission District" />)
    expect(screen.getByRole('heading', { name: 'Donate Bitcoin' })).toBeInTheDocument()
    const amount = screen.getByRole('button', { name: /1K sats/ })
    expect(amount.querySelector('img')?.getAttribute('src')).toBe('/images/bitcoin-logo.png')
  })

  it('panning the map never drags the sheet closed; the header still does', () => {
    const onOpenChange = vi.fn()
    render(<DonationModal open onOpenChange={onOpenChange} preSelectedLocation="Mission District" />)
    const map = screen.getByTestId('map')
    expect(map.parentElement!.className).toContain('touch-none')

    drag(map, 400)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog').style.transform).toBe('')

    drag(screen.getByRole('heading', { name: 'Donate Bitcoin' }), 200)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('invoice step polls and the manual "I\'ve Paid" step still works', async () => {
    createDonationInvoice.mockResolvedValue({ success: true, paymentRequest: 'lnbc1' + 'x'.repeat(60), paymentHash: 'h1' })
    render(<DonationModal open onOpenChange={vi.fn()} preSelectedLocation="Mission District" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /10K sats/ }))
    })
    expect(createDonationInvoice).toHaveBeenCalledWith({ amount: 10000, locationType: 'city', locationName: 'Mission District' })
    expect(await screen.findByTestId('qr')).toBeInTheDocument()
    expect(checkDonationPayment).toHaveBeenCalledWith('h1')

    fireEvent.click(screen.getByRole('button', { name: /I've Paid \(Manual\)/ }))
    expect(screen.getByText('Thank you for your donation!')).toBeInTheDocument()
  })

  it('closing while an invoice is pending closes, as before', async () => {
    createDonationInvoice.mockResolvedValue({ success: true, paymentRequest: 'lnbc1' + 'x'.repeat(60), paymentHash: 'h1' })
    const onOpenChange = vi.fn()
    render(<DonationModal open onOpenChange={onOpenChange} preSelectedLocation="Mission District" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /1K sats/ }))
    })
    await screen.findByTestId('qr')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
