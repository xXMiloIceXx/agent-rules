---
trigger: glob
globs: "resources/js/**, **/*.vue, **/*.ts, **/*.tsx"
description: "Vue / Inertia / TypeScript conventions."
---

# Vue / Inertia / TypeScript

## Discover first

Read `package.json` for framework versions and the configured lint/format commands, then look at a
neighbouring page or component. **Reuse the project's existing composables and UI primitives**
rather than adding parallel ones.

## Vue

- One root element per component; declare props and emits explicitly.
- Prefer `ref` and `computed` over manual watchers, and avoid watchers that merely mirror state.
- Extract repeated form logic into a composable instead of duplicating it across pages.
- Keep formatting in the project's Prettier/ESLint setup; do not hand-align.

## Inertia

- Navigation and submission go through Inertia — `router`, `useForm`, `<Link>` — rather than
  `fetch`, unless the endpoint is deliberately outside the Inertia contract.
- Server validation errors arrive in `page.props.errors`. **Surface them in the UI.** A form that
  silently ignores them looks to the user like nothing happened at all.
- Send only the fields the server validates; never post whole component state.

## TypeScript

- No `any` in new code. When a type is genuinely unknown, use `unknown` plus a narrowing check.
- Types describe the server contract that actually exists. Verify it rather than assuming.

## The falsy-value trap

An `<input type="number">` v-model yields a **string**, and `"0"` is falsy in JavaScript. Never
write `value || fallback` for a numeric field — test the empty string explicitly:

```js
const orUndefined = (value) => (value === "" || value === null ? undefined : value);
```

This has shipped as a real bug: a `0` bound was silently dropped and the filter returned every row.
