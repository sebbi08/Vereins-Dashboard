# Semantic Release & Commit Hooks Design

**Date:** 2026-07-23
**Status:** Approved

## Overview

Add automated semantic versioning with GitHub Releases via `semantic-release`, and enforce conventional commit messages via `commitlint` + `husky`.

## Motivation

- Commits already follow conventional commit format (`feat:`, `fix:`, `test:`)
- Tags already exist (`1.2.0`, `1.2.1`, `1.2.2`) — all manually created
- Need automated version bumping, changelog generation, and GitHub Releases
- Need commit message enforcement at commit time

## Design

### Tools

| Tool                                        | Purpose                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `semantic-release`                          | Analyzes commits since last tag, bumps version, generates changelog, creates GitHub Release |
| `@semantic-release/github`                  | GitHub Release publishing plugin (bundled with semantic-release)                            |
| `@semantic-release/commit-analyzer`         | Determines version bump from commits (bundled)                                              |
| `@semantic-release/release-notes-generator` | Generates release notes (bundled)                                                           |
| `@commitlint/cli`                           | Lint commit messages                                                                        |
| `@commitlint/config-conventional`           | Conventional commit rules                                                                   |
| `husky`                                     | Git hooks manager                                                                           |

### Configuration

**`.releaserc.json`** (root):

```json
{
  "branches": ["master"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/github"
  ]
}
```

- No npm publish (`npmPublish` defaults to `true`, but our package is `"private": true` so semantic-release auto-skips it)
- Releases from `master` branch only

**`commitlint.config.js`** (root):
Extends `@commitlint/config-conventional` with default rules.

**Husky hook** (`.husky/commit-msg`):
Runs `npx commitlint --edit $1` on each commit.

### Scripts Added

| Script    | Command                |
| --------- | ---------------------- |
| `release` | `npx semantic-release` |
| `prepare` | `husky`                |

### Required Environment

- `GH_TOKEN` or `GITHUB_TOKEN` — GitHub personal access token with `repo` scope (for creating releases)
- Run locally: `GH_TOKEN=... npm run release`
- Run in CI: Provided by GitHub Actions automatically

## Testing

- Commit hook: attempt a non-conventional commit, verify rejection
- Release: dry-run with `npx semantic-release --dry-run` to verify analysis
