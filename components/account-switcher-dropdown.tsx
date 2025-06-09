"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { AddConnectedAccountDialog } from "@/components/add-connected-account-dialog"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"

interface AccountSwitcherDropdownProps {
  triggerClassName?: string
  children: React.ReactNode
}

export function AccountSwitcherDropdown({ triggerClassName, children }: AccountSwitcherDropdownProps) {
  const {
    user,
    profile,
    signOut,
    isConnectedAccount,
    switchToAccount,
    resetToMainAccount,
    connectedAccounts,
    fetchConnectedAccounts,
  } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  // State for account management
  const [accountToManage, setAccountToManage] = useState<any>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Handle account management
  const handleAccountAction = (account: any) => {
    setAccountToManage(account)

    // Check if it's a child account (email ends with @ganamos.app)
    const isChildAccount = account.email?.endsWith("@ganamos.app")

    if (isChildAccount) {
      setShowDeleteDialog(true)
    } else {
      setShowDisconnectDialog(true)
    }
  }

  // Handle disconnect account
  const handleDisconnectAccount = async () => {
    if (!accountToManage || !user) return

    setIsProcessing(true)

    try {
      const response = await fetch("/api/disconnect-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          connectedAccountId: accountToManage.id,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || "Failed to disconnect account")
      }

      // If currently viewing the disconnected account, switch back to main
      if (isConnectedAccount && profile?.id === accountToManage.id) {
        resetToMainAccount()
      }

      // Refresh the connected accounts list
      fetchConnectedAccounts()

      toast({
        title: "Account disconnected",
        description: `${accountToManage.name} has been disconnected from your account.`,
      })

      setShowDisconnectDialog(false)
    } catch (error: any) {
      console.error("Error disconnecting account:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to disconnect account. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle delete child account
  const handleDeleteChildAccount = async () => {
    if (!accountToManage || !user) return

    setIsProcessing(true)

    try {
      const response = await fetch("/api/delete-child-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          childAccountId: accountToManage.id,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete child account")
      }

      // If currently viewing the deleted account, switch back to main
      if (isConnectedAccount && profile?.id === accountToManage.id) {
        resetToMainAccount()
      }

      // Refresh the connected accounts list
      fetchConnectedAccounts()

      toast({
        title: "Account deleted",
        description: `${accountToManage.name}'s account has been permanently deleted.`,
      })

      setShowDeleteDialog(false)
    } catch (error: any) {
      console.error("Error deleting child account:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to delete child account. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild className={triggerClassName}>
          {children}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 p-2">
          {/* Primary Account */}
          <DropdownMenuItem
            onClick={() => (!isConnectedAccount ? null : resetToMainAccount())}
            className={`p-4 ${!isConnectedAccount ? "bg-muted" : "cursor-pointer"}`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center max-w-[85%]">
                <div className="w-7 h-7 mr-2 overflow-hidden rounded-full flex-shrink-0">
                  <Image
                    src={user?.user_metadata?.avatar_url || "/placeholder.svg?height=24&width=24"}
                    alt={user?.user_metadata?.full_name || "Main Account"}
                    width={28}
                    height={28}
                    className="object-cover"
                  />
                </div>
                <span className="text-base truncate">{profile?.name || "Main Account"} (You)</span>
              </div>
              {!isConnectedAccount && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </div>
          </DropdownMenuItem>

          {/* Connected Accounts */}
          {connectedAccounts.map((account) => (
            <DropdownMenuItem
              key={account.id}
              onClick={() => (isConnectedAccount && profile?.id === account.id ? null : switchToAccount(account.id))}
              className={`p-4 ${isConnectedAccount && profile?.id === account.id ? "bg-muted" : "cursor-pointer"}`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center max-w-[75%]">
                  <div className="w-7 h-7 mr-2 overflow-hidden rounded-full flex-shrink-0">
                    <Image
                      src={account.avatar_url || "/placeholder.svg?height=24&width=24"}
                      alt={account.name}
                      width={28}
                      height={28}
                      className="object-cover"
                    />
                  </div>
                  <span className="text-base truncate">{account.name}</span>
                </div>
                <div className="flex items-center">
                  {isConnectedAccount && profile?.id === account.id && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-2 flex-shrink-0"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAccountAction(account)
                    }}
                  >
                    ×
                  </Button>
                </div>
              </div>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setShowAddAccountDialog(true)} className="p-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="24" y2="13" />
              <line x1="24" y1="8" x2="19" y2="13" />
            </svg>
            <span className="text-base">Add Connected Account</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={signOut} className="p-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16,17 21,12 16,7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="text-base">Log Out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Add Account Dialog */}
      <AddConnectedAccountDialog
        open={showAddAccountDialog}
        onOpenChange={setShowAddAccountDialog}
        onAccountAdded={fetchConnectedAccounts}
      />

      {/* Delete Child Account Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Child Account</DialogTitle>
            <DialogDescription>
              This will permanently delete {accountToManage?.name}'s account and all their data. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteChildAccount} disabled={isProcessing}>
              {isProcessing ? (
                <div className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Deleting...
                </div>
              ) : (
                "Delete Account"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disconnect Account Dialog */}
      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Account</DialogTitle>
            <DialogDescription>
              This will remove {accountToManage?.name} from your connected accounts. They will still have their own
              account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowDisconnectDialog(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={handleDisconnectAccount} disabled={isProcessing}>
              {isProcessing ? (
                <div className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Disconnecting...
                </div>
              ) : (
                "Disconnect Account"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
