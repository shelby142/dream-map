import { ensureExamples, ensureViewer, fail, getBinding, listDreams, viewerId } from "../../../lib/dream-data";

export const dynamic = "force-dynamic";

type Payload = Record<string, unknown>;
const bad = (message: string) => Response.json({ error: message }, { status: 400 });
const string = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const coordinate = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export async function GET(request: Request) {
  try {
    const db = getBinding();
    await ensureExamples(db);
    const viewer = viewerId(request);
    const dreams = await listDreams(db, viewer);
    const offers = viewer ? (await db.prepare(`SELECT h.id, h.dream_id AS dreamId, h.message, h.created_at AS createdAt, u.name AS helperName
      FROM help_offers h JOIN dreams d ON d.id = h.dream_id JOIN dreamers u ON u.id = h.helper_id
      WHERE d.dreamer_id = ? OR h.helper_id = ? ORDER BY h.created_at DESC`).bind(viewer, viewer).all()).results : [];
    return Response.json({ dreams, viewer, offers });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  const viewer = viewerId(request);
  if (!viewer) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return bad("Invalid origin.");
  let body: Payload;
  try { body = await request.json() as Payload; } catch { return bad("Invalid request."); }
  try {
    const db = getBinding();
    await ensureViewer(db, viewer, request);
    const now = new Date().toISOString();
    const action = body.action;
    if (action === "create") {
      const topic = string(body.topic, 100);
      const locationName = string(body.locationName, 80);
      const hasDestination = body.destinationName != null && String(body.destinationName).trim() !== "";
      if (topic.length < 3) return bad("Give your dream a title of at least 3 characters.");
      if (!locationName || !coordinate(body.locationLat, -85, 85) || !coordinate(body.locationLon, -180, 180)) return bad("Choose your location on the map and add its name.");
      if (hasDestination && (!coordinate(body.destinationLat, -85, 85) || !coordinate(body.destinationLon, -180, 180))) return bad("Choose a destination on the map.");
      const status = ["dreamed", "in-progress", "achieved"].includes(String(body.status)) ? body.status : "dreamed";
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO dreams (id, dreamer_id, topic, description, hashtag, status, location_name, location_lat, location_lon, destination_name, destination_lat, destination_lon, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, viewer, topic, string(body.description, 600), string(body.hashtag, 32).replace(/^#?/, "#").replace(/^#$/, ""), status,
        locationName, body.locationLat, body.locationLon, hasDestination ? string(body.destinationName, 80) : null,
        hasDestination ? body.destinationLat : null, hasDestination ? body.destinationLon : null, now).run();
      return Response.json({ id }, { status: 201 });
    }
    const dreamId = string(body.dreamId, 100);
    const dream = dreamId ? await db.prepare("SELECT dreamer_id FROM dreams WHERE id = ?").bind(dreamId).first<{dreamer_id: string}>() : null;
    if (!dream) return bad("Dream not found.");
    if (action === "vote") {
      if (dream.dreamer_id === viewer) return bad("You cannot vote for your own dream.");
      const existing = await db.prepare("SELECT id FROM votes WHERE dream_id = ? AND voter_id = ?").bind(dreamId, viewer).first();
      if (existing) await db.prepare("DELETE FROM votes WHERE dream_id = ? AND voter_id = ?").bind(dreamId, viewer).run();
      else await db.prepare("INSERT OR IGNORE INTO votes (id, dream_id, voter_id, created_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), dreamId, viewer, now).run();
      return Response.json({ voted: !existing });
    }
    if (action === "help") {
      if (dream.dreamer_id === viewer) return bad("This is your own dream.");
      const message = string(body.message, 500);
      if (message.length < 10) return bad("Tell the dreamer how you can help (at least 10 characters).");
      await db.prepare("INSERT INTO help_offers (id, dream_id, helper_id, message, created_at) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), dreamId, viewer, message, now).run();
      return Response.json({ saved: true }, { status: 201 });
    }
    if (action === "status") {
      if (dream.dreamer_id !== viewer) return Response.json({ error: "Only the dreamer can update this dream." }, { status: 403 });
      if (!["dreamed", "in-progress", "achieved"].includes(String(body.status))) return bad("Invalid status.");
      await db.prepare("UPDATE dreams SET status = ? WHERE id = ?").bind(body.status, dreamId).run();
      return Response.json({ saved: true });
    }
    return bad("Unknown action.");
  } catch (error) { return fail(error); }
}
