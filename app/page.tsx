"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoCentroid, geoContains, geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldData from "world-atlas/countries-110m.json";
import { ArrowLeft, Compass, Globe2, HandHeart, Heart, LocateFixed, MapPin, Minus, Plus, Search, Send, X } from "lucide-react";
import type { Dream, DreamStatus } from "../lib/dream-data";

type Offer = { id: string; dreamId: string; message: string; createdAt: string; helperName: string };
type Country = { id?: string | number; properties?: { name?: string }; geometry: unknown; type: "Feature" };
type Draft = { topic: string; description: string; hashtag: string; status: DreamStatus; locationName: string; locationLat: number | null; locationLon: number | null; destinationName: string; destinationLat: number | null; destinationLon: number | null };
const blank: Draft = { topic: "", description: "", hashtag: "", status: "dreamed", locationName: "", locationLat: null, locationLon: null, destinationName: "", destinationLat: null, destinationLon: null };
const statusLabel: Record<DreamStatus, string> = { dreamed: "Dreamed", "in-progress": "In progress", achieved: "Achieved" };
const projection = geoEquirectangular().scale(159.155).translate([500, 250]);
const path = geoPath(projection);
const countries = (feature(worldData as never, (worldData as never as { objects: { countries: never } }).objects.countries) as unknown as { features: Country[] }).features;
const gridPath = path(geoGraticule10()) || "";
const point = (lon: number, lat: number): [number, number] => projection([lon, lat]) as [number, number];
function Status({ status }: { status: DreamStatus }) { return <span className={`status status-${status}`}><span />{statusLabel[status]}</span>; }

