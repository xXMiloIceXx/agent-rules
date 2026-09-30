---
trigger: glob
globs: "**/*.ipynb"
description: "Jupyter notebook and AI/ML experiment conventions: reproducibility, notebook hygiene, and what must never be committed."
---

# Jupyter Notebooks & AI Experiments

Activated by touching a `.ipynb`. Read this before editing or running a notebook, and before
reporting any number that came out of one.

## Discover first

- Read the notebook's kernel metadata and the project's environment file (`pyproject.toml`,
  `requirements.txt`, `environment.yml`) and use the environment the project already has.
- Check whether the project **commits outputs**. Follow that policy — do not silently change it
  in either direction.
- Look at how existing notebooks in the repo are structured before adding another.

## The one rule that matters most

**A notebook is only reproducible if it runs top to bottom from a clean kernel.** A result that
depends on a deleted cell, an out-of-order run, or state left by an earlier experiment is not a
result.

- Before believing or reporting an output, **restart and run all**.
- Before committing, strip outputs unless the project deliberately keeps them.
- Keep cells in execution order. An appended "one more check" cell at the bottom that depends on
  state from the middle is the classic failure.

## Put logic in modules, orchestration in the notebook

- Reusable logic belongs in a `.py` module that the notebook imports. Notebooks orchestrate and
  display; they do not become the library.
- Anything long-running, scheduled, or worth testing belongs in a script with real logging, not in
  a cell someone re-runs by hand.
- If a cell is needed by two notebooks, it is a module.

## Experiments that are meant to be believed

- **Record the seed** for anything stochastic, and set it in the cell that produces the number.
- **Record the data**: which version, snapshot or hash; which split. "The dataset" is not a
  version.
- **Name the evaluation set** next to every metric, and never tune on the set you report.
- **Pin versions** for anything whose numbers you cite; an unpinned environment makes the number
  unreproducible even if the code is identical.
- **Separate the stages** — data preparation, training, evaluation — into distinct notebooks or
  modules rather than one growing notebook that does all three.
- Prefer one notebook per question. A notebook called `misc.ipynb` becomes unmaintainable.
- For model or agent experiments, record the **model name and version, the temperature, and the
  prompt version** alongside the results. A prompt is an input to the experiment like any other.

## Things that must never be committed

- **Credentials**: API keys for model providers, database URLs, tokens. They hide in cell outputs
  as well as in source — which is another reason to strip outputs.
- **Large data files**, model weights, or generated artefacts. Reference a path or an id instead.
- **Personal or production data.** If a notebook reads real data, do not commit its head as an
  example.

## Presentation

- One idea per cell; a cell that produces five unrelated outputs produces none of them legibly.
- Label plot axes with units. A figure without units is decoration, not evidence.
- Do not leave dead cells, commented-out experiments, or `print()` debugging in a committed
  notebook — that is what the module and a test are for.
- Markdown cells should record *why* a step is there and what the result meant, not restate the
  code.

## Commands to look for

```bash
jupyter lab                                  # interactive work
jupyter nbconvert --to notebook --execute --inplace  # what "restart and run all" means in CI
nbstripout                                   # strip outputs on commit, if the project uses it
papermill notebook.ipynb out.ipynb -p seed 0 # parameterised runs
pytest --nbmake                              # if the project tests notebooks
```

Use the tools the project already configures. If none are present, say so rather than adding one
as a side effect of an unrelated task.
