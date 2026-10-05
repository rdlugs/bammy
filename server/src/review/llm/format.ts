import { z } from "zod";

// Structured output is only guaranteed when the provider enforces the schema.
// Proxies such as 9router drop `response_format`, so the shape is always
// described in the prompt too and replies are parsed as untrusted text.

export function formatInstruction(schema: z.ZodType, name: string): string {
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" }));
  return `Respond with a single JSON object only: no prose before or after, no code fences. It must match this JSON Schema (${name}):\n${jsonSchema}`;
}

export class ParseError extends Error {}

const FENCE = /```(?:json)?\s*\n([\s\S]*?)\n\s*```/i;

// The JSON object inside a reply: fences and surrounding prose are dropped.
function extractObject(text: string): string | undefined {
  const fenced = FENCE.exec(text);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf("{");
  if (start < 0) return undefined;
  const end = body.lastIndexOf("}");
  return end > start ? body.slice(start, end + 1) : body.slice(start);
}

// Walks the text tracking strings and nesting, returning the open brackets at
// each position where a value inside an array has just closed.
function arrayElementEnds(text: string): { index: number; open: string[] }[] {
  const ends: { index: number; open: string[] }[] = [];
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.at(-1) === "[") ends.push({ index: i + 1, open: [...stack] });
    }
  }
  return ends;
}

// A reply cut off by the token limit loses its last, partial element; keeping
// the complete ones is better than discarding the whole pass.
function salvageTruncated(text: string): unknown {
  const ends = arrayElementEnds(text);
  for (let k = ends.length - 1; k >= 0; k--) {
    const { index, open } = ends[k]!;
    const closing = open
      .reverse()
      .map((bracket) => (bracket === "[" ? "]" : "}"))
      .join("");
    try {
      return JSON.parse(text.slice(0, index) + closing);
    } catch {
      // try an earlier cut
    }
  }
  return undefined;
}

export function parseLenient<T>(text: string, schema: z.ZodType<T>, repair?: (raw: unknown) => unknown): T {
  const candidate = extractObject(text);
  if (candidate === undefined) throw new ParseError("reply contained no JSON object");
  let raw: unknown;
  try {
    raw = JSON.parse(candidate);
  } catch {
    raw = salvageTruncated(candidate);
    if (raw === undefined) throw new ParseError("reply was not valid JSON");
  }
  const parsed = schema.safeParse(repair ? repair(raw) : raw);
  if (!parsed.success) {
    throw new ParseError(`reply did not match schema: ${z.prettifyError(parsed.error).replaceAll("\n", " ")}`);
  }
  return parsed.data;
}

export function excerpt(text: string | undefined, limit = 200): string {
  if (!text) return "(empty reply)";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}
