import { useState } from "react";
import { Plus, Star, StarOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SelectField } from "@/components/form/SelectField";
import { useAddFieldOption, useDeleteFieldOption, useFieldOptionRows } from "@/hooks/useFieldOptions";
import { useFieldDefaults, useInspectionDefaults, usePutAppSetting } from "@/hooks/useAppSettings";
import {
  CATEGORY_LABELS,
  DEFAULTABLE_FIELD_KEYS,
  FIELD_KEYS,
  FIELD_KEY_LABELS,
  INSPECTION_CATEGORIES,
  fieldDefaultKey,
  inspectionDefaultKey,
  type FieldKey,
  type InspectionCategory,
  type InspectionDefaultState,
} from "../../shared/constants";

// Chips + add-input body shared by FieldOptionsCard (one card per plain
// field) and TilstandCard (one card, two toggled field keys) so there's a
// single implementation of the "value chip with standard-value menu" UI.
function FieldOptionsBody({ fieldKey }: { fieldKey: FieldKey }) {
  const { items } = useFieldOptionRows(fieldKey);
  const addOption = useAddFieldOption();
  const deleteOption = useDeleteFieldOption();
  const putSetting = usePutAppSetting();
  const { getFieldDefault } = useFieldDefaults();
  const [draft, setDraft] = useState("");
  const [openChipId, setOpenChipId] = useState<number | null>(null);

  const isDefaultable = DEFAULTABLE_FIELD_KEYS.includes(fieldKey);
  const standardValue = getFieldDefault(fieldKey);

  function handleAdd() {
    const value = draft.trim();
    if (!value) return;
    addOption.mutate({ fieldKey, value });
    setDraft("");
  }

  function setAsDefault(value: string) {
    putSetting.mutate(
      { key: fieldDefaultKey(fieldKey), value },
      { onSuccess: () => toast.success("Standardverdi lagret") },
    );
  }

  function clearDefault() {
    putSetting.mutate({ key: fieldDefaultKey(fieldKey), value: "" });
  }

  function handleDelete(id: number, value: string) {
    deleteOption.mutate(id);
    if (value === standardValue) clearDefault();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 && <p className="text-xs text-muted-foreground">Ingen verdier ennå</p>}
        {items.map((o) => {
          const isStandard = o.value === standardValue;
          return (
            <Popover key={o.id} open={openChipId === o.id} onOpenChange={(open) => setOpenChipId(open ? o.id : null)}>
              <PopoverTrigger asChild>
                <button type="button">
                  <Badge
                    variant={isStandard ? undefined : "secondary"}
                    className={isStandard ? "gap-1 pr-1 bg-[#0b2540] text-white hover:bg-[#0b2540]" : "gap-1 pr-1"}
                  >
                    {isStandard && <Star className="h-3 w-3" />}
                    {o.value}
                  </Badge>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-fit">
                <p className="px-1 text-xs text-muted-foreground">{o.value}</p>
                {isDefaultable &&
                  (isStandard ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="justify-start"
                      onClick={() => {
                        clearDefault();
                        setOpenChipId(null);
                      }}
                    >
                      <StarOff className="h-4 w-4" />
                      Fjern som standard
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="justify-start"
                      onClick={() => {
                        setAsDefault(o.value);
                        setOpenChipId(null);
                      }}
                    >
                      <Star className="h-4 w-4" />
                      Sett som standard
                    </Button>
                  ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start text-destructive hover:text-destructive"
                  onClick={() => {
                    handleDelete(o.id, o.value);
                    setOpenChipId(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Slett verdien
                </Button>
              </PopoverContent>
            </Popover>
          );
        })}
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
    </div>
  );
}

function FieldOptionsCard({ fieldKey }: { fieldKey: FieldKey }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{FIELD_KEY_LABELS[fieldKey]}</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldOptionsBody fieldKey={fieldKey} />
      </CardContent>
    </Card>
  );
}

// Merges the old separate "Tilstand" / "Tilstand (ikke sjekket)" cards into
// one card with a Sjekket/Ikke sjekket segmented toggle, mirroring the
// report form's own Sjekket checkbox that swaps between the same two
// field_options sets.
function TilstandCard() {
  const [activeState, setActiveState] = useState<InspectionDefaultState>("checked");
  const activeFieldKey: FieldKey = activeState === "checked" ? "condition" : "condition_unchecked";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Tilstand</CardTitle>
        <StateToggle activeState={activeState} onChange={setActiveState} />
      </CardHeader>
      <CardContent className="space-y-2">
        <FieldOptionsBody fieldKey={activeFieldKey} />
        <p className="text-xs text-muted-foreground">
          {activeState === "checked" ? "Vises i skjemaet når «Sjekket» er på" : "Vises i skjemaet når «Sjekket» er av"}
        </p>
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
// The Kommentar Input is uncontrolled (defaultValue + onBlur), so callers
// MUST key this component (or the Input) on `${category}-${state}` when
// `state` can change under a mounted instance - otherwise the input keeps
// showing the previous state's text after the toggle flips.
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

function InspectionDefaultsCard({ category, activeState }: { category: InspectionCategory; activeState: InspectionDefaultState }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{CATEGORY_LABELS[category]}</CardTitle>
      </CardHeader>
      <CardContent>
        <DefaultBlock key={`${category}-${activeState}`} state={activeState} category={category} />
      </CardContent>
    </Card>
  );
}

// The shared navy segmented-toggle control - identical styling to
// TilstandCard's Sjekket/Ikke sjekket toggle, reused here at section level
// so the 5 InspectionDefaultsCards all show one active state at a time.
function StateToggle({
  activeState,
  onChange,
}: {
  activeState: InspectionDefaultState;
  onChange: (state: InspectionDefaultState) => void;
}) {
  return (
    <div className="flex rounded-full bg-muted p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("checked")}
        className={
          activeState === "checked"
            ? "rounded-full bg-[#0b2540] px-2.5 py-1 text-white"
            : "rounded-full px-2.5 py-1 text-muted-foreground"
        }
      >
        Sjekket
      </button>
      <button
        type="button"
        onClick={() => onChange("unchecked")}
        className={
          activeState === "unchecked"
            ? "rounded-full bg-[#0b2540] px-2.5 py-1 text-white"
            : "rounded-full px-2.5 py-1 text-muted-foreground"
        }
      >
        Ikke sjekket
      </button>
    </div>
  );
}

export function SettingsPage() {
  // Section-level Sjekket/Ikke sjekket toggle for the inspection-results
  // defaults below - swaps which state's Tilstand/Kommentar block all 5
  // category cards show, mirroring the report form's own Sjekket checkbox.
  const [inspectionDefaultsState, setInspectionDefaultsState] = useState<InspectionDefaultState>("checked");

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
        {FIELD_KEYS.filter((fieldKey) => fieldKey !== "condition_unchecked").map((fieldKey) =>
          fieldKey === "condition" ? <TilstandCard key={fieldKey} /> : <FieldOptionsCard key={fieldKey} fieldKey={fieldKey} />,
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Standardverdier for inspeksjonsresultater</h2>
          <p className="text-sm text-muted-foreground">
            {inspectionDefaultsState === "checked"
              ? "Verdiene som fylles ut når «Sjekket» er på i skjemaet."
              : "Verdiene som fylles ut når «Sjekket» er av i skjemaet."}
          </p>
        </div>
        <StateToggle activeState={inspectionDefaultsState} onChange={setInspectionDefaultsState} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {INSPECTION_CATEGORIES.map((category) => (
          <InspectionDefaultsCard key={category} category={category} activeState={inspectionDefaultsState} />
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
