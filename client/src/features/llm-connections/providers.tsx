import { Atom, Bot, BrainCircuit, Sparkles, type LucideIcon } from "lucide-react"
import type { LlmProvider } from "./api"

export interface LlmProviderDefinition {
  label: string
  icon: LucideIcon
  keyPlaceholder: string
  keyUrl?: string
  defaultBaseUrl?: string
}

export const LLM_PROVIDERS: Record<LlmProvider, LlmProviderDefinition> = {
  anthropic: {
    label: "Anthropic",
    icon: BrainCircuit,
    keyPlaceholder: "sk-ant-...",
    keyUrl: "console.anthropic.com",
  },
  openai: {
    label: "OpenAI",
    icon: Atom,
    keyPlaceholder: "sk-...",
    keyUrl: "platform.openai.com/api-keys",
  },
  google: {
    label: "Google",
    icon: Sparkles,
    keyPlaceholder: "AIza...",
    keyUrl: "aistudio.google.com/apikey",
  },
  ollama: {
    label: "Ollama",
    icon: Bot,
    keyPlaceholder: "Optional API key",
    defaultBaseUrl: "http://host.docker.internal:11434/v1",
  },
}
