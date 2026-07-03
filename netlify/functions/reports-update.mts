import type { Config, Context } from "@netlify/functions";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { fieldOptions, inspectionResults, reports } from "../../db/schema.js";
import {
  CHECKED_COMMENT_DEFAULTS,
  CHECKED_CONDITION_DEFAULT,
  UNCHECKED_COMMENT_DEFAULTS,
  UNCHECKED_CONDITION_DEFAULT,
} from "../../shared/constants.js";
import { reportInputSchema } from "../../shared/schema.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { badRequest, isUuid, json, notFound } from "./_shared/http.js";

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const { id } = context.params;
  if (!isUuid(id)) return notFound("Rapport ikke funnet");
  const body = await req.json().catch(() => null);
  const parsed = reportInputSchema.safeParse({ ...body, id });
  if (!parsed.success) return badRequest("Ugyldig rapport", parsed.error.flatten());
  const input = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!existing) return null;

    // report_number and id are immutable once assigned - never touched here.
    const [updated] = await tx
      .update(reports)
      .set({
        date: input.date,
        vessel: input.vessel ?? null,
        timeFrom: input.timeFrom ?? null,
        timeTo: input.timeTo ?? null,
        projectLeader: input.projectLeader ?? null,
        location: input.location ?? null,
        rovOperator: input.rovOperator ?? null,
        reason: input.reason ?? null,
        merdNumber: input.merdNumber ?? null,
        merdType: input.merdType ?? null,
        sizeX: input.sizeX?.toString() ?? null,
        sizeY: input.sizeY?.toString() ?? null,
        depth: input.depth?.toString() ?? null,
        deadFishCount: input.deadFishCount ?? null,
        deadFishApprox: input.deadFishApprox,
        currentStrength: input.currentStrength ?? null,
        visibility: input.visibility ?? null,
        wildFish: input.wildFish ?? null,
        wildFishNote: input.wildFishNote ?? null,
        growth: input.growth ?? null,
        comments: input.comments ?? null,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, id))
      .returning();

    const resultRows = await tx
      .insert(inspectionResults)
      .values(
        input.inspectionResults.map((r) => ({
          reportId: id,
          category: r.category,
          checked: r.checked,
          condition:
            r.condition?.trim() ||
            (r.checked ? CHECKED_CONDITION_DEFAULT : UNCHECKED_CONDITION_DEFAULT),
          comment:
            r.comment?.trim() ||
            (r.checked ? CHECKED_COMMENT_DEFAULTS[r.category] : UNCHECKED_COMMENT_DEFAULTS[r.category]),
        })),
      )
      .onConflictDoUpdate({
        target: [inspectionResults.reportId, inspectionResults.category],
        set: {
          checked: sql`excluded.checked`,
          condition: sql`excluded.condition`,
          comment: sql`excluded.comment`,
        },
      })
      .returning();

    const creatable: Array<[string, string | null | undefined]> = [
      ["location", input.location],
      ["vessel", input.vessel],
      ["project_leader", input.projectLeader],
      ["rov_operator", input.rovOperator],
      ["merd_type", input.merdType],
      ["reason", input.reason],
    ];
    for (const [fieldKey, value] of creatable) {
      const trimmed = value?.trim();
      if (!trimmed) continue;
      await tx
        .insert(fieldOptions)
        .values({ fieldKey: fieldKey as (typeof fieldOptions.$inferInsert)["fieldKey"], value: trimmed })
        .onConflictDoNothing({ target: [fieldOptions.fieldKey, fieldOptions.value] });
    }

    return { report: updated, results: resultRows };
  });

  if (!result) return notFound("Rapport ikke funnet");
  return json({ ...result.report, inspectionResults: result.results });
};

export const config: Config = {
  path: "/api/reports/:id",
  method: ["PUT", "PATCH"],
};
