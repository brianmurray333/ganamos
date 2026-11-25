import { redirect } from "next/navigation"

// The old demo store page (fake checkout, unverified claims) was retired.
// Satoshi Pet is sold at satoshipet.com.
export default function PetStorePage() {
  redirect("https://satoshipet.com")
}
