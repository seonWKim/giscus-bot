/**
 * GitHub Action entry point for giscus-bot.
 *
 * Supports two trigger modes:
 *
 *   1. Manual trigger (workflow_dispatch): User provides a blog-url input.
 *      The URL is scraped and comments are generated from the live page.
 *
 *   2. Push trigger: Detects newly added markdown files from the commit,
 *      reads them directly from the checkout, and generates comments from
 *      the file content.
 */

import * as core from "@actions/core";
import * as github from "@actions/github";
import { loadConfig } from "./config/loader.js";
import { createProvider } from "./providers/index.js";
import { generate } from "./core/generator.js";
import { extractPostFromFile } from "./core/scraper.js";
import type { GiscusBotConfig, ProviderName } from "./config/types.js";
import { existsSync } from "node:fs";

/**
 * Map provider names to their corresponding environment variable names.
 * The action's api-key input gets set to the correct env var so that
 * provider constructors can find it automatically.
 */
const PROVIDER_ENV_MAP: Record<string, string> = {
  openai: "GISCUS_BOT_OPENAI_API_KEY",
  claude: "GISCUS_BOT_CLAUDE_API_KEY",
};

/** Default config when no config file is found in the user's repo */
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

async function run(): Promise<void> {
  try {
    // Read GitHub Action inputs
    const githubToken = core.getInput("github-token", { required: true });
    const providerName = core.getInput("provider", { required: true });
    const apiKey = core.getInput("api-key", { required: true });
    const model = core.getInput("model") || "gpt-4o";
    const blogUrl = core.getInput("blog-url");
    const configPath = core.getInput("config-path") || "giscus-bot.config.yaml";

    // Set env vars so that provider constructors and publisher can find them
    process.env.GISCUS_BOT_GITHUB_TOKEN = githubToken;
    if (PROVIDER_ENV_MAP[providerName]) {
      process.env[PROVIDER_ENV_MAP[providerName]] = apiKey;
    }

    // Load config file if it exists, otherwise use defaults
    let config: GiscusBotConfig;
    if (existsSync(configPath)) {
      config = loadConfig(configPath);
    } else {
      config = defaultConfig();
    }

    // Override provider settings from action inputs
    config.provider.name = providerName as ProviderName;
    config.provider.model = model;

    // Infer repo from GITHUB_REPOSITORY env var if not set in config
    if (!config.github.repo && process.env.GITHUB_REPOSITORY) {
      config.github.repo = process.env.GITHUB_REPOSITORY;
    }

    const provider = createProvider(config.provider);

    if (blogUrl) {
      // ── Manual trigger (workflow_dispatch) ──
      core.info(`Processing URL: ${blogUrl}`);

      const result = await generate(blogUrl, config, provider);

      core.info(`Generated ${result.comments.length} comment(s) for "${result.postTitle}"`);
      if (result.discussionUrl) {
        core.info(`Discussion: ${result.discussionUrl}`);
      }

      core.setOutput("comments-generated", "1");
    } else {
      // ── Push trigger ──
      // Only process newly added files (skip modified to avoid duplicates)
      const payload = github.context.payload;
      const files: string[] = [];

      if (payload.commits) {
        for (const commit of payload.commits) {
          const commitFiles = (commit.added ?? []) as string[];

          for (const file of commitFiles) {
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
        core.info("No new blog posts detected in this push. Nothing to do.");
        return;
      }

      for (const file of files) {
        core.info(`Processing file: ${file}`);

        const postContext = extractPostFromFile(file);
        core.info(`Extracted post: "${postContext.title}"`);

        const result = await generate(postContext, config, provider);

        core.info(`Generated ${result.comments.length} comment(s) for "${result.postTitle}"`);
        if (result.discussionUrl) {
          core.info(`Discussion: ${result.discussionUrl}`);
        }
      }

      core.setOutput("comments-generated", files.length.toString());
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
