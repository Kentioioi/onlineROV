import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import type { InspectionResult, Report, ReportImage } from "../../../db/schema.js";
import { CATEGORY_LABELS, INSPECTION_CATEGORIES, type InspectionCategory } from "../../../shared/constants.js";
import { LOGO_PNG_BASE64 } from "./logo.js";
import { formatDateNo } from "../../../shared/format.js";

// Colors extracted directly from the real master template's XML
// (rov_inspector/assets/Inspeksjonsdokument_MASTER.docx, word/document.xml
// <w:shd w:fill=.../> values) rather than invented - this is the actual SEA
// ROV letterhead palette, not a redesign.
// Norwegian labels were being hyphenated mid-word by react-pdf's default
// (English) hyphenation - "Grunn for in-speksjon" in a finished report.
// Whole-word wrapping only.
Font.registerHyphenationCallback((word) => [word]);

const HEADER_BLUE = "#8EAADB"; // section title bars, basic-info label cells
const VALUE_BLUE = "#DEEAF6"; // basic-info value cells
const BODY_BLUE = "#B4C6E7"; // cage-info body, inspection-results data rows
const RESULTS_HEADER_GRAY = "#D0CECE"; // inspection-results column header row
const COMMENTS_GRAY = "#BFBFBF"; // Kommentar/Avvik content box
const IMAGES_PEACH = "#F7CAAC"; // Bilder: header bar
const BORDER = "#7F7F7F";

// Page margins match the master template's exact XML values
// (word/document.xml <w:pgMar>): A4 with true 1in (72pt) margins on all
// sides. The master's tables sit at ~94% of the content width, but the
// user preferred full-width tables aligned with the title rule, footer and
// Bilder bar, so every block spans 100% here. Column ratios inside the
// tables still mirror the master's dxa proportions.
const styles = StyleSheet.create({
  page: { padding: 72, fontSize: 9, fontFamily: "Helvetica", color: "#1a1a1a" },
  logo: { width: 130, marginBottom: 8 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  titleRule: { borderBottomWidth: 1, borderBottomColor: "#1a1a1a", marginBottom: 10 },

  table: { width: "100%", borderWidth: 0.5, borderColor: BORDER, marginBottom: 10 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER },
  rowLast: { flexDirection: "row" },
  cellLabel: {
    width: "22%",
    padding: 4,
    backgroundColor: HEADER_BLUE,
    borderRightWidth: 0.5,
    borderRightColor: BORDER,
  },
  cellValue: { width: "28%", padding: 4, backgroundColor: VALUE_BLUE, borderRightWidth: 0.5, borderRightColor: BORDER },
  cellValueLast: { width: "28%", padding: 4, backgroundColor: VALUE_BLUE },

  sectionBar: {
    width: "100%",
    backgroundColor: HEADER_BLUE,
    padding: 4,
    fontFamily: "Helvetica-Bold",
    borderWidth: 0.5,
    borderColor: BORDER,
    borderBottomWidth: 0,
  },
  // Two-column variant for the Merd / Miljø bar: real 50% columns aligned
  // with the two body columns beneath it, instead of a literal run of
  // spaces pushing the second heading "roughly" into place.
  sectionBarSplit: {
    width: "100%",
    flexDirection: "row",
    backgroundColor: HEADER_BLUE,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderBottomWidth: 0,
  },
  sectionBarCell: { width: "50%", padding: 4, fontFamily: "Helvetica-Bold" },
  cageBody: { width: "100%", flexDirection: "row", borderWidth: 0.5, borderColor: BORDER, marginBottom: 10 },
  cageCol: { width: "50%", backgroundColor: BODY_BLUE, padding: 6 },
  cageColBorder: { borderRightWidth: 0.5, borderRightColor: BORDER },
  cageLine: { marginBottom: 2 },

  resultsHeaderRow: { width: "100%", flexDirection: "row", backgroundColor: RESULTS_HEADER_GRAY, borderWidth: 0.5, borderColor: BORDER },
  resultHeaderCell: { padding: 4, fontFamily: "Helvetica-Bold", fontSize: 8, borderRightWidth: 0.5, borderRightColor: BORDER },
  resultRow: { flexDirection: "row", backgroundColor: BODY_BLUE, borderLeftWidth: 0.5, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: BORDER },
  // The last data row previously had no bottom border, leaving the whole
  // inspection-results table visually open at the bottom edge.
  resultRowLast: { flexDirection: "row", backgroundColor: BODY_BLUE, borderLeftWidth: 0.5, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: BORDER },
  resultCell: { padding: 4, fontSize: 8, borderRightWidth: 0.5, borderRightColor: BORDER },
  // Column widths mirror the master template's dxa ratios exactly
  // (1665/1307/992/3119/1405 out of 8488 total).
  colInspection: { width: "19.6%" },
  colStatus: { width: "15.4%" },
  colCondition: { width: "11.7%" },
  colComment: { width: "36.8%" },
  colImage: { width: "16.5%" },

  resultsRows: { width: "100%", marginBottom: 10 },

  commentsBlock: { width: "100%", backgroundColor: COMMENTS_GRAY, borderWidth: 0.5, borderColor: BORDER, padding: 8, minHeight: 60, marginBottom: 10 },

  imagesBar: {
    backgroundColor: IMAGES_PEACH,
    padding: 4,
    fontFamily: "Helvetica-Bold",
    borderWidth: 0.5,
    borderColor: BORDER,
    marginBottom: 8,
  },
  imageCategoryLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, marginTop: 6, marginBottom: 4 },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  imageWrap: { width: "31%" },
  // Fixed height + cover crop: without it, one portrait photo among
  // landscape ones made rows ragged and could push a whole category off
  // the page. Uniform tiles match how the Word master presents photos.
  image: { width: "100%", height: 110, objectFit: "cover", borderWidth: 0.5, borderColor: BORDER },
  imageCaption: { fontSize: 7, color: "#555555", marginTop: 2 },

  footer: {
    position: "absolute",
    bottom: 30,
    left: 72,
    right: 72,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#333333",
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    paddingTop: 6,
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
      <Text style={styles.cellLabel}>{label1}:</Text>
      <Text style={styles.cellValue}>{value1 || ""}</Text>
      <Text style={styles.cellLabel}>{label2}:</Text>
      <Text style={styles.cellValueLast}>{value2 || ""}</Text>
    </View>
  );
}

function CageLine({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.cageLine}>
      {label}: {value || ""}
    </Text>
  );
}

