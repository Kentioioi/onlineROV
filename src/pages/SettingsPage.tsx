import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/form/SelectField";
import { useAddFieldOption, useDeleteFieldOption, useFieldOptionRows } from "@/hooks/useFieldOptions";
import { useInspectionDefaults, usePutAppSetting } from "@/hooks/useAppSettings";
import {
  CATEGORY_LABELS,
  FIELD_KEYS,
  FIELD_KEY_LABELS,
  INSPECTION_CATEGORIES,
  inspectionDefaultKey,
  type FieldKey,
  type InspectionCategory,
  type InspectionDefaultState,
} from "../../shared/constants";

function FieldOptionsCard({ fieldKey }: { fieldKey: FieldKey }) {
  const { items } = useFieldOptionRows(fieldKey);
  const addOption = useAddFieldOption();
  const deleteOption = useDeleteFieldOption();
  const [draft, setDraft] = useState("");

  function handleAdd() {
    const value = draft.trim();
    if (!value) return;
    addOption.mutate({ fieldKey, value });
    setDraft("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{FIELD_KEY_LABELS[fieldKey]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {items.length === 0 && <p className="text-xs text-muted-foreground">Ingen verdier ennå</p>}
          {items.map((o) => (
            <Badge key={o.id} variant="secondary" className="gap-1 pr-1">
              {o.value}
              <button
                type="button"
                onClick={() => deleteOption.mutate(o.id)}
                className="rounded-full p-0.5 hover:bg-black/10"
                aria-label={`Slett ${o.value}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={draft}
            placeholder="Ny verdi..."
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={handleAdd}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// One Sjekket/Ikke sjekket block for a single category - Tilstand via the
// same SelectField used on the report form (reads the condition/
// condition_unchecked field_options vocabulary), Kommentar via an
// uncontrolled Input that saves on blur/Enter. Each instance owns its own
// useInspectionDefaults/usePutAppSetting pair, which is fine - these are
// cheap, cached TanStack Query hooks, not separate network round-trips.
function DefaultBlock({ state, category }: { state: InspectionDefaultState; category: InspectionCategory }) {
  const { getDefault } = useInspectionDefaults();
  const putSetting = usePutAppSetting();
  const label = state === "checked" ? "Sjekket" : "Ikke sjekket";
  const conditionValue = getDefault(state, "condition", category);
  const commentValue = getDefault(state, "comment", category);

  function saveComment(value: string) {
    if (value === commentValue) return;
    putSetting.mutate(
      { key: inspectionDefaultKey(state, "comment", category), value },
      { onSuccess: () => toast.success("Standardverdi lagret") },
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="grid gap-1.5">
        <label className="text-xs text-muted-foreground">Tilstand</label>
        <SelectField
          fieldKey={state === "checked" ? "condition" : "condition_unchecked"}
          value={conditionValue}
          onChange={(value) =>
            putSetting.mutate(
              { key: inspectionDefaultKey(state, "condition", category), value },
              { onSuccess: () => toast.success("Standardverdi lagret") },
            )
          }
        />
      </div>
      <div className="grid gap-1.5">
        <label className="text-xs text-muted-foreground">Kommentar</label>
        <Input
          key={commentValue}
          defaultValue={commentValue}
          onBlur={(e) => saveComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveComment(e.currentTarget.value);
            }
          }}
        />
      </div>
    </div>
  );
}

function InspectionDefaultsCard({ category }: { category: InspectionCategory }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{CATEGORY_LABELS[category]}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <DefaultBlock state="checked" category={category} />
          <DefaultBlock state="unchecked" category={category} />
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Innstillinger</h1>
        <p className="text-sm text-muted-foreground">
          Administrer standardverdier for nedtrekksmenyer. Alle verdier - både forhåndsutfylte og de du legger til selv -
          kan slettes eller legges til her.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIELD_KEYS.map((fieldKey) => (
          <FieldOptionsCard key={fieldKey} fieldKey={fieldKey} />
        ))}
      </div>

      <div>
        <h2 className="text-base font-semibold">Standardverdier for inspeksjonsresultater</h2>
        <p className="text-sm text-muted-foreground">
          Teksten som fylles ut automatisk i nye rapporter. Tom verdi = innebygd standard.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {INSPECTION_CATEGORIES.map((category) => (
          <InspectionDefaultsCard key={category} category={category} />
        ))}
      </div>

      {/* Which build is this device actually running? PWA updates lag
          behind deploys, so this is the ground truth when debugging
          "I still see the old behavior" - compare against the latest
          deploy time in Netlify. */}
      <p className="text-xs text-muted-foreground">
        App-versjon: bygget {new Date(__BUILD_TIME__).toLocaleString("nb-NO")}
      </p>
    </div>
  );
}
