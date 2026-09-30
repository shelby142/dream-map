import { env } from "cloudflare:workers";

export type DreamStatus = "dreamed" | "in-progress" | "achieved";
export type Dream = {
  id: string; dreamerId: string; dreamerName: string; isExample: boolean;
  topic: string; description: string; hashtag: string; status: DreamStatus;
  locationName: string; locationLat: number; locationLon: number;
  destinationName: string | null; destinationLat: number | null; destinationLon: number | null;
  createdAt: string; votes: number; hasVoted: boolean; helpCount: number;
};

const examples = [
  ["Shanghai", 31.23, 121.47, "Build an independent studio", "Turn small software ideas into a sustainable solo business, and share what I learn.", "#indie", "in-progress", null, null, null, "Ren"],
  ["Tokyo", 35.68, 139.69, "Make a neighborhood reading room", "A quiet place where children can discover books after school.", "#community", "dreamed", null, null, null, "Haru"],
  ["Mumbai", 19.08, 72.88, "Bring science labs to more schools", "Create affordable hands-on experiments for classrooms with limited equipment.", "#education", "in-progress", null, null, null, "Anika"],
  ["Nairobi", -1.29, 36.82, "Grow a city garden network", "Connect neighbors through shared gardens and fresh food.", "#climate", "achieved", null, null, null, "Amani"],
  ["London", 51.51, -0.13, "Cycle across Europe", "Ride from home to the Mediterranean and document the people I meet.", "#travel", "dreamed", "Barcelona", 41.39, 2.17, "Noah"],
  ["New York", 40.71, -74.01, "Open a free music workshop", "Help young people make their first recordings together.", "#music", "in-progress", null, null, null, "Maya"],
  ["São Paulo", -23.55, -46.63, "Restore a patch of Atlantic forest", "Work with local volunteers to bring native trees back.", "#nature", "dreamed", null, null, null, "Luca"],
  ["Lagos", 6.52, 3.38, "Launch a community design school", "Make practical design skills accessible to more young makers.", "#learning", "dreamed", null, null, null, "Tobi"],
  ["Berlin", 52.52, 13.4, "Build a tiny solar home", "Design an affordable home that runs on clean energy.", "#making", "in-progress", null, null, null, "Lea"],
  ["Sydney", -33.87, 151.21, "Swim the length of the harbor", "Train for an open-water challenge and raise funds for ocean care.", "#ocean", "achieved", null, null, null, "Kai"],
  ["Mexico City", 19.43, -99.13, "Create a public mural trail", "Invite local artists to tell the stories of our streets.", "#art", "dreamed", null, null, null, "Sofía"],
  ["Jakarta", -6.21, 106.85, "Study coral restoration", "Learn from island communities and help protect reefs.", "#ocean", "dreamed", "Bali", -8.41, 115.19, "Dewi"],
] as const;

export function getBinding() {
  if (!env.DB) throw new Error("Dream data is temporarily unavailable.");
  return env.DB;
}

export function viewerId(request: Request) {
  const id = request.headers.get("oai-authenticated-user-id");
  if (id) return `user:${id}`;
  if (process.env.NODE_ENV === "development") return "user:local-preview";
  return null;
}

export async function ensureExamples(db: D1Database) {
  const statements = examples.flatMap((e, i) => {
    const owner = `example:${i + 1}`;
    return [
      db.prepare("INSERT OR IGNORE INTO dreamers (id, name, is_example, created_at) VALUES (?, ?, 1, ?)").bind(owner, e[10], "2026-09-01T12:00:00Z"),
      db.prepare("INSERT OR IGNORE INTO dreams (id, dreamer_id, topic, description, hashtag, status, location_name, location_lat, location_lon, destination_name, destination_lat, destination_lon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(`example-${i + 1}`, owner, e[3], e[4], e[5], e[6], e[0], e[1], e[2], e[7], e[8], e[9], `2026-09-${String(i + 1).padStart(2,"0")}T12:00:00Z`),
    ];
  });
  await db.batch(statements);
}

export async function ensureViewer(db: D1Database, id: string, request: Request) {
  const email = request.headers.get("oai-authenticated-user-email");
  const name = email?.split("@")[0] || "Dreamer";
  await db.prepare("INSERT OR IGNORE INTO dreamers (id, name, is_example, created_at) VALUES (?, ?, 0, ?)").bind(id, name, new Date().toISOString()).run();
}

export async function listDreams(db: D1Database, viewer: string | null): Promise<Dream[]> {
  const { results } = await db.prepare(`SELECT d.*, u.name AS dreamer_name, u.is_example,
    (SELECT COUNT(*) FROM votes v WHERE v.dream_id = d.id) AS votes,
    (SELECT COUNT(*) FROM votes v WHERE v.dream_id = d.id AND v.voter_id = ?) AS has_voted,
    (SELECT COUNT(*) FROM help_offers h WHERE h.dream_id = d.id) AS help_count
    FROM dreams d JOIN dreamers u ON u.id = d.dreamer_id ORDER BY d.created_at DESC`).bind(viewer || "").all();
  return results.map((r) => ({
    id: String(r.id), dreamerId: String(r.dreamer_id), dreamerName: String(r.dreamer_name), isExample: !!r.is_example,
    topic: String(r.topic), description: String(r.description), hashtag: String(r.hashtag), status: r.status as DreamStatus,
    locationName: String(r.location_name), locationLat: Number(r.location_lat), locationLon: Number(r.location_lon),
    destinationName: r.destination_name ? String(r.destination_name) : null,
    destinationLat: r.destination_lat == null ? null : Number(r.destination_lat),
    destinationLon: r.destination_lon == null ? null : Number(r.destination_lon),
    createdAt: String(r.created_at), votes: Number(r.votes), hasVoted: !!r.has_voted, helpCount: Number(r.help_count),
  }));
}

export function fail(error: unknown) {
  console.error("Dream Map request failed", error);
  return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
