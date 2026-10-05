import { useEffect, useMemo, useRef, useState } from "react";
import { cellToBoundary, gridDisk } from "h3-js";
import { Layers3, Menu, Pause, Play, RotateCcw, X as CloseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/hyperhex-logo-amber.png.asset.json";
import mobileLogoAsset from "@/assets/hyperhex-logo-mobile.png.asset.json";
import {
  alt, benchmark, buildScenario, cellCenter, findConflicts, findStacks, stateAt, CONTROLLERS, FLEET_OPTIONS, LAYERS, LAYER_H, SLOT_SEC, ORIGIN,
  type Controller, type Drone, type Airspace,
} from "@/lib/hyperhex";

const CESIUM = "https://cesium.com/downloads/cesiumjs/releases/1.121/Build/Cesium";
const T_END = 60;

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

type Sim = { air: Airspace; drones: Drone[]; center: string };

export function Workbench() {
  const el = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<Controller>("hyperhex");
  const sim = useRef<Sim | null>(null);
  const viewer = useRef<any>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [ready, setReady] = useState(false);
  const [version, force] = useState(0);
  const voxelEntities = useRef<any[]>([]);
  const dronePos = useRef<Record<string, any>>({});
  const tRef = useRef(0);
  const droneAlt = useRef<Record<string, number>>({});
  const [exag, setExag] = useState(3);
  const ex = useRef(3);
  const X = (m: number) => m * ex.current;
  const [fleet, setFleet] = useState(12);
  const fleetRef = useRef(12);
  const bench = useMemo(() => benchmark(8, fleet), [fleet]);
  const [inspect, setInspect] = useState<string | null>(null);
  const [inspectorClosed, setInspectorClosed] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [mobileView, setMobileView] = useState(false);

  if (!sim.current) sim.current = buildScenario(controller, fleetRef.current);

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
      let compact = false;
      const observer = new ResizeObserver(() => {
        if (v.isDestroyed() || !el.current) return;
        v.resize();
        const mobile = el.current.clientWidth < 1024;
        if (mobile !== compact) {
          compact = mobile;
          if (mobile) v.camera.setView({
            destination: C.Cartesian3.fromDegrees(ORIGIN.lng, ORIGIN.lat - 0.018, 3400),
            orientation: { heading: 0, pitch: C.Math.toRadians(-57), roll: 0 },
          });
        }
        for (const drone of sim.current?.drones ?? []) {
          const entity = v.entities.getById(drone.id);
          if (entity?.label) entity.label.show = !mobile;
        }
      });
      observer.observe(el.current);
      observerRef.current = observer;
      const h = new C.ScreenSpaceEventHandler(v.scene.canvas);
      h.setInputAction((e: any) => {
        setPlaying(false);
        const picked = v.scene.pick(e.position);
        const id = typeof picked?.id?.id === "string" ? picked.id.id.replace(/-path$/, "") : null;
        const d = id && sim.current?.drones.find((x) => x.id === id);
        const st = d ? stateAt(d, Math.floor(tRef.current)) : null;
        setInspect(st ? st.cell : null);
        setInspectorClosed(false);
      }, C.ScreenSpaceEventType.LEFT_CLICK);
      drawStatic();
      setReady(true);
    });
    return () => { dead = true; observerRef.current?.disconnect(); viewer.current?.destroy(); viewer.current = null; };
  }, []);

  const pathPositions = (d: Drone) => {
    const C = (window as any).Cesium;
    return d.path.map((p) => { const { lat, lng } = cellCenter(p.cell); return C.Cartesian3.fromDegrees(lng, lat, X(alt(p.layer) + LAYER_H / 2)); });
  };

  const drawStatic = () => {
    const C = (window as any).Cesium, v = viewer.current, s = sim.current!;
    for (const c of gridDisk(s.center, 7)) {
      const b = cellToBoundary(c).flatMap(([la, ln]) => [ln, la]);
      v.entities.add({ polyline: { positions: C.Cartesian3.fromDegreesArrayHeights(b.flatMap((x, i) => (i % 2 ? [x, 2] : [x])).concat([b[0]!, b[1]!, 2])), width: 1, material: C.Color.fromCssColorString("#0f172a").withAlpha(0.35) } });
    }
    for (const d of s.drones) {
      dronePos.current[d.id] = C.Cartesian3.fromDegrees(0, 0, -1000);
      v.entities.add({
        id: d.id,
        position: new C.CallbackProperty(() => dronePos.current[d.id], false),
        point: { pixelSize: 14, color: C.Color.fromCssColorString(d.color), outlineColor: C.Color.BLACK, outlineWidth: 2 },
        label: { text: new C.CallbackProperty(() => `${d.id} · ${Math.round(droneAlt.current[d.id] ?? 0)}m`, false), font: "12px JetBrains Mono", pixelOffset: new C.Cartesian2(0, -18), fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, scale: 0.85 },
      });
      v.entities.add({ polyline: { positions: new C.CallbackProperty(() => { const p = dronePos.current[d.id]; const c = C.Cartographic.fromCartesian(p); if (!c || c.height < 0) return []; return [C.Cartesian3.fromRadians(c.longitude, c.latitude, 0), p]; }, false), width: 1.5, material: new C.PolylineDashMaterialProperty({ color: C.Color.fromCssColorString(d.color), dashLength: 8 }) } });
      v.entities.add({ position: new C.CallbackProperty(() => { const c = C.Cartographic.fromCartesian(dronePos.current[d.id]); return c && c.height >= 0 ? C.Cartesian3.fromRadians(c.longitude, c.latitude, 1) : C.Cartesian3.fromDegrees(0, 0, -1000); }, false), ellipse: { semiMajorAxis: 18, semiMinorAxis: 18, material: C.Color.fromCssColorString(d.color).withAlpha(0.35), height: 1 } });
      v.entities.add({ id: `${d.id}-path`, polyline: { positions: pathPositions(d), width: 2, material: C.Color.fromCssColorString(d.color).withAlpha(0.5) } });
    }
  };

  // voxels for the current slot window + conflict markers
  const slot = Math.floor(t);
  useEffect(() => {
    if (!ready) return;
    const C = (window as any).Cesium, v = viewer.current, s = sim.current!;
    voxelEntities.current.forEach((e) => v.entities.remove(e));
    voxelEntities.current = [];
    const hex = (c: string) => C.Cartesian3.fromDegreesArray(cellToBoundary(c).flatMap(([la, ln]) => [ln, la]));
    for (const c of s.air.noFly)
      voxelEntities.current.push(v.entities.add({ polygon: { hierarchy: hex(c), height: 0, extrudedHeight: X(alt(2) + LAYER_H), material: C.Color.RED.withAlpha(0.18), outline: true, outlineColor: C.Color.RED } }));
    for (const d of s.drones) for (const p of d.path) {
      if (p.t < slot || p.t > slot + 3) continue;
      const a = 0.5 - (p.t - slot) * 0.12;
      voxelEntities.current.push(v.entities.add({ polygon: { hierarchy: hex(p.cell), height: X(alt(p.layer)), extrudedHeight: X(alt(p.layer) + LAYER_H), material: C.Color.fromCssColorString(d.color).withAlpha(a), outline: p.t === slot, outlineColor: C.Color.WHITE } }));
    }
    for (const st of findStacks(s.drones)) {
      if (st.t !== slot) continue;
      const focus = st.cell === inspect;
      voxelEntities.current.push(v.entities.add({ polygon: { hierarchy: hex(st.cell), height: 0, extrudedHeight: X(alt(LAYERS.length - 1) + LAYER_H + 10), material: C.Color.WHITE.withAlpha(focus ? 0.12 : 0.05), outline: true, outlineColor: focus ? C.Color.YELLOW : C.Color.WHITE } }));
      for (let l = 0; l < LAYERS.length; l++) {
        const { lat, lng } = cellCenter(st.cell);
        const m = st.members.find((x) => x.layer === l);
        voxelEntities.current.push(v.entities.add({ position: C.Cartesian3.fromDegrees(lng, lat, X(alt(l) + LAYER_H / 2)), label: { text: `L${l} ${alt(l)}m ${m ? "· " + m.id : "· free"}`, font: "11px JetBrains Mono", fillColor: m ? C.Color.fromCssColorString(m.color) : C.Color.GRAY, outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(70, 0), showBackground: false } }));
      }
    }
    for (const c of findConflicts(s.drones)) {
      if (c.t < slot - 1 || c.t > slot + 1) continue;
      const { lat, lng } = cellCenter(c.cell);
      voxelEntities.current.push(v.entities.add({ position: C.Cartesian3.fromDegrees(lng, lat, X(alt(c.layer) + LAYER_H + 8)), point: { pixelSize: 22, color: C.Color.RED.withAlpha(0.35), outlineColor: C.Color.RED, outlineWidth: 3 } }));
    }
  }, [ready, slot, version, inspect]);

  // animation loop
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      if (playing) { tRef.current = Math.min(T_END, tRef.current + dt * 0.8 * speed); setT(tRef.current); }
      const C = (window as any).Cesium;
      if (C && sim.current) for (const d of sim.current.drones) {
        const first = d.path[0], end = d.path[d.path.length - 1];
        if (!first || !end || tRef.current < first.t || tRef.current > end.t + 0.5) { droneAlt.current[d.id] = 0; dronePos.current[d.id] = C.Cartesian3.fromDegrees(0, 0, -1000); continue; }
        const i = d.path.findIndex((p) => p.t > tRef.current);
        const a = i < 0 ? end : d.path[i - 1]!, b = i < 0 ? end : d.path[i]!;
        const f = a === b ? 0 : Math.min(1, (tRef.current - a.t) / (b.t - a.t));
        const ca = cellCenter(a.cell), cb = cellCenter(b.cell);
        const h = alt(a.layer) + (alt(b.layer) - alt(a.layer)) * f + LAYER_H / 2;
        dronePos.current[d.id] = C.Cartesian3.fromDegrees(ca.lng + (cb.lng - ca.lng) * f, ca.lat + (cb.lat - ca.lat) * f, X(h));
        droneAlt.current[d.id] = h;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const refreshPaths = () => {
    const v = viewer.current;
    for (const d of sim.current!.drones) { const e = v?.entities.getById(`${d.id}-path`); if (e) e.polyline.positions = pathPositions(d); }
    force((x) => x + 1);
  };

  const tfr = () => {
    const s = sim.current!;
    s.air.injectNoFly(s.center, 1, s.drones, Math.floor(tRef.current));
    refreshPaths();
  };
  const restart = (c: Controller) => {
    const v = viewer.current;
    v?.entities.removeAll(); voxelEntities.current = [];
    sim.current = buildScenario(c, fleetRef.current); tRef.current = 0; setT(0);
    if (v) drawStatic();
    force((x) => x + 1);
  };
  const pick = (c: Controller) => { setController(c); restart(c); };
  const pickFleet = (n: number) => { fleetRef.current = n; setFleet(n); setInspect(null); restart(controller); };
  const setEx = (n: number) => { ex.current = n; setExag(n); refreshPaths(); };
  const cam = (mode: "oblique" | "side" | "top") => {
    const C = (window as any).Cesium, v = viewer.current; if (!v) return;
    const o = { oblique: [ORIGIN.lat - 0.035, 2600, -38], side: [ORIGIN.lat - 0.022, 260, -4], top: [ORIGIN.lat, 4200, -90] }[mode];
    v.camera.flyTo({ destination: C.Cartesian3.fromDegrees(ORIGIN.lng, o[0], o[1]), orientation: { heading: 0, pitch: C.Math.toRadians(o[2]), roll: 0 }, duration: 1.2 });
  };
  const scrub = (v: number) => { tRef.current = v; setT(v); };
  const jumpTo = (st: { t: number; cell: string }) => {
    setPlaying(false); scrub(st.t); setInspect(st.cell); setInspectorClosed(false);
    if (ex.current < 6) setEx(6);
    const C = (window as any).Cesium, v = viewer.current; if (!v) return;
    const { lat, lng } = cellCenter(st.cell);
    v.camera.flyTo({ destination: C.Cartesian3.fromDegrees(lng, lat - 0.016, 900), orientation: { heading: 0, pitch: C.Math.toRadians(-22), roll: 0 }, duration: 1.4 });
  };

  const s = sim.current;
  const m = s.air.metrics(s.drones);
  const airborne = s.drones.filter((d) => { const st = stateAt(d, slot); return st && st.cell !== d.to; }).length;
  const ctl = CONTROLLERS.find((c) => c.id === controller)!;
  const stacks = findStacks(s.drones);
  const showcase = (() => {
    const seen = new Set<string>(), out: typeof stacks = [];
    for (const st of [...stacks].sort((a, b) => b.members.length - a.members.length || a.t - b.t)) {
      const key = st.members.map((x) => x.id).sort().join("+");
      if (seen.has(key) && st.members.length < 3) continue;
      seen.add(key); out.push(st); if (out.length >= 4) break;
    }
    return out.sort((a, b) => a.t - b.t);
  })();
  const nowStacks = stacks.filter((x) => x.t === slot);
  const inspected = inspect ? (nowStacks.find((x) => x.cell === inspect) ?? null) : (!playing ? nowStacks[0] ?? null : null);
  const inspectCell = inspected?.cell ?? (!playing ? inspect : null);
  const column = !inspectorClosed && inspectCell ? LAYERS.map((_, l) => ({ l, d: s.drones.find((d) => { const st = stateAt(d, slot); return st && st.cell === inspectCell && st.layer === l; }) })) : null;

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <aside className={`${mobilePanel ? "flex" : "hidden"} absolute inset-0 z-30 w-full flex-col overflow-y-auto border-r border-border bg-background pb-8 lg:static lg:flex lg:w-[400px] lg:shrink-0 lg:pb-0`}>
        <header className="border-b border-border p-5">
          <Button variant="ghost" size="icon" className="float-right lg:hidden" aria-label="Close controls" onClick={() => setMobilePanel(false)}><CloseIcon /></Button>
          <img src={logoAsset.url} alt="HyperHex" className="block w-full max-w-[340px] h-auto" />
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-primary">UTM · Drone Corridor Lab</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">Low-Altitude Drone Corridors</h1>
          <p className="mt-2 text-sm text-muted-foreground">Shared low-altitude flying space for drones: H3 res-9 hex tiles × {LAYERS.length} altitude layers × {SLOT_SEC}s slots, deconflicted with safe-interval corridor planning.</p>
        </header>

        <div className="border-b border-border p-4">
          <p className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">Controller</p>
          <div className="grid grid-cols-3 gap-1 rounded-md bg-secondary p-1">
            {CONTROLLERS.map((c) => (
              <Button key={c.id} variant={controller === c.id ? "default" : "ghost"} size="sm" onClick={() => pick(c.id)} className="h-auto min-w-0 whitespace-normal px-1 py-2 text-center leading-tight">{c.name}</Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{ctl.blurb}</p>
          <p className="mb-2 mt-4 font-mono text-[10px] uppercase text-muted-foreground">Flight density · transit UAVs (+3 stack demo)</p>
          <div className="grid grid-cols-5 gap-1 rounded-md bg-secondary p-1">
            {FLEET_OPTIONS.map((n) => (
              <Button key={n} variant={fleet === n ? "default" : "ghost"} size="sm" onClick={() => pickFleet(n)} className="px-1 font-mono">{n}</Button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">All departures share the same ~72 s window, so more flights means busier corridors.</p>
        </div>

        <div className="grid grid-cols-3 gap-px border-b border-border bg-border font-mono">
          {([["SLOT", slot], ["AIRBORNE", airborne], ["CONFLICTS", m.conflicts], ["DELAY (slots)", m.delay], ["REPLANS", m.replans], ["LEDGER", m.ledger]] as const).map(([k, val]) => (
            <div key={k} className="bg-background p-3">
              <div className="text-[10px] text-muted-foreground">{k}</div>
              <div className={`text-lg ${k === "CONFLICTS" && m.conflicts > 0 ? "text-destructive" : "text-primary"}`}>{val}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-b border-border p-4">
          <div className="flex gap-2">
            <Button onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</Button>
            <Button variant="destructive" onClick={tfr} disabled={s.air.noFly.size > 0}>Inject no-fly zone</Button>
            <Button variant="outline" onClick={() => restart(controller)}>Reset</Button>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
            <input type="range" min={0} max={T_END} step={0.1} value={t} onChange={(e) => scrub(+e.target.value)} className="flex-1 accent-primary" aria-label="Time" />
            <select value={speed} onChange={(e) => setSpeed(+e.target.value)} className="rounded border border-border bg-background px-1 py-0.5" aria-label="Speed">
              {[0.5, 1, 2, 4].map((x) => <option key={x} value={x}>{x}×</option>)}
            </select>
          </div>
        </div>

        <div className="border-b border-border p-4">
          <p className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">Same tile · different altitude — jump to moment</p>
          <div className="flex flex-col gap-1">
            {showcase.map((st) => (
              <Button variant="outline" key={`${st.t}-${st.cell}`} onClick={() => { jumpTo(st); setMobilePanel(false); }} className={`flex h-auto w-full items-center justify-start gap-2 rounded border border-border px-2 py-1.5 text-left font-mono text-[11px] hover:border-primary ${inspect === st.cell && slot === st.t ? "border-primary text-primary" : ""}`}>
                <span className="text-muted-foreground">t{String(st.t).padStart(3, "0")}</span>
                <span>{st.members.length}-drone stack</span>
                <span className="ml-auto flex gap-1">{st.members.map((m) => <span key={m.id} title={`${m.id} L${m.layer}`} className="h-2 w-2 rounded-full" style={{ background: m.color }} />)}</span>
              </Button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Tip: click any drone on the globe to pause and inspect its tile.</p>
        </div>

        <div className="border-b border-border p-4">
          <p className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">Benchmark · same {s.drones.length} flights, TFR at slot 8</p>
          <table className="w-full font-mono text-[11px]">
            <thead className="text-muted-foreground"><tr><th className="text-left font-normal">controller</th><th className="text-right font-normal">conflicts</th><th className="text-right font-normal">delay</th><th className="text-right font-normal">arrived</th></tr></thead>
            <tbody>
              {CONTROLLERS.map((c) => { const b = bench[c.id]; return (
                <tr key={c.id} className={controller === c.id ? "text-primary" : ""}>
                  <td>{c.name}</td>
                  <td className={`text-right ${b.conflicts ? "text-destructive" : ""}`}>{b.conflicts}</td>
                  <td className="text-right">{b.delay}</td>
                  <td className="text-right">{b.arrived}/{s.drones.length}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>

        <div className="border-b border-border p-4">
          <p className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">Fleet</p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
            {s.drones.map((d) => {
              const st = stateAt(d, slot);
              const status = !st ? "ground" : st.cell === d.to ? "landed" : `L${st.layer}`;
              return (
                <li key={d.id} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                  <span>{d.id}</span>
                  <span className="text-muted-foreground">{status}</span>
                  {d.replans > 0 && <span className="ml-auto text-primary">↻{d.replans}</span>}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-2 font-mono text-[10px] uppercase text-muted-foreground">Event log</p>
          <ul className="space-y-1 font-mono text-[11px] leading-snug">
            {s.air.log.filter((l) => l.t <= slot).reverse().map((l, i) => (
              <li key={i} className={l.kind === "conflict" || l.kind === "nofly" || l.kind === "fail" ? "text-destructive" : l.kind === "replan" ? "text-primary" : l.kind === "hold" ? "text-chart-4" : "text-muted-foreground"}>
                <span className="opacity-60">t{String(l.t).padStart(3, "0")} </span>{l.msg}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="relative min-w-0 flex-1">
        <div ref={el} className="absolute inset-0" />
        <div className="absolute left-3 right-3 top-3 z-10 flex items-start justify-between gap-2 lg:hidden">
          <div className="flex shrink-0 flex-col gap-2">
            <img src={mobileLogoAsset.url} alt="HyperHex" className="h-8 w-auto" />
            <Button variant="secondary" size="sm" className="w-fit border border-border bg-card/95" onClick={() => setMobilePanel(true)} aria-label="Open controls"><Menu /> Controls</Button>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate rounded border border-border bg-card/95 px-2 py-1.5 font-mono text-[10px] text-primary">t{String(slot).padStart(3, "0")} · {airborne} air · {m.conflicts} conflicts</span>
            <Button variant="secondary" size="icon" className="shrink-0 border border-border bg-card/95" onClick={() => setMobileView((v) => !v)} aria-label={mobileView ? "Close view settings" : "Open view settings"}><Layers3 /></Button>
          </div>
        </div>
        <div className={`${mobileView ? "block" : "hidden"} absolute right-3 top-14 z-20 max-h-[calc(100dvh-10rem)] space-y-2 overflow-y-auto rounded-md border border-border bg-card/95 p-3 font-mono text-[11px] text-card-foreground lg:right-4 lg:top-4 lg:block lg:max-h-none lg:border-0 lg:bg-card/90`}>
          <Button variant="ghost" size="icon" className="float-right h-5 w-5 lg:hidden" onClick={() => setMobileView(false)} aria-label="Close view settings"><CloseIcon /></Button>
          <div className="text-muted-foreground">VIEW</div>
          <div className="flex gap-1">{(["oblique", "side", "top"] as const).map((m) => <Button variant="outline" size="sm" key={m} onClick={() => { cam(m); setMobileView(false); }} className="h-8 capitalize">{m}</Button>)}</div>
          <div className="text-muted-foreground">VERTICAL SCALE</div>
          <div className="flex gap-1">{[1, 3, 6].map((n) => <Button variant={exag === n ? "default" : "outline"} size="sm" key={n} onClick={() => setEx(n)} className="h-8">{n}×</Button>)}</div>
          <div className="pt-1 text-muted-foreground">ALTITUDE SHELLS</div>
          {[...LAYERS].map((h, i) => ({ h, i })).reverse().map(({ h, i }) => <div key={i}>L{i} · {h}–{h + LAYER_H}m</div>)}
        </div>
        {column && (
          <div className={`${mobileView ? "max-lg:hidden" : ""} absolute bottom-20 left-3 right-3 z-10 max-h-[min(48dvh,330px)] overflow-y-auto rounded-md border border-primary/60 bg-card/95 p-3 font-mono text-[11px] text-card-foreground max-lg:landscape:right-auto max-lg:landscape:w-[min(22rem,calc(100%-1.5rem))] lg:bottom-auto lg:left-4 lg:right-auto lg:top-4 lg:max-h-none lg:w-72`}>
            <div className="flex items-center justify-between"><span className="text-primary">TILE INSPECTOR · t{String(slot).padStart(3, "0")}</span><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setInspect(null); setInspectorClosed(true); }} aria-label="Close inspector"><CloseIcon /></Button></div>
            <div className="mt-1 truncate text-muted-foreground">H3 {inspectCell}</div>
            <div className="mt-2 space-y-1">
              {[...column].reverse().map(({ l, d }) => (
                <div key={l} className="flex items-center gap-2 rounded border border-border px-2 py-1">
                  <span className="w-20 text-muted-foreground">L{l} {alt(l)}–{alt(l) + LAYER_H}m</span>
                  {d ? <><span className="h-2 w-2 rounded-full" style={{ background: d.color }} /><span>{d.id}</span><span className="ml-auto text-primary">reserved</span></> : <span className="ml-auto text-muted-foreground">free</span>}
                </div>
              ))}
            </div>
            {(() => { const n = column.filter((c) => c.d).length; return <div className={`mt-2 ${n >= 2 ? "text-primary" : "text-muted-foreground"}`}>{n >= 2 ? `${n} drones over the same tile, ${alt(1) - alt(0)} m between shells — no loss of separation.` : n === 1 ? "Single occupant." : "Tile empty at this slot."}</div>; })()}
          </div>
        )}
        {!ready && <div className="absolute inset-0 grid place-items-center font-mono text-sm text-muted-foreground">Loading globe…</div>}
        <div className="pointer-events-none absolute bottom-4 left-4 hidden max-w-[min(600px,calc(100%-2rem))] rounded-md bg-card/90 p-3 font-mono text-[11px] text-card-foreground lg:block">
          Solid prism = voxel held now · fading = next 3 slots · red column = no-fly zone · red ring = loss of separation · dashed line = drone's altitude above ground
        </div>
        <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-3 z-10 flex items-center gap-2 rounded-md border border-border bg-card/95 p-2 lg:hidden">
          <Button size="icon" className="shrink-0" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause /> : <Play />}</Button>
          <input type="range" min={0} max={T_END} step={0.1} value={t} onChange={(e) => scrub(+e.target.value)} className="min-w-0 flex-1 accent-primary" aria-label="Time" />
          <span className="w-8 shrink-0 text-right font-mono text-[11px] text-muted-foreground">{slot}s</span>
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => restart(controller)} aria-label="Reset"><RotateCcw /></Button>
        </div>
      </main>
    </div>
  );
}
