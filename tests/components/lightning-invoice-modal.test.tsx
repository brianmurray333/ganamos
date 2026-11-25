/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

let resolvePayment: ((r: any) => void) | null = null
const payAnonymousRewardAction = vi.fn(
  () => new Promise((r) => { resolvePayment = r })
)
vi.mock('@/app/actions/post-actions', () => ({ payAnonymousRewardAction }))
vi.mock('@/lib/anonymous-claim', () => ({ getClaimToken: () => 'tok' }))

import { LightningInvoiceModal } from '@/components/lightning-invoice-modal'

beforeEach(() => {
  resolvePayment = null
  payAnonymousRewardAction.mockClear()
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any
})

function setup() {
  const onOpenChange = vi.fn()
  const onSuccess = vi.fn()
  render(
    <LightningInvoiceModal open onOpenChange={onOpenChange} rewardAmount={2000} postId="p1" onSuccess={onSuccess} />
  )
  return { onOpenChange, onSuccess }
}

async function startPayment() {
  fireEvent.change(screen.getByLabelText('Lightning Invoice or Address'), { target: { value: 'maria@getalby.com' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Withdraw/ }))
  })
  await screen.findByText('Processing Payment')
}

describe('LightningInvoiceModal (withdraw sheet)', () => {
  it('can be dismissed before a payment starts', () => {
    const { onOpenChange } = setup()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('cannot be closed by X or Escape while the payment is processing', async () => {
    const { onOpenChange } = setup()
    await startPayment()

    expect(payAnonymousRewardAction).toHaveBeenCalledWith('p1', 'maria@getalby.com', 'tok')
    expect(screen.getByText(/can.t be closed until the payment is done/i)).toBeInTheDocument()

    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toBeDisabled()
    fireEvent.click(close)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onOpenChange).not.toHaveBeenCalled()

    // Payment fails: back to the input step and closable again
    await act(async () => resolvePayment!({ success: false, error: 'nope' }))
    expect(await screen.findByText('nope')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).not.toBeDisabled()
  })

  it('stays locked on the success screen until it auto-closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { onOpenChange, onSuccess } = setup()
      await startPayment()
      await act(async () => resolvePayment!({ success: true, paymentHash: 'h' }))
      expect(await screen.findByText('Payment Sent!')).toBeInTheDocument()
      expect(onSuccess).toHaveBeenCalled()

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
      expect(onOpenChange).not.toHaveBeenCalled()

      act(() => { vi.advanceTimersByTime(2000) })
      expect(onOpenChange).toHaveBeenCalledWith(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
