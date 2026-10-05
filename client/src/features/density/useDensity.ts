import { useContext } from "react"
import { DensityContext } from "./density-context"

export function useDensity() {
  const context = useContext(DensityContext)
  if (!context) {
    throw new Error("useDensity must be used within a DensityProvider")
  }
  return context
}
