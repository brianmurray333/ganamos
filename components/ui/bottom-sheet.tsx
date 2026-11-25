"use client"

/**
 * iOS-style bottom sheet on Radix Dialog (focus trap, Escape, outside tap,
 * screen-reader semantics come from Dialog). Edge to edge, anchored to the
 * bottom of the screen, rounded top corners, grab handle, slides up; drag the
 * handle/header down to dismiss. Pads for the home indicator.
 * On desktop (lg, where the desktop header shows) it becomes a full-height
 * drawer that slides in from the right.
 *
 * Only the handle/header area starts a drag; the scrolling body (and anything
 * in it, e.g. a map) never moves the sheet. Pass `dismissible={false}` to
 * block every dismiss path (X, drag, Escape, outside tap) while something
 * must not be interrupted, such as a payment in flight.
 */

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export const BottomSheet = DialogPrimitive.Root
export const BottomSheetTrigger = DialogPrimitive.Trigger
export const BottomSheetTitle = DialogPrimitive.Title
export const BottomSheetDescription = DialogPrimitive.Description

const DISMISS_DISTANCE = 90 // px dragged down to close

type ContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /** Fixed area above the scrolling body (title etc.); also the drag area */
  header?: React.ReactNode
  onDismiss?: () => void
  /**
   * false blocks the X, drag-to-dismiss, Escape and outside tap; the handle
   * and X are dimmed. Default true.
   */
  dismissible?: boolean
}

export const BottomSheetContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, ContentProps>(
  (
    {
      className,
      children,
      header,
      onDismiss,
      dismissible = true,
      style,
      onEscapeKeyDown,
      onPointerDownOutside,
      onInteractOutside,
      ...props
    },
    ref
  ) => {
    const [dragY, setDragY] = React.useState(0)
    const start = React.useRef<number | null>(null)

    const onPointerDown = (e: React.PointerEvent) => {
      if (!dismissible) return
      if (e.pointerType === "mouse" && e.button !== 0) return
      // Drag-to-dismiss is a bottom-sheet gesture; not for the desktop drawer
      if (window.matchMedia("(min-width: 1024px)").matches) return
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
      if (dragY > DISMISS_DISTANCE && dismissible) onDismiss?.()
      setDragY(0)
    }

    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            // Phone: bottom sheet
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full flex-col rounded-t-[20px] border-t bg-background shadow-2xl outline-none sm:max-w-md sm:border-x",
            "pb-[env(safe-area-inset-bottom)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:duration-300 data-[state=closed]:duration-200 ease-out",
            // Desktop: right-hand drawer
            "lg:inset-y-0 lg:left-auto lg:right-0 lg:mx-0 lg:h-[100dvh] lg:max-h-none lg:w-[420px] lg:max-w-[420px] lg:rounded-none lg:border-y-0 lg:border-l lg:border-r-0 lg:pb-0",
            "lg:data-[state=open]:slide-in-from-bottom-0 lg:data-[state=open]:slide-in-from-right lg:data-[state=closed]:slide-out-to-bottom-0 lg:data-[state=closed]:slide-out-to-right",
            className
          )}
          style={{
            ...style,
            transform: dragY ? `translateY(${dragY}px)` : style?.transform,
            transition: start.current === null ? "transform 200ms ease-out" : "none",
          }}
          {...props}
          onEscapeKeyDown={(e) => {
            onEscapeKeyDown?.(e)
            if (!dismissible) e.preventDefault()
          }}
          onPointerDownOutside={(e) => {
            onPointerDownOutside?.(e)
            if (!dismissible) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            onInteractOutside?.(e)
            if (!dismissible) e.preventDefault()
          }}
        >
          <div
            className="shrink-0 touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <div className="flex justify-center pb-1 pt-2 lg:hidden" aria-hidden="true" data-sheet-handle="">
              <div className={cn("h-1.5 w-10 rounded-full bg-muted-foreground/30", !dismissible && "opacity-40")} />
            </div>
            {header}
          </div>
          {children}
          <DialogPrimitive.Close
            disabled={!dismissible}
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full opacity-70 transition-opacity hover:bg-accent hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    )
  }
)
BottomSheetContent.displayName = "BottomSheetContent"
