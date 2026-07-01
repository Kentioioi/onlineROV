import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAddFieldOption, useFieldOptionValues } from "@/hooks/useFieldOptions";
import type { FieldKey } from "../../../shared/constants";

/**
 * Open-ended entity field (Lokalitet, Fartøy, Prosjektleder, ROV Operatør,
 * Merd type, Grunn for inspeksjon): typing filters existing field_options,
 * an unmatched value offers "+ Legg til X" which both selects it AND
 * persists it for next time - new values are ordinary, later-deletable
 * field_options rows, no different from the seeded ones.
 */
export function CreatableCombobox({
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
  const addOption = useAddFieldOption();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const exactMatch = useMemo(
    () => options.some((o) => o.toLowerCase() === search.trim().toLowerCase()),
    [options, search],
  );

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    setSearch("");
    const trimmed = next.trim();
    if (trimmed && !options.includes(trimmed)) {
      addOption.mutate({ fieldKey, value: trimmed });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder || "Velg..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Søk eller skriv ny verdi..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted"
                  onClick={() => commit(search.trim())}
                >
                  <Plus className="h-4 w-4" /> Legg til "{search.trim()}"
                </button>
              ) : (
                "Ingen treff"
              )}
            </CommandEmpty>
            <CommandGroup>
              {options
                .filter((o) => o.toLowerCase().includes(search.trim().toLowerCase()))
                .map((o) => (
                  <CommandItem key={o} value={o} onSelect={() => commit(o)}>
                    <Check className={cn("h-4 w-4", value === o ? "opacity-100" : "opacity-0")} />
                    {o}
                  </CommandItem>
                ))}
              {search.trim() && !exactMatch && (
                <CommandItem value={`__create_${search}`} onSelect={() => commit(search.trim())}>
                  <Plus className="h-4 w-4" />
                  Legg til "{search.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
