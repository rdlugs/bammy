import { useMemo, useState, type ReactNode } from "react"
import { DensityContext } from "./density-context"
import { applyDensity, readDensity, saveDensity, type Density } from "./density"

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setState] = useState<Density>(readDensity)

  const value = useMemo(
    () => ({
      density,
      setDensity(next: Density) {
        applyDensity(next)
        saveDensity(next)
        setState(next)
      },
    }),
    [density],
  )

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
}
