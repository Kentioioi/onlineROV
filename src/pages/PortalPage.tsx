import { Link } from "react-router-dom";
import { FilePlus2, ListChecks } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PortalPage() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Link to="/reports/new">
        <Card className="h-full transition-shadow hover:shadow-md">
          <CardHeader>
            <FilePlus2 className="h-8 w-8 text-[#12a5c9]" />
            <CardTitle>Ny rapport</CardTitle>
            <CardDescription>Registrer en ny ROV-inspeksjon</CardDescription>
          </CardHeader>
        </Card>
      </Link>
      <Link to="/reports">
        <Card className="h-full transition-shadow hover:shadow-md">
          <CardHeader>
            <ListChecks className="h-8 w-8 text-[#12a5c9]" />
            <CardTitle>Se tidligere rapporter</CardTitle>
            <CardDescription>Søk og bla gjennom lagrede inspeksjoner</CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </div>
  );
}
