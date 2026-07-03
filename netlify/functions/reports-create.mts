import type { Config } from "@netlify/functions";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { fieldOptions, inspectionResults, reportNumberCounter, reports } from "../../db/schema.js";
import {
  CHECKED_COMMENT_DEFAULTS,
  CHECKED_CONDITION_DEFAULT,
  UNCHECKED_COMMENT_DEFAULTS,
  UNCHECKED_CONDITION_DEFAULT,
} from "../../shared/constants.js";
import { reportInputSchema } from "../../shared/schema.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { badRequest, json } from "./_shared/http.js";

export default async (req: Request) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = reportInputSchema.safeParse(body);
  if (!parsed.success) return badRequest("Ugyldig rapport", parsed.error.flatten());
  const input = parsed.data;

  const result = await db.transaction(async (tx) => {
    // Idempotent upsert keyed on the client-generated id: a retry of an
    // already-synced create (dropped-connection response, offline outbox
    // retry) must not double-insert or double-increment the report number.
    const existing = await tx.select().from(reports).where(eq(reports.id, input.id)).limit(1);
    if (existing[0]) {
      const existingResults = await tx
        .select()
        .from(inspectionResults)
        .where(eq(inspectionResults.reportId, input.id));
      return { report: existing[0], results: existingResults, isNew: false };
    }

    // Claim the next report number atomically - old next_value is the
    // assigned number, then bump the counter for the next caller.
    const [{ nextValue }] = await tx
      .update(reportNumberCounter)
      .set({ nextValue: sql`${reportNumberCounter.nextValue} + 1` })
      .where(eq(reportNumberCounter.id, 1))
      .returning({ nextValue: reportNumberCounter.nextValue });
    const assignedNumber = nextValue - 1;

    const [inserted] = await tx
      .insert(reports)
      .values({
        id: input.id,
        reportNumber: assignedNumber,
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
        createdBy: user.id,
        updatedBy: user.id,
      })
      .onConflictDoNothing({ target: reports.id })
      .returning();

    if (!inserted) {
      // Genuine concurrent race on the exact same client-generated id -
      // exceptionally rare, but handled: someone else's insert won, use it.
      const [row] = await tx.select().from(reports).where(eq(reports.id, input.id)).limit(1);
      const rowResults = await tx
        .select()
        .from(inspectionResults)
        .where(eq(inspectionResults.reportId, input.id));
      return { report: row, results: rowResults, isNew: false };
    }

    const resultRows = await tx
      .insert(inspectionResults)
      .values(
        input.inspectionResults.map((r) => ({
          reportId: input.id,
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

    // Grow the creatable-combobox option lists from real usage - seed rows
    // and user-typed rows are indistinguishable, all equally deletable.
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

    return { report: inserted, results: resultRows, isNew: true };
  });

  // isNew travels in the BODY, not just the status code: apiFetch strips the
  // status, and the client must know whether its payload was actually
  // applied (201) or an existing row was returned untouched (200) - in the
  // latter case the client follows up with a PUT to apply newer edits
  // (offline-sync race, see ReportFormPage.persist).
  return json(
    { ...result.report, inspectionResults: result.results, isNew: result.isNew },
    { status: result.isNew ? 201 : 200 },
  );
};

export const config: Config = {
  path: "/api/reports",
  method: "POST",
};
