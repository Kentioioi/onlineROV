import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addFieldOption, deleteFieldOption, listFieldOptions } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { cacheFieldOptions, getCachedFieldOptions } from "@/offline/db";
import type { FieldKey } from "../../shared/constants";

const QUERY_KEY = ["field-options"] as const;

// One shared fetch for the whole option set on app/form load (small,
// low-churn dataset per the plan) - individual components filter client-side
// via useFieldOptionValues() below rather than issuing per-field requests.
// Successful fetches are mirrored into IndexedDB so dropdowns/comboboxes
// still work fully offline; a failed fetch (no network) falls back to that
// cache instead of leaving the form's dropdowns empty.
export function useAllFieldOptions() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      try {
        const result = await listFieldOptions();
        void cacheFieldOptions(result.items);
        return result;
      } catch (err) {
        const cached = await getCachedFieldOptions();
        if (cached.length > 0) return { items: cached };
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useFieldOptionValues(fieldKey: FieldKey): string[] {
  const { data } = useAllFieldOptions();
  return (data?.items ?? [])
    .filter((o) => o.fieldKey === fieldKey)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value, "nb"))
    .map((o) => o.value);
}

export function useFieldOptionRows(fieldKey: FieldKey) {
  const { data, ...rest } = useAllFieldOptions();
  const items = (data?.items ?? [])
    .filter((o) => o.fieldKey === fieldKey)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value, "nb"));
  return { items, ...rest };
}

// Failures used to be completely silent: the Settings input cleared
// optimistically, nothing appeared, no toast - the typed value just
// vanished (worst on the boat, where offline is the norm, not the edge).
function mutationErrorToast(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? `${fallback}: ${err.message}` : `${fallback} - sjekk nettforbindelsen.`);
}

export function useAddFieldOption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fieldKey, value }: { fieldKey: FieldKey; value: string }) => addFieldOption(fieldKey, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => mutationErrorToast(err, "Kunne ikke legge til verdien"),
  });
}

export function useDeleteFieldOption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteFieldOption(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => mutationErrorToast(err, "Kunne ikke slette verdien"),
  });
}
