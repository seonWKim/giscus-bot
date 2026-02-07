/**
 * Provider factory — instantiates the correct AI provider based on config.
 *
 * This is the single entry point the rest of the app uses to get a provider.
 * Adding a new provider only requires:
 *   1. Creating a new class that implements AIProvider
 *   2. Adding a case to the switch statement below
 */

import type { ProviderConfig } from "../config/types.js";
import type { AIProvider } from "./base.js";
import { OpenAIProvider } from "./openai.js";
import { ClaudeProvider } from "./claude.js";
import { OllamaProvider } from "./ollama.js";

/**
 * Create an AI provider instance from the config's provider section.
 *
 * @param config - The provider config from giscus-bot.config.yaml
 * @returns A ready-to-use AIProvider instance
 * @throws If the provider name is not recognized
 */
export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.name) {
    case "openai":
      return new OpenAIProvider(config.model);
    case "claude":
      return new ClaudeProvider(config.model);
    case "ollama":
      return new OllamaProvider(config.model);
    default:
      // TypeScript's exhaustive check won't catch this at runtime
      // if someone passes an invalid string, so we throw explicitly
      throw new Error(`Unknown provider: ${config.name}`);
  }
}

// Re-export base types so consumers can import everything from providers/
export type { AIProvider, PostContext, Persona } from "./base.js";
