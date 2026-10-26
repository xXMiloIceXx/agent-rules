---
trigger: glob
globs: "**/*.cs, **/*.unity, **/*.prefab, **/*.asset, Packages/manifest.json"
description: "Unity / C# conventions. UnityEngine.Object fake null, GC allocations, Inspector serialization, and thread boundaries are the primary risks."
---

# Unity / C#

## Discover first

Read `ProjectSettings/ProjectVersion.txt` and `Packages/manifest.json` for the Unity editor version,
installed packages (e.g. UniTask, VContainer/Zenject, Input System, Addressables, TextMeshPro), and C#
features. Inspect existing assembly definitions (`*.asmdef`) before placing or referencing new code.

## Conventions

- **`UnityEngine.Object` fake null**: Never use C# pattern matching (`obj is null`, `obj is not null`,
  `obj is Type t`), null-conditional (`obj?.Method()`), null-coalescing (`obj ?? fallback`), compound
  assignment (`obj ??= fallback`), or `object.ReferenceEquals(obj, null)` on types deriving from
  `UnityEngine.Object`. These operators perform pure CLR reference checks, bypassing Unity's overloaded
  `==` and `!=` operators (which verify whether the underlying C++ engine object is alive via `m_CachedPtr`).
  Destroyed objects remain non-null in CLR memory until GC: `is null` evaluates to `false`, `is not null`
  evaluates to `true`, `obj is Type t` succeeds even if destroyed (leading to subsequent `MissingReferenceException`),
  `obj?.Method()` attempts invocation on the destroyed engine object, and `obj ?? fallback` evaluates to
  the destroyed object. For interface references (`IMyInterface comp`) and unconstrained generics
  (`where T : class`), `comp == null` bypasses Unity's operator overload and uses CLR reference equality;
  cast explicitly to `UnityEngine.Object` (or constrain `where T : UnityEngine.Object`) before checking.
  Always use explicit `obj == null`, `obj != null`, or `if (obj)` on `UnityEngine.Object` types.
- **Zero GC alloc in high-frequency loops**: In `Update()`, `FixedUpdate()`, `LateUpdate()`, physics loops,
  and render callbacks:
  - Eliminate heap allocations (GC Alloc): avoid `new`, closure lambdas capturing variables, LINQ
    (`.Where()`, `.Select()`), string concatenation/interpolation (`$"{x}"`), and boxing of value types / enums.
  - Tag comparison: always use `gameObject.CompareTag("Tag")`; never `gameObject.tag == "Tag"` (which allocates a new string).
  - Cache lookups in `Awake()` or `Start()`: never call `GetComponent<T>()`, `GameObject.Find()`,
    `FindAnyObjectByType<T>()` / `FindObjectsByType<T>()`, or `Camera.main` inside frame update methods.
  - For dynamic lookups that cannot be cached, use `TryGetComponent<T>(out var comp)` to avoid internal allocations.
  - Use non-allocating API variants: e.g. `Physics.RaycastNonAlloc` or `Physics.OverlapSphereNonAlloc`
    with preallocated buffers, and collection overloads (`GetComponents(List<T>)`).
  - Cache property IDs: use `Shader.PropertyToID("...")` and `Animator.StringToHash("...")` in static readonly
    fields instead of passing string literals each frame.
  - Avoid `renderer.material` which instantiates and leaks material clones at runtime; use `MaterialPropertyBlock`
    or `renderer.sharedMaterial`.
  - Avoid `yield return new WaitForSeconds(...)` in coroutine loops; cache yield instructions or use async/UniTask.
