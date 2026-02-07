/**
 * Ollama provider implementation.
 *
 * Communicates with a locally running Ollama instance via its REST API.
 * No SDK dependency needed — just plain fetch calls. This makes it ideal
 * for users who want to run everything locally without API keys.
 */

import type { AIProvider, PostContext, Persona } from "./base.js";
import { buildSystemPrompt, buildUserPrompt } from "./base.js";

/** Shape of Ollama's /api/chat response (only the fields we need) */
interface OllamaChatResponse {
  message: {
    content: string;
  };
}

export class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  private baseUrl: string;
  private model: string;

  /**
   * @param model - The Ollama model name (e.g., "llama3", "mistral").
   * @param baseUrl - Ollama server URL. Defaults to localhost:11434.
   */
  constructor(model: string, baseUrl?: string) {
    this.model = model;
    this.baseUrl =
      baseUrl ??
      process.env.GISCUS_BOT_OLLAMA_URL ??
      "http://localhost:11434";
  }

  async generateComment(context: PostContext, persona: Persona): Promise<string> {
    // Ollama exposes an OpenAI-compatible /api/chat endpoint
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        // stream: false makes Ollama return the full response in one JSON object
        // instead of streaming newline-delimited chunks
        stream: false,
        messages: [
          { role: "system", content: buildSystemPrompt(persona) },
          { role: "user", content: buildUserPrompt(context) },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as OllamaChatResponse;
    const content = data.message?.content;
    if (!content) {
      throw new Error("Ollama returned an empty response");
    }

    return content.trim();
  }
}
