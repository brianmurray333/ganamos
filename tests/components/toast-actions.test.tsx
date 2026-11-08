/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { Toaster, toast } from '@/components/ui/toast'

async function mount() {
  render(<Toaster />)
  // Let the toaster subscribe (it flushes queued toasts after mount)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('compact toast actions', () => {
  it('runs the action callback when its text is tapped', async () => {
    await mount()
    const onClick = vi.fn()
    act(() => {
      toast('New join request', { description: 'Annie wants to join', action: { label: 'Review', onClick } })
    })
    fireEvent.click(await screen.findByText('Review'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('runs the cancel callback of a confirm toast', async () => {
    await mount()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    act(() => {
      toast('Remove Kit from family?', { action: { label: 'Remove', onClick: onConfirm }, cancel: { label: 'Cancel', onClick: onCancel } })
    })
    fireEvent.click(await screen.findByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('shows the description instead of a generic "Error" title, and expands extra detail on tap', async () => {
    await mount()
    act(() => {
      toast.error('Error', { description: 'Failed to upload image.' })
      toast('Post created', { description: '2,000 sats reward is live.' })
    })
    expect((await screen.findAllByText('Failed to upload image.')).length).toBeGreaterThan(0)
    expect(screen.queryByText('2,000 sats reward is live.')).toBeNull()
    fireEvent.click(screen.getByText('Post created'))
    await waitFor(() => expect(screen.getByText('2,000 sats reward is live.')).toBeTruthy())
  })
})
