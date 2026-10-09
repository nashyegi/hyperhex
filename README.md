# HyperHex

## Urban low-altitude drone corridor research simulator

HyperHex explores how drones can share urban low-altitude drone corridors through
four-dimensional reservations: **H3 geographic cells × altitude layers × time slots**.
It combines an interval-based reservation engine with an interactive 3D workbench
for comparing coordination strategies, inspecting conflicts, and exploring route
repair when a corridor segment becomes unavailable.

Created and maintained by **Naresh Yegireddi**.

[Live demonstration](https://hyperhex.dev) ·
[Source repository](https://github.com/nashyegi/hyperhex) ·
[Technical model](docs/technical-model.md) ·
[Research and reproducibility](docs/research.md)

> **Research prototype:** HyperHex explores a proposed framework for coordinating
> urban low-altitude drone corridors. Using synthetic traffic and a simplified
> movement model, it provides a foundation for research, teaching, and experimentation
> in this evolving field. The current prototype demonstrates the concepts through
> simulation, with real-world implementation and validation remaining future work.

## Why HyperHex?

A geographic route alone does not describe when a drone occupies a location or how
another drone might use the same location at a different height. HyperHex makes
these relationships visible by treating corridor occupancy as a resource that can
be reserved in both space and time.

The project builds on the creator's interest in hierarchical hexagonal geospatial
indexing, including a talk at the 2023 Databricks AI Summit in San Francisco. Its
current focus is a small-scale, inspectable simulation of urban low-altitude drone
corridors. Broader autonomous-mobility applications remain a research direction,
not an implemented capability.

## What you can explore

- **4D reservations:** inspect H3 cells occupied at a particular altitude and time.
- **Coordinated planning:** explore routing based on Safe Interval Path Planning
  with cell and movement-edge reservations.
- **Controller comparisons:** compare HyperHex with simplified static-geofence and
  reactive controllers using the same generated drone route requests.
- **Route repair:** inject a no-fly zone and observe attempts to reroute affected
  drones without replanning the entire fleet.
- **Traffic density:** select 12, 24, 36, 48, or 72 transit drones, with three
  additional drones demonstrating vertically separated use of a shared tile.
- **Interactive inspection:** pause, scrub the timeline, inspect a drone's tile,
  switch camera views, and exaggerate vertical scale for visibility.
- **Simulation metrics:** examine discrete conflicts, aggregate delay, arrivals,
  replans, and reservation-ledger size.

The scenario is synthetic and centered on San Francisco. It is not a dataset of
recorded drone movements or a map of authorized drone routes. See the
[technical model](docs/technical-model.md) for controller assumptions and metric
definitions.

## How it works

1. Generate synthetic drone route requests.
2. Represent corridor occupancy using H3 cells, altitude layers, and time slots.
3. Use the selected controller to calculate trajectories and, for HyperHex, reservations.
4. Attempt route repair when a no-fly-zone event affects a drone's planned route.
5. Inspect the resulting trajectories and metrics in the CesiumJS workbench.

The current model uses H3 resolution 9, three altitude bands, and four-second time
slots. Horizontal moves follow neighboring H3 cells; vertical moves connect adjacent
layers. HyperHex plans drone routes sequentially against an interval ledger. The
workbench renders those discrete trajectories; it is not a vehicle-dynamics simulator.

## Quick start

You need Git, Bun, Node.js compatible with the project's dependencies, and a browser
with WebGL support. Bun is the documented package manager because the repository
contains `bun.lock` and `bunfig.toml`.

```sh
git clone https://github.com/nashyegi/hyperhex.git
cd hyperhex
bun install --frozen-lockfile
bun run dev
```

Open the local URL printed by the development server. The workbench requires network
access for external resources such as CesiumJS, map tiles, and fonts.

The repository does not yet pin tested Node.js and Bun versions. These commands
reflect the checked-in configuration, not a certified runtime compatibility matrix.
See [development and deployment](docs/development.md) for available scripts, asset
portability, and installation limitations.

## Try a first experiment

1. Open the demonstration and select **HyperHex** with **12** transit drones.
2. Pause playback and use a **same tile · different altitude** shortcut to inspect
   the three-layer demonstration.
3. Reset, ensure playback is paused, and scrub to slot **8**. Select **Inject no-fly
   zone** and inspect the event log and affected trajectories.
4. Repeat with **Static geofence** and **Reactive**, keeping the fleet size and event
   slot unchanged.
5. Compare the benchmark table, which independently runs the same scenario with a
   no-fly event at slot 8. It does not follow the timing of your manual injection.

The default selection contains **15 drones total**: 12 transit drones and three
stack-demonstration drones. A slot represents four simulated seconds; playback
speed and vertical exaggeration are presentation controls.

## Research status and limitations

HyperHex currently provides a synthetic scenario generator, a reservation engine,
controller comparisons, and a browser workbench. It does not model terrain-aware
clearance, buildings, weather, vehicle dynamics, navigation uncertainty, or live
drone telemetry. The altitude bands are model parameters, not regulatory guidance.

The comparison controllers are deliberately simplified. In particular, the reactive
controller can move into a blocked destination after five holds. The comparison is
an illustration of these implementations, not evidence of superiority over all
reactive or operational systems.

The existing automated tests are routing smoke tests, not validation of planner
correctness or safety. Known implementation limitations, metric definitions, and
requirements for reporting experiments are documented in the
[technical model](docs/technical-model.md) and [research guide](docs/research.md).

## Documentation

| Guide | Contents |
| --- | --- |
| [Technical model and architecture](docs/technical-model.md) | Coordinates, reservations, controllers, metrics, and implementation limitations |
| [Research and reproducibility](docs/research.md) | Experiment procedure, reporting checklist, citation, and publication status |
| [Development and deployment](docs/development.md) | Local workflow, scripts, hosting boundaries, and external resources |
| [Collaboration and forks](CONTRIBUTING.md) | Bug reports, research collaboration, and the current contribution policy |
| [Licensing notice](NOTICE.md) | AGPL permissions, alternative licensing, and patent considerations |
| [Third-party components](THIRD_PARTY_NOTICES.md) | Dependency and service attribution inventory and its limits |

## Citation and collaboration

If you use HyperHex in research or teaching, please cite the software and identify
the exact commit or release used. Machine-readable author and repository metadata
is available in [CITATION.cff](CITATION.cff). Citation is an academic request, not an
additional restriction on the software license.

No paper DOI, patent identifier, or archived software-release DOI is supplied by
this repository's documentation. Do not infer publication, peer-review, or patent
status from the demonstration. See the [research guide](docs/research.md) for how to
report and share work based on HyperHex.

Forks, replication studies, bug reports, teaching applications, and research
partnership inquiries are welcome. Upstream pull requests are not currently
accepted; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

HyperHex is copyright © 2026 Naresh Yegireddi and is available under the
[GNU Affero General Public License v3.0 only](LICENSE.md) (`AGPL-3.0-only`),
supplemented by an author-attribution term under Section 7(b). Third-party
materials retain their respective rights and license terms.

- Academic, nonprofit, personal, and **commercial use are permitted**, subject to
  the AGPL's conditions. Organization type does not create an automatic exemption.
- Distribution carries source and notice obligations. Modified versions supporting
  remote network interaction must offer their Corresponding Source to those users
  as specified in Section 13.
- All copies and modified versions must preserve the project attribution to
  Naresh Yegireddi wherever legal or copyright notices appear, as required by the
  Section 7(b) term in [LICENSE.md](LICENSE.md).
- Organizations needing alternative permissions may inquire about a separate
  commercial agreement. Commercial activity alone does not require one.
- The AGPL includes an explicit patent grant with a defined scope; see Section 11
  and the [licensing notice](NOTICE.md).

The license text governs; this summary does not add restrictions or exceptions.

**Research, licensing, and partnership inquiries:**
Naresh Yegireddi, [contact@hyperhex.dev](mailto:contact@hyperhex.dev)