function fmtTime(from: string | null, to: string | null): string {
  // Only render what was actually filled in - "08:00 - ?" read like an
  // error in the finished report when the end time was left blank.
  return [from, to].filter(Boolean).join(" - ");
}

function fmtUnit(value: string | null, unit: string): string {
  if (value === null || value === "") return "";
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
  function imageCountLabel(category: InspectionCategory): string {
    const count = imagesByCategory.get(category)?.length ?? 0;
    return count > 0 ? String(count) : "-";
  }

  return (
    <Document title={`Inspeksjonsrapport ${report.reportNumber}`}>
      <Page size="A4" style={styles.page}>
        <Image style={styles.logo} src={{ data: Buffer.from(LOGO_PNG_BASE64, "base64"), format: "png" }} />
        <Text style={styles.title}>
          Inspeksjonsrapport NOT
          {report.vessel ? `  -  MS ${report.vessel}` : ""}
        </Text>
        <View style={styles.titleRule} />

        <View style={styles.table}>
          <LabelValueRow label1="Dato" value1={formatDateNo(report.date)} label2="Fartøy" value2={report.vessel ?? ""} />
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
            label1="Rapport nummer"
            value1={String(report.reportNumber)}
            label2="Grunn for inspeksjon"
            value2={report.reason ?? ""}
            last
          />
        </View>

        <View style={styles.sectionBarSplit}>
          <Text style={styles.sectionBarCell}>Merd</Text>
          <Text style={styles.sectionBarCell}>Miljø & Økologiske faktorer</Text>
        </View>
        <View style={styles.cageBody}>
          <View style={[styles.cageCol, styles.cageColBorder]}>
            <CageLine label="Merd nummer" value={report.merdNumber ?? ""} />
            <CageLine label="Merd type" value={report.merdType ?? ""} />
            <CageLine label="Størrelse x" value={fmtUnit(report.sizeX, "m")} />
            <CageLine label="Størrelse y" value={fmtUnit(report.sizeY, "m")} />
            <CageLine label="Dybde" value={fmtUnit(report.depth, "m")} />
          </View>
          <View style={styles.cageCol}>
            <CageLine
              label="Død fisk"
              value={report.deadFishCount != null ? `${report.deadFishApprox ? "ca. " : ""}${report.deadFishCount} stk` : ""}
            />
            <CageLine label="Strøm" value={report.currentStrength ?? ""} />
            <CageLine label="Sikt" value={report.visibility ?? ""} />
            <CageLine label="Villfisk" value={[report.wildFish, report.wildFishNote].filter(Boolean).join(" - ")} />
            <CageLine label="Groe" value={report.growth ?? ""} />
          </View>
        </View>

        <Text style={styles.sectionBar}>Inspeksjonsresultater</Text>
        <View style={styles.resultsHeaderRow}>
          <Text style={[styles.resultHeaderCell, styles.colInspection]}>Inspeksjon av</Text>
          <Text style={[styles.resultHeaderCell, styles.colStatus]}>Status</Text>
          <Text style={[styles.resultHeaderCell, styles.colCondition]}>Tilstand</Text>
          <Text style={[styles.resultHeaderCell, styles.colComment]}>Kommentar</Text>
          <Text style={[styles.resultHeaderCell, styles.colImage, { borderRightWidth: 0 }]}>Bilde</Text>
        </View>
        <View style={styles.resultsRows}>
          {INSPECTION_CATEGORIES.map((category: InspectionCategory, i) => {
            const r = resultByCategory.get(category);
            const isLast = i === INSPECTION_CATEGORIES.length - 1;
            return (
              <View style={isLast ? styles.resultRowLast : styles.resultRow} key={category}>
                <Text style={[styles.resultCell, styles.colInspection]}>{CATEGORY_LABELS[category]}</Text>
                <Text style={[styles.resultCell, styles.colStatus]}>{r?.checked ? "Sjekket" : "Ikke sjekket"}</Text>
                <Text style={[styles.resultCell, styles.colCondition]}>{r?.condition ?? "-"}</Text>
                <Text style={[styles.resultCell, styles.colComment]}>{r?.comment ?? "-"}</Text>
                <Text style={[styles.resultCell, styles.colImage, { borderRightWidth: 0 }]}>{imageCountLabel(category)}</Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionBar}>Kommentar/Avvik</Text>
        <View style={styles.commentsBlock}>
          <Text>{report.comments || ""}</Text>
        </View>

        {images.length > 0 && (
          <>
            <Text style={styles.imagesBar} break>
              Bilder:
            </Text>
            {/* Each category renders as unbreakable chunks of up to 6 photos
                (two grid rows, always shorter than a page). The heading is
                bound to the first chunk, so it can never be stranded alone at
                the bottom of a page - and a category with many photos still
                flows onto following pages chunk by chunk instead of
                overflowing past the page edge. */}
            {[...imagesByCategory.entries()].flatMap(([category, catImages]) => {
              const chunks: ImageWithBytes[][] = [];
              for (let i = 0; i < catImages.length; i += 6) chunks.push(catImages.slice(i, i + 6));
              return chunks.map((chunk, ci) => (
                <View key={`${category}-${ci}`} wrap={false}>
                  {ci === 0 && (
                    <Text style={styles.imageCategoryLabel}>
                      {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
                    </Text>
                  )}
                  <View style={styles.imageGrid}>
                    {chunk.map((img) => (
                      <View style={styles.imageWrap} key={img.id}>
                        <Image style={styles.image} src={{ data: img.data, format: "jpg" }} />
                        <Text style={styles.imageCaption}>{img.originalFilename ?? ""}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ));
            })}
          </>
        )}

        <View style={styles.footer} fixed>
          <View>
            <Text>Searov AS</Text>
            <Text>Sørskårvegen 115</Text>
            <Text>4121 Tau</Text>
          </View>
          <View>
            <Text>Email: post@searov.no</Text>
            <Text>Tlf: +47 971 92 616</Text>
            <Text>Org: 920 286 917</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
