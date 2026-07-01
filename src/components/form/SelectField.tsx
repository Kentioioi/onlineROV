import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFieldOptionValues } from "@/hooks/useFieldOptions";
import type { FieldKey } from "../../../shared/constants";

/**
 * Standardized-scale field (Strøm, Sikt, Villfisk, Groe, Tilstand): a plain
 * select, not creatable at data-entry time - the option list is still fully
 * user-editable, just via the Settings page rather than inline typing, to
 * keep the vocabulary from drifting report to report.
 */
export function SelectField({
  fieldKey,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  fieldKey: FieldKey;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const options = useFieldOptionValues(fieldKey);

  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder ?? "Velg..."} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
