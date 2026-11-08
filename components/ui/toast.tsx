"use client"

/**
 * shadcn/ui Toast (Base UI variant), ported to Tailwind v3 syntax.
 * Source: https://ui.shadcn.com/docs/components/base/toast
 *
 * On top of the shadcn component this file exports a sonner-compatible
 * `toast` API (toast(), toast.success(), toast.error(), ..., `action`,
 * `cancel`, `duration`, `id`, `icon`) so existing call sites only need to
 * change their import. The raw Base UI manager is exported as `toastManager`.
 */

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const toastManager = ToastPrimitive.createToastManager<ToastData>()

const DEFAULT_TIMEOUT = 4000

type ToastData = {
  icon?: React.ReactNode
  cancel?: { label: React.ReactNode; onClick?: () => void }
}

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        // Top center (like sonner's position="top-center"), below the iOS status bar / notch.
        "pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[100] mx-auto w-auto max-w-sm outline-none sm:inset-x-0 sm:w-full",
        className
      )}
      {...props}
    />
  )
}

function Toast({ className, swipeDirection = ["up", "left", "right"], ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      swipeDirection={swipeDirection}
      className={cn(
        // Top-anchored stack: the newest toast (index 0) sits at the top, older ones peek out below it.
        "group/toast pointer-events-auto absolute left-0 right-0 top-0 z-[calc(1000-var(--toast-index))] w-full origin-top select-none rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none will-change-transform focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)+calc(var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]",
        "h-[var(--height)] [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--peek))+(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]",
        // Invisible bridge across the gap above each toast so hover/expansion doesn't flicker.
        "after:absolute after:bottom-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "data-[expanded]:h-[var(--toast-height)] data-[expanded]:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-[limited]:opacity-0 data-[starting-style]:[transform:translateY(-150%)]",
        "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(-150%)]",
        "data-[ending-style]:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-[ending-style]:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-[ending-style]:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-[ending-style]:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "data-[expanded]:data-[ending-style]:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "data-[expanded]:data-[ending-style]:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-[expanded]:data-[ending-style]:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "data-[expanded]:data-[ending-style]:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        className
      )}
      {...props}
    />
  )
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        "flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-[250ms] ease-[cubic-bezier(0.22,1,0.36,1)] data-[behind]:opacity-0 data-[expanded]:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  )
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function ToastAction({
  className,
  render = <Button variant="outline" size="sm" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn("shrink-0", className)}
      {...props}
    />
  )
}

function ToastClose({
  className,
  children,
  render = <Button variant="ghost" size="icon" />,
  ...props
}: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="Close toast"
      render={render}
      className={cn(
        "relative h-7 w-7 shrink-0 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:text-foreground",
        className
      )}
      {...props}
    >
      {children ?? <X aria-hidden="true" />}
    </ToastPrimitive.Close>
  )
}

function ToastIcon({ type, icon }: { type: string | undefined; icon?: React.ReactNode }) {
  let content: React.ReactNode = icon ?? null

  if (content == null) {
    if (type === "success") content = <CircleCheck className="text-green-600 dark:text-green-500" aria-hidden="true" />
    if (type === "info") content = <Info aria-hidden="true" />
    if (type === "warning") content = <TriangleAlert className="text-amber-500" aria-hidden="true" />
    if (type === "error") content = <OctagonX className="text-destructive dark:text-red-500" aria-hidden="true" />
    if (type === "loading") content = <Loader2 className="animate-spin" aria-hidden="true" />
  }

  if (!content) return null

  return (
    <span
      data-slot="toast-icon"
      className="shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none"
    >
      {content}
    </span>
  )
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager<ToastData>()

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem}>
      <ToastContent>
        <ToastIcon type={toastItem.type} icon={toastItem.data?.icon} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        {toastItem.data?.cancel && (
          <ToastClose
            render={<Button variant="ghost" size="sm" />}
            className="h-9 w-auto after:hidden"
            aria-label={undefined}
            onClick={toastItem.data.cancel.onClick}
          >
            {toastItem.data.cancel.label}
          </ToastClose>
        )}
        <ToastAction />
        {!toastItem.data?.cancel && <ToastClose />}
      </ToastContent>
    </Toast>
  ))
}

