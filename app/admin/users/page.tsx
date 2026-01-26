"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  Users,
  Search,
  User,
  Mail,
  Wallet,
  Calendar,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { searchUsers } from "@/app/actions/admin-actions"
import { createBrowserSupabaseClient } from "@/lib/supabase"
import { toast } from "sonner"

interface UserResult {
  id: string
  email: string | null
  name: string
  username: string
  balance: number
  created_at: string
  avatar_url: string | null
}

const ITEMS_PER_PAGE = 20

export default function AdminUsersPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [users, setUsers] = useState<UserResult[]>([])
  const [allUsers, setAllUsers] = useState<UserResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  
  const supabase = createBrowserSupabaseClient()

  // Load initial users list
  useEffect(() => {
    const loadUsers = async () => {
      setIsLoading(true)
      try {
        const { data, error, count } = await supabase
          .from("profiles")
          .select("id, email, name, username, balance, created_at, avatar_url", { count: "exact" })
          .order("created_at", { ascending: false })
          .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1)

        if (error) throw error
        
        setAllUsers(data || [])
        setTotalCount(count || 0)
      } catch (error) {
        console.error("Error loading users:", error)
        toast.error("Failed to load users")
      } finally {
        setIsLoading(false)
      }
    }

    if (!hasSearched) {
      loadUsers()
    }
  }, [currentPage, hasSearched, supabase])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) {
      setHasSearched(false)
      setUsers([])
      setCurrentPage(1)
      return
    }

    setIsSearching(true)
    setHasSearched(true)
    try {
      const result = await searchUsers(searchQuery)
      if (result.success && result.users) {
        setUsers(result.users)
      } else {
        toast.error(result.error || "Search failed")
        setUsers([])
      }
    } catch (error) {
      toast.error("Error searching users")
      setUsers([])
    } finally {
      setIsSearching(false)
    }
  }

  const clearSearch = () => {
    setSearchQuery("")
    setHasSearched(false)
    setUsers([])
    setCurrentPage(1)
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)
  const displayUsers = hasSearched ? users : allUsers

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Users</h1>
        <p className="text-gray-400 mt-1">
          {hasSearched 
            ? `${users.length} search result(s)` 
            : `${totalCount.toLocaleString()} total users`}
        </p>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search by email, username, or ID..."
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
      ) : displayUsers.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">
              {hasSearched ? `No users found matching "${searchQuery}"` : "No users found"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {displayUsers.map((user) => (
              <Card key={user.id} className="bg-gray-900 border-gray-800">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-6 h-6 text-gray-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-white">{user.name}</h3>
                        <span className="text-gray-500">@{user.username}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-300">{user.email || "No email"}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Wallet className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-300">{user.balance.toLocaleString()} sats</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-300">
                            Joined {new Date(user.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3">
                        <p className="text-xs text-gray-500 font-mono">{user.id}</p>
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
