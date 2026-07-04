import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listAppSettings, putAppSetting } from "@/lib/api";
import { cacheAppSettings, getCachedAppSettings } from "@/offline/db";
import {
  builtinInspectionDefault,
  inspectionDefaultKey,
  type InspectionCategory,
  type InspectionDefaultField,
  type InspectionDefaultState,
} from "../../shared/constants";

const QUERY_KEY = ["app-settings"] as const;

// Mirrors useFieldOptions.ts's useAllFieldOptions(): fetch, mirror into
// IndexedDB on success, fall back to the cache on failure (offline) so the
// inspection-defaults resolution below still works without a network.
export function useAppSettings() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      try {
        const result = await listAppSettings();
        void cacheAppSettings(result.items);
        return result;
      } catch (err) {
        const cached = await getCachedAppSettings();
        if (cached.length > 0) return { items: cached };
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

// Resolves the per-category inspection defaults, preferring a stored
// override and falling back to the hardcoded builtin. `isReady` settles
// (true) on either success or error - a failed fetch still counts as ready
// because builtinInspectionDefault() is always available offline.
export function useInspectionDefaults() {
  const query = useAppSettings();
  const overrides = useMemo(() => new Map((query.data?.items ?? []).map((i) => [i.key, i.value])), [query.data]);

  function getDefault(state: InspectionDefaultState, fieldName: InspectionDefaultField, category: InspectionCategory): string {
    const stored = overrides.get(inspectionDefaultKey(state, fieldName, category));
    return stored ?? builtinInspectionDefault(state, fieldName, category);
  }

  const isReady = query.isSuccess || query.isError;

  return { getDefault, isReady };
}

export function usePutAppSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => putAppSetting(key, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: () => toast.error("Kunne ikke lagre standardverdien - sjekk nettforbindelsen."),
  });
}
