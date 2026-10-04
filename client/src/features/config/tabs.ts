import { BookText, Bot, FileCode, ListChecks, MessageSquare, Zap } from "lucide-react"
import type { FormErrors } from "./settingsForm"

export const CONFIG_TABS = [
  {
    value: "llm",
    label: "LLM Config",
    icon: Bot,
    description: "Which preset and model run the review, and how the model is called.",
  },
  {
    value: "findings",
    label: "Finding Types",
    icon: ListChecks,
    description: "What gets reported and what fails the review.",
  },
  { value: "files", label: "Files", icon: FileCode, description: "Which files are reviewed and how a large change is split." },
  {
    value: "display",
    label: "Display",
    icon: MessageSquare,
    description: "What Bammy posts back to the pull or merge request.",
  },
  { value: "triggers", label: "Triggers", icon: Zap, description: "When a review starts without being queued by hand." },
  {
    value: "guidance",
    label: "Guidance",
    icon: BookText,
    description: "Project conventions and per-language guidance passed to the reviewer.",
  },
] as const

export type ConfigTab = (typeof CONFIG_TABS)[number]["value"]
export const DEFAULT_CONFIG_TAB: ConfigTab = "llm"

export function isConfigTab(value: string | null): value is ConfigTab {
  return CONFIG_TABS.some((tab) => tab.value === value)
}

// Which tab shows each validated field, so a tab can flag an error the user
// cannot see while the save button stays disabled.
export const TAB_ERRORS: Record<ConfigTab, (keyof FormErrors)[]> = {
  llm: ["model", "fallbackModels", "baseUrl", "temperature", "maxTokens", "contextBudget"],
  findings: ["categories", "maxFindings", "minConfidence"],
  files: ["ignorePaths", "maxChunks"],
  display: [],
  triggers: [],
  guidance: ["instructions", "languageInstructions"],
}
