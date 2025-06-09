"use client"

import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import AccountSwitcher from "./AccountSwitcher"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icons } from "@/components/icons"

async function getActiveProfile(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profiles } = await supabase.from("profiles").select("*").eq("id", user.id).single()

  return profiles
}

export default async function Dashboard() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete({ name, ...options })
        },
      },
    },
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/")
  }

  const profile = await getActiveProfile(supabase)

  async function signOut() {
    "use server"

    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete({ name, ...options })
          },
        },
      },
    )
    await supabase.auth.signOut()
    redirect("/")
  }

  return (
    <div className="container py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
              <div className="flex items-center space-x-2">
                <Avatar>
                  <AvatarImage
                    src={profile?.avatar_url || "/placeholder.svg?height=32&width=32"}
                    alt={profile?.name || "User"}
                  />
                  <AvatarFallback>{profile?.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span>{profile?.name}</span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <AccountSwitcher />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer">
              <Icons.logout className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4">
          <h3 className="text-lg font-semibold">Total Revenue</h3>
          <p className="text-2xl font-bold">$1,250</p>
        </div>
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4">
          <h3 className="text-lg font-semibold">New Customers</h3>
          <p className="text-2xl font-bold">235</p>
        </div>
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4">
          <h3 className="text-lg font-semibold">Products Sold</h3>
          <p className="text-2xl font-bold">1,500</p>
        </div>
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4">
          <h3 className="text-lg font-semibold">Conversion Rate</h3>
          <p className="text-2xl font-bold">12%</p>
        </div>
      </div>
    </div>
  )
}
