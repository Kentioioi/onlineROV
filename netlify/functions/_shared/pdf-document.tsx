import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { InspectionResult, Report, ReportImage } from "../../../db/schema.js";
import { CATEGORY_LABELS, INSPECTION_CATEGORIES, type InspectionCategory } from "../../../shared/constants.js";

// One fixed branded look (no theme/banner picker, per plan) - dark navy /
// cyan maritime palette matching the legacy app's SEA ROV branding.
const BRAND_DARK = "#0b2540";
const BRAND_ACCENT = "#12a5c9";
const BORDER = "#c8cdd4";
const MUTED = "#5b6672";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica", color: "#1a1f26" },
  header: {
    backgroundColor: BRAND_DARK,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { color: "#ffffff", fontSize: 18, fontFamily: "Helvetica-Bold" },
  brandSub: { color: BRAND_ACCENT, fontSize: 8, marginTop: 2 },
  headerRight: { alignItems: "flex-end" },
  headerRightText: { color: "#ffffff", fontSize: 9 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: BRAND_DARK,
    marginBottom: 4,
    marginTop: 10,
  },
  table: { borderWidth: 1, borderColor: BORDER, marginBottom: 4 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  rowLast: { flexDirection: "row" },
  cellLabel: {
    width: "22%",
    padding: 4,
    backgroundColor: "#f2f4f6",
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  cellValue: { width: "28%", padding: 4, borderRightWidth: 1, borderRightColor: BORDER },
  cellValueLast: { width: "28%", padding: 4 },
  resultHeaderRow: { flexDirection: "row", backgroundColor: BRAND_DARK },
  resultHeaderCell: { padding: 4, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 8 },
  resultRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  resultCell: { padding: 4, borderRightWidth: 1, borderRightColor: BORDER, fontSize: 8 },
  resultCellLast: { padding: 4, fontSize: 8 },
  colCategory: { width: "16%" },
  colStatus: { width: "14%" },
  colCondition: { width: "16%" },
  colComment: { width: "54%" },
  commentsBlock: { borderWidth: 1, borderColor: BORDER, padding: 8, minHeight: 40 },
  imageCategoryLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: BRAND_DARK,
    marginTop: 8,
    marginBottom: 4,
  },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  imageWrap: { width: "31%" },
  image: { width: "100%", objectFit: "cover", borderWidth: 1, borderColor: BORDER },
  imageCaption: { fontSize: 7, color: MUTED, marginTop: 2 },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 28,
    right: 28,
    fontSize: 7,
    color: MUTED,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 4,
  },
});

function LabelValueRow({
  label1,
  value1,
  label2,
  value2,
  last,
}: {
  label1: string;
  value1: string;
  label2: string;
  value2: string;
  last?: boolean;
}) {
  return (
    <View style={last ? styles.rowLast : styles.row}>
      <Text style={styles.cellLabel}>{label1}</Text>
      <Text style={styles.cellValue}>{value1 || "-"}</Text>
      <Text style={styles.cellLabel}>{label2}</Text>
      <Text style={styles.cellValueLast}>{value2 || "-"}</Text>
    </View>
  );
}

function fmtTime(from: string | null, to: string | null): string {
  if (!from && !to) return "-";
  return `${from ?? "?"} - ${to ?? "?"}`;
}

function fmtUnit(value: string | null, unit: string): string {
  if (value === null || value === "") return "-";
  return `${value}${unit}`;
}

export type ImageWithBytes = ReportImage & { data: Buffer };

