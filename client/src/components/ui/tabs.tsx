import * as React from "react"
import { cn } from "cn"
import { Tabs as TabsPrimitive } from "radix-ui"

// orientation="vertical" lays the tabs out as a side nav once the nearest
// `@container` ancestor is at least 48rem wide. Below that, and when there is
// no container, they stay a horizontally scrollable row. Sizing to the
// container instead of the viewport keeps the layout right next to an open
// app sidebar.

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn(
        "flex flex-col gap-4 data-[orientation=vertical]:@3xl:flex-row data-[orientation=vertical]:@3xl:items-start data-[orientation=vertical]:@3xl:gap-6",
        className
      )}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 w-fit max-w-full items-center justify-start overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground",
        "data-[orientation=vertical]:@3xl:h-auto data-[orientation=vertical]:@3xl:w-48 data-[orientation=vertical]:@3xl:shrink-0 data-[orientation=vertical]:@3xl:flex-col data-[orientation=vertical]:@3xl:items-stretch data-[orientation=vertical]:@3xl:gap-1 data-[orientation=vertical]:@3xl:overflow-visible data-[orientation=vertical]:@3xl:bg-transparent data-[orientation=vertical]:@3xl:p-0",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // As a side nav, the tabs look like the sidebar items.
        "data-[orientation=vertical]:@3xl:w-full data-[orientation=vertical]:@3xl:flex-none data-[orientation=vertical]:@3xl:justify-start data-[orientation=vertical]:@3xl:gap-2 data-[orientation=vertical]:@3xl:px-3 data-[orientation=vertical]:@3xl:py-2 data-[orientation=vertical]:@3xl:hover:bg-muted data-[orientation=vertical]:@3xl:hover:text-foreground data-[orientation=vertical]:@3xl:data-[state=active]:bg-muted data-[orientation=vertical]:@3xl:data-[state=active]:shadow-none dark:data-[orientation=vertical]:@3xl:data-[state=active]:border-transparent dark:data-[orientation=vertical]:@3xl:data-[state=active]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("min-w-0 flex-1 outline-none", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
