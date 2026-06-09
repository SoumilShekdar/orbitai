import { generateObject } from "ai";
import { z } from "zod";
import { LAUNCH_SITES, resolveLaunchSite } from "@/lib/mission/launchSites";

export const maxDuration = 60;

const missionSchema = z.object({
  missionName: z
    .string()
    .describe("Short evocative mission name derived from the request, e.g. 'EarthWatch-1'"),
  massKg: z.number().describe("Satellite mass in kg. Default 200 if unspecified."),
  orbitType: z.enum(["SSO", "polar", "equatorial", "inclined"]),
  altitudeKm: z.number().describe("Target circular orbit altitude in km. Default 550."),
  inclinationDeg: z
    .number()
    .describe(
      "Orbital inclination in degrees. For SSO use the sun-synchronous value (~97.6 at 550 km). For polar use 90. For equatorial use 0.",
    ),
  launchSiteName: z.string().describe("Launch site name, matched to a real pad when possible."),
  launchSiteLat: z.number(),
  launchSiteLon: z.number(),
});

const SYSTEM = `You parse satellite mission descriptions into structured launch parameters.

Known launch sites (prefer these; pick the most plausible for the country or operator mentioned):
${LAUNCH_SITES.map((s) => `- ${s.name} (${s.country}): lat ${s.lat}, lon ${s.lon}`).join("\n")}

Rules:
- "SSO" / "sun-synchronous" means orbitType SSO with inclination ≈ 96.6 + altitude_km * 0.00185 degrees.
- If the user mentions a country with a known site, use that site (e.g. India -> Sriharikota).
- If no site is mentioned, choose Cape Canaveral.
- Altitudes below 200 km or above 2000 km should be clamped into the 200-2000 km LEO band.`;

export async function POST(request: Request) {
  const { prompt } = (await request.json()) as { prompt?: string };
  if (!prompt?.trim()) {
    return Response.json({ error: "Missing prompt" }, { status: 400 });
  }

  try {
    const { object } = await generateObject({
      model: process.env.AI_MODEL ?? "google/gemini-2.5-flash",
      schema: missionSchema,
      system: SYSTEM,
      prompt,
    });

    const site = resolveLaunchSite(
      object.launchSiteName,
      object.launchSiteLat,
      object.launchSiteLon,
    );
    const altitudeKm = Math.min(2000, Math.max(200, object.altitudeKm));
    const inclinationDeg =
      object.orbitType === "SSO" ? 96.6 + altitudeKm * 0.00185 : object.inclinationDeg;

    return Response.json({
      missionName: object.missionName,
      massKg: object.massKg,
      orbitType: object.orbitType,
      altitudeKm,
      inclinationDeg,
      launchSite: { name: site.name, lat: site.lat, lon: site.lon },
    });
  } catch (err) {
    console.error("parse-mission failed", err);
    return Response.json({ error: "Failed to parse mission" }, { status: 502 });
  }
}
