import type { Config } from "@netlify/functions";
import { and, asc, count, desc, gte, ilike, lte, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reports } from "../../db/schema.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { json } from "./_shared/http.js";

export default async (req: Request) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const p = url.searchParams;

  const page = Math.max(1, Number(p.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(p.get("page_size") ?? "25") || 25));

  const conditions = [];
  const dateFrom = p.get("date_from");
  const dateTo = p.get("date_to");
  const location = p.get("location");
  const merdNumber = p.get("merd_number");
  const rovOperator = p.get("rov_operator");
  const q = p.get("q");

  if (dateFrom) conditions.push(gte(reports.date, dateFrom));
  if (dateTo) conditions.push(lte(reports.date, dateTo));
  if (location) conditions.push(ilike(reports.location, `%${location}%`));
  if (merdNumber) conditions.push(ilike(reports.merdNumber, `%${merdNumber}%`));
  if (rovOperator) conditions.push(ilike(reports.rovOperator, `%${rovOperator}%`));
  if (q) {
    conditions.push(
      or(
        ilike(reports.location, `%${q}%`),
        ilike(reports.merdNumber, `%${q}%`),
        ilike(reports.reason, `%${q}%`),
        ilike(reports.rovOperator, `%${q}%`),
        ilike(reports.vessel, `%${q}%`),
      ),
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [items, totalRow] = await Promise.all([
    db
      .select({
        id: reports.id,
        reportNumber: reports.reportNumber,
        date: reports.date,
        location: reports.location,
        merdNumber: reports.merdNumber,
        reason: reports.reason,
        rovOperator: reports.rovOperator,
        vessel: reports.vessel,
        pdfBlobKey: reports.pdfBlobKey,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(where)
      .orderBy(desc(reports.reportNumber), desc(reports.createdAt), asc(reports.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(reports).where(where),
  ]);

  return json({
    items,
    total: totalRow[0]?.total ?? 0,
    page,
    pageSize,
  });
};

export const config: Config = {
  path: "/api/reports",
  method: "GET",
};
