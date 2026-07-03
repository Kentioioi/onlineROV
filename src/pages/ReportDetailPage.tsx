import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, FileDown, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { deleteReport, downloadPdf, generatePdf, getReport, imageUrl } from "@/lib/api";
import { CATEGORY_LABELS, IMAGE_CATEGORIES, INSPECTION_CATEGORIES } from "../../shared/constants";
import { formatDateNo } from "../../shared/format";

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value?.trim() || "-"}</span>
    </div>
  );
}

export function ReportDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState<{ id: string; name: string } | null>(null);

  const query = useQuery({ queryKey: ["report", id], queryFn: () => getReport(id!), enabled: !!id });

  const pdfMutation = useMutation({
    mutationFn: () => generatePdf(id!),
    onMutate: () => setGenerating(true),
    onSuccess: () => {
      toast.success("PDF generert");
      queryClient.invalidateQueries({ queryKey: ["report", id] });
      // The list's "Ingen PDF"/download-button column reads pdfBlobKey from
      // its own cache - without this, going back to the list within its
      // staleTime still showed "Ingen PDF" for a report that just got one.
      queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: () => toast.error("Kunne ikke generere PDF"),
    onSettled: () => setGenerating(false),
  });

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadPdf(id!);
    } catch {
      toast.error("Kunne ikke laste ned PDF");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteReport(id!);
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Rapport slettet");
      navigate("/reports");
    } catch {
      toast.error("Kunne ikke slette rapporten");
      setDeleting(false);
    }
  }

  // Distinct error state - a failed fetch (dropped signal, deleted report)
  // previously fell into the `!query.data` arm below and spun "Laster
  // rapport..." forever with no explanation and no way to retry.
  if (query.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <div>
          <p className="font-medium">Kunne ikke laste rapporten</p>
          <p className="text-sm text-muted-foreground">Sjekk nettforbindelsen og prøv igjen.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void query.refetch()}>
            Prøv igjen
          </Button>
          <Button variant="ghost" onClick={() => navigate("/reports")}>
            Til rapporter
          </Button>
        </div>
      </div>
    );
  }

  if (query.isLoading || !query.data) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Laster rapport...
      </div>
    );
  }

  const report = query.data;
  const resultByCategory = new Map(report.inspectionResults.map((r) => [r.category, r]));
  const pdfIsStale =
    report.pdfBlobKey && report.pdfGeneratedAt && new Date(report.updatedAt) > new Date(report.pdfGeneratedAt);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Rapport nr. {report.reportNumber}</h1>
          <p className="text-sm text-muted-foreground">{formatDateNo(report.date)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/reports/${report.id}/edit`}>
            <Button variant="outline">
              <Pencil className="h-4 w-4" /> Rediger
            </Button>
          </Link>
          {report.pdfBlobKey ? (
            <Button onClick={handleDownload} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Last ned PDF
            </Button>
          ) : null}
          <Button variant={report.pdfBlobKey ? "outline" : "default"} onClick={() => pdfMutation.mutate()} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {report.pdfBlobKey ? "Regenerer PDF" : "Generer PDF"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive" disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Slett
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Slette rapport nr. {report.reportNumber}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Rapporten, alle bilder og PDF-en slettes permanent. Dette kan ikke angres.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
                  Slett rapporten
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {pdfIsStale && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Rapporten er endret siden PDF-en ble generert - regenerer for å få siste versjon.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Grunnleggende informasjon</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Fartøy" value={report.vessel} />
            <DetailRow label="Tid" value={report.timeFrom || report.timeTo ? `${report.timeFrom ?? "?"} - ${report.timeTo ?? "?"}` : null} />
            <DetailRow label="Prosjektleder" value={report.projectLeader} />
            <DetailRow label="Lokalitet" value={report.location} />
            <DetailRow label="ROV Operatør" value={report.rovOperator} />
            <DetailRow label="Grunn for inspeksjon" value={report.reason} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Merdinformasjon</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Merd nummer" value={report.merdNumber} />
            <DetailRow label="Merd type" value={report.merdType} />
            <DetailRow label="Størrelse" value={report.sizeX || report.sizeY ? `${report.sizeX ?? "?"}m x ${report.sizeY ?? "?"}m` : null} />
            <DetailRow label="Dybde" value={report.depth ? `${report.depth}m` : null} />
            <DetailRow
              label="Død fisk"
              value={report.deadFishCount != null ? `${report.deadFishApprox ? "ca. " : ""}${report.deadFishCount} stk` : null}
            />
            <DetailRow label="Strøm" value={report.currentStrength} />
            <DetailRow label="Sikt" value={report.visibility} />
            <DetailRow label="Villfisk" value={[report.wildFish, report.wildFishNote].filter(Boolean).join(" - ")} />
            <DetailRow label="Groe" value={report.growth} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inspeksjonsresultater</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {INSPECTION_CATEGORIES.map((cat) => {
            const r = resultByCategory.get(cat);
            return (
              <div key={cat} className="rounded-md border p-2 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">{CATEGORY_LABELS[cat]}</span>
                  <Badge variant={r?.checked ? "default" : "secondary"}>{r?.checked ? "Sjekket" : "Ikke sjekket"}</Badge>
                </div>
                <p className="text-muted-foreground">
                  {r?.condition} - {r?.comment}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kommentarer/Avvik</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{report.comments || "-"}</p>
        </CardContent>
      </Card>

      {report.images.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bilder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {IMAGE_CATEGORIES.map((cat) => {
              const catImages = report.images.filter((i) => i.category === cat);
              if (!catImages.length) return null;
              return (
                <div key={cat}>
                  <p className="mb-2 text-sm font-medium">{CATEGORY_LABELS[cat]}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {catImages.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => setLightbox({ id: img.id, name: img.originalFilename ?? "" })}
                        className="overflow-hidden rounded-md border"
                        aria-label={`Vis bilde ${img.originalFilename ?? ""}`}
                      >
                        <img
                          src={imageUrl(img.id)}
                          alt={img.originalFilename ?? ""}
                          className="aspect-square h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{lightbox?.name || "Bilde"}</DialogTitle>
          {lightbox && (
            <img src={imageUrl(lightbox.id)} alt={lightbox.name} className="max-h-[80vh] w-full rounded object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
