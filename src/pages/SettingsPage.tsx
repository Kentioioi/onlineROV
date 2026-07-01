import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAddFieldOption, useDeleteFieldOption, useFieldOptionRows } from "@/hooks/useFieldOptions";
import { FIELD_KEYS, FIELD_KEY_LABELS, type FieldKey } from "../../shared/constants";

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
    </div>
  );
}