/**
 * Base UI's manager only delivers toasts once the <Toaster> has subscribed.
 * Toasts fired earlier (e.g. auth errors during first render) are queued here
 * and flushed after mount, matching sonner's behavior.
 */
let toasterReady = false
const pendingToasts: Array<() => void> = []

function ToasterReadySignal() {
  React.useEffect(() => {
    // Defer past the provider's own subscribe effect, which runs after ours.
    const t = setTimeout(() => {
      toasterReady = true
      pendingToasts.splice(0).forEach((fn) => fn())
    }, 0)
    return () => {
      clearTimeout(t)
      toasterReady = false
    }
  }, [])
  return null
}

function whenReady(fn: () => void) {
  if (toasterReady || typeof window === "undefined") fn()
  else pendingToasts.push(fn)
}

function Toaster({
  children,
  toastManager: manager = toastManager,
  timeout = DEFAULT_TIMEOUT,
  ...props
}: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider toastManager={manager} timeout={timeout} {...props}>
      {children}
      <ToasterReadySignal />
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  )
}

/* ------------------------------------------------------------------ */
/* sonner-compatible API                                              */
/* ------------------------------------------------------------------ */

type ToastType = "success" | "error" | "info" | "warning" | "loading"

export interface ToastOptions {
  description?: React.ReactNode
  /** ms before auto-dismiss; Infinity or 0 keeps it open */
  duration?: number
  id?: string | number
  icon?: React.ReactNode
  action?: { label: React.ReactNode; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void }
  cancel?: { label: React.ReactNode; onClick?: () => void }
  onDismiss?: () => void
  onAutoClose?: () => void
  /** Accepted for compatibility with sonner call sites; ignored. */
  position?: string
  className?: string
}

function show(type: ToastType | undefined, title: React.ReactNode, options: ToastOptions = {}): string {
  const id = options.id != null ? String(options.id) : `toast-${Math.random().toString(36).slice(2)}`
  const timeout =
    options.duration === undefined
      ? type === "loading"
        ? 0
        : undefined
      : !Number.isFinite(options.duration)
        ? 0
        : options.duration
  const onClose = options.onDismiss ?? options.onAutoClose

  whenReady(() => {
    toastManager.add({
      id,
      type,
      title,
      description: options.description,
      timeout,
      priority: type === "error" ? "high" : "low",
      onClose,
      actionProps: options.action
        ? {
            children: options.action.label,
            onClick: (event) => {
              options.action!.onClick(event)
              toastManager.close(id)
            },
          }
        : undefined,
      data: { icon: options.icon, cancel: options.cancel },
    })
  })
  return id
}

type PromiseMessage<T> = React.ReactNode | ((value: T) => React.ReactNode)

const toast = Object.assign(
  (title: React.ReactNode, options?: ToastOptions) => show(undefined, title, options),
  {
    success: (title: React.ReactNode, options?: ToastOptions) => show("success", title, options),
    error: (title: React.ReactNode, options?: ToastOptions) => show("error", title, options),
    info: (title: React.ReactNode, options?: ToastOptions) => show("info", title, options),
    warning: (title: React.ReactNode, options?: ToastOptions) => show("warning", title, options),
    loading: (title: React.ReactNode, options?: ToastOptions) => show("loading", title, options),
    message: (title: React.ReactNode, options?: ToastOptions) => show(undefined, title, options),
    dismiss: (id?: string | number) => toastManager.close(id != null ? String(id) : undefined),
    promise: <T,>(
      promise: Promise<T>,
      messages: { loading: React.ReactNode; success: PromiseMessage<T>; error: PromiseMessage<unknown> }
    ) => {
      const id = show("loading", messages.loading)
      promise.then(
        (value) => {
          const title = typeof messages.success === "function" ? messages.success(value) : messages.success
          show("success", title, { id })
        },
        (err) => {
          const title = typeof messages.error === "function" ? messages.error(err) : messages.error
          show("error", title, { id })
        }
      )
      return promise
    },
  }
)

const createToastManager = ToastPrimitive.createToastManager
const useToastManager = ToastPrimitive.useToastManager

export {
  Toaster,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  toast,
  toastManager,
  useToastManager,
}
