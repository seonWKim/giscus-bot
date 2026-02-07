/**
 * Claude (Anthropic) provider implementation.
 *
 * Uses the official Anthropic SDK to generate comments via the Messages API.
 * Supports Claude 4.x models (claude-sonnet-4-5-20250929, etc.).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, PostContext, Persona } from "./base.js";
import { buildSystemPrompt, buildUserPrompt } from "./base.js";

export class ClaudeProvider implements AIProvider {
  readonly name = "claude";
  private client: Anthropic;
  private model: string;

  /**
   * @param model - The Anthropic model ID (e.g., "claude-sonnet-4-5-20250929").
   * @param apiKey - Anthropic API key. Falls back to GISCUS_BOT_CLAUDE_API_KEY env var.
   */
  constructor(model: string, apiKey?: string) {
    this.model = model;
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.GISCUS_BOT_CLAUDE_API_KEY,
    });
  }

  async generateComment(context: PostContext, persona: Persona): Promise<string> {
    // Anthropic's API has a dedicated `system` parameter (not a message role)
    // which is ideal for persona instructions
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: buildSystemPrompt(persona),
      messages: [
        { role: "user", content: buildUserPrompt(context) },
      ],
    });

    // The response content is an array of content blocks; we expect a single text block
    const block = response.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Claude returned an empty or non-text response");
    }

    return block.text.trim();
  }
}
