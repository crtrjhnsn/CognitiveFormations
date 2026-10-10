import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface StructuredRequest<S extends z.ZodType> {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  // Stable rules: identical across every call, cached.
  system: string;
  // Course and unit context: identical across a unit's calls, cached.
  context: string;
  // The varying instruction for this call.
  task: string;
  schema: S;
}

export interface StructuredResult<T> {
  output: T;
  usage: Usage;
  // The model that actually served the call (differs if a fallback ran).
  servedBy: string;
}

// The pipeline depends on this signature, not on the SDK, so tests can
// substitute canned responses.
export type Llm = <S extends z.ZodType>(req: StructuredRequest<S>) => Promise<StructuredResult<z.infer<S>>>;

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly reason: "refusal" | "max_tokens" | "unparsed",
  ) {
    super(message);
  }
}

// Spec: retry rate-limit, overload and timeout errors up to 5 attempts.
// The SDK retries 408/409/429/5xx and connection errors with backoff.
export function createClient(): Anthropic {
  return new Anthropic({ maxRetries: 4 });
}

export function claudeLlm(client: Anthropic): Llm {
  return async (req) => {
    const stream = client.beta.messages.stream({
      model: req.model,
      max_tokens: 64_000,
      // If a safety classifier declines, the API re-runs the request on a
      // fallback model chosen by refusal category.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: req.context, cache_control: { type: "ephemeral" } },
            { type: "text", text: req.task },
          ],
        },
      ],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      throw new GenerationError(`Declined: ${message.stop_details?.category ?? "unknown category"}`, "refusal");
    }
    if (message.stop_reason === "max_tokens") throw new GenerationError("Hit max_tokens", "max_tokens");
    if (message.parsed_output == null) throw new GenerationError("No structured output returned", "unparsed");

    return {
      output: message.parsed_output,
      servedBy: message.model,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      },
    };
  };
}
