---
trigger: model_decision
description: "Query, memory and caching discipline: N+1, bulk loading, chunking, indexes, and when not to optimise."
---

# Performance

Read when touching queries, loops that scale with data, reporting, or caching.

## Queries

- **No N+1.** If a loop body reads a relation, eager-load it. Verify by logging the query count
  on a realistic dataset, not by inspection alone.
- Eager-load **intentionally**: name the relations you need (`with(['a', 'b'])`) rather than
  loading everything a model could reach.
- Select only the columns you use when a row is wide or the set is large.
- For a set of ids, prefer one `whereIn` over a query per id.
- Make sure the index exists for the columns a hot query filters or sorts on; a missing index is
  a schema change, so raise it rather than silently accepting the scan.

## Volume

- Chunk or stream large sets (`chunkById`, cursors, generators) instead of loading everything
  into memory. Chunk on a stable, indexed key — offset paging over a changing table skips and
  repeats rows.
- Aggregate in the database rather than pulling rows in to sum them.
- Avoid loading a relation just to call `count()`; use `withCount`.

## Read and serialisation paths

- **A read path must not perform remote I/O.** Serving a payload — an API resource, a page prop, a
  model accessor, a list endpoint — must not call a remote system to answer a question about data
  you already store: `exists()`, `size()`, a signed URL generated per row, an HTTP call inside a
  transformer. It costs one round trip per row, and the remote system's downtime becomes your read
  path's downtime.
- **Resolve remote facts at write time.** Persist the metadata you will need to display (size,
  path, checksum, storage key, public URL) when the object is ingested, and read it from the
  database afterwards.
- If a signed URL genuinely must be produced on read, produce it **once per response**, never
  inside a loop that scales with the page size.

## Caching

- Cache the expensive and reused, not the cheap and rare.
- Every cache entry needs an explicit invalidation path and a sane TTL. A cache with no
  invalidation story is a correctness bug waiting for a deploy.
- Never cache across an authorization boundary: include the actor's scope in the key.

## Judgement

**Do not optimise prematurely.** Optimise the measured hot path, and report the measurement —
before and after — rather than asserting an improvement. Correctness and clarity outrank a
speculative speed-up; the priority order in `00-core.md` still applies.
