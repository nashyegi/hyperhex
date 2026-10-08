# Technical model and architecture

[Project overview](../README.md) · [Research guide](research.md) ·
[Development guide](development.md)

HyperHex models urban low-altitude drone corridors as discrete geographic cells,
altitude layers, and time slots. This guide describes the current implementation,
not a specification of operational drone behavior or a proof of safety.

## Implementation map

| Component | Responsibility |
| --- | --- |
| [`src/lib/hyperhex.ts`](../src/lib/hyperhex.ts) | Scenario generation, reservations, planning, route repair, conflicts, and metrics |
| [`src/components/Workbench.tsx`](../src/components/Workbench.tsx) | Simulation controls, CesiumJS rendering, inspection, playback, and comparison table |
| [`src/routes/index.tsx`](../src/routes/index.tsx) | Client-rendered workbench route |
| [`src/routes/__root.tsx`](../src/routes/__root.tsx) | Shared document shell, metadata, fonts, and error boundary |
| [`src/server.ts`](../src/server.ts) and [`src/start.ts`](../src/start.ts) | TanStack Start server integration and error handling |
| [`vite.config.ts`](../vite.config.ts) | Build configuration through the existing platform integration |

The engine maintains simulation state in memory. The reviewed application does not
implement accounts, persistent experiment storage, live vehicle integration, or an
experiment-export endpoint. The server infrastructure does not make the simulation
a centralized drone-coordination service; workbench simulation state is local to
the application instance.

## Coordinates and time

A trajectory state contains an H3 cell identifier, altitude-layer index, and integer
time-slot index. A cell encodes the two horizontal dimensions, giving a four-dimensional
model when altitude and time are included.

| Parameter | Current value |
| --- | --- |
| Geographic origin | Latitude 37.7793, longitude -122.4193, San Francisco |
| H3 resolution | 9 |
| Layer bases | 60 m, 100 m, 140 m |
| Rendered layer thickness | 30 m |
| Rendered bands | 60 to 90 m, 100 to 130 m, 140 to 170 m |
| Time represented by a slot | 4 seconds |
| Workbench playback range | Slots 0 to 60 |
| Transit-fleet selections | 12, 24, 36, 48, 72 |
| Additional demonstration drones | 3 |

Altitude layers are simplified model parameters, not validated terrain-relative
clearances. The renderer positions drones at band midpoints and can exaggerate
heights by 1×, 3×, or 6×. The globe does not supply a terrain/building clearance
model. Do not interpret displayed heights as authorized operating altitudes.

Playback is an animation of the discrete model, not real-time drone operation.
The mobile timeline currently appends `s` to a slot counter; interpret engine times
as slot indices and multiply by four for simulated seconds. The workbench range is
also distinct from the planner's search limits, so a displayed timeline need not
cover every state in a generated trajectory.

H3 supplies the geographic indexing and neighborhood operations. HyperHex uses a
fixed resolution in this demonstration; it does not implement adaptive-resolution
routing or a new global grid system. H3's spherical grid includes pentagons, so
"hexagonal" is not a claim that every possible H3 cell is a hexagon.

## Reservation ledger

The ledger stores:

- Node occupancy intervals keyed by `(cell, layer)`.
- Movement-edge intervals keyed by an unordered pair of node identifiers.
- An owner identifier for each reservation.

Consecutive states occupying the same node are compressed into inclusive intervals.
Safe intervals are gaps in other owners' reservations. Undirected edge reservations
prevent coordinated drones from reserving opposite directions on the same edge
at the same departure slot.

This is sparse storage of reservations, not a materialized grid of every location
at every time. Despite the source comment's wording about "contention," the ledger
stores reserved resources even when no competing request exists.

## Coordinated planning

The `sipp` function uses a search based on Safe Interval Path Planning. Horizontal
neighbors come from H3; vertical neighbors are adjacent layers in the same cell.
Each transition advances one slot. Waiting is represented by repeated occupancy
of the same node before departure.

The heuristic uses horizontal H3 grid distance. Vertical moves receive an additional
0.4 priority term; this is not a physical energy or travel-time model. The search
has implementation bounds, including a 20,000-expansion cap, a `MAX_T` value of 90,
and a per-expansion departure-wait bound of 30 slots. These limits must be considered
when interpreting a failed search; the implementation does not establish general
completeness or globally optimal fleet scheduling.

