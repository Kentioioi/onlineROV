import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";

/**
 * Numeric input with a fixed unit shown outside the field (not typed) -
 * replaces free-text-with-embedded-unit fields like "160m"/"100 stk" from
 * the legacy app.
 */
export function NumericUnitField({
  value,
  onChange,
  unit,
  placeholder,
  disabled,
  min = 0,
}: {
  value: string;
  onChange: (value: string) => void;
  unit: string;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
}) {
  return (
    <InputGroup>
      <InputGroupInput
        type="number"
        inputMode="decimal"
        min={min}
        step="any"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>{unit}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}
