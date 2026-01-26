"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { PostCard } from "@/components/post-card"
import { useAuth } from "@/components/auth-provider"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"
import type { Post } from "@/lib/types"
import { ArrowLeft } from "lucide-react"

export default function UserProfilePage({ params }: { params: { id: string } }) {
  const { user } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("all")
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [profileData, setProfileData] = useState<{
    id: string
    name: string
    email?: string
    avatar_url?: string
  } | null>(null)
  const supabase = createBrowserSupabaseClient()
  const userId = params.id

  // Check if viewing own profile
  const isOwnProfile = user?.id === userId

  useEffect(() => {
    const fetchProfileAndPosts = async () => {
      setIsLoading(true)
      try {
        // Fetch profile data (exclude deleted accounts)
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, name, email, avatar_url")
          .eq("id", userId)
          .neq("status", "deleted")
          .single()

        if (profileError) {
          console.error("Error fetching profile:", profileError)
          toast.error("Error", {
            description: "Failed to load user profile",
          })
          setIsLoading(false)
          return
        }

        setProfileData(profileData)

        // Fetch posts
        const { data: postsData, error: postsError } = await supabase
          .from("posts")
          .select(`
            *,
            group:group_id(
              id,
              name,
              description
            ),
            assigned_to_user:assigned_to(
              id,
              name
            )
          `)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })

        if (postsError) {
          console.error("Error fetching posts:", postsError)
          toast.error("Error", {
            description: "Failed to load user posts",
          })
          setIsLoading(false)
          return
        }

        setPosts(postsData || [])
      } catch (error) {
        console.error("Error in fetchProfileAndPosts:", error)
        toast.error("Error", {
          description: "An unexpected error occurred",
        })
      } finally {
        setIsLoading(false)
      }
    }

    if (userId) {
      fetchProfileAndPosts()
    }
  }, [userId, supabase, toast])

  const handleBack = () => {
    router.back()
  }

  // Format name to show full name
  const formatName = () => {
    if (!profileData?.name) return "User"
    return profileData.name
  }

  // Get initials for avatar fallback
  const getInitials = () => {
    if (!profileData?.name) return "U"
    return profileData.name
      .split(" ")
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase()
  }

  // Filter posts based on active tab
  const filteredPosts = () => {
    switch (activeTab) {
      case "open":
        return posts.filter((post) => !post.fixed)
      case "fixed":
        return posts.filter((post) => post.fixed)
      case "all":
      default:
        return posts
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  if (!profileData) {
    return (
      <div className="container px-4 py-6 mx-auto max-w-md">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">User not found</h2>
          <Button onClick={handleBack}>Go Back</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container px-4 py-6 mx-auto max-w-md">
      <div className="mb-4">
        <Button variant="ghost" onClick={handleBack} className="pl-0">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      <Card className="mb-6 border dark:border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="relative w-16 h-16 mr-4 overflow-hidden rounded-full">
                {profileData.avatar_url ? (
                  <Image
                    src={profileData.avatar_url || "/placeholder.svg"}
                    alt={formatName()}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xl font-bold">
                    {getInitials()}
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold">{formatName()}</h2>
                {isOwnProfile && profileData.email && (
                  <p className="text-sm text-muted-foreground">{profileData.email}</p>
                )}
              </div>
            </div>
          </div>

          <Separator className="my-4 dark:bg-gray-800" />

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {posts.length} {posts.length === 1 ? "post" : "posts"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 mb-4 dark:bg-gray-800/50">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="fixed">Fixed</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {filteredPosts().length > 0 ? (
            filteredPosts().map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No posts to display</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="open" className="space-y-4">
          {filteredPosts().length > 0 ? (
            filteredPosts().map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No open posts</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="fixed" className="space-y-4">
          {filteredPosts().length > 0 ? (
            filteredPosts().map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No fixed posts</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