Drones are admitted sequentially in generated order, with each successful route
reserved before the next request. Order therefore matters. There is no joint
multi-agent optimizer, fairness guarantee, or uncertainty-aware separation model.

## Controller definitions

| Controller | Behavior |
| --- | --- |
| HyperHex | Plans against node and edge reservations, then reserves successful trajectories. Attempts local repair for affected drones. |
| Static geofence | Calls the route planner without the reservation ledger. Avoids blocked horizontal cells but does not coordinate drones. It also attempts rerouting after an injected closure. |
| Reactive | Generates routes without the ledger, then simulates movement slot by slot, waiting when a destination is occupied or already claimed. After five blocked holds, it can move despite the blockage. |

"Static geofence" is the existing UI label, not a claim that the controller never
reroutes. "Reactive" denotes this particular simplified controller, not the whole
class of reactive avoidance algorithms. All three controllers share parts of the
route-planning implementation; they are not independent external baseline packages.

## Scenario and closure event

The generator places synthetic origin/destination pairs on rings around the origin.
Transit departures span approximately 18 slots, so increasing fleet size increases
traffic density within a similar departure window. Initial layers depend on route
bearing. Three extra drones start at slot 28 to demonstrate shared horizontal
location at different heights.

The workbench's **Inject no-fly zone** action blocks the center cell and its radius-1
H3 neighborhood: seven cells in this scenario. The closure is cell-based across
layers, persists until reset, and does not come from an external restriction feed.
The UI and code also label this event **TFR**. In HyperHex it is only a simulated
closure, not an authoritative restriction or authorization.

For coordinated repair, the engine identifies affected future paths, releases the
drone's future reservations, and attempts a replacement route against remaining
reservations. It does not reroute the entire fleet or model closure expiry.

## Metric definitions

| Metric | Current meaning and caveat |
| --- | --- |
| Conflicts | Count returned by `findConflicts` over stored trajectories: shared cell/layer/slot events and detected horizontal head-on swaps. Not a physical collision probability or a count of unique incidents. |
| Delay | Sum, for drones reaching their destination, of final slot minus departure slot minus horizontal H3 grid distance. Units are slots; multiply by four for seconds. Drones that do not arrive do not contribute. |
| Arrived | Number of stored trajectories ending at the destination, not necessarily arrivals already elapsed at the playback cursor. |
| Replans | Number of route-repair attempts for affected drones, including failed attempts. |
| Ledger | Number of node reservation intervals. Excludes edge intervals and is not memory usage in bytes. |
| Planning time | Accumulated `performance.now()` duration inside planning calls. HyperHex includes both an uncoordinated reference call and a coordinated call at admission. Excludes rendering and other work; not shown in the comparison table. |
| Airborne | Workbench count based on current slot and whether a drone's latest state has reached its destination. |

Most summary metrics describe the complete stored plan, while the event log is
filtered by playback time. Read conflicts alongside arrivals and delay; a controller
that fails to move drones is not necessarily performing better because it reports
fewer conflicts or less delay.

## Known limitations requiring validation

- Movement is discrete and idealized. Speed, acceleration, vehicle size, wind,
  navigation error, communications delay, and continuous-time separation are not
  modeled. Vertical transitions take one slot regardless of vehicle capability.
- Conflict checking is not a full physical-separation test. The swap detector
  requires different horizontal cells and does not count same-cell vertical swaps.
- Destination occupancy is not reserved indefinitely after arrival.
- On failed coordinated repair, future reservations have already been released,
  while the old path is retained and a "holding" event is logged. This is not a
  validated holding maneuver or safe fallback.
- Drones already inside a newly closed cell are skipped by the repair condition.
  There is no modeled emergency evacuation procedure.
- The reactive simulator's departure handling should be tested explicitly,
  particularly for slot-zero departures, before drawing comparative conclusions.
- The scenario and stack demonstration are synthetic and intentionally constructed.
  Results do not establish performance across cities, arbitrary H3 regions, or
  general demand distributions.
- The existing test suite checks route rendering, not these engine invariants.

These limitations describe the current implementation and should accompany research
results. Planned improvements must be reported separately from implemented behavior.
