/**
 * GitHub Action entry point for giscus-bot.
 *
 * Runs as a composite action — inputs are passed as INPUT_* env vars.
 *
 * Two trigger modes:
 *   1. Manual (workflow_dispatch): scrapes the provided blog-url
 *   2. Push: reads newly added markdown files from the checkout
 */

import { existsSync, readFileSync } from "node:fs";
import { loadConfig } from "./config/loader.js";
import { createProvider } from "./providers/index.js";
import { generate } from "./core/generator.js";
import { extractPostFromFile } from "./core/scraper.js";
import type { GiscusBotConfig, ProviderName } from "./config/types.js";

/** Map provider names to their env var for API keys */
const PROVIDER_ENV_MAP: Record<string, string> = {
  openai: "GISCUS_BOT_OPENAI_API_KEY",
  claude: "GISCUS_BOT_CLAUDE_API_KEY",
};

/** Default config when no config file exists in the user's repo */
function defaultConfig(): GiscusBotConfig {
  return {
    provider: { name: "openai", model: "gpt-4o" },
    github: { repo: "", discussionCategory: "General" },
    personas: [
      {
        name: "Curious Reader",
        description: "Asks thoughtful questions about the content",
        tone: "friendly, inquisitive",
      },
    ],
    limits: { maxPersonas: 1 },
    labeling: { prefix: "🤖 **AI-Generated Comment**" },
  };
}

function info(msg: string): void {
  console.log(msg);
}

function fail(msg: string): void {
  console.error(`::error::${msg}`);
  process.exitCode = 1;
}

async function run(): Promise<void> {
  try {
    // Read inputs from INPUT_* env vars (set by composite action)
    const githubToken = process.env.INPUT_GITHUB_TOKEN;
    const providerName = process.env.INPUT_PROVIDER;
    const apiKey = process.env.INPUT_API_KEY;
    const model = process.env.INPUT_MODEL || "gpt-4o";
    const blogUrl = process.env.INPUT_BLOG_URL;
    const configPath = process.env.INPUT_CONFIG_PATH || "giscus-bot.config.yaml";

    if (!githubToken) throw new Error("github-token input is required");
    if (!providerName) throw new Error("provider input is required");
    if (!apiKey) throw new Error("api-key input is required");

    // Set env vars for provider constructors and publisher
    process.env.GISCUS_BOT_GITHUB_TOKEN = githubToken;
    if (PROVIDER_ENV_MAP[providerName]) {
      process.env[PROVIDER_ENV_MAP[providerName]] = apiKey;
    }

    // Load config or use defaults
    let config: GiscusBotConfig;
    if (existsSync(configPath)) {
      config = loadConfig(configPath);
    } else {
      config = defaultConfig();
    }

    // Override from action inputs
    config.provider.name = providerName as ProviderName;
    config.provider.model = model;

    // Infer repo from GITHUB_REPOSITORY if not in config
    if (!config.github.repo && process.env.GITHUB_REPOSITORY) {
      config.github.repo = process.env.GITHUB_REPOSITORY;
    }

    const provider = createProvider(config.provider);

    if (blogUrl) {
      // ── Manual trigger ──
      info(`Processing URL: ${blogUrl}`);
      const result = await generate(blogUrl, config, provider);
      info(`Generated ${result.comments.length} comment(s) for "${result.postTitle}"`);
      if (result.discussionUrl) info(`Discussion: ${result.discussionUrl}`);
    } else {
      // ── Push trigger ──
      const eventPath = process.env.GITHUB_EVENT_PATH;
      if (!eventPath) throw new Error("GITHUB_EVENT_PATH not set");

      const payload = JSON.parse(readFileSync(eventPath, "utf-8"));
      const files: string[] = [];

      // Only newly added files (skip modified to avoid duplicates)
      if (payload.commits) {
        for (const commit of payload.commits) {
          for (const file of (commit.added ?? []) as string[]) {
            if (
              file.match(/\.(md|mdx)$/) &&
              file.match(/^(content|_posts|src\/posts|posts|blog)\//)
            ) {
              files.push(file);
            }
          }
        }
      }

      if (files.length === 0) {
        info("No new blog posts detected in this push. Nothing to do.");
        return;
      }

      for (const file of files) {
        info(`Processing file: ${file}`);
        const postContext = extractPostFromFile(file);
        info(`Extracted post: "${postContext.title}"`);
        const result = await generate(postContext, config, provider);
        info(`Generated ${result.comments.length} comment(s) for "${result.postTitle}"`);
        if (result.discussionUrl) info(`Discussion: ${result.discussionUrl}`);
      }
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

run();
