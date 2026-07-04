import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CloudOff, ImageOff, Loader2, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ApiError, deleteImage, imageUrl, uploadImage } from "@/lib/api";
import { compressImageForUpload } from "@/lib/compress-image";
import { queueImageForSync } from "@/offline/syncManager";
import { deleteOutboxImage } from "@/offline/db";
import { CATEGORY_LABELS, IMAGE_CATEGORIES, type ImageCategory } from "../../../shared/constants";
import type { ReportImage } from "../../../db/schema";

// Outbox deletion is bookkeeping, never worth failing the happy path over.
async function deleteQueuedImage(id: string): Promise<void> {
  try {
    await deleteOutboxImage(id);
  } catch {
    // ignore - worst case the record lingers until cleanup
  }
}

type PendingUpload = {
  localId: string;
  category: ImageCategory;
  previewUrl: string;
  status: "uploading" | "queued-offline" | "failed";
};

export function ImageUploadSection({
  reportId,
  isSaved,
  ensureSaved,
  images,
  onImagesChange,
  onPendingCountChange,
}: {
  reportId: string;
  isSaved: boolean;
  ensureSaved: () => Promise<void>;
  images: ReportImage[];
  onImagesChange: (updater: (prev: ReportImage[]) => ReportImage[]) => void;
  /** Lets the parent's navigation guard cover in-flight photo uploads. */
  onPendingCountChange?: (count: number) => void;
}) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const queryClient = useQueryClient();

  // Photo changes bypass the form's save flow, so the detail page's cached
  // copy of this report must be invalidated here - otherwise navigating
  // back within the cache's staleTime showed the pre-edit photo set.
  const invalidateReport = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["report", reportId] });
  }, [queryClient, reportId]);

  // Photos added this session keep their in-memory preview as the thumbnail
  // source even after upload succeeds. Re-fetching the freshly-uploaded bytes
  // from /api/images/:id is pointless work and, on a marginal boat
  // connection, was the reason a photo could count up (1) yet show no
  // thumbnail - the upload made it, the immediate re-download didn't.
  const localPreviews = useRef(new Map<string, string>());
  useEffect(() => {
    const map = localPreviews.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  useEffect(() => {
    onPendingCountChange?.(pending.filter((p) => p.status === "uploading").length);
  }, [pending, onPendingCountChange]);

  const handleDrop = useCallback(
    async (category: ImageCategory, files: File[]) => {
      if (!files.length) return;

      // Compress + build a local preview FIRST, before anything that touches
      // the network. Adding photos before the silent auto-save that backs a
      // brand-new report used to be gated behind that save succeeding - any
      // hard error there (expired session, transient 500, ...) left the
      // photo picker looking like it did nothing at all, with only an
      // easy-to-miss toast. Now the thumbnail always shows up immediately.
      const items = await Promise.all(
        files.map(async (file) => {
          const localId = crypto.randomUUID();
          const { blob, filename } = await compressImageForUpload(file);
          return { localId, file, blob, filename, previewUrl: URL.createObjectURL(blob) };
        }),
      );
      setPending((prev) => [
        ...prev,
        ...items.map((it) => ({ localId: it.localId, category, previewUrl: it.previewUrl, status: "uploading" as const })),
      ]);

      if (!isSaved) {
        try {
          await ensureSaved();
        } catch (err) {
          const ids = new Set<string>(items.map((it) => it.localId));
          setPending((prev) => prev.map((p) => (ids.has(p.localId) ? { ...p, status: "failed" } : p)));
          toast.error(
            err instanceof ApiError
              ? `Kunne ikke lagre rapporten: ${err.message}`
              : "Kunne ikke lagre rapporten - prøv igjen.",
          );
          return;
        }
      }

      // Queue-first: every photo goes into the IndexedDB outbox BEFORE the
      // foreground uploads start. The uploads below then run sequentially,
      // potentially for minutes on a boat uplink - if the browser/PWA is
      // killed mid-batch, the un-uploaded photos survive in the outbox and
      // background sync finishes the job. Previously the batch lived only
      // in this closure and died with the process, silently.
      for (const it of items) {
        try {
          await queueImageForSync({
            id: it.localId,
            reportId,
            category,
            blob: it.blob,
            originalFilename: it.filename,
            contentType: it.blob.type || it.file.type,
            sortOrder: 0,
          });
        } catch {
          // IndexedDB unavailable/full - continue without the safety net
          // (the foreground upload below is now the only path for this
          // photo, same as the old behavior).
        }
      }

      for (const it of items) {
        try {
          const row = await uploadImage(reportId, { id: it.localId, category, file: it.blob, filename: it.filename });
          localPreviews.current.set(row.id, it.previewUrl);
          onImagesChange((prev) => [...prev, row]);
          setPending((prev) => prev.filter((p) => p.localId !== it.localId));
          await deleteQueuedImage(it.localId);
          invalidateReport();
        } catch (err) {
          if (err instanceof ApiError && err.status < 500) {
            // Genuine server rejection (bad format, too big, ...) - a retry
            // of the same bytes can never succeed. Drop the outbox copy.
            toast.error(`Opplasting feilet: ${err.message || it.filename}`);
            setPending((prev) => prev.map((p) => (p.localId === it.localId ? { ...p, status: "failed" } : p)));
            await deleteQueuedImage(it.localId);
            continue;
          }
          // Network failure or transient server error (5xx) - the photo is
          // already safe in the outbox; background sync retries it. Kept
          // visible as "queued-offline" so the inspector sees it wasn't
          // dropped.
          setPending((prev) => prev.map((p) => (p.localId === it.localId ? { ...p, status: "queued-offline" } : p)));
        }
      }
    },
    [isSaved, ensureSaved, reportId, onImagesChange, invalidateReport],
  );

  function dismissPending(localId: string) {
    setPending((prev) => {
      const found = prev.find((p) => p.localId === localId);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
    // Also drop the outbox copy - dismissing the tile means "don't want
    // this photo"; leaving it queued made it sync into the report anyway.
    void deleteQueuedImage(localId);
  }

  async function handleDelete(image: ReportImage) {
    // Deleting is instant and irreversible server-side - confirm first
    // (audit: invisible hover-only button erased photos with no undo).
    if (!window.confirm("Slette bildet? Dette kan ikke angres.")) return;
    onImagesChange((prev) => prev.filter((i) => i.id !== image.id));
    try {
      await deleteImage(reportId, image.id);
      invalidateReport();
    } catch {
      toast.error("Kunne ikke slette bildet");
      onImagesChange((prev) => [...prev, image]);
    }
  }

  // All six categories stacked for a full overview - tabs hid five of six
  // categories and their two-row tab grid collided with the dropzone on
  // phones.
  return (
    <div className="space-y-5">
      {IMAGE_CATEGORIES.map((cat) => {
        const count = images.filter((i) => i.category === cat).length;
        return (
          <section key={cat}>
            <div className="mb-1.5 flex items-center gap-2">
              <h4 className="text-sm font-medium">{CATEGORY_LABELS[cat]}</h4>
              {count > 0 && (
                <Badge variant="secondary" className="px-1.5 text-[10px]">
                  {count}
                </Badge>
              )}
            </div>
            <CategoryDropzone
              category={cat}
              images={images.filter((i) => i.category === cat)}
              pending={pending.filter((p) => p.category === cat)}
              onDrop={(files) =>
                // handleDrop is a floating promise (dropzone callback) - a
                // rejection anywhere inside would otherwise vanish as an
                // unhandled rejection with tiles stuck on their spinner.
                void handleDrop(cat, files).catch(() => {
                  toast.error("Noe gikk galt under behandling av bildene - prøv igjen.");
                  setPending((prev) =>
                    prev.map((p) => (p.category === cat && p.status === "uploading" ? { ...p, status: "failed" } : p)),
                  );
                })
              }
              onDelete={handleDelete}
              onDismissPending={dismissPending}
              localPreviews={localPreviews.current}
            />
          </section>
        );
      })}
    </div>
  );
}

/**
 * Thumbnail with a self-healing fallback: if the authenticated image fetch
 * fails (transient blip, cold function), retry once with a cache-busting
 * query param; if that also fails, show an explicit broken-image tile
 * instead of an invisible empty square.
 */
function Thumbnail({ image, localPreviewUrl }: { image: ReportImage; localPreviewUrl?: string }) {
  const [attempt, setAttempt] = useState(0);
  if (localPreviewUrl) {
    return <img src={localPreviewUrl} alt={image.originalFilename ?? ""} className="h-full w-full object-cover" />;
  }
  if (attempt >= 2) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
        <ImageOff className="h-5 w-5" />
      </div>
    );
  }
  return (
    <img
      src={attempt === 0 ? imageUrl(image.id) : `${imageUrl(image.id)}?retry=${attempt}`}
      alt={image.originalFilename ?? ""}
      className="h-full w-full object-cover"
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}

function CategoryDropzone({
  images,
  pending,
  onDrop,
  onDelete,
  onDismissPending,
  localPreviews,
}: {
  category: ImageCategory;
  images: ReportImage[];
  pending: PendingUpload[];
  onDrop: (files: File[]) => void;
  onDelete: (image: ReportImage) => void;
  onDismissPending: (localId: string) => void;
  localPreviews: Map<string, string>;
}) {
  // A plain "image/*" wildcard (rather than an explicit MIME list) is the
  // standard, most compatible way to get mobile browsers to offer BOTH
  // "Take Photo" and "Choose from Library" in the native picker - listing
  // specific types (especially non-standard ones like "image/heic") can
  // make some mobile browsers narrow or drop that native chooser entirely.
  // Server-side validation (images-upload.mts) still enforces the real
  // accepted-type allowlist regardless of what the client offers here.
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    multiple: true,
    onDrop: (accepted) => onDrop(accepted),
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center text-sm text-muted-foreground transition-colors ${
          isDragActive ? "border-[#12a5c9] bg-[#12a5c9]/5" : "border-muted-foreground/25"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-5 w-5" />
        <p>Dra og slipp bilder her, eller klikk for å velge filer</p>
      </div>

      {(images.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((img) => (
            <div key={img.id} className="group relative aspect-square overflow-hidden rounded-md border">
              <Thumbnail image={img} localPreviewUrl={localPreviews.get(img.id)} />
              {/* Always visible - hover-only controls don't exist on touch
                  screens, which made photos undeletable on phones. */}
              <button
                type="button"
                onClick={() => onDelete(img)}
                aria-label="Slett bilde"
                className="absolute top-1 right-1 rounded-full bg-black/60 p-1.5 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.localId} className="relative aspect-square overflow-hidden rounded-md border">
              <img src={p.previewUrl} alt="" className="h-full w-full object-cover opacity-50" />
              <div
                className={`absolute inset-0 flex items-center justify-center ${
                  p.status === "failed" ? "bg-red-950/40" : "bg-black/20"
                }`}
              >
                {p.status === "uploading" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : p.status === "failed" ? (
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                ) : (
                  <CloudOff className="h-5 w-5 text-white" />
                )}
              </div>
              {p.status !== "uploading" && (
                <button
                  type="button"
                  onClick={() => onDismissPending(p.localId)}
                  aria-label="Fjern bilde"
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-1.5 text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
