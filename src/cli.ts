#!/usr/bin/env node

/**
 * CLI entry point for giscus-bot.
 *
 * Provides the `giscus-bot generate <url>` command for generating
 * AI discussion-starter comments on blog posts.
 *
 * Usage:
 *   giscus-bot generate https://myblog.com/post --dry-run
 *   giscus-bot generate https://myblog.com/post --provider claude
 *   giscus-bot generate https://myblog.com/post --config ./custom-config.yaml
 */

import { Command } from "commander";
import { loadConfig } from "./config/loader.js";
import { createProvider } from "./providers/index.js";
import { generate } from "./core/generator.js";
import type { ProviderName } from "./config/types.js";

const program = new Command();

program
  .name("giscus-bot")
  .description("AI-powered discussion starter for blog posts")
  .version("0.1.0");

program
  .command("generate")
  .description("Generate AI comments for a blog post")
  .argument("<url>", "Blog post URL to generate comments for")
  .option(
    "-c, --config <path>",
    "Path to config file",
    "giscus-bot.config.yaml",
  )
  .option(
    "-p, --provider <name>",
    "Override AI provider (openai|claude|ollama)",
  )
  .option(
    "-n, --max-personas <number>",
    "Override max number of personas to use",
  )
  .option(
    "--dry-run",
    "Preview generated comments without posting to GitHub",
    false,
  )
  .action(async (url: string, opts: {
    config: string;
    provider?: string;
    maxPersonas?: string;
    dryRun: boolean;
  }) => {
    try {
      // Load and optionally override config values from CLI flags
      const config = loadConfig(opts.config);

      // CLI flags override config file values — useful for one-off runs
      if (opts.provider) {
        config.provider.name = opts.provider as ProviderName;
      }
      if (opts.maxPersonas) {
        config.limits.maxPersonas = parseInt(opts.maxPersonas, 10);
      }

      // Create the AI provider based on (potentially overridden) config
      const provider = createProvider(config.provider);

      console.log(`\nGenerating comments for: ${url}`);
      console.log(`Provider: ${provider.name} (${config.provider.model})`);
      console.log(`Personas: ${config.personas.slice(0, config.limits.maxPersonas).map((p) => p.name).join(", ")}`);
      if (opts.dryRun) {
        console.log("Mode: DRY RUN (comments will not be posted)\n");
      }

      // Run the generation pipeline
      const result = await generate(url, config, provider, {
        dryRun: opts.dryRun,
      });

      // Display results
      console.log(`\nPost: "${result.postTitle}"`);
      if (result.discussionUrl) {
        console.log(`Discussion: ${result.discussionUrl}`);
      }

      // Print each generated comment with a separator
      console.log("\n" + "=".repeat(60));
      for (const comment of result.comments) {
        console.log(`\nPersona: ${comment.personaName}`);
        console.log("-".repeat(40));
        console.log(comment.formattedComment);
        console.log("\n" + "=".repeat(60));
      }

      console.log(
        `\nDone! Generated ${result.comments.length} comment(s).`,
      );
    } catch (error) {
      // Print a clean error message without a stack trace for known errors
      console.error(
        `\nError: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  });

// Parse command-line arguments and execute
program.parse();
