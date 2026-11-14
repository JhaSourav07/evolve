# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initialized repository and public GitHub remote at `https://github.com/JhaSourav07/evolve`.
- Configured pnpm monorepo workspace for `packages/*` and `apps/*`.
- Configured strict TypeScript compiler configuration (`tsconfig.base.json`, `tsconfig.json`).
- Configured ESLint (flat config) and Prettier code formatting with workspace scripts.
- Configured Vitest test runner across packages (`vitest.workspace.ts`).
- Created `@evolve/core` package with baseline metadata and unit tests.
- Created `@evolve/cli` application package linked to `@evolve/core` via `workspace:*`.
- Created initial architectural and design documentation in `docs/`.
