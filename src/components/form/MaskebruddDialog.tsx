import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NumericUnitField } from "@/components/form/NumericUnitField";
import { cn } from "@/lib/utils";
import { formatMaskebruddText, maskebruddInputSchema } from "../../../shared/schema";

const ESCALATION_CONTACTS = ["Prosjektleder", "Operasjonsleder", "Lokalitetsansvarlig"];

/**
 * Structured "Legg til maskebrudd" mini-form that composes a formatted line
 * and appends it into the Kommentarer/Avvik textarea - mirrors the legacy
 * dialog's exact fields and X>2/Y>2 conditional escape-risk reveal.
 */
export function MaskebruddDialog({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (text: string) => void;
}) {
  const [sizeX, setSizeX] = useState("");
  const [sizeY, setSizeY] = useState("");
  const [depth, setDepth] = useState("");
  const [escapeRisk, setEscapeRisk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const x = Number(sizeX);
  const y = Number(sizeY);
  const needsEscapeRisk = sizeX !== "" && sizeY !== "" && (x > 2 || y > 2);

  function reset() {
    setSizeX("");
    setSizeY("");
    setDepth("");
    setEscapeRisk(null);
    setError(null);
  }

  function handleSubmit() {
    const parsed = maskebruddInputSchema.safeParse({
      sizeX: x,
      sizeY: y,
      depth: Number(depth),
      escapeRisk,
    });
    if (!parsed.success) {
      // A silent no-op here left users mashing a button that "did nothing"
      // (audit finding) - name the actual problem instead.
      setError("Størrelse X og Y må være hele tall, og dybde må være større enn 0.");
      return;
    }
    setError(null);

    onInsert(formatMaskebruddText(parsed.data));
    if (needsEscapeRisk && escapeRisk) {
      toast.warning("Rømningsfare - kontakt i rekkefølge:", {
        description: ESCALATION_CONTACTS.join(" -> "),
        duration: 8000,
      });
    }
    reset();
    onOpenChange(false);
  }

  const canSubmit = sizeX !== "" && sizeY !== "" && depth !== "" && (!needsEscapeRisk || escapeRisk !== null);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Legg til maskebrudd</DialogTitle>
          <DialogDescription>Registrer størrelse og dybde på maskebruddet.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label>Størrelse X</Label>
            <NumericUnitField value={sizeX} onChange={setSizeX} unit="masker" min={1} />
          </div>
          <div className="grid gap-1.5">
            <Label>Størrelse Y</Label>
            <NumericUnitField value={sizeY} onChange={setSizeY} unit="masker" min={1} />
          </div>
          <div className="col-span-2 grid gap-1.5">
            <Label>Dybde</Label>
            <NumericUnitField value={depth} onChange={setDepth} unit="m" min={0} />
          </div>
          {needsEscapeRisk && (
            <div className="col-span-2 grid gap-1.5">
              <Label className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Rømningsfare
              </Label>
              <div className="flex gap-2">
                {[
                  { label: "Ja", val: true },
                  { label: "Nei", val: false },
                ].map((opt) => (
                  <Button
                    key={opt.label}
                    type="button"
                    variant="outline"
                    className={cn(
                      "flex-1",
                      escapeRisk === opt.val && "border-[#0b2540] bg-[#0b2540] text-white hover:bg-[#0b2540] hover:text-white",
                    )}
                    onClick={() => setEscapeRisk(opt.val)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Legg til
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
