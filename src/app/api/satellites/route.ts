import { db } from "@/db/client";
import { satellites } from "@/db/schema";

export const maxDuration = 60;

// Compact catalog for the client: array of
// [noradId, name, operator, tleLine1, tleLine2].
export async function GET() {
  const rows = await db
    .select({
      noradId: satellites.noradId,
      name: satellites.name,
      operator: satellites.operator,
      tleLine1: satellites.tleLine1,
      tleLine2: satellites.tleLine2,
    })
    .from(satellites);

  const compact = rows.map((r) => [r.noradId, r.name, r.operator, r.tleLine1, r.tleLine2]);

  return Response.json(compact, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
