"use client"

/**
 * iOS-style bottom sheet on Radix Dialog (focus trap, Escape, outside tap,
 * screen-reader semantics come from Dialog). Edge to edge, anchored to the
 * bottom of the screen, rounded top corners, grab handle, slides up; drag the
 * handle/header down to dismiss. Pads for the home indicator. On wider
 * screens it stays a centered column.
 */

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export const BottomSheet = DialogPrimitive.Root
export const BottomSheetTitle = DialogPrimitive.Title
export const BottomSheetDescription = DialogPrimitive.Description

const DISMISS_DISTANCE = 90 // px dragged down to close

type ContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /** Fixed area above the scrolling body (title etc.); also the drag area */
  header?: React.ReactNode
  onDismiss?: () => void
}

export const BottomSheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, ContentProps>(
  ({ className, children, header, onDismiss, style, ...props }, ref) => {
    const [dragY, setDragY] = React.useState(0)
    const start = React.useRef<number | null>(null)

    const onPointerDown = (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      start.current = e.clientY
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    }
    const onPointerMove = (e: React.PointerEvent) => {
      if (start.current === null) return
      setDragY(Math.max(0, e.clientY - start.current))
    }
    const onPointerEnd = () => {
      if (start.current === null) return
      start.current = null
      if (dragY > DISMISS_DISTANCE) onDismiss?.()
      setDragY(0)
    }

    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full flex-col rounded-t-[20px] border-t bg-background shadow-2xl outline-none sm:max-w-md sm:border-x",
            "pb-[env(safe-area-inset-bottom)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:duration-300 data-[state=closed]:duration-200 ease-out",
            className
          )}
          style={{
            ...style,
            transform: dragY ? `translateY(${dragY}px)` : style?.transform,
            transition: start.current === null ? "transform 200ms ease-out" : "none",
          }}
          {...props}
        >
          <div
            className="shrink-0 touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <div className="flex justify-center pb-1 pt-2" aria-hidden="true">
              <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
            </div>
            {header}
          </div>
          {children}
          <DialogPrimitive.Close className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full opacity-70 transition-opacity hover:bg-accent hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    )
  }
)
BottomSheetContent.displayName = "BottomSheetContent"
