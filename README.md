# giscus-bot

AI-powered discussion starter for blog posts. Automatically generates thoughtful comments on your blog posts and posts them to GitHub Discussions.

Most blog posts have zero comments, creating no feedback loop for bloggers. giscus-bot solves this by seeding conversations using configurable AI personas. Unlike [giscus](https://giscus.app) (which provides comment infrastructure), giscus-bot actively starts discussions.

- AI posts top-level comments only; replies are reserved for humans
- Every comment is clearly labeled as AI-generated
- Pluggable AI providers: OpenAI, Claude, Ollama
- User-defined personas with configurable limits
- Works as a CLI tool or GitHub Action

## Prerequisites

1. **GitHub Discussions enabled** on your repository (Settings > Features > Discussions)
2. **A Discussion category** created for blog comments (e.g., "Blog Comments")
3. **A GitHub PAT** with `discussions:write` scope (the default `GITHUB_TOKEN` does not have Discussions permissions)
4. **An AI provider API key** (OpenAI, Anthropic, or a local Ollama instance)

## Quick Start

### Install

```bash
npm install giscus-bot
```

### Configure

Create `giscus-bot.config.yaml` in your project root:

```yaml
provider:
  name: openai                          # openai | claude | ollama
  model: gpt-4o

github:
  repo: "youruser/yourblog"
  discussionCategory: "Blog Comments"

personas:
  - name: "Curious Reader"
    description: "Asks thoughtful questions about the content"
    tone: "friendly, inquisitive"
  - name: "Devil's Advocate"
    description: "Offers respectful counterpoints"
    tone: "constructive, analytical"

limits:
  maxPersonas: 2

labeling:
  prefix: "🤖 **AI-Generated Comment**"
```

Create a `.env` file with your API keys:

```bash
GISCUS_BOT_GITHUB_TOKEN=ghp_your_token_here
GISCUS_BOT_OPENAI_API_KEY=sk-your-key-here
# Or for Claude:
# GISCUS_BOT_CLAUDE_API_KEY=sk-ant-your-key-here
# Or for Ollama:
# GISCUS_BOT_OLLAMA_URL=http://localhost:11434
```

### Run

```bash
# Preview comments without posting (dry run)
giscus-bot generate https://yourblog.com/my-post --dry-run

# Generate and post comments
giscus-bot generate https://yourblog.com/my-post
```

## CLI Usage

```
giscus-bot generate <url> [options]

Options:
  -c, --config <path>      Path to config file (default: ./giscus-bot.config.yaml)
  -p, --provider <name>    Override AI provider (openai|claude|ollama)
  -n, --max-personas <n>   Override max personas to use
  --dry-run                Preview comments without posting to GitHub
```

Examples:

```bash
# Use Claude instead of the configured provider
giscus-bot generate https://myblog.com/post --provider claude

# Only generate 1 comment even if config has more personas
giscus-bot generate https://myblog.com/post --max-personas 1

# Use a different config file
giscus-bot generate https://myblog.com/post --config ./my-config.yaml
```

## GitHub Action

giscus-bot can run as a GitHub Action with two trigger modes: **manual** (paste a URL) and **automatic** (detect new posts on push).

### Manual trigger only

If you just want to run it on-demand from the Actions tab:

```yaml
# .github/workflows/giscus-bot.yml
name: Generate Discussion Comments

on:
  workflow_dispatch:
    inputs:
      url:
        description: "Blog post URL"
        required: true
        type: string

jobs:
  comment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: youruser/giscus-bot@main
        with:
          github-token: ${{ secrets.DISCUSSIONS_TOKEN }}
          provider: openai
          api-key: ${{ secrets.OPENAI_API_KEY }}
          blog-url: ${{ github.event.inputs.url }}
```

### Auto-trigger on push (+ manual fallback)

For automatic comment generation when new posts are pushed:

```yaml
# .github/workflows/giscus-bot.yml
name: Generate Discussion Comments

on:
  push:
    paths:
      - "_posts/**"          # Jekyll
      # - "content/posts/**" # Hugo

  workflow_dispatch:
    inputs:
      url:
        description: "Blog post URL"
        required: true
        type: string

jobs:
  comment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: youruser/giscus-bot@main
        with:
          github-token: ${{ secrets.DISCUSSIONS_TOKEN }}
          provider: openai
          api-key: ${{ secrets.OPENAI_API_KEY }}
          blog-url: ${{ github.event.inputs.url }}
```

Auto-trigger mode requires a `site` section in your config so that file paths can be mapped to live URLs:

```yaml
# Add this to giscus-bot.config.yaml
site:
  url: "https://yourblog.com"
  framework: jekyll   # jekyll | hugo | custom
```

### Action inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | Yes | | GitHub PAT with `discussions:write` scope |
| `provider` | Yes | | AI provider: `openai`, `claude`, or `ollama` |
| `api-key` | Yes | | API key for the AI provider |
| `model` | No | `gpt-4o` | AI model to use |
| `blog-url` | No | | Blog post URL (for manual trigger) |
| `site-url` | No | | Override `site.url` from config |
| `config-path` | No | `giscus-bot.config.yaml` | Path to config file |

## Framework Setup Guides

### Jekyll

Jekyll posts follow the `_posts/YYYY-MM-DD-slug.md` convention. giscus-bot maps these to `/YYYY/MM/DD/slug/` URLs automatically.

```yaml
# giscus-bot.config.yaml
site:
  url: "https://yourblog.com"
  framework: jekyll
```

```yaml
# .github/workflows/giscus-bot.yml
on:
  push:
    paths: ["_posts/**"]
  workflow_dispatch:
    inputs:
      url:
        description: "Blog post URL"
        required: true
        type: string
```

File mapping example:
```
_posts/2024-06-15-hello-world.md → https://yourblog.com/2024/06/15/hello-world/
```

### Hugo

Hugo content lives under `content/`. giscus-bot strips the `content/` prefix and the file extension.

```yaml
# giscus-bot.config.yaml
site:
  url: "https://yourblog.com"
  framework: hugo
```

```yaml
on:
  push:
    paths: ["content/posts/**"]
```

File mapping example:
```
content/posts/hello-world.md → https://yourblog.com/posts/hello-world/
```

### Custom framework

For other static site generators, use a path pattern with placeholders:

```yaml
# giscus-bot.config.yaml
site:
  url: "https://yourblog.com"
  framework: custom
  pathPattern: "/blog/{year}/{slug}/"
```

Available placeholders: `{slug}`, `{filename}`, `{year}`, `{month}`, `{day}`

## Configuration Reference

### `provider`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `openai` \| `claude` \| `ollama` | Which AI provider to use |
| `model` | string | Model ID (e.g., `gpt-4o`, `claude-sonnet-4-5-20250929`, `llama3`) |

### `github`

| Field | Type | Description |
|-------|------|-------------|
| `repo` | string | GitHub repo in `owner/repo` format |
| `discussionCategory` | string | Name of the Discussions category to post in |

### `site` (optional)

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | Blog base URL, no trailing slash |
| `framework` | `jekyll` \| `hugo` \| `custom` | Determines how file paths map to URLs |
| `pathPattern` | string | URL pattern for `custom` framework |

### `personas`

An array of personas. Each persona generates one comment per blog post.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name shown in the comment |
| `description` | string | Instructions for the AI about this persona's role |
| `tone` | string | Adjectives describing the writing style |

### `limits`

| Field | Type | Description |
|-------|------|-------------|
| `maxPersonas` | number | Max personas to use per post (caps API calls) |

### `labeling`

| Field | Type | Description |
|-------|------|-------------|
| `prefix` | string | Markdown text prepended to every AI comment |

### Environment variables

| Variable | Description |
|----------|-------------|
| `GISCUS_BOT_GITHUB_TOKEN` | GitHub PAT with `discussions:write` |
| `GISCUS_BOT_OPENAI_API_KEY` | OpenAI API key |
| `GISCUS_BOT_CLAUDE_API_KEY` | Anthropic API key |
| `GISCUS_BOT_OLLAMA_URL` | Ollama base URL (default: `http://localhost:11434`) |

Environment variables can also be referenced in the config file using `${VAR_NAME}` syntax:

```yaml
provider:
  name: openai
  model: ${GISCUS_BOT_MODEL}
```

## How It Works

1. **Scrape** the blog post URL using [Readability](https://github.com/mozilla/readability) (the same engine behind Firefox Reader View) and convert to markdown
2. **Generate** comments by sending the post content to the configured AI provider, once per persona
3. **Publish** comments to a GitHub Discussion (creating one if it doesn't exist), with each comment labeled as AI-generated

Comments are top-level only. Replies are reserved for human readers.

## Development

```bash
git clone https://github.com/youruser/giscus-bot.git
cd giscus-bot
npm install
npm run build
npm test
```

## License

MIT
