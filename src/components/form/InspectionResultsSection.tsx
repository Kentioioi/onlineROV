import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AutoGrowTextarea } from "@/components/form/AutoGrowTextarea";
import { SelectField } from "@/components/form/SelectField";
import {
  CATEGORY_LABELS,
  CHECKED_COMMENT_DEFAULTS,
  INSPECTION_CATEGORIES,
  UNCHECKED_COMMENT_DEFAULTS,
  type InspectionCategory,
} from "../../../shared/constants";

export type FormInspectionResult = {
  category: InspectionCategory;
  checked: boolean;
  condition: string;
  comment: string;
};

export function InspectionResultsSection({
  results,
  onChange,
  imageCounts,
  getDefault,
}: {
  results: FormInspectionResult[];
  onChange: (category: InspectionCategory, patch: Partial<FormInspectionResult>) => void;
  imageCounts: Record<InspectionCategory, number>;
  getDefault: (state: "checked" | "unchecked", fieldName: "condition" | "comment", category: InspectionCategory) => string;
}) {
  return (
    <div className="space-y-4">
      {INSPECTION_CATEGORIES.map((category) => {
        const row = results.find((r) => r.category === category);
        if (!row) return null;
        const imageCount = imageCounts[category] ?? 0;

        // A comment counts as "template" (not dirty) if it matches either
        // the CURRENT resolved default (possibly user-customized via
        // Settings) or the original hardcoded builtin - pre-existing reports
        // whose comment text still holds the old builtin must keep counting
        // as undirty even after the default is customized.
        function isTemplateComment(comment: string): boolean {
          return (
            comment === getDefault("checked", "comment", category) ||
            comment === getDefault("unchecked", "comment", category) ||
            comment === CHECKED_COMMENT_DEFAULTS[category] ||
            comment === UNCHECKED_COMMENT_DEFAULTS[category]
          );
        }

        const dirty = !isTemplateComment(row.comment);

        function toggle(checked: boolean) {
          const state = checked ? "checked" : "unchecked";
          const patch: Partial<FormInspectionResult> = {
            checked,
            condition: getDefault(state, "condition", category),
          };
          if (!dirty) {
            patch.comment = getDefault(state, "comment", category);
          }
          onChange(category, patch);
        }

        function resetToDefault() {
          onChange(category, {
            comment: getDefault(row!.checked ? "checked" : "unchecked", "comment", category),
          });
        }

        return (
          <div key={category} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium">{CATEGORY_LABELS[category]}</span>
                {imageCount > 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    {imageCount} bilde{imageCount > 1 ? "r" : ""}
                  </Badge>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={row.checked} onCheckedChange={(v) => toggle(v === true)} />
                Sjekket
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Tilstand</Label>
                {/* Unchecked rows get their own user-editable Tilstand vocabulary
                    (condition_unchecked) instead of a disabled N/A - the toggle()
                    below still resets the value to each state's default when flipped. */}
                <SelectField
                  fieldKey={row.checked ? "condition" : "condition_unchecked"}
                  value={row.condition}
                  onChange={(v) => onChange(category, { condition: v })}
                />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Kommentar</Label>
                  {dirty && (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={resetToDefault}>
                      Sett til standardtekst
                    </Button>
                  )}
                </div>
                {/* Auto-growing textarea, not a single-line Input: a long
                    comment used to scroll sideways inside one invisible
                    line instead of wrapping into view. Starts input-height,
                    grows with content. */}
                <AutoGrowTextarea
                  rows={1}
                  className="min-h-9 py-1.5"
                  value={row.comment}
                  onChange={(e) => onChange(category, { comment: e.target.value })}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
