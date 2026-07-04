import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PREFIXES = ["M", "R"] as const;
type Prefix = (typeof PREFIXES)[number];

function parse(value: string): { prefix: Prefix | null; digits: string } {
  const match = /^([MR])(\d*)$/i.exec(value.trim());
  if (match) return { prefix: match[1].toUpperCase() as Prefix, digits: match[2] };
  return { prefix: null, digits: "" };
}

/**
 * M/R prefix toggle + plain numeric input (not a +/- stepper: real cage
 * numbers range from single digits ("M2") to 5 digits ("R12345")) -
 * reconstructs "M2"/"R12345". Emits "" (not a bare "M"/"R") while the
 * number part is empty, so an untouched field stays genuinely empty.
 */
export function MerdNumberField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const parsed = useMemo(() => parse(value), [value]);
  // Remembers the chosen prefix while digits are empty (the committed value
  // is "" then, so the prefix can't live in `value` yet).
  const [localPrefix, setLocalPrefix] = useState<Prefix>("M");
  const prefix = parsed.prefix ?? localPrefix;
  const digits = parsed.digits;

  function commit(nextPrefix: Prefix, nextDigits: string) {
    setLocalPrefix(nextPrefix);
    onChange(nextDigits ? `${nextPrefix}${nextDigits}` : "");
  }

  return (
    <div className="flex gap-2">
      {/* shrink-0: the w-full Input next to this was squeezing the toggle and overflow-hidden clipped away the "R" button. */}
      <div className="flex shrink-0 overflow-hidden rounded-lg border border-input">
        {PREFIXES.map((p) => (
          <Button
            key={p}
            type="button"
            variant="ghost"
            disabled={disabled}
            className={cn(
              "h-8 w-9 shrink-0 rounded-none px-0 text-sm",
              prefix === p && "bg-[#0b2540] text-white hover:bg-[#0b2540] hover:text-white",
            )}
            onClick={() => commit(p, digits)}
          >
            {p}
          </Button>
        ))}
      </div>
      <Input
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="nummer"
        value={digits}
        disabled={disabled}
        onChange={(e) => commit(prefix, e.target.value.replace(/\D/g, ""))}
      />
    </div>
  );
}
