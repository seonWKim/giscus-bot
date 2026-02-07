/**
 * Configuration loader for giscus-bot.
 *
 * Reads a YAML config file and performs environment variable interpolation.
 * The interpolation syntax is ${VAR_NAME} — any occurrence in the YAML string
 * values will be replaced with the corresponding env var at load time.
 *
 * This allows users to keep secrets out of config files:
 *   api_key: ${GISCUS_BOT_OPENAI_API_KEY}
 */

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { config as loadDotenv } from "dotenv";
import type { GiscusBotConfig } from "./types.js";

// Load .env file into process.env (no-op if .env doesn't exist)
loadDotenv();

/**
 * Replace all ${VAR_NAME} patterns in a string with their env var values.
 * Unmatched variables are left as empty strings (fail-open for optional vars).
 */
function interpolateEnvVars(raw: string): string {
  return raw.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
    return process.env[varName] ?? "";
  });
}

/**
 * Load and parse the giscus-bot config file.
 *
 * @param configPath - Absolute or relative path to the YAML config file.
 *                     Defaults to ./giscus-bot.config.yaml in the cwd.
 * @returns Parsed and env-interpolated configuration object.
 * @throws If the file cannot be read or parsed.
 */
export function loadConfig(
  configPath: string = "giscus-bot.config.yaml",
): GiscusBotConfig {
  // Read the raw YAML file as a string
  const raw = readFileSync(configPath, "utf-8");

  // Interpolate env vars before parsing YAML — this keeps the YAML parser
  // from needing to know about our ${} syntax
  const interpolated = interpolateEnvVars(raw);

  // Parse the interpolated YAML into a plain object
  const parsed = parseYaml(interpolated) as GiscusBotConfig;

  return parsed;
}
