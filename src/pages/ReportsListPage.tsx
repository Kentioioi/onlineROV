import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listReports, pdfDownloadUrl, type ReportListFilters } from "@/lib/api";

const PAGE_SIZE = 20;

export function ReportsListPage() {
  const [filters, setFilters] = useState<ReportListFilters>({});
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["reports", filters, page],
    queryFn: () => listReports({ ...filters, page, pageSize: PAGE_SIZE }),
  });

  function updateFilter(patch: Partial<ReportListFilters>) {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Rapporter</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Søk lokalitet, merd, grunn, operatør..."
            className="pl-8"
            onChange={(e) => updateFilter({ q: e.target.value || undefined })}
          />
        </div>
        <Input type="date" placeholder="Fra dato" onChange={(e) => updateFilter({ dateFrom: e.target.value || undefined })} />
        <Input type="date" placeholder="Til dato" onChange={(e) => updateFilter({ dateTo: e.target.value || undefined })} />
        <Input placeholder="Merd nummer" onChange={(e) => updateFilter({ merdNumber: e.target.value || undefined })} />
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : query.data && query.data.items.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rapport nr.</TableHead>
                <TableHead>Dato</TableHead>
                <TableHead>Lokalitet</TableHead>
                <TableHead>Merd</TableHead>
                <TableHead>Grunn</TableHead>
                <TableHead>ROV Operatør</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((r) => (
                <TableRow key={r.id} className="cursor-pointer">
                  <TableCell>
                    <Link to={`/reports/${r.id}`} className="block font-medium">
                      {r.reportNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.location || "-"}</TableCell>
                  <TableCell>{r.merdNumber || "-"}</TableCell>
                  <TableCell>{r.reason || "-"}</TableCell>
                  <TableCell>{r.rovOperator || "-"}</TableCell>
                  <TableCell>
                    {r.pdfBlobKey ? (
                      <a href={pdfDownloadUrl(r.id)} onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <FileDown className="h-4 w-4" />
                        </Button>
                      </a>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Ingen PDF
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Side {page} av {totalPages} ({query.data.total} rapporter)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Forrige
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Neste
              </Button>
            </div>
          </div>
        </>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">Ingen rapporter funnet.</p>
      )}
    </div>
  );
}