export function InspectionReportDocument({
  report,
  results,
  images,
}: {
  report: Report;
  results: InspectionResult[];
  images: ImageWithBytes[];
}) {
  const resultByCategory = new Map(results.map((r) => [r.category, r]));
  const imagesByCategory = new Map<string, ImageWithBytes[]>();
  for (const img of images) {
    const list = imagesByCategory.get(img.category) ?? [];
    list.push(img);
    imagesByCategory.set(img.category, list);
  }

  return (
    <Document title={`Inspeksjonsrapport ${report.reportNumber}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.brand}>SEA ROV</Text>
            <Text style={styles.brandSub}>searov as - ROV-inspeksjon</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerRightText}>Rapport nr. {report.reportNumber}</Text>
            <Text style={styles.headerRightText}>{report.date}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Grunnleggende informasjon</Text>
        <View style={styles.table}>
          <LabelValueRow label1="Dato" value1={report.date} label2="Fartøy" value2={report.vessel ?? ""} />
          <LabelValueRow
            label1="Tid fra-til"
            value1={fmtTime(report.timeFrom, report.timeTo)}
            label2="Prosjektleder"
            value2={report.projectLeader ?? ""}
          />
          <LabelValueRow
            label1="Lokalitet"
            value1={report.location ?? ""}
            label2="ROV Operatør"
            value2={report.rovOperator ?? ""}
          />
          <LabelValueRow
            label1="Rapport nr."
            value1={String(report.reportNumber)}
            label2="Grunn for inspeksjon"
            value2={report.reason ?? ""}
            last
          />
        </View>

        <Text style={styles.sectionTitle}>Merdinformasjon</Text>
        <View style={styles.table}>
          <LabelValueRow
            label1="Merd nummer"
            value1={report.merdNumber ?? ""}
            label2="Død fisk"
            value2={report.deadFishCount != null ? `${report.deadFishApprox ? "ca. " : ""}${report.deadFishCount} stk` : "-"}
          />
          <LabelValueRow
            label1="Merd type"
            value1={report.merdType ?? ""}
            label2="Strøm"
            value2={report.currentStrength ?? ""}
          />
          <LabelValueRow
            label1="Størrelse x"
            value1={fmtUnit(report.sizeX, "m")}
            label2="Sikt"
            value2={report.visibility ?? ""}
          />
          <LabelValueRow
            label1="Størrelse y"
            value1={fmtUnit(report.sizeY, "m")}
            label2="Villfisk"
            value2={[report.wildFish, report.wildFishNote].filter(Boolean).join(" - ") || "-"}
          />
          <LabelValueRow
            label1="Dybde"
            value1={fmtUnit(report.depth, "m")}
            label2="Groe"
            value2={report.growth ?? ""}
            last
          />
        </View>

        <Text style={styles.sectionTitle}>Inspeksjonsresultater</Text>
        <View style={styles.table}>
          <View style={styles.resultHeaderRow}>
            <Text style={[styles.resultHeaderCell, styles.colCategory]}>Kategori</Text>
            <Text style={[styles.resultHeaderCell, styles.colStatus]}>Status</Text>
            <Text style={[styles.resultHeaderCell, styles.colCondition]}>Tilstand</Text>
            <Text style={[styles.resultHeaderCell, styles.colComment]}>Kommentar</Text>
          </View>
          {INSPECTION_CATEGORIES.map((category: InspectionCategory, i) => {
            const r = resultByCategory.get(category);
            const isLast = i === INSPECTION_CATEGORIES.length - 1;
            return (
              <View style={isLast ? styles.rowLast : styles.resultRow} key={category}>
                <Text style={[styles.resultCell, styles.colCategory]}>{CATEGORY_LABELS[category]}</Text>
                <Text style={[styles.resultCell, styles.colStatus]}>{r?.checked ? "Sjekket" : "Ikke sjekket"}</Text>
                <Text style={[styles.resultCell, styles.colCondition]}>{r?.condition ?? "-"}</Text>
                <Text style={[styles.resultCellLast, styles.colComment]}>{r?.comment ?? "-"}</Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Kommentarer/Avvik</Text>
        <View style={styles.commentsBlock}>
          <Text>{report.comments || "-"}</Text>
        </View>

        {images.length > 0 && (
          <>
            <Text style={styles.sectionTitle} break>
              Bilder
            </Text>
            {[...imagesByCategory.entries()].map(([category, catImages]) => (
              <View key={category} wrap={false}>
                <Text style={styles.imageCategoryLabel}>{CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}</Text>
                <View style={styles.imageGrid}>
                  {catImages.map((img) => (
                    <View style={styles.imageWrap} key={img.id}>
                      <Image style={styles.image} src={{ data: img.data, format: "jpg" }} />
                      <Text style={styles.imageCaption}>{img.originalFilename ?? ""}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `SEA ROV - Rapport nr. ${report.reportNumber} - Side ${pageNumber} av ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