export default function Home() {
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [country, setCountry] = useState<Country | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DreamStatus | "all">("all");
  const [mode, setMode] = useState<"detail" | "create">("detail");
  const [draft, setDraft] = useState<Draft>(blank);
  const [picking, setPicking] = useState<"home" | "destination" | null>(null);
  const [destinationEnabled, setDestinationEnabled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpMessage, setHelpMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([500, 250]);
  const [mapAspect, setMapAspect] = useState(1.5);
  const mapRef = useRef<SVGSVGElement>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; center: [number, number]; moved: boolean } | null>(null);
  const movedRecently = useRef(false);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/dreams", { cache: "no-store" });
      const data = await response.json() as { dreams: Dream[]; viewer: string | null; offers: Offer[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to load dreams.");
      setDreams(data.dreams); setViewer(data.viewer); setOffers(data.offers); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load dreams."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("dream"); if (id) setSelectedId(id); }, []);
  useEffect(() => {
    if (!mapWrapRef.current) return;
    const observer = new ResizeObserver(([entry]) => setMapAspect(entry.contentRect.width / Math.max(entry.contentRect.height, 1)));
    observer.observe(mapWrapRef.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (mode !== "create" || !window.matchMedia("(max-width: 760px)").matches) return;
    const target = picking ? mapWrapRef.current : document.querySelector(".detail-panel");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mode, picking]);

  const viewWidth = 1000 / zoom;
  const viewHeight = viewWidth / Math.max(mapAspect, .6);
  const bounds = { left: center[0] - viewWidth / 2, right: center[0] + viewWidth / 2, top: center[1] - viewHeight / 2, bottom: center[1] + viewHeight / 2 };
  const visible = useMemo(() => dreams.filter((dream) => {
    const [x, y] = point(dream.locationLon, dream.locationLat);
    const inView = x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    const inCountry = !country || geoContains(country as never, [dream.locationLon, dream.locationLat]);
    const match = !query || `${dream.topic} ${dream.description} ${dream.locationName} ${dream.dreamerName} ${dream.hashtag}`.toLowerCase().includes(query.toLowerCase());
    return inView && inCountry && match && (status === "all" || status === dream.status);
  }), [dreams, bounds.left, bounds.right, bounds.top, bounds.bottom, country, query, status]);
  const selected = dreams.find(d => d.id === selectedId) || null;
  const selectedOffers = offers.filter(o => o.dreamId === selectedId);

  function selectDream(dream: Dream) {
    setMode("detail"); setSelectedId(dream.id); setHelpOpen(false); setNotice("");
    const url = new URL(window.location.href); url.searchParams.set("dream", dream.id); window.history.replaceState(null, "", url);
  }
  function closeDetail() {
    setSelectedId(null); setHelpOpen(false); setNotice("");
    const url = new URL(window.location.href); url.searchParams.delete("dream"); window.history.replaceState(null, "", url);
  }
  function focus(lon: number, lat: number, targetZoom = 3) { setCenter(point(lon, lat)); setZoom(targetZoom); setCountry(null); }
  function resetMap() { setCountry(null); setCenter([500, 250]); setZoom(1); }
  function selectCountry(item: Country) {
    if (picking || movedRecently.current) return;
    setCountry(item); const [lon, lat] = geoCentroid(item as never); setCenter(point(lon, lat)); setZoom(2.2);
  }
  function mapCoordinate(event: React.MouseEvent<SVGSVGElement>) {
    const svg = mapRef.current; if (!svg) return null;
    const screen = svg.createSVGPoint(); screen.x = event.clientX; screen.y = event.clientY;
    const matrix = svg.getScreenCTM(); if (!matrix) return null;
    const local = screen.matrixTransform(matrix.inverse());
    return projection.invert?.([local.x, local.y]);
  }
  function mapClick(event: React.MouseEvent<SVGSVGElement>) {
    if (movedRecently.current) { movedRecently.current = false; return; }
    if (!picking) return;
    const loc = mapCoordinate(event); if (!loc) return;
    const [lon, lat] = loc;
    if (lon < -180 || lon > 180 || lat < -85 || lat > 85) return;
    const region = countries.find(c => geoContains(c as never, [lon, lat]));
    const regionName = region?.properties?.name || "Selected location";
    setDraft(d => picking === "home" ? { ...d, locationLat: +lat.toFixed(3), locationLon: +lon.toFixed(3), locationName: regionName } : { ...d, destinationLat: +lat.toFixed(3), destinationLon: +lon.toFixed(3), destinationName: regionName });
    setPicking(null);
  }
  function startDrag(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, center: [...center], moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.current.moved = true;
    if (!drag.current.moved) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setCenter([Math.max(0, Math.min(1000, drag.current.center[0] - dx * viewWidth / rect.width)), Math.max(-80, Math.min(580, drag.current.center[1] - dy * viewHeight / rect.height))]);
  }
  function endDrag() {
    if (drag.current?.moved) { movedRecently.current = true; window.setTimeout(() => { movedRecently.current = false; }, 80); }
    drag.current = null;
  }
  function changeZoom(delta: number) { setZoom(z => Math.max(1, Math.min(8, +(z * delta).toFixed(2)))); }
  function wheel(event: React.WheelEvent<SVGSVGElement>) { event.preventDefault(); changeZoom(event.deltaY < 0 ? 1.18 : 1 / 1.18); }

  async function action(payload: Record<string, unknown>) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/dreams", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { id?: string; error?: string }; if (!response.ok) throw new Error(data.error || "Please try again.");
      await reload(); return data;
    } catch (e) { setNotice(e instanceof Error ? e.message : "Please try again."); return null; }
    finally { setBusy(false); }
  }
  async function createDream(event: React.FormEvent) {
    event.preventDefault();
    const data = await action({ action: "create", ...draft, destinationName: destinationEnabled ? draft.destinationName : null, destinationLat: destinationEnabled ? draft.destinationLat : null, destinationLon: destinationEnabled ? draft.destinationLon : null });
    if (data?.id) { setMode("detail"); setDraft(blank); setDestinationEnabled(false); setSelectedId(data.id); focus(draft.locationLon!, draft.locationLat!, 3); const url = new URL(window.location.href); url.searchParams.set("dream", data.id); window.history.replaceState(null, "", url); }
  }
  async function sendHelp(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return;
    if (await action({ action: "help", dreamId: selected.id, message: helpMessage })) { setHelpOpen(false); setHelpMessage(""); setNotice("Your offer was saved. The dreamer can see it when they open this dream."); }
  }

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-icon"><Compass size={20} strokeWidth={2.4}/></span><span>Dream Map</span></div><div className="top-center"><Globe2 size={16}/><span>Explore dreams across the world</span></div><button className="primary-button" onClick={() => { setMode("create"); closeDetail(); setNotice(""); }}><Plus size={18}/> Add your dream</button></header>
    <div className="workspace">
      <section className="explore-panel" aria-label="Explore dreams"><div className="panel-heading"><div className="eyebrow">EXPLORE</div><h1>{country?.properties?.name || (zoom === 1 ? "Around the world" : "In this area")}</h1><p>{visible.length} {visible.length === 1 ? "dream" : "dreams"} in view · {new Set(visible.map(d => d.dreamerId)).size} dreamers</p></div><div className="explore-controls"><label className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search this area" aria-label="Search this area"/></label><div className="filters" aria-label="Filter by status">{(["all", "dreamed", "in-progress", "achieved"] as const).map(s => <button key={s} className={status === s ? "active" : ""} onClick={() => setStatus(s)}>{s === "all" ? "All" : statusLabel[s]}</button>)}</div></div><div className="list-scroll">{loading ? <div className="state-card">Finding dreams…</div> : error ? <div className="state-card">{error}<button onClick={reload}>Try again</button></div> : visible.length ? visible.map(d => <button className={`dream-card ${selectedId === d.id ? "selected" : ""}`} key={d.id} onClick={() => selectDream(d)}><div className="card-top"><Status status={d.status}/><span className="vote-count"><Heart size={14}/>{d.votes}</span></div><h2>{d.topic}</h2><p>{d.description}</p><div className="card-bottom"><span><MapPin size={14}/>{d.locationName}</span><span>{d.dreamerName}{d.isExample ? " · Example" : ""}</span></div></button>) : <div className="state-card"><Globe2 size={25}/><strong>No dreams in this view</strong><span>Move the map or clear the filters to explore somewhere else.</span><button onClick={() => { resetMap(); setStatus("all"); setQuery(""); }}>Show the world</button></div>}</div><div className="list-footer">Example dreams are marked. Your dreams and actions are saved.</div></section>
      <section className="map-wrap" ref={mapWrapRef} aria-label="Interactive world map"><div className="map-top"><div className="map-hint"><span className="pulse"/>{picking ? `Click the map to set your ${picking === "home" ? "location" : "destination"}` : "Drag to explore · scroll to zoom · select a country"}</div>{country && <button className="region-pill" onClick={() => setCountry(null)}>{country.properties?.name}<X size={14}/></button>}</div><svg ref={mapRef} className={`world-map ${picking ? "picking" : ""}`} viewBox={`${bounds.left} ${bounds.top} ${viewWidth} ${viewHeight}`} onClick={mapClick} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onWheel={wheel} role="img" aria-label="World map showing the location of dreams"><rect x="-200" y="-200" width="1400" height="900" fill="#122c3d"/><path d={gridPath} fill="none" stroke="#345365" strokeWidth={.75 / zoom} opacity=".7"/>{countries.map((c, i) => <path key={i} d={path(c as never) || ""} fill={country === c ? "#557c80" : "#315769"} stroke="#153749" strokeWidth={.9 / zoom} onClick={() => selectCountry(c)} className="country"/>)}{selected?.destinationLat != null && selected.destinationLon != null && <line x1={point(selected.locationLon, selected.locationLat)[0]} y1={point(selected.locationLon, selected.locationLat)[1]} x2={point(selected.destinationLon, selected.destinationLat)[0]} y2={point(selected.destinationLon, selected.destinationLat)[1]} stroke="#f6d886" strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${4 / zoom}`}/>}{dreams.map(d => { const [x, y] = point(d.locationLon, d.locationLat); const active = selectedId === d.id; return <g key={d.id} transform={`translate(${x} ${y})`} className="map-marker" onClick={e => { if (picking || movedRecently.current) return; e.stopPropagation(); selectDream(d); }} role="button" tabIndex={0} aria-label={`${d.topic}, ${d.locationName}`} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectDream(d); } }}><circle r={(active ? 17 : 14) / zoom} fill={active ? "#fbd58b" : "#ffffff"} opacity={active ? .25 : .18}/><circle r={(active ? 8 : 6.5) / zoom} fill={d.status === "achieved" ? "#72d6ba" : d.status === "in-progress" ? "#f3ce75" : "#f6a67f"} stroke="#fff" strokeWidth={2 / zoom}/><title>{d.topic} · {d.locationName}</title></g>; })}{mode === "create" && draft.locationLat != null && <circle cx={point(draft.locationLon!, draft.locationLat)[0]} cy={point(draft.locationLon!, draft.locationLat)[1]} r={10 / zoom} fill="#ffad7c" stroke="#fff" strokeWidth={3 / zoom} pointerEvents="none"/>}{mode === "create" && destinationEnabled && draft.destinationLat != null && <circle cx={point(draft.destinationLon!, draft.destinationLat)[0]} cy={point(draft.destinationLon!, draft.destinationLat)[1]} r={10 / zoom} fill="#f7d886" stroke="#fff" strokeWidth={3 / zoom} pointerEvents="none"/>}</svg><div className="map-bottom"><span><span className="legend-dot dreamed"/> Dreamed <span className="legend-dot progress"/> In progress <span className="legend-dot achieved"/> Achieved</span><div className="map-actions"><button title="Show the whole world" aria-label="Show the whole world" onClick={resetMap}><LocateFixed size={18}/></button><button title="Zoom out" aria-label="Zoom out" onClick={() => changeZoom(1/1.5)}><Minus size={18}/></button><button title="Zoom in" aria-label="Zoom in" onClick={() => changeZoom(1.5)}><Plus size={18}/></button></div></div></section>
      <aside className="detail-panel" aria-label={mode === "create" ? "Add a dream" : "Dream details"}>
        {mode === "create" ? <div className="detail-content"><div className="detail-header"><div className="eyebrow">YOUR DREAM</div><button className="icon-button" aria-label="Close" onClick={() => { setMode("detail"); setPicking(null); setNotice(""); }}><X size={19}/></button></div><h2 className="detail-title">Put your dream on the map.</h2><p className="detail-intro">Start with where you are. Your destination is optional.</p><form className="dream-form" onSubmit={createDream}><label>Dream title <span>*</span><input required minLength={3} maxLength={100} value={draft.topic} onChange={e => setDraft({ ...draft, topic: e.target.value })} placeholder="What do you dream of doing?"/></label><label>Description <small>optional</small><textarea maxLength={600} rows={3} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Tell us a little more…"/></label><div className="form-two"><label>Hashtag <small>optional</small><input maxLength={32} value={draft.hashtag} onChange={e => setDraft({ ...draft, hashtag: e.target.value })} placeholder="#learning"/></label><label>Status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as DreamStatus })}><option value="dreamed">Dreamed</option><option value="in-progress">In progress</option><option value="achieved">Achieved</option></select></label></div><div className="form-location"><div><strong>Dreamer location <span>*</span></strong><small>Where are you now?</small></div><button type="button" className={picking === "home" ? "pick-button active" : "pick-button"} onClick={() => setPicking(picking === "home" ? null : "home")}><MapPin size={16}/>{draft.locationLat == null ? "Pick on map" : "Move pin"}</button></div>{draft.locationLat != null && <label>Place name<input required maxLength={80} value={draft.locationName} onChange={e => setDraft({ ...draft, locationName: e.target.value })} placeholder="City or region"/><small>{draft.locationLat.toFixed(2)}°, {draft.locationLon?.toFixed(2)}°</small></label>}<label className="checkbox-row"><input type="checkbox" checked={destinationEnabled} onChange={e => { setDestinationEnabled(e.target.checked); if (!e.target.checked) setPicking(null); }}/><span>Add a dream destination <small>optional</small></span></label>{destinationEnabled && <><div className="form-location"><div><strong>Dream destination</strong><small>Where does this dream take you?</small></div><button type="button" className={picking === "destination" ? "pick-button active" : "pick-button"} onClick={() => setPicking(picking === "destination" ? null : "destination")}><MapPin size={16}/>{draft.destinationLat == null ? "Pick on map" : "Move pin"}</button></div>{draft.destinationLat != null && <label>Destination name<input required maxLength={80} value={draft.destinationName} onChange={e => setDraft({ ...draft, destinationName: e.target.value })} placeholder="City or region"/></label>}</>}{notice && <div className="form-notice" role="alert">{notice}</div>}<button className="submit-button" disabled={busy || draft.locationLat == null || (destinationEnabled && draft.destinationLat == null)} type="submit">{busy ? "Saving…" : "Publish dream"}</button></form></div> : selected ? <div className="detail-content"><div className="detail-header"><button className="back-button" onClick={closeDetail}><ArrowLeft size={17}/> Back to explore</button><button className="icon-button" onClick={closeDetail} aria-label="Close details"><X size={19}/></button></div><div className="detail-meta"><Status status={selected.status}/>{selected.isExample && <span className="example-tag">Example dream</span>}</div><h2 className="detail-title">{selected.topic}</h2><p className="detail-description">{selected.description || "No description yet."}</p>{selected.hashtag && <span className="hashtag">{selected.hashtag}</span>}<div className="person-row"><div className="avatar">{selected.dreamerName.charAt(0).toUpperCase()}</div><div><strong>{selected.dreamerName}</strong><span>Dreamer · {selected.locationName}</span></div></div><div className="journey"><div><span className="journey-symbol home"><MapPin size={18}/></span><div><small>DREAMER LOCATION</small><strong>{selected.locationName}</strong></div></div>{selected.destinationName && <div><span className="journey-symbol destination"><Compass size={18}/></span><div><small>DREAM DESTINATION</small><strong>{selected.destinationName}</strong></div></div>}</div>{viewer === selected.dreamerId ? <div className="owner-actions"><label>Update progress<select value={selected.status} disabled={busy} onChange={async e => { if (await action({ action: "status", dreamId: selected.id, status: e.target.value })) setNotice("Status updated."); }}><option value="dreamed">Dreamed</option><option value="in-progress">In progress</option><option value="achieved">Achieved</option></select></label></div> : <div className="support-actions"><button className={selected.hasVoted ? "vote-button voted" : "vote-button"} disabled={busy} onClick={async () => { if (await action({ action: "vote", dreamId: selected.id })) setNotice(selected.hasVoted ? "Vote removed." : "You voted for this dream."); }}><Heart size={18} fill={selected.hasVoted ? "currentColor" : "none"}/>{selected.hasVoted ? "Voted" : "Vote"} <span>{selected.votes}</span></button><button className="help-button" onClick={() => { setHelpOpen(!helpOpen); setNotice(""); }}><HandHeart size={18}/> Offer help</button></div>}{helpOpen && <form className="help-form" onSubmit={sendHelp}><label>How could you help?<textarea required minLength={10} maxLength={500} rows={3} value={helpMessage} onChange={e => setHelpMessage(e.target.value)} placeholder="A resource, advice, introduction, or another way to help…"/></label><button className="submit-button" disabled={busy}><Send size={16}/>{busy ? "Saving…" : "Send offer"}</button><small>Your offer is saved on this dream for its dreamer to see. Example dreamers are illustrative.</small></form>}{notice && <div className="form-notice" role="status">{notice}</div>}{selectedOffers.length > 0 && <div className="offers"><h3>{viewer === selected.dreamerId ? "Offers of help" : "Your offers"}</h3>{selectedOffers.map(o => <div key={o.id}><strong>{o.helperName}</strong><p>{o.message}</p></div>)}</div>}<div className="detail-footnote">Added {new Date(selected.createdAt).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })} · {selected.helpCount} {selected.helpCount === 1 ? "offer" : "offers"} of help</div></div> : <div className="empty-detail"><span className="empty-emblem"><Compass size={30}/></span><div className="eyebrow">A WORLD OF POSSIBILITY</div><h2>Every dot begins with a dream.</h2><p>Choose a dream on the map or from the list to see the person, the place, and their story.</p><div className="empty-rule"/><span>Explore anywhere. Start with a place that matters to you.</span></div>}
      </aside>
    </div>
  </main>;
}
