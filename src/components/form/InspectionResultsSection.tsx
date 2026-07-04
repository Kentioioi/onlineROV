import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AutoGrowTextarea } from "@/components/form/AutoGrowTextarea";
import { SelectField } from "@/components/form/SelectField";
import {
  CATEGORY_LABELS,
  CHECKED_COMMENT_DEFAULTS,
  CHECKED_CONDITION_DEFAULT,
  INSPECTION_CATEGORIES,
  UNCHECKED_COMMENT_DEFAULTS,
  UNCHECKED_CONDITION_DEFAULT,
  type InspectionCategory,
} from "../../../shared/constants";

export type FormInspectionResult = {
  category: InspectionCategory;
  checked: boolean;
  condition: string;
  comment: string;
};

function isTemplateComment(category: InspectionCategory, comment: string): boolean {
  return comment === CHECKED_COMMENT_DEFAULTS[category] || comment === UNCHECKED_COMMENT_DEFAULTS[category];
}

export function InspectionResultsSection({
  results,
  onChange,
  imageCounts,
}: {
  results: FormInspectionResult[];
  onChange: (category: InspectionCategory, patch: Partial<FormInspectionResult>) => void;
  imageCounts: Record<InspectionCategory, number>;
}) {
  return (
    <div className="space-y-4">
      {INSPECTION_CATEGORIES.map((category) => {
        const row = results.find((r) => r.category === category);
        if (!row) return null;
        const dirty = !isTemplateComment(category, row.comment);
        const imageCount = imageCounts[category] ?? 0;

        function toggle(checked: boolean) {
          const patch: Partial<FormInspectionResult> = {
            checked,
            condition: checked ? CHECKED_CONDITION_DEFAULT : UNCHECKED_CONDITION_DEFAULT,
          };
          if (!dirty) {
            patch.comment = checked ? CHECKED_COMMENT_DEFAULTS[category] : UNCHECKED_COMMENT_DEFAULTS[category];
          }
          onChange(category, patch);
        }

        function resetToDefault() {
          onChange(category, {
            comment: row!.checked ? CHECKED_COMMENT_DEFAULTS[category] : UNCHECKED_COMMENT_DEFAULTS[category],
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
