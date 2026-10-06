import { vi } from "vitest"
import type { ReactElement } from "react"
import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { AuthProvider } from "@/features/auth/AuthProvider"
import { DensityProvider } from "@/features/density/DensityProvider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { createQueryClient } from "@/lib/queryClient"

export function renderWithProviders(ui: ReactElement, { route = "/" } = {}) {
  const queryClient = createQueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <DensityProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>
            <AuthProvider>
              <TooltipProvider>
                {ui}
                <Toaster />
              </TooltipProvider>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      </DensityProvider>
    </ThemeProvider>,
  )
}

export function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
    handler(String(input), init),
  )
}

export function jsonResponse(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
