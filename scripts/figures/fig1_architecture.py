#!/usr/bin/env python3
"""Figure 1: HyperHex architecture (ledger, SIPP admission, closure repair and fallback ladder)."""
import sys
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
out = sys.argv[1]
fig, ax = plt.subplots(figsize=(11, 6.4)); ax.set_xlim(0, 110); ax.set_ylim(0, 64); ax.axis("off")
def box(x, y, w, h, title, body="", fc="#f8fafc", ec="#334155", tc="#0f172a"):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.4,rounding_size=1.2", fc=fc, ec=ec, lw=1.2))
    ax.text(x + w / 2, y + h - 2.2, title, ha="center", va="top", fontsize=9.5, weight="bold", color=tc)
    if body: ax.text(x + w / 2, y + h - 5.4, body, ha="center", va="top", fontsize=7.6, color="#1e293b", linespacing=1.35)
def arrow(x0, y0, x1, y1, label="", rad=0.0, color="#334155"):
    ax.add_patch(FancyArrowPatch((x0, y0), (x1, y1), arrowstyle="-|>", mutation_scale=12, lw=1.2, color=color, connectionstyle=f"arc3,rad={rad}"))
    if label: ax.text((x0 + x1) / 2, (y0 + y1) / 2 + 1.2, label, ha="center", fontsize=7.2, color=color, style="italic")
box(2, 44, 22, 16, "Mission requests", "origin cell, destination cell,\ndeparture slot, initial layer\n(synthetic, seeded)")
box(32, 44, 30, 16, "SIPP admission", "sequential, in admission order\nA* over (node, safe interval)\nh = H3 grid distance\nfail → ground hold (not launched)", fc="#eff6ff", ec="#1d4ed8")
box(72, 40, 35, 22, "Sparse 4D interval ledger", "node key (H3 cell h, layer k):\n  sorted intervals [t_a, t_b] + owner\nedge key {v, v'}: move intervals\n(blocks head-on and vertical swaps)\nmissing key = free at all times\nstorage ∝ traffic, not grid size", fc="#fffbeb", ec="#b45309")
arrow(24, 52, 32, 52, "requests")
arrow(62, 55, 72, 55, "reserve path")
arrow(72, 47, 62, 47, "safe intervals")
box(2, 22, 22, 15, "Closure event", "cells F = H3 disk(centre, r)\nall layers, from slot t_f\n(TFR / no-fly zone)", fc="#fef2f2", ec="#b91c1c")
box(32, 3, 48, 32, "Repair and fallback ladder (affected drones only)", "", fc="#f0fdf4", ec="#15803d")
steps = ["0  release own reservations from t_f",
         "1  not departed → replan, else cancel on ground",
         "2  inside F → evacuate: earliest reservable exit",
         "3  repair: SIPP to destination, F excluded",
         "4  fails / destination closed → contingency",
         "    landing at earliest reachable open cell (L0)",
         "every new path is reserved in the ledger"]
for i, s in enumerate(steps): ax.text(35, 29.5 - i * 3.6, s, fontsize=8, color="#14532d" if i < 6 else "#166534", style="italic" if i == 6 else "normal", family="monospace")
arrow(24, 29, 32, 29, "affected set")
arrow(74, 35.6, 74, 39.6, color="#15803d")
ax.text(73, 37.4, "reserve", ha="right", va="center", fontsize=7.2, color="#15803d", style="italic")
arrow(78, 39.6, 78, 35.6, color="#b45309")
ax.text(79, 37.4, "free intervals", ha="left", va="center", fontsize=7.2, color="#b45309", style="italic")
box(86, 3, 21, 30, "Outputs", "per-slot trajectories\n(cell, layer, slot)\n\nmetrics: conflicts,\narrivals, delay, holds,\ndiverted, cancelled\n\nCesiumJS workbench /\nheadless harness", fc="#f5f3ff", ec="#6d28d9")
ax.text(55, 63, "Corridor unit = H3 res-9 cell × altitude layer (60/100/140 m bases) × 4-s slot", ha="center", fontsize=9, color="#475569")
arrow(96, 39.6, 96, 33.6, "trajectories")
fig.tight_layout(); fig.savefig(out, dpi=200)
