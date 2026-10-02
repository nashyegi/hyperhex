import { useEffect, useRef, useState } from "react";
import { cellToBoundary, gridDisk } from "h3-js";
import { alt, buildScenario, cellCenter, LAYERS, LAYER_H, SLOT_SEC, ORIGIN, type Drone, type Airspace } from "@/lib/hyperhex";

const CESIUM = "https://cesium.com/downloads/cesiumjs/releases/1.121/Build/Cesium";

function loadCesium(): Promise<any> {
  const w = window as any;
  if (w.Cesium) return Promise.resolve(w.Cesium);
  return new Promise((res, rej) => {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = `${CESIUM}/Widgets/widgets.css`;
    document.head.appendChild(l);
    const s = document.createElement("script");
    s.src = `${CESIUM}/Cesium.js`; s.onload = () => res(w.Cesium); s.onerror = rej;
    document.head.appendChild(s);
  });
}

export function Workbench() {
  const el = useRef<HTMLDivElement>(null);
  const sim = useRef<{ air: Airspace; drones: Drone[]; center: string } | null>(null);
  const viewer = useRef<any>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);
  const [, force] = useState(0);
  const voxelEntities = useRef<any[]>([]);
  const dronePos = useRef<Record<string, any>>({});
  const tRef = useRef(0);

  if (!sim.current) sim.current = buildScenario();

  useEffect(() => {
    let dead = false;
    loadCesium().then((C) => {
      if (dead || !el.current) return;
      const v = new C.Viewer(el.current, {
        baseLayer: new C.ImageryLayer(new C.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" })),
        baseLayerPicker: false, geocoder: false, timeline: false, animation: false, homeButton: false,
        sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
      });
      v.scene.globe.enableLighting = false;
      v.camera.setView({
        destination: C.Cartesian3.fromDegrees(ORIGIN.lng, ORIGIN.lat - 0.035, 2600),
        orientation: { heading: 0, pitch: C.Math.toRadians(-38), roll: 0 },
      });
      viewer.current = v;
      drawStatic();
      setReady(true);
    });
    return () => { dead = true; viewer.current?.destroy(); viewer.current = null; };
  }, []);

  const drawStatic = () => {
    const C = (window as any).Cesium, v = viewer.current, s = sim.current!;
    for (const c of gridDisk(s.center, 7)) {
      const b = cellToBoundary(c).flatMap(([la, ln]) => [ln, la]);
      v.entities.add({ polyline: { positions: C.Cartesian3.fromDegreesArrayHeights(b.flatMap((x, i) => (i % 2 ? [x, 2] : [x])).concat([b[0]!, b[1]!, 2])), width: 1, material: C.Color.fromCssColorString("#0f172a").withAlpha(0.35) } });
    }
    for (const d of s.drones) {
      dronePos.current[d.id] = C.Cartesian3.fromDegrees(0, 0, 0);
      v.entities.add({
        id: d.id,
        position: new C.CallbackProperty(() => dronePos.current[d.id], false),
        point: { pixelSize: 12, color: C.Color.fromCssColorString(d.color), outlineColor: C.Color.BLACK, outlineWidth: 2 },
        label: { text: d.id, font: "12px JetBrains Mono", pixelOffset: new C.Cartesian2(0, -18), fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, scale: 0.9 },
      });
      v.entities.add({ id: `${d.id}-path`, polyline: { positions: pathPositions(d), width: 2, material: C.Color.fromCssColorString(d.color).withAlpha(0.55) } });
    }
  };

  const pathPositions = (d: Drone) => {
    const C = (window as any).Cesium;
    return d.path.map((p) => { const { lat, lng } = cellCenter(p.cell); return C.Cartesian3.fromDegrees(lng, lat, alt(p.layer) + LAYER_H / 2); });
  };

  // redraw reserved voxels for the current slot window
  useEffect(() => {
    if (!ready) return;
    const C = (window as any).Cesium, v = viewer.current, s = sim.current!;
    voxelEntities.current.forEach((e) => v.entities.remove(e));
    voxelEntities.current = [];
    const slot = Math.floor(t);
    for (const c of s.air.noFly) {
      const b = cellToBoundary(c).flatMap(([la, ln]) => [ln, la]);
      voxelEntities.current.push(v.entities.add({ polygon: { hierarchy: C.Cartesian3.fromDegreesArray(b), height: 0, extrudedHeight: alt(2) + LAYER_H, material: C.Color.RED.withAlpha(0.18), outline: true, outlineColor: C.Color.RED } }));
    }
    for (const d of s.drones) for (const p of d.path) {
      if (p.t < slot || p.t > slot + 3) continue;
      const b = cellToBoundary(p.cell).flatMap(([la, ln]) => [ln, la]);
      const a = 0.55 - (p.t - slot) * 0.13;
      voxelEntities.current.push(v.entities.add({ polygon: { hierarchy: C.Cartesian3.fromDegreesArray(b), height: alt(p.layer), extrudedHeight: alt(p.layer) + LAYER_H, material: C.Color.fromCssColorString(d.color).withAlpha(a), outline: p.t === slot, outlineColor: C.Color.WHITE } }));
    }
  }, [ready, Math.floor(t), sim.current.air.noFly.size, sim.current.air.log.length]);

  // animation loop
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      if (playing) { tRef.current += dt * 0.8; setT(tRef.current); }
      const C = (window as any).Cesium;
      if (C && sim.current) for (const d of sim.current.drones) {
        const i = d.path.findIndex((p) => p.t > tRef.current);
        if (!d.path.length) continue;
        const a = (i <= 0 ? d.path[i === 0 ? 0 : d.path.length - 1] : d.path[i - 1])!;
        const b = (i <= 0 ? a : d.path[i])!;
        const f = i <= 0 ? 0 : Math.min(1, (tRef.current - a.t) / (b.t - a.t));
        const ca = cellCenter(a.cell), cb = cellCenter(b.cell);
        const h = alt(a.layer) + (alt(b.layer) - alt(a.layer)) * f + LAYER_H / 2;
        dronePos.current[d.id] = C.Cartesian3.fromDegrees(ca.lng + (cb.lng - ca.lng) * f, ca.lat + (cb.lat - ca.lat) * f, h);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const refreshPaths = () => {
    const v = viewer.current;
    for (const d of sim.current!.drones) v.entities.getById(`${d.id}-path`)!.polyline.positions = pathPositions(d);
    force((x) => x + 1);
  };

  const tfr = () => {
    const s = sim.current!;
    s.air.injectNoFly(s.center, 1, s.drones, Math.floor(tRef.current));
    refreshPaths();
  };
  const reset = () => {
    const v = viewer.current;
    v.entities.removeAll(); voxelEntities.current = [];
    sim.current = buildScenario(); tRef.current = 0; setT(0);
    drawStatic(); force((x) => x + 1);
  };

  const s = sim.current;
  const slot = Math.floor(t);
  const active = s.drones.filter((d) => d.path.length && slot >= d.path[0].t && slot <= d.path[d.path.length - 1].t).length;

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside className="flex w-[380px] shrink-0 flex-col border-r border-border">
        <header className="border-b border-border p-5">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">HyperHex / UTM Lab</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">4D Airspace Reservations</h1>
          <p className="mt-2 text-sm text-muted-foreground">H3 res-9 hexes × {LAYERS.length} altitude layers × {SLOT_SEC}s slots. Each drone owns exclusive voxels along its route.</p>
        </header>
        <div className="grid grid-cols-3 gap-px border-b border-border bg-border font-mono">
          {[["SLOT", slot], ["AIRBORNE", active], ["VOXELS", s.air.table.size]].map(([k, val]) => (
            <div key={k} className="bg-background p-3"><div className="text-[10px] text-muted-foreground">{k}</div><div className="text-xl text-primary">{val}</div></div>
          ))}
        </div>
        <div className="flex gap-2 border-b border-border p-4">
          <button onClick={() => setPlaying((p) => !p)} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">{playing ? "Pause" : "Play"}</button>
          <button onClick={tfr} disabled={s.air.noFly.size > 0} className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-40">Inject no-fly zone</button>
          <button onClick={reset} className="rounded-md border border-border px-3 py-2 text-sm">Reset</button>
        </div>
        <div className="border-b border-border p-4">
          <p className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">Fleet</p>
          <ul className="space-y-1 font-mono text-xs">
            {s.drones.map((d) => {
              const st = s.air.stateAt(d, slot);
              return (
                <li key={d.id} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="w-14">{d.id}</span>
                  <span className="text-muted-foreground">L{st?.layer ?? "-"} · {d.path.length} slots</span>
                  {d.replans > 0 && <span className="ml-auto text-destructive">replan×{d.replans}</span>}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">Reservation log</p>
          <ul className="space-y-1.5 font-mono text-[11px] leading-snug">
            {[...s.air.log].reverse().map((l, i) => (
              <li key={i} className={l.kind === "conflict" ? "text-chart-4" : l.kind === "replan" ? "text-primary" : l.kind === "nofly" || l.kind === "fail" ? "text-destructive" : "text-muted-foreground"}>
                <span className="opacity-60">t{String(l.t).padStart(3, "0")} </span>{l.msg}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="relative flex-1">
        <div ref={el} className="absolute inset-0" />
        {!ready && <div className="absolute inset-0 grid place-items-center font-mono text-sm text-muted-foreground">Loading globe…</div>}
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-md bg-card/90 p-3 font-mono text-[11px] text-card-foreground">
          Solid prism = voxel held now · fading = next 3 slots · red column = no-fly zone
        </div>
      </main>
    </div>
  );
}
