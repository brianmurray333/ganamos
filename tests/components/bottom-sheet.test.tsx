/**
 * @vitest-environment jsdom
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BottomSheet, BottomSheetContent, BottomSheetTitle } from '@/components/ui/bottom-sheet'

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

beforeEach(() => {
  // Phone width: drag-to-dismiss is on
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any
})

function Sheet({ dismissible, onOpenChange }: { dismissible?: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <BottomSheet open onOpenChange={onOpenChange}>
      <BottomSheetContent
        dismissible={dismissible}
        onDismiss={() => onOpenChange(false)}
        aria-describedby={undefined}
        header={
          <div data-testid="header">
            <BottomSheetTitle>Title</BottomSheetTitle>
          </div>
        }
      >
        <div data-testid="body">
          <div data-testid="map" style={{ height: 200 }} />
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}

function drag(el: Element, distance: number) {
  fireEvent.pointerDown(el, { clientY: 100, pointerType: 'touch', button: 0, pointerId: 1 })
  fireEvent.pointerMove(el, { clientY: 100 + distance, pointerType: 'touch', pointerId: 1 })
  fireEvent.pointerUp(el, { clientY: 100 + distance, pointerType: 'touch', pointerId: 1 })
}

describe('BottomSheet', () => {
  it('dismisses by default via the X, Escape and a drag on the header', () => {
    const onOpenChange = vi.fn()
    render(<Sheet onOpenChange={onOpenChange} />)

    drag(screen.getByTestId('header'), 150)
    expect(onOpenChange).toHaveBeenCalledWith(false)

    onOpenChange.mockClear()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)

    onOpenChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('dismisses by default on an outside tap', async () => {
    const onOpenChange = vi.fn()
    render(<Sheet onOpenChange={onOpenChange} />)
    // Radix registers its outside-pointer listener on the next tick
    await new Promise((r) => setTimeout(r, 0))
    fireEvent.pointerDown(document.body)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('ignores a short drag', () => {
    const onOpenChange = vi.fn()
    render(<Sheet onOpenChange={onOpenChange} />)
    drag(screen.getByTestId('header'), 30)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('never drags from the body (e.g. panning a map inside it)', () => {
    const onOpenChange = vi.fn()
    render(<Sheet onOpenChange={onOpenChange} />)
    drag(screen.getByTestId('map'), 300)
    drag(screen.getByTestId('body'), 300)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog').style.transform).toBe('')
  })

  it('dismissible={false} blocks the X, drag, Escape and outside tap', async () => {
    const onOpenChange = vi.fn()
    render(<Sheet dismissible={false} onOpenChange={onOpenChange} />)
    await new Promise((r) => setTimeout(r, 0))

    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toBeDisabled()
    fireEvent.click(close)

    drag(screen.getByTestId('header'), 300)
    expect(screen.getByRole('dialog').style.transform).toBe('')

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.pointerDown(document.body)

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('becomes dismissible again when the flag flips back', () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<Sheet dismissible={false} onOpenChange={onOpenChange} />)
    rerender(<Sheet dismissible onOpenChange={onOpenChange} />)
    expect(screen.getByRole('button', { name: 'Close' })).not.toBeDisabled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
