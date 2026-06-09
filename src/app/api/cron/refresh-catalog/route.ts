import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { satellites } from "@/db/schema";
import { parseTleCatalog } from "@/lib/tle";
import { deriveOperator } from "@/lib/operators";

export const maxDuration = 300;

const CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(CELESTRAK_URL, { cache: "no-store" });
  if (!res.ok) {
    return Response.json({ error: `CelesTrak fetch failed: ${res.status}` }, { status: 502 });
  }

  const parsed = parseTleCatalog(await res.text());
  if (parsed.length < 1000) {
    return Response.json({ error: `Suspiciously small catalog: ${parsed.length}` }, { status: 502 });
  }

  const now = new Date();
  const rows = parsed.map((p) => ({
    ...p,
    operator: deriveOperator(p.name),
    updatedAt: now,
  }));

  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db
      .insert(satellites)
      .values(chunk)
      .onConflictDoUpdate({
        target: satellites.noradId,
        set: {
          name: sql`excluded.name`,
          tleLine1: sql`excluded.tle_line1`,
          tleLine2: sql`excluded.tle_line2`,
          operator: sql`excluded.operator`,
          inclination: sql`excluded.inclination`,
          apoapsisKm: sql`excluded.apoapsis_km`,
          periapsisKm: sql`excluded.periapsis_km`,
          epoch: sql`excluded.epoch`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  // Drop satellites that left the active catalog (decayed/retired).
  await db.delete(satellites).where(sql`${satellites.updatedAt} < now() - interval '2 days'`);

  return Response.json({ ok: true, count: rows.length });
}
