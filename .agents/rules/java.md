---
trigger: glob
globs: "**/*.java, pom.xml, build.gradle, build.gradle.kts, settings.gradle, settings.gradle.kts"
description: "Java / JVM conventions. The build file wins over preference."
---

# Java / JVM

## Discover first

Read `pom.xml` or `build.gradle*` for the language level, dependency manager, test framework and
formatter. **The build file wins over personal preference.** Match the existing package root and
layering; do not add a module or layer for a small change.

## Conventions

- Constructor injection over field injection or static singletons.
- Public APIs return `Optional` or fail explicitly — do not return `null`.
- Model closed value sets as `enum`, not `int` or `String` constants.
- `try`-with-resources for anything `AutoCloseable`.
- Money and exact quantities: `BigDecimal`, never `double`.
- `equals` and `hashCode` together (or use a `record`); keep `compareTo` consistent with `equals`.
- Never `catch (Exception e) {}`. Degrade explicitly and log when a failure is non-critical.
- Prefer immutability: `final` fields, unmodifiable collections at boundaries.
- Keep checked exceptions meaningful; do not widen a signature just to avoid handling one.

## Commands

```bash
./mvnw -q test        # or: ./gradlew test
./mvnw -q verify      # or: ./gradlew check
```

Use the wrapper the project ships; do not assume a globally installed Maven or Gradle.
