import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createGenerate, missingKeys } from "../src/review/llm/providers.ts";
import { fetchStub } from "./helpers/fetchStub.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const request = (model: string) => ({
  model,
  system: "s",
  prompt: "p",
  schema: z.object({ ok: z.boolean() }),
  schemaName: "result",
  temperature: 0,
  maxOutputTokens: 100,
});

const chatCompletion = (content: string) => ({
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 0,
  model: "cx/gpt-5.6-sol(medium)",
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
});

describe("createGenerate with an endpoint", () => {
  it("sends OpenAI models to its chat completions with the chosen key and the router id", async () => {
    const { fetch, calls } = fetchStub([
      { method: "POST", url: /^http:\/\/router\.test\/v1\/chat\/completions$/, body: chatCompletion('{"ok":true}') },
    ]);
    vi.stubGlobal("fetch", fetch);

    const generate = createGenerate({ openai: "sk-real" }, { baseUrl: "http://router.test/v1", apiKey: "router-key" });
    const response = await generate(request("openai/cx/gpt-5.6-sol(medium)"));

    expect(response.object).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.authorization).toBe("Bearer router-key");
    expect(JSON.parse(calls[0]!.body!).model).toBe("cx/gpt-5.6-sol(medium)");
  });

  it("sends Anthropic models to the same endpoint in their own format", async () => {
    const { fetch, calls } = fetchStub([{ method: "POST", url: /^http:\/\/router\.test\/v1\/messages$/, status: 400 }]);
    vi.stubGlobal("fetch", fetch);

    const generate = createGenerate({}, { baseUrl: "http://router.test/v1" });
    await expect(generate({ ...request("anthropic/claude-sonnet-5-5") })).rejects.toThrow();

    expect(calls[0]!.url).toBe("http://router.test/v1/messages");
  });
});

describe("missingKeys", () => {
  it("asks for no key behind an endpoint", () => {
    const models = ["openai/gpt-5", "anthropic/claude-sonnet-5-5"];
    expect(missingKeys(models, {}, { baseUrl: "http://router.test/v1" })).toEqual([]);
    expect(missingKeys(models, { openai: "k" })).toEqual(["anthropic"]);
  });
});
