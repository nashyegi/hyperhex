#!/usr/bin/env python3
"""Figure 2 (headless substitute for a CesiumJS screenshot): three drones sharing one H3 tile on three layers."""
import json, sys
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
d = json.load(open(sys.argv[1])); out = sys.argv[2]
LAYERS, H, EX = [60, 100, 140], 30, 3  # band bases (m), band thickness (m), vertical exaggeration
fig = plt.figure(figsize=(8, 6.2)); ax = fig.add_subplot(111, projection="3d")
def prism(bnd, z0, z1, fc, ec, a):
    faces = [[(x, y, z0) for x, y in bnd], [(x, y, z1) for x, y in bnd]]
    for i in range(len(bnd)):
        (x0, y0), (x1, y1) = bnd[i], bnd[(i + 1) % len(bnd)]
        faces.append([(x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1)])
    ax.add_collection3d(Poly3DCollection(faces, facecolors=fc, edgecolors=ec, linewidths=0.4, alpha=a))
for c in d["cells"]:
    ax.add_collection3d(Poly3DCollection([[(x, y, 0) for x, y in c["boundary"]]], facecolors="#e5e7eb", edgecolors="#9ca3af", linewidths=0.6, alpha=0.6))
    for L in LAYERS:
        if c["center"]: prism(c["boundary"], L * EX, (L + H) * EX, "#f59e0b", "#b45309", 0.10)
        else: prism(c["boundary"], L * EX, (L + H) * EX, "#cbd5e1", "#94a3b8", 0.04)
for tr in d["tracks"]:
    xs = [p["xy"][0] for p in tr["pts"]]; ys = [p["xy"][1] for p in tr["pts"]]; zs = [(LAYERS[p["layer"]] + H / 2) * EX for p in tr["pts"]]
    ax.plot(xs, ys, zs, "-", color=tr["color"], lw=1.6)
    now = [p for p in tr["pts"] if p["t"] == d["t"]][0]
    ax.scatter([now["xy"][0]], [now["xy"][1]], [(LAYERS[now["layer"]] + H / 2) * EX], s=70, color=tr["color"], edgecolors="k", depthshade=False, label=f'{tr["id"]} on L{tr["layer"]} ({LAYERS[tr["layer"]]}–{LAYERS[tr["layer"]] + H} m)')
    ax.plot([now["xy"][0]] * 2, [now["xy"][1]] * 2, [0, (LAYERS[now["layer"]] + H / 2) * EX], ":", color=tr["color"], lw=0.8)
ax.set_xlabel("East (m)"); ax.set_ylabel("North (m)"); ax.set_zlabel(f"Altitude × {EX} (m, exaggerated)")
zt = [0, 60, 100, 140, 170]; ax.set_zticks([z * EX for z in zt]); ax.set_zticklabels([str(z) for z in zt])
ax.set_xlim(-600, 600); ax.set_ylim(-600, 600); ax.set_zlim(0, 180 * EX); ax.view_init(elev=22, azim=-58)
ax.legend(loc="upper left", fontsize=8, framealpha=0.9)
ax.set_title(f"Slot {d['t']} ({d['t']*4} s): three drones share H3 tile {d['cell']} on layers L0–L2\n"
             "(trajectories ±2 slots; neighbouring prisms grey). Headless matplotlib rendering of simulator output, not a CesiumJS screenshot.", fontsize=8.5)
fig.tight_layout(); fig.savefig(out, dpi=200)
