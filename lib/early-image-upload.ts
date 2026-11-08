/**
 * Start uploading a new post's photo as soon as it's captured, so the
 * upload is (usually) finished by the time the user presses Post.
 *
 * One upload slot is kept at module scope, keyed by image data + user id.
 * - primeImageUpload(): start (or keep) the upload for this image.
 * - takeImageUpload(): hand the promise to the submit task (starting it if
 *   needed) and empty the slot, so later discards don't touch it.
 * - discardImageUpload(): the photo was retaken/removed; drop the promise and
 *   best-effort delete the orphaned file once it lands.
 */

import { deleteImage, generateImagePath, uploadImage } from "@/lib/storage"

export type ImageUploadResult = { url: string | null; error: Error | null }

interface UploadSlot {
  image: string
  userId: string
  promise: Promise<ImageUploadResult>
}

let slot: UploadSlot | null = null

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.82

/**
 * Downscale a data-URL image so its long edge is at most MAX_EDGE px and
 * re-encode it as JPEG. Returns the input unchanged when it is already small
 * enough or when the browser can't decode/encode it.
 */
export async function downscaleImageDataUrl(
  dataUrl: string,
  maxEdge: number = MAX_EDGE,
  quality: number = JPEG_QUALITY
): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined" || !dataUrl.startsWith("data:image")) {
    return dataUrl
  }
  try {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return dataUrl
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error("decode failed"))
      el.src = dataUrl
    })
    const { naturalWidth: w, naturalHeight: h } = img
    if (!w || !h || Math.max(w, h) <= maxEdge) return dataUrl
    const scale = maxEdge / Math.max(w, h)
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    // JPEG has no alpha: paint transparent PNGs onto white instead of black.
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const out = canvas.toDataURL("image/jpeg", quality)
    return out.startsWith("data:image/jpeg") ? out : dataUrl
  } catch {
    return dataUrl
  }
}

async function doUpload(image: string, userId: string): Promise<ImageUploadResult> {
  try {
    const data = await downscaleImageDataUrl(image)
    return await uploadImage(data, generateImagePath(userId, "posts"))
  } catch (error) {
    return { url: null, error: error as Error }
  }
}

function dropSlot(old: UploadSlot | null) {
  if (!old) return
  old.promise
    .then(({ url }) => {
      if (url) return deleteImage(url)
    })
    .catch(() => {})
}

/** Begin uploading `image` for `userId` unless that exact upload is already running. */
export function primeImageUpload(image: string, userId: string): Promise<ImageUploadResult> {
  if (slot && slot.image === image && slot.userId === userId) return slot.promise
  dropSlot(slot)
  slot = { image, userId, promise: doUpload(image, userId) }
  return slot.promise
}

/** Take ownership of the upload for `image` (reusing a primed one) and clear the slot. */
export function takeImageUpload(image: string, userId: string): Promise<ImageUploadResult> {
  if (slot && slot.image === image && slot.userId === userId) {
    const { promise } = slot
    slot = null
    return promise
  }
  dropSlot(slot)
  slot = null
  return doUpload(image, userId)
}

/** Forget the primed upload (photo removed or retaken). */
export function discardImageUpload() {
  dropSlot(slot)
  slot = null
}

/** Test helper. */
export function __peekImageUploadSlot() {
  return slot
}
