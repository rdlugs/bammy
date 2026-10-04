import type { Config } from "../config/schema.ts";
import type { ChangedFile, ChangeSet, LlmUsage, Walkthrough } from "../core/models.ts";
import { estimateTokens } from "../context/budget.ts";
import { renderFileDiff } from "../context/diffText.ts";
import { WALKTHROUGH_SYSTEM_PROMPT, walkthroughUserPrompt } from "./prompt.ts";
import { generateWithFallback, type Generate } from "./providers.ts";
import { walkthroughOutputSchema } from "./schemas.ts";

// The overview needs breadth, not every line: files are included whole until
// this budget, then listed by name only.
const WALKTHROUGH_DIFF_TOKENS = 20_000;

function overviewDiff(files: ChangedFile[]): string {
  const blocks: string[] = [];
  const listed: string[] = [];
  let tokens = 0;
  for (const file of files) {
    const text = renderFileDiff(file);
    const fileTokens = estimateTokens(text);
    if (tokens + fileTokens <= WALKTHROUGH_DIFF_TOKENS) {
      blocks.push(text);
      tokens += fileTokens;
    } else {
      listed.push(`- ${file.path} (${file.changeType})`);
    }
  }
  if (listed.length) blocks.push(`Also changed (diff not shown):\n${listed.join("\n")}`);
  return blocks.join("\n\n");
}

export async function generateWalkthrough(
  generate: Generate,
  changeSet: ChangeSet,
  files: ChangedFile[],
  config: Config,
): Promise<{ walkthrough: Walkthrough; usage: LlmUsage }> {
  const response = await generateWithFallback(generate, [config.llm.model, ...config.llm.fallbackModels], {
    system: WALKTHROUGH_SYSTEM_PROMPT,
    prompt: walkthroughUserPrompt(changeSet, overviewDiff(files)),
    schema: walkthroughOutputSchema,
    schemaName: "walkthrough",
    temperature: config.llm.temperature,
    maxOutputTokens: Math.min(config.llm.maxTokens, 4000),
  });
  const known = new Set(changeSet.files.map((file) => file.path));
  const output = response.object;
  return {
    walkthrough: {
      overview: output.overview.trim(),
      fileSummaries: output.fileSummaries.filter((entry) => known.has(entry.path)),
      labels: output.labels.map((label) => label.trim()).filter(Boolean).slice(0, 5),
      estimatedEffort: Math.min(5, Math.max(1, Math.round(output.estimatedEffort))),
      blastRadius: output.blastRadius,
    },
    usage: {
      purpose: "walkthrough",
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      latencyMs: response.latencyMs,
    },
  };
}
