# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read this first

[AGENTS.md](AGENTS.md) warns that this Next.js version (16.x) has breaking changes from what you may know. Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (`01-app/` for App Router, `02-pages/`, `03-architecture/`). Heed deprecation notices.

## Commands

- `npm run dev` — dev server at http://localhost:3000
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — ESLint (flat config, `eslint-config-next` core-web-vitals + typescript). Runs `eslint` with no path, so it lints the whole project.
- No test runner is configured. There is no test script, so don't assume one exists.

## Architecture

- App Router only; all code lives in `app/`. There is no `pages/` directory, `src/` directory or API layer yet.
- [app/layout.tsx](app/layout.tsx) is the root layout. It loads Geist / Geist Mono via `next/font/google` and exposes them as the CSS variables `--font-geist-sans` and `--font-geist-mono` on `<html>`. Its props are typed with the globally available `LayoutProps<"/">` helper (Next 16 typed routes), so no import is needed. `metadata` still has the create-next-app defaults.
- Styling is Tailwind CSS v4, wired through `@tailwindcss/postcss` in [postcss.config.mjs](postcss.config.mjs). [app/globals.css](app/globals.css) is just `@import "tailwindcss";` (default styles were deliberately removed in the last commit). There is no `tailwind.config`; v4 is configured in CSS.
- Path alias `@/*` maps to the repo root (not `src/`), e.g. `@/app/...`.
- [next.config.ts](next.config.ts) is empty. `next-env.d.ts` and `.next/` are generated (don't edit).
