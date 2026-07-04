import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listAppSettings, putAppSetting } from "@/lib/api";
import { cacheAppSettings, getCachedAppSettings } from "@/offline/db";
import {
  builtinInspectionDefault,
  fieldDefaultKey,
  inspectionDefaultKey,
  type FieldKey,
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
    const perCategory = overrides.get(inspectionDefaultKey(state, fieldName, category));
    if (perCategory !== undefined) return perCategory;

    // "condition" has an extra fallback rung: the set-wide starred standard
    // value from the Tilstand card in Settings (fieldDefaultKey), which sits
    // between the per-category override above and the hardcoded builtin
    // below. "comment" has no such set-wide concept, so it skips straight to
    // the builtin.
    if (fieldName === "condition") {
      const setWide = overrides.get(fieldDefaultKey(state === "checked" ? "condition" : "condition_unchecked"));
      if (setWide) return setWide;
    }

    return builtinInspectionDefault(state, fieldName, category);
  }

  const isReady = query.isSuccess || query.isError;

  return { getDefault, isReady };
}

// Starred standard values per dropdown field ("Sett som standard" in
// Settings) - null when no standard is chosen.
export function useFieldDefaults() {
  const query = useAppSettings();
  const overrides = useMemo(() => new Map((query.data?.items ?? []).map((i) => [i.key, i.value])), [query.data]);

  function getFieldDefault(fieldKey: FieldKey): string | null {
    return overrides.get(fieldDefaultKey(fieldKey)) ?? null;
  }

  const isReady = query.isSuccess || query.isError;

  return { getFieldDefault, isReady };
}

export function usePutAppSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => putAppSetting(key, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: () => toast.error("Kunne ikke lagre standardverdien - sjekk nettforbindelsen."),
  });
}
