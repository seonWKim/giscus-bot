/**
 * OpenAI provider implementation.
 *
 * Uses the official OpenAI SDK to generate comments via chat completions.
 * Supports any model available through the OpenAI API (gpt-4o, gpt-4-turbo, etc.).
 */

import OpenAI from "openai";
import type { AIProvider, PostContext, Persona } from "./base.js";
import { buildSystemPrompt, buildUserPrompt } from "./base.js";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  /**
   * @param model - The OpenAI model ID (e.g., "gpt-4o").
   * @param apiKey - OpenAI API key. Falls back to GISCUS_BOT_OPENAI_API_KEY env var.
   */
  constructor(model: string, apiKey?: string) {
    this.model = model;
    // The OpenAI SDK auto-reads OPENAI_API_KEY from env, but we use
    // our own env var name for clarity, so we pass it explicitly.
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env.GISCUS_BOT_OPENAI_API_KEY,
    });
  }

  async generateComment(context: PostContext, persona: Persona): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        // System message sets up the persona and comment guidelines
        { role: "system", content: buildSystemPrompt(persona) },
        // User message contains the actual blog post content
        { role: "user", content: buildUserPrompt(context) },
      ],
      // Moderate temperature for creative but focused comments
      temperature: 0.7,
    });

    // Extract the generated text from the first (and only) choice
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response");
    }

    return content.trim();
  }
}
