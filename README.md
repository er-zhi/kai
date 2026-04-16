# Kai — Kodif AI Agent

AI engineering agent for GitHub. Mention `@kai` in any PR comment to trigger.

## Quick Start

Add to your repo — `.github/workflows/kai.yml`:

```yaml
name: Kai
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  kai:
    if: contains(github.event.comment.body, '@kai')
    runs-on: ubuntu-latest
    steps:
      - uses: er-zhi/kai@v1
        with:
          app_id: ${{ secrets.KAI_APP_ID }}
          app_private_key: ${{ secrets.KAI_APP_PRIVATE_KEY }}
```

## Setup

1. Install the [kai-kodif GitHub App](https://github.com/apps/kai-kodif) on your repo
2. Add `KAI_APP_ID` and `KAI_APP_PRIVATE_KEY` to repo secrets
3. Add the workflow file above
4. Mention `@kai` in a PR comment

## How it works

- `@kai review` — review PR for bugs, security, performance
- `@kai fix tests` — fix failing tests
- `@kai explain` — explain the changes
- Delete Kai's working comment to cancel

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `trigger_phrase` | No | `@kai` | Trigger phrase |
| `app_id` | No | — | GitHub App ID (for kai[bot] identity) |
| `app_private_key` | No | — | GitHub App private key |
| `github_token` | No | `${{ github.token }}` | Fallback token |
