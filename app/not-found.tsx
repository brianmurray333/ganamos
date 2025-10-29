'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8">
          <div className="text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center">
              <span className="text-4xl">404</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Page Not Found</h2>
              <p className="text-muted-foreground text-sm">
                The page you're looking for doesn't exist.
              </p>
            </div>
            <Button
              onClick={() => window.location.href = '/'}
              className="w-full"
            >
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