- **Inspector serialization invariants**:
  - Prefer `[SerializeField] private` (or `protected`) over `public` fields to expose configuration in
    the Inspector while maintaining encapsulation.
  - Use `[System.NonSerialized]` to exclude public fields from serialization; `[HideInInspector]` only
    hides the field in the Inspector UI while Unity still serializes it.
  - Unity only serializes fields (never properties `{ get; set; }`, static, const, or readonly fields),
    cannot serialize `Dictionary<K, V>` or `HashSet<T>` natively, and requires `[System.Serializable]`
    on custom classes/structs. Use `[SerializeReference]` for polymorphic classes or interfaces (plain
    `[SerializeField]` slices derived class data).
  - Field renaming requires `[FormerlySerializedAs("oldFieldName")]` (from `UnityEngine.Serialization`)
    to avoid silent data loss in scenes and prefabs. Note that `[FormerlySerializedAs]` only remaps names;
    changing a field's type requires custom migration (e.g. `ISerializationCallbackReceiver`) or editor scripts.
  - Treat `.unity` (scenes), `.prefab` (prefabs), `.asset` (ScriptableObjects), and their `.meta` files
    (which store asset GUIDs) as authoritative data boundaries: avoid raw text manipulation of YAML files,
    never move/delete asset files without their matching `.meta`, and preserve file IDs and GUIDs.
- **Lifecycle and event isolation**:
  - Symmetrical event subscriptions: balance subscriptions in `OnEnable()` with unsubscriptions in
    `OnDisable()`, and subscriptions in `Awake()` / `Start()` with unsubscriptions in `OnDestroy()`.
    Never subscribe anonymous lambdas or local functions (`+= () => ...`) without storing the delegate
    reference, as they cannot be unsubscribed and will leak memory or invoke destroyed handlers.
  - Background async tasks (`Task`, `async UniTask`) do not terminate when a `MonoBehaviour` is
    destroyed. Link all async tasks to `destroyCancellationToken` (Unity 2022.2+) or
    `this.GetCancellationTokenOnDestroy()` (UniTask), or cancel a `CancellationTokenSource` in `OnDestroy()`.
  - Avoid `async void` outside event handlers: unhandled exceptions crash synchronization contexts, and
    lifecycle methods like `async void Update()` spawn uncontrolled concurrent loops; prefer `async UniTaskVoid`
    with error handling or cancellable tasks.
  - Coroutines survive component disable (`enabled = false`) and only stop when the `GameObject` is
    deactivated or destroyed; stop them explicitly via `StopCoroutine()` if tied to component state.
- **Thread boundaries**:
  - All Unity Engine APIs (Transforms, GameObjects, Component access, Physics, GUI) must execute
    exclusively on the main thread; calling them from background threads throws `UnityException`.
  - For multithreaded computation, use the Unity C# Job System (`IJob`, `IJobParallelFor`) with Burst
    and unmanaged structs. Always dispose native containers (`NativeArray<T>.Dispose()` or pass a
    completing `JobHandle`) to prevent unmanaged native memory leaks.
  - When using `async` / `await` or worker threads, dispatch execution back to the main thread
    (e.g. `await UniTask.SwitchToMainThread()` or a synchronization context) before invoking Unity APIs.
    Never use `.ConfigureAwait(false)` on operations that resume into Unity API calls.
- **Assembly boundaries**:
  - Organize code into Assembly Definition files (`.asmdef`). Runtime assemblies must never depend
    on Editor assemblies (`UnityEditor`); referencing editor code compiles in the Editor but breaks
    standalone player builds in CI/CD. Place editor tools in dedicated `Editor/` folders or editor
    `.asmdef`s, and guard inline editor helpers with `#if UNITY_EDITOR`. Test assemblies must be
    designated for testing and excluded from release builds.

## Commands — discover first

```bash
# Verify compilation in headless batchmode (exits non-zero on compilation error)
Unity.exe -batchmode -nographics -silent-crashes -logFile - -projectPath . -quit

# Run Unity tests in headless batchmode (adjust Unity path for OS / installed editor)
Unity.exe -batchmode -nographics -silent-crashes -logFile - -runTests -projectPath . -testPlatform EditMode -testResults Logs/editmode-results.xml
Unity.exe -batchmode -nographics -silent-crashes -logFile - -runTests -projectPath . -testPlatform PlayMode -testResults Logs/playmode-results.xml
```
