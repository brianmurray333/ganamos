"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  FileText,
  Search,
  MapPin,
  User,
  Calendar,
  Bitcoin,
  CheckCircle2,
  Clock,
  Eye,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { searchPosts } from "@/app/actions/admin-actions"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"

interface PostResult {
  id: string
  title: string
  description: string
  location: string | null
  reward: number
  fixed: boolean
  under_review: boolean
  created_at: string
  author: {
    id: string
    name: string
    username: string
  } | null
}

const ITEMS_PER_PAGE = 20

export default function AdminPostsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [posts, setPosts] = useState<PostResult[]>([])
  const [allPosts, setAllPosts] = useState<PostResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  
  const supabase = createBrowserSupabaseClient()

  // Load initial posts list
  useEffect(() => {
    const loadPosts = async () => {
      setIsLoading(true)
      try {
        const { data, error, count } = await supabase
          .from("posts")
          .select(`
            id, title, description, location, reward, fixed, under_review, created_at,
            author:user_id(id, name, username)
          `, { count: "exact" })
          .order("created_at", { ascending: false })
          .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1)

        if (error) throw error
        
        setAllPosts((data as any) || [])
        setTotalCount(count || 0)
      } catch (error) {
        console.error("Error loading posts:", error)
        toast.error("Failed to load posts")
      } finally {
        setIsLoading(false)
      }
    }

    if (!hasSearched) {
      loadPosts()
    }
  }, [currentPage, hasSearched, supabase])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) {
      setHasSearched(false)
      setPosts([])
      setCurrentPage(1)
      return
    }

    setIsSearching(true)
    setHasSearched(true)
    try {
      const result = await searchPosts(searchQuery)
      if (result.success && result.posts) {
        setPosts(result.posts)
      } else {
        toast.error(result.error || "Search failed")
        setPosts([])
      }
    } catch (error) {
      toast.error("Error searching posts")
      setPosts([])
    } finally {
      setIsSearching(false)
    }
  }

  const clearSearch = () => {
    setSearchQuery("")
    setHasSearched(false)
    setPosts([])
    setCurrentPage(1)
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)
  const displayPosts = hasSearched ? posts : allPosts

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Posts</h1>
        <p className="text-gray-400 mt-1">
          {hasSearched 
            ? `${posts.length} search result(s)` 
            : `${totalCount.toLocaleString()} total posts`}
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search by title, location, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-gray-900 border-gray-800 text-white"
          />
        </div>
        <Button type="submit" disabled={isSearching || !searchQuery.trim()}>
          {isSearching ? "Searching..." : "Search"}
        </Button>
        {hasSearched && (
          <Button type="button" variant="outline" onClick={clearSearch}>
            Clear
          </Button>
        )}
      </form>

      {/* Results */}
      {isLoading || isSearching ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : displayPosts.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">
              {hasSearched ? `No posts found matching "${searchQuery}"` : "No posts found"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {displayPosts.map((post) => (
              <Card key={post.id} className="bg-gray-900 border-gray-800">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-medium text-white">{post.title}</h3>
                        {post.fixed ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Fixed
                          </Badge>
                        ) : post.under_review ? (
                          <Badge className="bg-yellow-500/20 text-yellow-400">
                            <Eye className="w-3 h-3 mr-1" />
                            Under Review
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-500/20 text-blue-400">
                            <Clock className="w-3 h-3 mr-1" />
                            Open
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 line-clamp-2 mb-3">
                        {post.description}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-300">{post.location || "No location"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Bitcoin className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-300">{post.reward.toLocaleString()} sats</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <User className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-300">@{post.author?.username || "unknown"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-300">
                            {new Date(post.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3">
                        <p className="text-xs text-gray-500 font-mono">{post.id}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination - only show when not searching */}
          {!hasSearched && totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-gray-400">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
