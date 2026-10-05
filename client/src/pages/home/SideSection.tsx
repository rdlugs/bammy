import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

// A right-column section that starts open and folds away under its title.
export function SideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Collapsible defaultOpen className="border-b pb-5">
      <CollapsibleTrigger className="group flex w-full items-center justify-between py-1 text-sm font-medium">
        {title}
        <ChevronDown
          className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}
