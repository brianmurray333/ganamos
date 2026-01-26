"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/auth-provider";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/loading-spinner";

export default function SettingsPage() {
  const { user, profile, updateProfile, loading, session, sessionLoaded } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [currentSort, setCurrentSort] = useState<"Recent" | "Nearby" | "Reward">("Recent");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load initial values
  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setUsername(profile.username || "");
    }
    // Load sort preference from localStorage
    try {
      const savedSort = localStorage.getItem("ganamos_feed_sort");
      if (savedSort && ["Recent", "Nearby", "Reward"].includes(savedSort)) {
        setCurrentSort(savedSort as "Recent" | "Nearby" | "Reward");
      }
    } catch (e) {}
  }, [profile]);

  // Track changes
  useEffect(() => {
    if (profile) {
      const nameChanged = name !== (profile.name || "");
      const usernameChanged = username !== (profile.username || "");
      setHasChanges(nameChanged || usernameChanged);
    }
  }, [name, username, profile]);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionLoaded && !session) {
      router.push("/auth/login");
    }
  }, [sessionLoaded, session, router]);

  const handleSave = async () => {
    if (!hasChanges) return;

    const trimmedName = name.trim();
    const trimmedUsername = username.trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      toast.error("Invalid Name", {
        description: "Name must be at least 2 characters long.",
      });
      return;
    }

    if (!trimmedUsername || trimmedUsername.length < 3) {
      toast.error("Invalid Username", {
        description: "Username must be at least 3 characters long.",
      });
      return;
    }

    // Validate username format
    if (!/^[a-z0-9-]+$/.test(trimmedUsername)) {
      toast.error("Invalid Username", {
        description: "Username can only contain lowercase letters, numbers, and hyphens.",
      });
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({ 
        name: trimmedName, 
        username: trimmedUsername 
      });
      toast.success("Settings saved", {
        description: "Your profile has been updated.",
      });
      setHasChanges(false);
    } catch (error: any) {
      toast.error("Update Failed", {
        description: error.message?.includes('duplicate') 
          ? "Username already taken. Please choose another." 
          : "Failed to update profile.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSortChange = (sort: "Recent" | "Nearby" | "Reward") => {
    setCurrentSort(sort);
    localStorage.setItem("ganamos_feed_sort", sort);
    toast.success("Sort preference saved", {
      description: `Feed will now sort by ${sort.toLowerCase()}.`,
    });
  };

  if (sessionLoaded && !session) {
    return null;
  }

  if (loading || !user || !profile) {
    return (
      <div className="min-h-screen bg-white dark:bg-background">
        <div className="container px-4 pt-6 mx-auto max-w-md">
          <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
            <LoadingSpinner />
          </div>
        </div>
      </div>
    );
  }

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Header */}
      <div className="bg-white dark:bg-card">
        <div className="container px-4 py-4 mx-auto max-w-md">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Account settings</h1>
          </div>
        </div>
      </div>

      <div className="container px-4 py-6 mx-auto max-w-md pb-24">
        {/* Profile Settings */}
        <Card className="mb-4 shadow-lg rounded-2xl border-0 bg-white dark:bg-card">
          <CardContent className="p-6 space-y-5">
            <div>
              <Label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="mt-1.5 rounded-xl border-gray-200 dark:border-gray-700"
              />
            </div>

            <div>
              <Label htmlFor="username" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Username
              </Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">@</span>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="username"
                  className="pl-8 rounded-xl border-gray-200 dark:border-gray-700"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                Only lowercase letters, numbers, and hyphens
              </p>
            </div>

            {hasChanges && (
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full rounded-xl"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Theme Settings */}
        <Card className="mb-4 shadow-lg rounded-2xl border-0 bg-white dark:bg-card">
          <CardContent className="p-6">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">
              Theme
            </Label>
            <div className="flex gap-3">
              <button
                onClick={() => setTheme("light")}
                className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                  theme === "light"
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-500">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                  </svg>
                  <span className="text-sm font-medium">Light</span>
                </div>
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                  theme === "dark"
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-500">
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                  <span className="text-sm font-medium">Dark</span>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Sort Preference */}
        <Card className="mb-4 shadow-lg rounded-2xl border-0 bg-white dark:bg-card">
          <CardContent className="p-6">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">
              Sort Feed By
            </Label>
            <div className="space-y-2">
              {(["Recent", "Nearby", "Reward"] as const).map((sort) => (
                <button
                  key={sort}
                  onClick={() => handleSortChange(sort)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                    currentSort === sort
                      ? "bg-primary/10 border border-primary"
                      : "bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  <span className="font-medium">{sort}</span>
                  {currentSort === sort && (
                    <Check className="w-5 h-5 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

