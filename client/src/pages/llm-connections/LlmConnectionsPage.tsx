import { PageHeader } from "@/components/PageHeader"
import { PageShell } from "@/components/PageShell"
import { LlmConnectionsCard } from "@/features/llm-connections/LlmConnectionsCard"

export function LlmConnectionsPage() {
  return (
    <PageShell>
      <PageHeader
        title="LLM Connections"
        description="Provider credentials and custom API hosts that reviews run with."
      />
      <LlmConnectionsCard />
    </PageShell>
  )
}
