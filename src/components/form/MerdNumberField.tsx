import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PREFIXES = ["M", "R"] as const;

function parse(value: string): { prefix: (typeof PREFIXES)[number]; digits: string } {
  const match = /^([MR])(\d*)$/i.exec(value.trim());
  if (match) return { prefix: match[1].toUpperCase() as "M" | "R", digits: match[2] };
  return { prefix: "M", digits: "" };
}

/**
 * M/R prefix toggle + plain numeric input (not a +/- stepper: real cage
 * numbers range from single digits ("M2") to 5 digits ("R12345"), where a
 * stepper's up/down arrows would be useless) - reconstructs "M2"/"R12345".
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
  const { prefix, digits } = useMemo(() => parse(value), [value]);

  return (
    <div className="flex gap-2">
      <div className="flex overflow-hidden rounded-lg border border-input">
        {PREFIXES.map((p) => (
          <Button
            key={p}
            type="button"
            variant="ghost"
            disabled={disabled}
            className={cn(
              "h-8 w-9 rounded-none px-0 text-sm",
              prefix === p && "bg-[#0b2540] text-white hover:bg-[#0b2540] hover:text-white",
            )}
            onClick={() => onChange(`${p}${digits}`)}
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
        onChange={(e) => onChange(`${prefix}${e.target.value.replace(/\D/g, "")}`)}
      />
    </div>
  );
}
