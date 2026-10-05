import { createContext } from "react"
import type { Density } from "./density"

export type DensityContextValue = {
  density: Density
  setDensity: (density: Density) => void
}

export const DensityContext = createContext<DensityContextValue | null>(null)
