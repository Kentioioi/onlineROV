import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
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
import { AutoGrowTextarea } from "@/components/form/AutoGrowTextarea";
import { CreatableCombobox } from "@/components/form/CreatableCombobox";
import { SelectField } from "@/components/form/SelectField";
import { NumericUnitField } from "@/components/form/NumericUnitField";
import { MerdNumberField } from "@/components/form/MerdNumberField";
import { InspectionResultsSection, type FormInspectionResult } from "@/components/form/InspectionResultsSection";
import { ImageUploadSection } from "@/components/form/ImageUploadSection";
import { MaskebruddDialog } from "@/components/form/MaskebruddDialog";
import { ApiError, createReport, downloadPdf, generatePdf, getReport, updateReport, type ReportDetail } from "@/lib/api";
import { deleteOutboxReport } from "@/offline/db";
import { queueReportForSync, syncNow } from "@/offline/syncManager";
import { useInspectionDefaults } from "@/hooks/useAppSettings";
import {
  CHECKED_COMMENT_DEFAULTS,
  CHECKED_CONDITION_DEFAULT,
  DEFAULT_COMMENTS_TEXT,
  INSPECTION_CATEGORIES,
  builtinInspectionDefault,
  type InspectionCategory,
  type InspectionDefaultField,
  type InspectionDefaultState,
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
  // Local date, NOT toISOString() (UTC) - a report started 00:30 Norway
  // time must not default to yesterday's date.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Norwegian labels for zod-rejected fields so a validation failure names the
// actual problem instead of a generic "try again".
const FIELD_LABELS: Record<string, string> = {
  date: "Dato",
  timeFrom: "Tid fra",
  timeTo: "Tid til",
  sizeX: "Størrelse x",
  sizeY: "Størrelse y",
  depth: "Dybde",
  deadFishCount: "Død fisk",
  inspectionResults: "Inspeksjonsresultater",
};

class FormValidationError extends Error {
  fields: string[];
  constructor(fields: string[]) {
    super("Validation failed");
    this.fields = fields;
  }
}

// getDefault defaults to the hardcoded builtins (used for useForm's initial
// mount, before the app_settings query can possibly have resolved) - the
// create-mode effect below re-calls this with the real resolver once ready.
function emptyDefaults(
  getDefault: (state: InspectionDefaultState, fieldName: InspectionDefaultField, category: InspectionCategory) => string = builtinInspectionDefault,
): FormValues {
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
      condition: getDefault("checked", "condition", category),
      comment: getDefault("checked", "comment", category),
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
    deadFishCount: v.deadFishCount ? Math.round(Number(v.deadFishCount)) : null,
    deadFishApprox: v.deadFishApprox,
    currentStrength: v.currentStrength || null,
    visibility: v.visibility || null,
    wildFish: v.wildFish || null,
    // The note field is hidden when Villfisk is empty/"Ikke observert", but
    // hiding doesn't clear it - submitting the leftover text produced
    // contradictory data like "Ikke observert - sei, ca 20 stk" in the PDF.
    // Mirror the visibility condition (ReportFormPage line ~597).
    wildFishNote: v.wildFish && v.wildFish !== "Ikke observert" ? v.wildFishNote || null : null,
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

  const { getDefault, isReady: defaultsReady } = useInspectionDefaults();

  const { control, getValues, watch, setValue, reset, formState } = useForm<FormValues>({
    defaultValues: emptyDefaults(),
  });
  // react-hook-form's formState is a subscription Proxy: a key only starts
  // being tracked once it's read DURING RENDER. Reading formState.isDirty
  // exclusively inside the navigation-guard callbacks below meant the
  // subscription never activated and the guards always saw false - the
  // whole unsaved-changes protection was inert.
  const { isDirty } = formState;

  // Half-filled reports were silently lost on any navigation (audit
  // finding) - block in-app navigation and tab close while dirty OR while
  // photo uploads are still running (photos never touch form state, so
  // isDirty alone missed a mid-batch upload), except right after a
  // successful save.
  const skipNavGuard = useRef(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(0);
  const blocker = useBlocker(() => (isDirty || uploadingPhotos > 0) && !skipNavGuard.current);
  useEffect(() => {
    if (blocker.state === "blocked") {
      const message =
        uploadingPhotos > 0
          ? "Bilder lastes fortsatt opp. Forlate siden likevel?"
          : "Rapporten har ulagrede endringer. Forlate siden uten å lagre?";
      if (window.confirm(message)) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker, uploadingPhotos]);
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if ((isDirty || uploadingPhotos > 0) && !skipNavGuard.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, uploadingPhotos]);

  const [images, setImages] = useState<ReportImage[]>([]);
  const [savedId, setSavedId] = useState<string | null>(mode === "edit" ? routeId ?? null : null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [maskebruddOpen, setMaskebruddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [offlineQueued, setOfflineQueued] = useState(false);

  // Guard the reset so a background refetch (window refocus etc.) can't
  // clobber in-progress edits - only reset when a different report loads.
  const lastResetId = useRef<string | null>(null);
  useEffect(() => {
    if (mode === "edit" && reportQuery.data && reportQuery.data.id !== lastResetId.current) {
      lastResetId.current = reportQuery.data.id;
      reset(fromReportDetail(reportQuery.data));
      setImages(reportQuery.data.images);
      setSavedId(reportQuery.data.id);
    }
  }, [mode, reportQuery.data, reset]);

  // useForm's defaultValues is only read on first mount, and hooks can't be
  // conditional - so instead of gating the render on defaultsReady, mount
  // with the static builtin defaults and swap in the resolved (possibly
  // user-customized) ones via reset() the moment they're ready. Runs at
  // most once: guarded so it can't clobber an edit in progress, and
  // keepDefaultValues stays false so isDirty is unaffected afterwards.
  // Settings load fast, an offline hit resolves from the IndexedDB cache,
  // and a failed fetch still counts as "ready" (falls back to builtins) -
  // so this is at most a brief flash, never a stall.
  const appliedDynamicDefaults = useRef(false);
  useEffect(() => {
    if (
      mode === "create" &&
      defaultsReady &&
      !appliedDynamicDefaults.current &&
      !formState.isDirty &&
      !savedId
    ) {
      appliedDynamicDefaults.current = true;
      reset(emptyDefaults(getDefault), { keepDefaultValues: false });
    }
  }, [mode, defaultsReady, formState.isDirty, savedId, getDefault, reset]);

  const persist = useCallback(async (): Promise<{ id: string; reportNumber: number | null; offline: boolean }> => {
    const values = getValues();
    const parsed = reportInputSchema.safeParse(toReportInput(values));
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => FIELD_LABELS[String(i.path[0])] ?? String(i.path[0])))];
      throw new FormValidationError(fields);
    }
    const input = parsed.data;

    if (savedId && !offlineQueued) {
      // Editing an already-synced report requires connectivity (offline v1
      // scope: create-only offline, edit is view-only when offline) - let a
      // network failure here propagate as a real error, not a silent queue.
      const result = await updateReport(savedId, input);
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["report", savedId] });
      return { id: result.id, reportNumber: result.reportNumber, offline: false };
    }

    // First save, OR a re-save of a report that only exists in the offline
    // outbox so far. Both go through createReport: it's idempotent on the
    // client-generated id, and an offline-queued report has NO server row
    // yet - routing a re-save to updateReport would 404 (audit finding).
    try {
      let result = await createReport(input);
      if (!result.isNew) {
        // The row already existed (the background sync won the race with
        // older queued data, or this is a retry of a completed create) -
        // the POST returned the EXISTING row without applying this
        // payload. Follow up with a PUT so the newest edits actually land
        // instead of being silently discarded under a success toast.
        result = { ...(await updateReport(input.id, input)), isNew: false };
      }
      if (offlineQueued) {
        // The server now holds this exact payload - drop the outbox entry
        // entirely so the background sync can't re-POST stale data.
        await deleteOutboxReport(input.id);
        setOfflineQueued(false);
      }
      setSavedId(result.id);
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["report", result.id] });
      return { id: result.id, reportNumber: result.reportNumber, offline: false };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network failure, not a server rejection - queue for background
      // sync instead of losing the report. reports-create is idempotent on
      // `id`, and queueReportForSync overwrites by id, so re-saving an
      // already-queued draft just refreshes the queued data.
      await queueReportForSync(input.id, input);
      setSavedId(input.id);
      setOfflineQueued(true);
      return { id: input.id, reportNumber: null, offline: true };
    }
  }, [getValues, savedId, offlineQueued, queryClient]);

  const ensureSaved = useCallback(async () => {
    if (savedId) return;
    await persist();
  }, [savedId, persist]);

  function saveErrorToast(err: unknown) {
    if (err instanceof FormValidationError) {
      toast.error(`Ugyldige verdier i: ${err.fields.join(", ")}`);
    } else if (err instanceof ApiError) {
      toast.error(`Kunne ikke lagre: ${err.message}`);
    } else {
      toast.error("Kunne ikke lagre rapporten. Prøv igjen.");
    }
  }

  async function onSave() {
    const values = getValues();
    const nextWarnings = softValidationWarnings(toReportInput(values));
    setWarnings(nextWarnings);
    setSaving(true);
    try {
      const result = await persist();
      skipNavGuard.current = true;
      if (result.offline) {
        toast.success("Rapport lagret lokalt - synkroniseres automatisk når du får nettforbindelse.");
        navigate("/");
      } else {
        toast.success(mode === "create" ? `Rapport lagret - nr. ${result.reportNumber}` : "Rapport oppdatert");
        navigate(`/reports/${result.id}`);
      }
    } catch (err) {
      saveErrorToast(err);
    } finally {
      setSaving(false);
    }
  }

  // Separate from "Lagre rapport" - saves first if needed, then generates
  // and immediately downloads the PDF, so filling out a report on-site ends
  // in an actual downloaded file in one tap rather than a second trip to
  // the detail page. PDF generation is server-side and needs connectivity,
  // so an offline-queued report can't produce one yet.
  async function onGeneratePdf() {
    const values = getValues();
    setWarnings(softValidationWarnings(toReportInput(values)));
    setGeneratingPdf(true);
    // Each stage gets its own error message - "Kunne ikke generere PDF" for
    // a failed SAVE sent users retrying the PDF instead of fixing the save,
    // and for a failed DOWNLOAD it hid that the PDF actually exists.
    let stage: "save" | "generate" | "download" = "save";
    try {
      const result = await persist();
      if (result.offline) {
        toast.error("Rapporten er lagret lokalt (uten nett) - PDF kan genereres når du er tilkoblet igjen.");
        return;
      }
      // Drain any photos still queued from an offline session first - the
      // report row just synced, but its outbox photos wait for the next
      // 45s tick, and a PDF generated in that window would silently miss
      // them.
      await syncNow();
      stage = "generate";
      await generatePdf(result.id);
      stage = "download";
      await downloadPdf(result.id);
      toast.success("PDF generert og lastet ned");
      skipNavGuard.current = true;
      navigate(`/reports/${result.id}`);
    } catch (err) {
      if (stage === "save") {
        saveErrorToast(err);
      } else if (stage === "download") {
        toast.error("PDF-en ble generert, men nedlastingen feilet - last den ned fra rapportsiden.");
      } else {
        toast.error("Kunne ikke generere PDF. Prøv igjen.");
      }
    } finally {
      setGeneratingPdf(false);
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
    setValue("inspectionResults", next, { shouldDirty: true });
  }

  if (mode === "edit" && reportQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Laster rapport...
      </div>
    );
  }

  // Never render the editable form without the report's data. Doing so
  // showed a BLANK form with savedId pointing at the real report - one
  // "Lagre rapport" tap would overwrite the entire report with empty
  // defaults. Offline relaunch on an edit URL lands here too (edits require
  // connectivity by design).
  if (mode === "edit" && !reportQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <div>
          <p className="font-medium">Kunne ikke laste rapporten</p>
          <p className="text-sm text-muted-foreground">
            Redigering krever nettforbindelse. Sjekk tilkoblingen og prøv igjen.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void reportQuery.refetch()}>
            Prøv igjen
          </Button>
          <Button variant="ghost" onClick={() => navigate("/reports")}>
            Til rapporter
          </Button>
        </div>
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
              {watch("wildFish") && watch("wildFish") !== "Ikke observert" && (
                <Field label="Villfisk - notat (art/antall)">
                  <Controller
                    control={control}
                    name="wildFishNote"
                    render={({ field }) => <Input placeholder="F.eks. sei, ca 20 stk" {...field} />}
                  />
                </Field>
              )}
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
            <InspectionResultsSection
              results={inspectionResults}
              onChange={updateResult}
              imageCounts={imageCounts}
              getDefault={getDefault}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="comments" className="rounded-lg border px-4">
          <AccordionTrigger>Kommentarer/Avvik</AccordionTrigger>
          <AccordionContent>
            <Controller
              control={control}
              name="comments"
              render={({ field }) => <AutoGrowTextarea rows={5} className="min-h-28" {...field} />}
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
                // shouldDirty: an inserted maskebrudd is a compliance-
                // relevant edit - without it the unsaved-changes guard
                // let the deviation text be discarded without a confirm.
                setValue("comments", `${prefix}${heading}${text}`, { shouldDirty: true });
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
              onPendingCountChange={setUploadingPhotos}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl gap-2 px-4 sm:justify-end">
          <Button size="lg" variant="outline" className="flex-1 sm:flex-none" onClick={onGeneratePdf} disabled={saving || generatingPdf}>
            {generatingPdf && <Loader2 className="h-4 w-4 animate-spin" />}
            Generer PDF
          </Button>
          <Button size="lg" className="flex-1 sm:flex-none" onClick={onSave} disabled={saving || generatingPdf}>
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
