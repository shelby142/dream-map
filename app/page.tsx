"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoCentroid, geoContains, geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldData from "world-atlas/countries-110m.json";
import { ArrowLeft, Compass, Globe2, HandHeart, Heart, LocateFixed, MapPin, Minus, Plus, Search, Send, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../components/ui/sheet";
import { useIsMobile } from "../hooks/use-mobile";
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
const countryPaths = countries.map(country => ({ country, outline: path(country as never) || "" }));
const point = (lon: number, lat: number): [number, number] => projection([lon, lat]) as [number, number];
function Status({ status }: { status: DreamStatus }) { return <span className={`status status-${status}`}><span />{statusLabel[status]}</span>; }

export default function Home() {
  const [dreams, setDreams] = useState<Dream[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("dream"));
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
  const [mapSize, setMapSize] = useState({ width: 1000, height: 667 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const mapRef = useRef<SVGSVGElement>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<{ pointerId: number; x: number; y: number; center: [number, number]; moved: boolean } | null>(null);
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
  useEffect(() => { void Promise.resolve().then(reload); }, [reload]);
  useEffect(() => {
    if (!mapWrapRef.current) return;
    const observer = new ResizeObserver(([entry]) => setMapSize({ width: Math.max(entry.contentRect.width, 1), height: Math.max(entry.contentRect.height, 1) }));
    observer.observe(mapWrapRef.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (mode !== "create" || !isMobile) return;
    const target = picking ? mapWrapRef.current : document.querySelector(".detail-panel");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mode, picking, isMobile]);

  const mapAspect = mapSize.width / mapSize.height;
  const viewWidth = Math.max(1000, 500 * mapAspect) / zoom;
  const viewHeight = viewWidth / mapAspect;
  const pixel = viewWidth / mapSize.width;
  const bounds = { left: center[0] - viewWidth / 2, right: center[0] + viewWidth / 2, top: center[1] - viewHeight / 2, bottom: center[1] + viewHeight / 2 };
  const filteredDreams = useMemo(() => dreams.filter((dream) => {
    const inCountry = !country || geoContains(country as never, [dream.locationLon, dream.locationLat]);
    const match = !query.trim() || `${dream.topic} ${dream.description} ${dream.locationName} ${dream.destinationName || ""} ${dream.dreamerName} ${dream.hashtag}`.toLowerCase().includes(query.trim().toLowerCase());
    return inCountry && match && (status === "all" || status === dream.status);
  }), [dreams, country, query, status]);
  const visible = useMemo(() => filteredDreams.filter(dream => {
    const [x, y] = point(dream.locationLon, dream.locationLat);
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }), [filteredDreams, bounds.left, bounds.right, bounds.top, bounds.bottom]);
  const selected = dreams.find(d => d.id === selectedId) || null;
  const selectedOffers = offers.filter(o => o.dreamId === selectedId);
  const detailOpen = mode === "create" || !!selected;
  const selectedMatches = !selected || filteredDreams.some(dream => dream.id === selected.id);
  const markers = selected && !selectedMatches ? [...filteredDreams, selected] : filteredDreams;
  const highlighted = dreams.find(dream => dream.id === (hoveredId || selectedId)) || null;
  const highlightPoint = highlighted ? point(highlighted.locationLon, highlighted.locationLat) : null;
  const highlightInView = highlightPoint && highlightPoint[0] >= bounds.left && highlightPoint[0] <= bounds.right && highlightPoint[1] >= bounds.top && highlightPoint[1] <= bounds.bottom;

  const closeDetail = useCallback(() => {
    setSelectedId(null); setHoveredId(null); setHelpOpen(false); setNotice("");
    const url = new URL(window.location.href); url.searchParams.delete("dream"); window.history.replaceState(null, "", url);
  }, []);
  const closePanel = useCallback(() => { closeDetail(); setMode("detail"); setPicking(null); }, [closeDetail]);

  useEffect(() => {
    if (!selectedId) return;
    // Keep the selected point clear of the overlay on smaller desktop screens.
    const dream = dreams.find(item => item.id === selectedId);
    if (!dream) return;
    const [x, y] = point(dream.locationLon, dream.locationLat);
    const overlayWidth = !isMobile && window.innerWidth <= 1180 ? 360 : 0;
    const frame = requestAnimationFrame(() => {
      setCenter([x + viewWidth * overlayWidth / mapSize.width / 2, y]);
      if (!isMobile) cardRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, mapSize.width, isMobile, dreams, viewWidth]);

  useEffect(() => {
    if (!detailOpen && !picking) return;
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || isMobile && mode === "detail") return;
      if (picking) setPicking(null);
      else closePanel();
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [detailOpen, picking, isMobile, mode, closePanel]);

  useEffect(() => {
    const svg = mapRef.current;
    if (!svg) return;
    function wheel(event: WheelEvent) {
      if (isMobile && !event.ctrlKey) return;
      event.preventDefault();
      const rect = svg!.getBoundingClientRect();
      const nextZoom = Math.max(1, Math.min(8, zoom * Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .002)));
      const ratio = zoom / nextZoom;
      const offsetX = (event.clientX - rect.left) / rect.width - .5;
      const offsetY = (event.clientY - rect.top) / rect.height - .5;
      setCenter([center[0] + offsetX * viewWidth * (1 - ratio), center[1] + offsetY * viewHeight * (1 - ratio)]);
      setZoom(nextZoom);
    }
    svg.addEventListener("wheel", wheel, { passive: false });
    return () => svg.removeEventListener("wheel", wheel);
  }, [isMobile, zoom, center, viewWidth, viewHeight]);

  function selectDream(dream: Dream) {
    setMode("detail"); setSelectedId(dream.id); setPicking(null); setHoveredId(null); setHelpOpen(false); setHelpMessage(""); setNotice("");
    const url = new URL(window.location.href); url.searchParams.set("dream", dream.id); window.history.replaceState(null, "", url);
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
    if (event.button !== 0 || !event.isPrimary) return;
    movedRecently.current = false;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, center: [...center], moved: false };
  }
  function moveDrag(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current || event.pointerId !== drag.current.pointerId) return;
    const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
    if (!drag.current.moved && Math.abs(dx) + Math.abs(dy) > 5) {
      drag.current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setHoveredId(null);
    }
    if (!drag.current.moved) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setCenter([Math.max(0, Math.min(1000, drag.current.center[0] - dx * viewWidth / rect.width)), Math.max(-80, Math.min(580, drag.current.center[1] - dy * viewHeight / rect.height))]);
  }
  function endDrag(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current || event.pointerId !== drag.current.pointerId) return;
    if (drag.current.moved) movedRecently.current = true;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  }
  function changeZoom(delta: number) { setZoom(z => Math.max(1, Math.min(8, +(z * delta).toFixed(2)))); }

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


  const createContent = <div className="detail-content"><div className="detail-header"><div className="eyebrow">YOUR DREAM</div><button className="icon-button" aria-label="Close" onClick={closePanel}><X size={19}/></button></div><h2 className="detail-title">Put your dream on the map.</h2><p className="detail-intro">Start with where you are. Your destination is optional.</p><form className="dream-form" onSubmit={createDream}><label>Dream title <span>*</span><input required minLength={3} maxLength={100} value={draft.topic} onChange={e => setDraft({ ...draft, topic: e.target.value })} placeholder="What do you dream of doing?"/></label><label>Description <small>optional</small><textarea maxLength={600} rows={3} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Tell us a little more…"/></label><div className="form-two"><label>Hashtag <small>optional</small><input maxLength={32} value={draft.hashtag} onChange={e => setDraft({ ...draft, hashtag: e.target.value })} placeholder="#learning"/></label><label>Status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as DreamStatus })}><option value="dreamed">Dreamed</option><option value="in-progress">In progress</option><option value="achieved">Achieved</option></select></label></div><div className="form-location"><div><strong>Dreamer location <span>*</span></strong><small>Where are you now?</small></div><button type="button" className={picking === "home" ? "pick-button active" : "pick-button"} onClick={() => setPicking(picking === "home" ? null : "home")}><MapPin size={16}/>{draft.locationLat == null ? "Pick on map" : "Move pin"}</button></div>{draft.locationLat != null && <label>Place name<input required maxLength={80} value={draft.locationName} onChange={e => setDraft({ ...draft, locationName: e.target.value })} placeholder="City or region"/><small>{draft.locationLat.toFixed(2)}°, {draft.locationLon?.toFixed(2)}°</small></label>}<label className="checkbox-row"><input type="checkbox" checked={destinationEnabled} onChange={e => { setDestinationEnabled(e.target.checked); if (!e.target.checked) setPicking(null); }}/><span>Add a dream destination <small>optional</small></span></label>{destinationEnabled && <><div className="form-location"><div><strong>Dream destination</strong><small>Where does this dream take you?</small></div><button type="button" className={picking === "destination" ? "pick-button active" : "pick-button"} onClick={() => setPicking(picking === "destination" ? null : "destination")}><MapPin size={16}/>{draft.destinationLat == null ? "Pick on map" : "Move pin"}</button></div>{draft.destinationLat != null && <label>Destination name<input required maxLength={80} value={draft.destinationName} onChange={e => setDraft({ ...draft, destinationName: e.target.value })} placeholder="City or region"/></label>}</>}{notice && <div className="form-notice" role="alert">{notice}</div>}<button className="submit-button" disabled={busy || draft.locationLat == null || (destinationEnabled && draft.destinationLat == null)} type="submit">{busy ? "Saving…" : "Publish dream"}</button></form></div>;
  const dreamContent = selected ? <div className="detail-content"><div className="detail-header"><button className="back-button" onClick={closeDetail}><ArrowLeft size={17}/> Back to explore</button><button className="icon-button" onClick={closeDetail} aria-label="Close details"><X size={19}/></button></div><div className="detail-meta"><Status status={selected.status}/>{selected.isExample && <span className="example-tag">Example dream</span>}</div><h2 className="detail-title">{selected.topic}</h2><p className="detail-description">{selected.description || "No description yet."}</p>{selected.hashtag && <span className="hashtag">{selected.hashtag}</span>}<div className="person-row"><div className="avatar">{selected.dreamerName.charAt(0).toUpperCase()}</div><div><strong>{selected.dreamerName}</strong><span>Dreamer · {selected.locationName}</span></div></div><div className="journey"><div><span className="journey-symbol home"><MapPin size={18}/></span><div><small>DREAMER LOCATION</small><strong>{selected.locationName}</strong></div></div>{selected.destinationName && <div><span className="journey-symbol destination"><Compass size={18}/></span><div><small>DREAM DESTINATION</small><strong>{selected.destinationName}</strong></div></div>}</div>{viewer === selected.dreamerId ? <div className="owner-actions"><label>Update progress<select value={selected.status} disabled={busy} onChange={async e => { if (await action({ action: "status", dreamId: selected.id, status: e.target.value })) setNotice("Status updated."); }}><option value="dreamed">Dreamed</option><option value="in-progress">In progress</option><option value="achieved">Achieved</option></select></label></div> : <div className="support-actions"><button className={selected.hasVoted ? "vote-button voted" : "vote-button"} disabled={busy} onClick={async () => { if (await action({ action: "vote", dreamId: selected.id })) setNotice(selected.hasVoted ? "Vote removed." : "You voted for this dream."); }}><Heart size={18} fill={selected.hasVoted ? "currentColor" : "none"}/>{selected.hasVoted ? "Voted" : "Vote"} <span>{selected.votes}</span></button><button className="help-button" onClick={() => { setHelpOpen(!helpOpen); setNotice(""); }}><HandHeart size={18}/> Offer help</button></div>}{helpOpen && <form className="help-form" onSubmit={sendHelp}><label>How could you help?<textarea required minLength={10} maxLength={500} rows={3} value={helpMessage} onChange={e => setHelpMessage(e.target.value)} placeholder="A resource, advice, introduction, or another way to help…"/></label><button className="submit-button" disabled={busy}><Send size={16}/>{busy ? "Saving…" : "Send offer"}</button><small>Your offer is saved on this dream for its dreamer to see. Example dreamers are illustrative.</small></form>}{notice && <div className="form-notice" role="status">{notice}</div>}{selectedOffers.length > 0 && <div className="offers"><h3>{viewer === selected.dreamerId ? "Offers of help" : "Your offers"}</h3>{selectedOffers.map(o => <div key={o.id}><strong>{o.helperName}</strong><p>{o.message}</p></div>)}</div>}<div className="detail-footnote">Added {new Date(selected.createdAt).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })} · {selected.helpCount} {selected.helpCount === 1 ? "offer" : "offers"} of help</div></div> : null;

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-icon"><Compass size={21}/></span><span>Dream Map</span></div>
      <div className="top-center"><span className="brand-divider"/><span>A world of dreams. A little closer together.</span></div>
      <button className="primary-button" onClick={() => { closeDetail(); setPicking(null); setMode("create"); }}><Plus size={18}/> Add your dream</button>
    </header>
    <div className={`workspace ${detailOpen && !isMobile ? "detail-open" : ""}`}>
      <section className="explore-panel" aria-label="Explore dreams">
        <div className="panel-heading">
          <div className="eyebrow">THE DREAM ATLAS</div>
          <h1>{country?.properties?.name || (zoom === 1 ? "Around the world" : "In this area")}</h1>
          <p aria-live="polite">{loading ? "Finding dreams…" : `${visible.length} ${visible.length === 1 ? "dream" : "dreams"} in view · ${new Set(visible.map(d => d.dreamerId)).size} dreamers`}</p>
        </div>
        <div className="explore-controls">
          <label className="search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a dream in this area" aria-label="Search this area"/>{query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={14}/></button>}</label>
          <div className="filters" aria-label="Filter by status">
            {(["all", "dreamed", "in-progress", "achieved"] as const).map(s => <button key={s} className={status === s ? "active" : ""} aria-pressed={status === s} onClick={() => { setStatus(s); setHoveredId(null); }}>{s === "all" ? "All dreams" : statusLabel[s]}</button>)}
          </div>
        </div>
        <div className="list-scroll" aria-busy={loading}>
          {loading ? <div className="loading-cards" role="status" aria-label="Loading dreams">{[1, 2, 3].map(n => <div className="loading-card" key={n}><span/><span/><span/></div>)}</div>
            : error ? <div className="state-card" role="alert"><strong>Dreams couldn’t load</strong><span>{error}</span><button onClick={reload}>Try again</button></div>
            : visible.length ? visible.map(d => <button
              className={`dream-card ${selectedId === d.id ? "selected" : ""} ${hoveredId === d.id ? "hovered" : ""}`}
              key={d.id}
              ref={node => { if (node) cardRefs.current.set(d.id, node); else cardRefs.current.delete(d.id); }}
              aria-label={`${d.topic}, by ${d.dreamerName} in ${d.locationName}`}
              aria-pressed={selectedId === d.id}
              onClick={() => selectDream(d)}
              onMouseEnter={() => { if (!isMobile) setHoveredId(d.id); }}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(d.id)}
              onBlur={() => setHoveredId(null)}
            >
              <div className="card-person"><span className={`card-avatar avatar-${d.status}`}>{d.dreamerName.charAt(0).toUpperCase()}</span><span className="card-identity"><strong>{d.dreamerName}</strong><span><MapPin size={12}/>{d.locationName}</span></span>{d.isExample && <span className="example-tag">Example</span>}</div>
              <h2>{d.topic}</h2>
              {d.description && <p>{d.description}</p>}
              <div className="card-bottom"><Status status={d.status}/><span className="card-tag">{d.hashtag}</span><span className="vote-count"><Heart size={14}/>{d.votes}</span></div>
            </button>)
            : <div className="state-card"><Globe2 size={27}/><strong>No dreams in this view</strong><span>Try another place or clear your filters.</span><button onClick={() => { resetMap(); setStatus("all"); setQuery(""); }}>Explore all dreams</button></div>}
        </div>
        <div className="list-footer"><Compass size={14}/><span>Every dream starts somewhere.</span><span title="Illustrative dreams are marked Example">Examples marked</span></div>
      </section>
      <section className="map-wrap" ref={mapWrapRef} aria-label="Interactive world map">
        <div className="map-top">
          <div className="map-context"><Globe2 size={16}/><span>{country?.properties?.name || "The world, one dream at a time"}</span></div>
          {country && <button className="region-pill" onClick={() => setCountry(null)} aria-label="Clear country filter">{country.properties?.name}<X size={14}/></button>}
        </div>
        {!detailOpen && !query && status === "all" && !country && zoom === 1 && <div className="map-welcome"><div className="eyebrow">A WORLD OF POSSIBILITY</div><h2>Big dreams.<br/>Small beginnings.</h2><p>Find a person, a place, a story.</p></div>}
        {picking && <div className="picking-banner" role="status"><MapPin size={17}/><span>Tap to set your {picking === "home" ? "location" : "destination"}</span><button onClick={() => setPicking(null)}>Cancel</button></div>}
        <svg
          ref={mapRef} className={`world-map ${picking ? "picking" : ""}`}
          viewBox={`${bounds.left} ${bounds.top} ${viewWidth} ${viewHeight}`}
          onClick={mapClick} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          role="group" aria-label="World map showing the location of dreams"
        >
          <rect x={bounds.left} y={bounds.top} width={viewWidth} height={viewHeight} fill="#122c3d"/>
          <path d={gridPath} fill="none" stroke="#476174" strokeWidth={.5 * pixel} opacity=".25"/>
          {countryPaths.map(({ country: c, outline }, i) => <path key={i} d={outline} fill={country === c ? "#64838b" : "#375b6b"} stroke="#183847" strokeWidth={.75 * pixel} onClick={() => selectCountry(c)} className="country"><title>{c.properties?.name}</title></path>)}
          {selected?.destinationLat != null && selected.destinationLon != null && <>
            <path d={path({ type: "LineString", coordinates: [[selected.locationLon, selected.locationLat], [selected.destinationLon, selected.destinationLat]] }) || ""} fill="none" stroke="#efd298" strokeWidth={1.5 * pixel} strokeDasharray={`${5 * pixel} ${5 * pixel}`} pointerEvents="none"/>
            <g transform={`translate(${point(selected.destinationLon, selected.destinationLat).join(" ")})`} pointerEvents="none"><circle r={12 * pixel} fill="#efd298" opacity=".15"/><path d={`M 0 ${-6 * pixel} L ${6 * pixel} 0 L 0 ${6 * pixel} L ${-6 * pixel} 0 Z`} fill="#efd298" stroke="#fff" strokeWidth={1.5 * pixel}/><title>Dream destination: {selected.destinationName}</title></g>
          </>}
          {markers.map(d => {
            const [x, y] = point(d.locationLon, d.locationLat);
            const active = selectedId === d.id, hovered = hoveredId === d.id;
            return <g key={d.id} data-dream-id={d.id} transform={`translate(${x} ${y})`} className={`map-marker ${active ? "active" : ""}`}
              onClick={e => { if (picking || movedRecently.current) return; e.stopPropagation(); selectDream(d); }}
              onMouseEnter={() => { if (!picking && !isMobile) setHoveredId(d.id); }} onMouseLeave={() => setHoveredId(null)}
              role="button" tabIndex={0} aria-pressed={active} aria-label={`${d.topic}, ${d.locationName}`}
              onKeyDown={e => { if (!picking && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectDream(d); } }}
              onFocus={() => setHoveredId(d.id)} onBlur={() => setHoveredId(null)}
            >
              <circle className="marker-hit" r={20 * pixel} fill="transparent"/>
              <circle r={(active || hovered ? 17 : 12) * pixel} fill={active ? "#f4cb91" : "#fff"} opacity={active || hovered ? .23 : .10} pointerEvents="none"/>
              <circle r={(active || hovered ? 8 : 6) * pixel} fill={d.status === "achieved" ? "#72d6ba" : d.status === "in-progress" ? "#f3ce75" : "#f6a67f"} stroke="#f9f5e8" strokeWidth={1.5 * pixel} pointerEvents="none"/>
              <title>{d.topic} · {d.locationName}</title>
            </g>;
          })}
          {mode === "create" && draft.locationLat != null && <circle cx={point(draft.locationLon!, draft.locationLat)[0]} cy={point(draft.locationLon!, draft.locationLat)[1]} r={9 * pixel} fill="#ffad7c" stroke="#fff" strokeWidth={2 * pixel} pointerEvents="none"/>}
          {mode === "create" && destinationEnabled && draft.destinationLat != null && <circle cx={point(draft.destinationLon!, draft.destinationLat)[0]} cy={point(draft.destinationLon!, draft.destinationLat)[1]} r={9 * pixel} fill="#f7d886" stroke="#fff" strokeWidth={2 * pixel} pointerEvents="none"/>}
        </svg>
        {!picking && highlightInView && highlighted && highlightPoint && <div className="map-label" style={{ left: `${(highlightPoint[0] - bounds.left) / viewWidth * 100}%`, top: `${(highlightPoint[1] - bounds.top) / viewHeight * 100}%` }}><strong>{highlighted.topic}</strong><span>{highlighted.dreamerName} · {highlighted.locationName}{highlighted.destinationName ? ` → ${highlighted.destinationName}` : ""}</span>{highlighted.id === selectedId && !selectedMatches && <small>Selected dream · outside your filters</small>}</div>}
        <div className="map-bottom"><div className="map-legend" aria-label="Dream status legend"><span><i className="legend-dot dreamed"/>Dreamed</span><span><i className="legend-dot progress"/>In progress</span><span><i className="legend-dot achieved"/>Achieved</span></div><span className="map-tip">{isMobile ? "Drag to explore" : "Drag to explore · scroll to zoom"}</span></div>
        <div className="map-actions"><button title="Zoom in" aria-label="Zoom in" disabled={zoom >= 8} onClick={() => changeZoom(1.5)}><Plus size={18}/></button><button title="Zoom out" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => changeZoom(1/1.5)}><Minus size={18}/></button><span/><button title="Show the whole world" aria-label="Show the whole world" onClick={resetMap}><LocateFixed size={18}/></button></div>
      </section>
      {mode === "create" ? <aside className="detail-panel detail-create" aria-label="Add a dream">{createContent}</aside> : selected && !isMobile ? <aside className="detail-panel" aria-label="Dream details">{dreamContent}</aside> : null}
    </div>
    {isMobile && <Sheet open={!!selected && mode === "detail"} onOpenChange={open => { if (!open) closeDetail(); }}><SheetContent side="bottom" className="dream-sheet" showCloseButton={false}><SheetTitle className="sr-only">{selected?.topic || "Dream details"}</SheetTitle><SheetDescription className="sr-only">Dream details, location, and ways to support the dreamer.</SheetDescription><div className="sheet-handle"/>{dreamContent}</SheetContent></Sheet>}
  </main>;
}
