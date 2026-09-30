---
trigger: model_decision
description: "Naming conventions for classes, methods, variables, database objects, routes, enum cases and frontend components."
---

# Naming

Read before creating a class, method, variable, table, column, route, enum, component or
composable. Framework idioms win where they exist: follow the project's own layout and pinned
versions over anything here.

## Fundamentals

| Construct | Convention | Example |
| :--- | :--- | :--- |
| Class | `PascalCase`, singular noun | `CustomerController`, `SaveArticleRequest` |
| Method | `camelCase`, verb-first | `getActivePosts()`, `handle()` |
| Variable | `camelCase`, descriptive | `$articlesWithAuthor` — never `$art`, `$res` |
| Collection / single object | plural noun / singular noun | `$activeUsers` / `$activeUser` |
| Database column | `snake_case` | `meta_title`, `is_active` |
| Enum case | `UPPER_SNAKE_CASE` with lowercase backing value | `PENDING = 'pending'` |
| Component file | `PascalCase.vue` | `UserProfileCard.vue` |
| Composable | `useCamelCase` | `useFieldValidation` |

## Domain and schema

- **Models** are singular (`User`, `CustomerProfile`); **tables** are plural `snake_case`.
- **Primary key** is `id`. **Foreign keys** are `{singular_model}_id`.
- A column must not repeat its table's name: `birth_date`, not `customer_birth_date`.
- **Relationships**: `hasOne` / `belongsTo` / `morphOne` read singular (`$customer->team()`);
  `hasMany` / `belongsToMany` / `morphMany` read plural (`$user->sessions()`).
- **Pivot tables** join singular model names in alphabetical order (`article_user`). When the
  relationship carries business attributes of its own, model it as a first-class plural entity
  instead of a bare pivot.
- **Migrations**: timestamp + action + plural table name,
  e.g. `2026_09_08_000001_create_uploads_table.php`.

## Routing and views

- **URLs**: plural, kebab-case resource paths (`/customers`, `/agent-outcome-types`).
- **Named routes**: kebab-case with dot notation (`customers.index`, `users.update-status`).
- **Actions**: use the framework's standard resource action names (`index`, `create`, `store`,
  `show`, `edit`, `update`, `destroy`) rather than inventing synonyms.
- **SPA page files**: `[module]/[Action].vue` under the project's configured page directory.
  Take the exact casing from the project — do not assume it.

## Contracts and traits

- Describe a **capability or role**, not the mechanism: `Authenticatable`, `PaymentGateway`.
  Avoid `Interface` suffixes and `I` prefixes.
- Prefer capability prefixes for traits — `Has*`, `Handles*` — over a `Trait` suffix.

## Frontend

- **Props and emits**: `camelCase` (`modelValue`, `isEditing`); emits may surface as
  `update:modelValue` or kebab-case in templates.
- **HTML `id`**: `snake_case`. **`class`**: the project's utility framework, not bespoke names.
- **Config keys**: `snake_case` (`app.timezone`). **Translation keys**: follow the project's
  existing scheme exactly rather than introducing a second one.

## Config files

Lowercase `snake_case.php` in the config directory.

## Non-negotiable

Match what the surrounding code already does. A locally perfect name that breaks the file's
established pattern is a worse outcome than a slightly awkward one that fits.
