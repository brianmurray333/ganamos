import type { Metadata } from "next"
import OrderView from "./order-view"

// Order pages hold buyer details: keep them out of search engines, and don't
// leak the ?t= access token to other sites through the Referer header.
export const metadata: Metadata = {
  title: "Your Order - Satoshi Pet",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default function OrderPage({
  params,
  searchParams,
}: {
  params: { orderNumber: string }
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const t = searchParams?.t
  const accessToken = typeof t === "string" ? t : null
  return <OrderView orderNumber={decodeURIComponent(params.orderNumber)} accessToken={accessToken} />
}
