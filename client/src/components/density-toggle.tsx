import { Rows2, Rows3, Rows4, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DENSITIES, type Density } from "@/features/density/density"
import { useDensity } from "@/features/density/useDensity"

const LABELS: Record<Density, string> = { compact: "Compact", comfortable: "Comfortable", spacious: "Spacious" }
const ICONS: Record<Density, LucideIcon> = { compact: Rows4, comfortable: Rows3, spacious: Rows2 }

export function DensityToggle() {
  const { density, setDensity } = useDensity()
  const Icon = ICONS[density]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Icon className="size-4" />
          <span className="sr-only">Change density</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>Density</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={density} onValueChange={(value) => setDensity(value as Density)}>
          {DENSITIES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {LABELS[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
