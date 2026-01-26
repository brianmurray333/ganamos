import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function Loading() {
  return (
    <div className="container px-4 py-6 mx-auto max-w-md">
      <div className="mb-4">
        <Skeleton className="h-9 w-20" />
      </div>

      <Card className="mb-6 border dark:border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center">
            <Skeleton className="h-16 w-16 rounded-full mr-4" />
            <div>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>

          <Separator className="my-4 dark:bg-gray-800" />

          <div className="text-center">
            <Skeleton className="h-4 w-20 mx-auto" />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4 dark:bg-gray-800/50">
          <TabsTrigger value="all" disabled>
            All
          </TabsTrigger>
          <TabsTrigger value="open" disabled>
            Open
          </TabsTrigger>
          <TabsTrigger value="fixed" disabled>
            Fixed
          </TabsTrigger>
        </TabsList>
<TabsContent value="all" className="space-y-4">
  {[1, 2, 3, 4].map((i) => (
    <Card key={i} className="overflow-hidden border dark:border-gray-800 w-full">
      <CardContent className="flex items-center p-2 space-x-4 w-full">
        <Skeleton className="w-12 h-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </CardContent>
    </Card>
  ))}
</TabsContent>
      </Tabs>
    </div>
  )
}
