import { useEffect, useId, useState } from "react"
import { useTheme } from "next-themes"

// Mermaid is large, so it loads the first time a diagram is shown.
const loadMermaid = () => import("mermaid").then((module) => module.default)

// A Mermaid diagram as GitHub and GitLab draw one. The source comes from a
// model, so Mermaid runs in strict mode (no scripts, no HTML labels) and a
// diagram that does not parse falls back to its source, as the forges do.
export function MermaidDiagram({ source }: { source: string }) {
  const { resolvedTheme } = useTheme()
  const id = `mermaid-${useId().replace(/[^\w-]/g, "")}`
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: resolvedTheme === "dark" ? "dark" : "default",
        })
        const rendered = await mermaid.render(id, source)
        if (!cancelled) {
          setSvg(rendered.svg)
          setFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [id, source, resolvedTheme])

  if (failed || svg === null) {
    return (
      <pre aria-busy={!failed && svg === null}>
        <code>{source}</code>
      </pre>
    )
  }
  return (
    <div
      role="img"
      aria-label="Sequence diagram"
      className="overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
      // Mermaid's own output in strict mode, sanitised by Mermaid.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
