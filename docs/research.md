# Research and reproducibility

[Project overview](../README.md) · [Technical model](technical-model.md) ·
[Development guide](development.md)

HyperHex supports exploratory research and teaching about urban low-altitude drone
corridors. Its current demonstration is an inspectable implementation of a discrete
reservation model, not a validated operational system or a published performance
claim.

## Questions the prototype helps explore

- How do altitude and time change the interpretation of shared geographic routes?
- How does sequential reservation planning affect the generated trajectories?
- What happens when a corridor segment becomes unavailable after initial planning?
- How do this implementation's coordination strategies behave as synthetic traffic
  density increases?

These are experiment prompts, not conclusions. H3 and Safe Interval Path Planning
are existing foundations; publications should distinguish those foundations from
any claimed contribution in HyperHex's formulation, implementation, or evaluation.
A novelty or patentability claim requires its own prior-art and technical analysis.

## Reproduce the built-in comparison

1. Record the repository commit and any local modifications. For a local run, follow
   the [development guide](development.md) and retain the committed lockfile.
2. Record your operating system, hardware, browser, and runtime versions.
3. Choose one transit-fleet size: 12, 24, 36, 48, or 72. Add three when reporting the
   total number of drones.
4. Read the **Benchmark** table. For each controller, it constructs the same scenario,
   injects the central radius-1 closure at slot 8, and calculates summary metrics.
   Slot 8 represents 32 simulated seconds.
5. To inspect the corresponding event visually, reset the selected controller,
   ensure playback is paused, scrub to slot 8, and inject the no-fly zone. Repeat for
   each controller without changing fleet size or the injection slot.
6. Record conflicts, delay, and arrived/total together. Include relevant failures
   and event-log observations, not only successful trajectories.
7. Repeat with other fleet sizes and distinguish each scenario configuration.

The comparison table is independent of manual playback and injection timing. A
manual closure at a different slot does not update the table's slot-8 experiment.
Changing the controller resets the simulation, so repeat the event explicitly.

Scenario generation is deterministic for a given implementation, dependency set,
and input configuration; there is no exposed random seed. This is not a guarantee
of identical behavior across different versions. Planning-time measurements also
depend on hardware, runtime state, and timing noise.

## Headless engine entry point

The engine exports `benchmark(tfrAt = 8, fleet = 12)` from
[`src/lib/hyperhex.ts`](../src/lib/hyperhex.ts). It returns a controller-keyed record
of metrics after constructing each scenario and injecting the closure. It does
not require Cesium rendering.

There is currently no checked-in benchmark CLI, batch runner, result-file exporter,
or statistical analysis pipeline. Using the exported function in a separate harness
requires you to document that harness and its runtime; do not report it as a
built-in command or feature.

## Reporting checklist

For a report, paper, classroom exercise, or derived dataset, include:

| Item | What to record |
| --- | --- |
| Software identity | Repository URL, exact commit or release, and modifications |
| Dependencies | Lockfile, package-manager version, runtime version, and install procedure |
| Execution environment | OS, browser/runtime, CPU, memory, and relevant graphics conditions |
| Scenario | Origin, H3 resolution, layers, slot duration, transit fleet, and total fleet |
| Closure | Center, H3 radius, injection slot, and persistent-until-reset behavior |
| Controllers | Exact implemented policies, admission order, and baseline limitations |
| Metrics | Definitions, units, aggregation rules, and treatment of non-arriving drones |
| Results | Failures as well as successes, raw observations, and analysis procedure |
| Visualizations | Playback slot, camera, and vertical exaggeration |
| Timing studies | What is timed, warm-up procedure, repetitions, and uncertainty summaries |

The [technical model](technical-model.md) defines the metrics and documents known
limitations. In particular, forced moves in the reactive baseline and failed-repair
behavior must be disclosed when they affect results. Do not label a comparison
"collision-free" or "safe" solely because the discrete detector returns zero.

## Validation needed for stronger claims

Before using this implementation to support comparative performance or safety
claims, an evaluation should address:

- Unit and property tests for reservations, interval boundaries, releases, conflict
  detection, admission times, and failed repairs.
- Diverse scenarios beyond the single ring-based demand generator and constructed
  altitude-stack example.
- Documented, justified baseline policies and sensitivity to admission order.
- Complete outcomes for failed or non-arriving drones rather than delay alone.
- Movement and separation assumptions, including vertical transitions and behavior
  between sampled states.
- Reproducible result artifacts tied to a reviewed code version.

These are evaluation requirements, not a claim that the repository already provides
these tests, datasets, or experimental results. The checked-in tests currently cover
route-rendering smoke checks.

## Citation and publication status

Use [CITATION.cff](../CITATION.cff) for the software title, author, and repository.
Include the actual commit or release used and your access date in your bibliography
or methods section. Do not substitute the live demonstration for a versioned
research artifact: its contents can change.

Suggested citation structure:

> Yegireddi, Naresh. HyperHex: Urban Low-Altitude Drone Corridor Research Simulator.
> Software. https://github.com/nashyegi/hyperhex. Specify the commit or release used
> and the actual access date.

The repository documentation does not currently supply a paper DOI, an archived
software-release DOI, or a patent identifier. This does not assert that none exists;
verified bibliographic and legal details must be supplied by the maintainer before
they can be listed. Do not describe a manuscript as peer-reviewed, or an application
as a granted patent, without the corresponding evidence.

For a citable research release, archive the exact reviewed version, attach the
reproduction materials, and update citation metadata with its actual version,
release date, and DOI. Cite the software and any associated paper separately when
both are relevant. Follow the target venue's requirements for acknowledging
AI-assisted development; development-tool use is not evidence of scientific novelty.

## Sharing derived work

Forks, replication reports, classroom uses, and nonprofit research applications are
welcome under the applicable license. Please distinguish your modifications and
conclusions from upstream results. Citation is requested as scholarly practice, not
as an extra licensing restriction.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the current collaboration policy and
[NOTICE.md](../NOTICE.md) for licensing and patent considerations. Direct research
and partnership inquiries to
[Naresh Yegireddi](mailto:yegireddi.naresh@gmail.com).
