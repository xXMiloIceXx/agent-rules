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

- One root element per component; declare props and emits explicitly rather than guessing at
  runtime.
- Use the Composition API and `<script setup>` where the project does.
- Prefer `ref` and `computed` over manual watchers, and avoid watchers that merely mirror state.
- Keep components small and presentational; push cross-cutting state into composables.
- Extract repeated form logic into a composable instead of duplicating it across pages.
- **Keep field order and structural grouping consistent across the create, edit and show views**
  of the same entity. Do not convert a read-only view into a form just to achieve visual symmetry.
- **An optional input needs defined behaviour when it is omitted** — a typed default or guarded
  access, never an implicit `undefined` that leaks into the payload.
- Use the framework's link component for internal navigation; never a raw anchor tag.
- External links that open a new browsing context need `noopener` and `noreferrer`.
- Nested interactive elements must stop event propagation, or the parent handler fires too.
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
- Enable strict mode where the project does; handle `null` and `undefined` explicitly rather than
  letting them flow into logic.
- Prefer a union type over a widening cast, and reach for generics only when the same shape
  genuinely repeats — not to look clever.
- Mark data that must not be mutated `readonly`.

## The falsy-value trap

An `<input type="number">` v-model yields a **string**, and `"0"` is falsy in JavaScript. Never
write `value || fallback` for a numeric field — test the empty string explicitly:

```js
const orUndefined = (value) => (value === "" || value === null ? undefined : value);
```

This has shipped as a real bug: a `0` bound was silently dropped and the filter returned every row.
