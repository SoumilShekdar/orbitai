import { generateObject } from "ai";
import { z } from "zod";

export const maxDuration = 60;

const reportSchema = z.object({
  collisionRisk: z.enum(["Low", "Moderate", "High"]),
  summary: z
    .string()
    .describe("2-3 sentence mission analysis written for a mission operator. Confident, concise."),
  recommendedAltitudeKm: z
    .number()
    .describe("The best alternative altitude from the provided candidates, or the current altitude if it is already optimal."),
  recommendationReason: z
    .string()
    .describe("One sentence explaining the recommendation, citing congestion numbers."),
});

const SYSTEM = `You are OrbitAI's mission analyst. You receive deterministic traffic statistics
for a satellite that was just inserted into orbit, plus a survey of candidate altitudes with
their traffic counts. Write the report. Never invent numbers.

Calibrate collisionRisk to the data: density HIGH -> High, MEDIUM -> Moderate, LOW -> Low.

Recommend a move ONLY if a candidate altitude cuts the ±20 km traffic count by at least 60%
versus the current orbit. Otherwise set recommendedAltitudeKm to the CURRENT altitude and write
the recommendationReason as an endorsement of staying put. Pick moves only from the provided
candidates and prefer the smallest move that achieves the reduction.`;

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const { object } = await generateObject({
      model: process.env.AI_MODEL ?? "google/gemini-2.5-flash",
      schema: reportSchema,
      system: SYSTEM,
      prompt: JSON.stringify(body),
    });
    return Response.json(object);
  } catch (err) {
    console.error("analyze-mission failed", err);
    return Response.json({ error: "Failed to generate report" }, { status: 502 });
  }
}
