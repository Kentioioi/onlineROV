import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { AlertTriangle, Loader2, PlusCircle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CreatableCombobox } from "@/components/form/CreatableCombobox";
import { SelectField } from "@/components/form/SelectField";
import { NumericUnitField } from "@/components/form/NumericUnitField";
import { MerdNumberField } from "@/components/form/MerdNumberField";
import { InspectionResultsSection, type FormInspectionResult } from "@/components/form/InspectionResultsSection";
import { ImageUploadSection } from "@/components/form/ImageUploadSection";
import { MaskebruddDialog } from "@/components/form/MaskebruddDialog";
import { ApiError, createReport, getReport, updateReport, type ReportDetail } from "@/lib/api";
import { queueReportForSync } from "@/offline/syncManager";
import {
  CHECKED_COMMENT_DEFAULTS,
  CHECKED_CONDITION_DEFAULT,
  DEFAULT_COMMENTS_TEXT,
  INSPECTION_CATEGORIES,
  type InspectionCategory,
} from "../../shared/constants";
import { reportInputSchema, softValidationWarnings, type ReportInput } from "../../shared/schema";
import type { ReportImage } from "../../db/schema";

type FormValues = {
  id: string;
  date: string;
  vessel: string;
  timeFrom: string;
  timeTo: string;
  projectLeader: string;
  location: string;
  rovOperator: string;
  reason: string;
  merdNumber: string;
  merdType: string;
  sizeX: string;
  sizeY: string;
  depth: string;
  deadFishCount: string;
  deadFishApprox: boolean;
  currentStrength: string;
  visibility: string;
  wildFish: string;
  wildFishNote: string;
  growth: string;
  comments: string;
  inspectionResults: FormInspectionResult[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDefaults(): FormValues {
  return {
    id: crypto.randomUUID(),
    date: todayIso(),
    vessel: "",
    timeFrom: "",
    timeTo: "",
    projectLeader: "",
    location: "",
    rovOperator: "",
    reason: "",
    merdNumber: "",
    merdType: "",
    sizeX: "",
    sizeY: "",
    depth: "",
    deadFishCount: "",
    deadFishApprox: false,
    currentStrength: "",
    visibility: "",
    wildFish: "",
    wildFishNote: "",
    growth: "",
    comments: DEFAULT_COMMENTS_TEXT,
    inspectionResults: INSPECTION_CATEGORIES.map((category) => ({
      category,
      checked: true,
      condition: CHECKED_CONDITION_DEFAULT,
      comment: CHECKED_COMMENT_DEFAULTS[category],
    })),
  };
}

function fromReportDetail(detail: ReportDetail): FormValues {
  const byCategory = new Map(detail.inspectionResults.map((r) => [r.category, r]));
  return {
    id: detail.id,
    date: detail.date,
    vessel: detail.vessel ?? "",
    timeFrom: detail.timeFrom ?? "",
    timeTo: detail.timeTo ?? "",
    projectLeader: detail.projectLeader ?? "",
    location: detail.location ?? "",
    rovOperator: detail.rovOperator ?? "",
    reason: detail.reason ?? "",
    merdNumber: detail.merdNumber ?? "",
    merdType: detail.merdType ?? "",
    sizeX: detail.sizeX ?? "",
    sizeY: detail.sizeY ?? "",
    depth: detail.depth ?? "",
    deadFishCount: detail.deadFishCount != null ? String(detail.deadFishCount) : "",
    deadFishApprox: detail.deadFishApprox,
    currentStrength: detail.currentStrength ?? "",
    visibility: detail.visibility ?? "",
    wildFish: detail.wildFish ?? "",
    wildFishNote: detail.wildFishNote ?? "",
    growth: detail.growth ?? "",
    comments: detail.comments ?? "",
    inspectionResults: INSPECTION_CATEGORIES.map((category) => {
      const r = byCategory.get(category);
      return {
        category,
        checked: r?.checked ?? true,
        condition: r?.condition ?? CHECKED_CONDITION_DEFAULT,
        comment: r?.comment ?? CHECKED_COMMENT_DEFAULTS[category],
      };
    }),
  };
}

function toReportInput(v: FormValues): ReportInput {
  return {
    id: v.id,
    date: v.date,
    vessel: v.vessel || null,
    timeFrom: v.timeFrom || null,
    timeTo: v.timeTo || null,
    projectLeader: v.projectLeader || null,
    location: v.location || null,
    rovOperator: v.rovOperator || null,
    reason: v.reason || null,
    merdNumber: v.merdNumber || null,
    merdType: v.merdType || null,
    sizeX: v.sizeX ? Number(v.sizeX) : null,
    sizeY: v.sizeY ? Number(v.sizeY) : null,
    depth: v.depth ? Number(v.depth) : null,
    deadFishCount: v.deadFishCount ? Number(v.deadFishCount) : null,
    deadFishApprox: v.deadFishApprox,
    currentStrength: v.currentStrength || null,
    visibility: v.visibility || null,
    wildFish: v.wildFish || null,
    wildFishNote: v.wildFishNote || null,
    growth: v.growth || null,
    comments: v.comments || null,
    inspectionResults: v.inspectionResults,
  };
}

export function ReportFormPage({ mode }: { mode: "create" | "edit" }) {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const reportQuery = useQuery({
    queryKey: ["report", routeId],
    queryFn: () => getReport(routeId!),
    enabled: mode === "edit" && !!routeId,
  });

  const { control, getValues, watch, setValue, reset } = useForm<FormValues>({
    defaultValues: emptyDefaults(),
  });

  const [images, setImages] = useState<ReportImage[]>([]);
  const [savedId, setSavedId] = useState<string | null>(mode === "edit" ? routeId ?? null : null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [maskebruddOpen, setMaskebruddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [offlineQueued, setOfflineQueued] = useState(false);

  useEffect(() => {
    if (mode === "edit" && reportQuery.data) {
      reset(fromReportDetail(reportQuery.data));
      setImages(reportQuery.data.images);
      setSavedId(reportQuery.data.id);
    }
  }, [mode, reportQuery.data, reset]);

  const persist = useCallback(async (): Promise<{ id: string; reportNumber: number | null; offline: boolean }> => {
    const values = getValues();
    const input = reportInputSchema.parse(toReportInput(values));

    if (savedId) {
      // Editing an already-synced report requires connectivity (offline v1
      // scope: create-only offline, edit is view-only when offline) - let a
      // network failure here propagate as a real error, not a silent queue.
      const result = await updateReport(savedId, input);
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      return { id: result.id, reportNumber: result.reportNumber, offline: false };
    }

    try {
      const result = await createReport(input);
      setSavedId(result.id);
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      return { id: result.id, reportNumber: result.reportNumber, offline: false };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure, not a server rejection - queue for background
      // sync instead of losing the report. reports-create is idempotent on
      // `id`, so this is safe to retry later without creating a duplicate.
      await queueReportForSync(input.id, input);
      setSavedId(input.id);
      setOfflineQueued(true);
      return { id: input.id, reportNumber: null, offline: true };
    }
  }, [getValues, savedId, queryClient]);

  const ensureSaved = useCallback(async () => {
    if (savedId) return;
    await persist();
  }, [savedId, persist]);

  async function onSave() {
    const values = getValues();
    const nextWarnings = softValidationWarnings(toReportInput(values));
    setWarnings(nextWarnings);
    setSaving(true);
    try {
      const result = await persist();
      if (result.offline) {
        toast.success("Rapport lagret lokalt - synkroniseres automatisk når du får nettforbindelse.");
        navigate("/");
      } else {
        toast.success(mode === "create" ? `Rapport lagret - nr. ${result.reportNumber}` : "Rapport oppdatert");
        navigate(`/reports/${result.id}`);
      }
    } catch {
      toast.error("Kunne ikke lagre rapporten. Prøv igjen.");
    } finally {
      setSaving(false);
    }
  }

  const inspectionResults = watch("inspectionResults");
  const comments = watch("comments");
  const formId = watch("id");

  const imageCounts = images.reduce(
    (acc, img) => {
      acc[img.category as InspectionCategory] = (acc[img.category as InspectionCategory] ?? 0) + 1;
      return acc;
    },
    {} as Record<InspectionCategory, number>,
  );

  function updateResult(category: InspectionCategory, patch: Partial<FormInspectionResult>) {
    const next = inspectionResults.map((r) => (r.category === category ? { ...r, ...patch } : r));
    setValue("inspectionResults", next);
  }

  if (mode === "edit" && reportQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Laster rapport...
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{mode === "create" ? "Ny rapport" : "Rediger rapport"}</h1>
        <Badge variant="outline">
          {offlineQueued
            ? "Lagret lokalt - tildeles ved synkronisering"
            : reportQuery.data?.reportNumber
              ? `Rapport nr. ${reportQuery.data.reportNumber}`
              : "Tildeles ved lagring"}
        </Badge>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <Accordion type="multiple" defaultValue={["basic", "cage", "results", "comments", "images"]} className="space-y-3">
        <AccordionItem value="basic" className="rounded-lg border px-4">
          <AccordionTrigger>Grunnleggende informasjon</AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dato">
                <Controller
                  control={control}
                  name="date"
                  render={({ field }) => <Input type="date" {...field} />}
                />
              </Field>
              <Field label="Fartøy">
                <Controller
                  control={control}
                  name="vessel"
                  render={({ field }) => <CreatableCombobox fieldKey="vessel" value={field.value} onChange={field.onChange} />}
                />
              </Field>
              <Field label="Tid fra-til">
                <div className="flex items-center gap-2">
                  <Controller control={control} name="timeFrom" render={({ field }) => <Input type="time" {...field} />} />
                  <span className="text-muted-foreground">-</span>
                  <Controller control={control} name="timeTo" render={({ field }) => <Input type="time" {...field} />} />
                </div>
              </Field>
              <Field label="Prosjektleder">
                <Controller
                  control={control}
                  name="projectLeader"
                  render={({ field }) => (
                    <CreatableCombobox fieldKey="project_leader" value={field.value} onChange={field.onChange} />
                  )}
                />
              </Field>
              <Field label="Lokalitet">
                <Controller
                  control={control}
                  name="location"
                  render={({ field }) => <CreatableCombobox fieldKey="location" value={field.value} onChange={field.onChange} />}
                />
              </Field>
              <Field label="ROV Operatør">
                <Controller
                  control={control}
                  name="rovOperator"
                  render={({ field }) => (
                    <CreatableCombobox fieldKey="rov_operator" value={field.value} onChange={field.onChange} />
                  )}
                />
              </Field>
              <Field label="Grunn for inspeksjon" className="sm:col-span-2">
                <Controller
                  control={control}
                  name="reason"
                  render={({ field }) => <CreatableCombobox fieldKey="reason" value={field.value} onChange={field.onChange} />}
                />
              </Field>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="cage" className="rounded-lg border px-4">
          <AccordionTrigger>Merdinformasjon</AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Merd nummer">
                <Controller
                  control={control}
                  name="merdNumber"
                  render={({ field }) => <MerdNumberField value={field.value} onChange={field.onChange} />}
                />
              </Field>
              <Field label="Merd type">
                <Controller
                  control={control}
                  name="merdType"
                  render={({ field }) => <CreatableCombobox fieldKey="merd_type" value={field.value} onChange={field.onChange} />}
                />
              </Field>
              <Field label="Størrelse x">
                <Controller
                  control={control}
                  name="sizeX"
                  render={({ field }) => <NumericUnitField value={field.value} onChange={field.onChange} unit="m" />}
                />
              </Field>
              <Field label="Størrelse y">
                <Controller
                  control={control}
                  name="sizeY"
                  render={({ field }) => <NumericUnitField value={field.value} onChange={field.onChange} unit="m" />}
                />
              </Field>
              <Field label="Dybde">
                <Controller
                  control={control}
                  name="depth"
                  render={({ field }) => <NumericUnitField value={field.value} onChange={field.onChange} unit="m" />}
                />
              </Field>
              <Field label="Død fisk">
                <div className="flex items-center gap-2">
                  <Controller
                    control={control}
                    name="deadFishCount"
                    render={({ field }) => <NumericUnitField value={field.value} onChange={field.onChange} unit="stk" />}
                  />
                  <Controller
                    control={control}
                    name="deadFishApprox"
                    render={({ field }) => (
                      <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                        <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                        ca.
                      </label>
                    )}
                  />
                </div>
              </Field>
              <Field label="Strøm">
                <Controller
                  control={control}
                  name="currentStrength"
                  render={({ field }) => <SelectField fieldKey="current_strength" value={field.value} onChange={field.onChange} />}
                />
              </Field>
              <Field label="Sikt">
                <Controller
                  control={control}
                  name="visibility"
                  render={({ field }) => <SelectField fieldKey="visibility" value={field.value} onChange={field.onChange} />}
                />
              </Field>
              <Field label="Villfisk">
                <Controller
                  control={control}
                  name="wildFish"
                  render={({ field }) => <SelectField fieldKey="wild_fish" value={field.value} onChange={field.onChange} />}
                />
              </Field>
              <Field label="Groe">
                <Controller
                  control={control}
                  name="growth"
                  render={({ field }) => <SelectField fieldKey="growth" value={field.value} onChange={field.onChange} />}
                />
              </Field>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="results" className="rounded-lg border px-4">
          <AccordionTrigger>Inspeksjonsresultater</AccordionTrigger>
          <AccordionContent>
            <InspectionResultsSection results={inspectionResults} onChange={updateResult} imageCounts={imageCounts} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="comments" className="rounded-lg border px-4">
          <AccordionTrigger>Kommentarer/Avvik</AccordionTrigger>
          <AccordionContent>
            <Controller
              control={control}
              name="comments"
              render={({ field }) => <Textarea rows={5} {...field} />}
            />
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setMaskebruddOpen(true)}>
              <PlusCircle className="h-4 w-4" /> Legg til maskebrudd
            </Button>
            <MaskebruddDialog
              open={maskebruddOpen}
              onOpenChange={setMaskebruddOpen}
              onInsert={(text) => {
                const hasAvvikHeading = /(^|\n)avvik:?\s*$/im.test(comments) || /(^|\n)avvik:?\n/im.test(comments);
                const prefix = comments.trim() ? comments.trimEnd() + "\n" : "";
                const heading = hasAvvikHeading || comments.toLowerCase().includes("avvik") ? "" : "Avvik:\n";
                setValue("comments", `${prefix}${heading}${text}`);
              }}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="images" className="rounded-lg border px-4">
          <AccordionTrigger>Bilder</AccordionTrigger>
          <AccordionContent>
            <ImageUploadSection
              reportId={formId}
              isSaved={!!savedId}
              ensureSaved={ensureSaved}
              images={images}
              onImagesChange={setImages}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl justify-end px-4">
          <Button size="lg" onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Lagre rapport
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
