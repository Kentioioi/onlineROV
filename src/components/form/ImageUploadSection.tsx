import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { CloudOff, Loader2, Upload, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ApiError, deleteImage, imageUrl, uploadImage } from "@/lib/api";
import { compressImageForUpload } from "@/lib/compress-image";
import { queueImageForSync } from "@/offline/syncManager";
import { CATEGORY_LABELS, IMAGE_CATEGORIES, type ImageCategory } from "../../../shared/constants";
import type { ReportImage } from "../../../db/schema";

type PendingUpload = {
  localId: string;
  category: ImageCategory;
  previewUrl: string;
  status: "uploading" | "queued-offline";
};

export function ImageUploadSection({
  reportId,
  isSaved,
  ensureSaved,
  images,
  onImagesChange,
}: {
  reportId: string;
  isSaved: boolean;
  ensureSaved: () => Promise<void>;
  images: ReportImage[];
  onImagesChange: (updater: (prev: ReportImage[]) => ReportImage[]) => void;
}) {
  const [active, setActive] = useState<ImageCategory>("liftup");
  const [pending, setPending] = useState<PendingUpload[]>([]);

  const handleDrop = useCallback(
    async (category: ImageCategory, files: File[]) => {
      if (!files.length) return;
      if (!isSaved) {
        try {
          await ensureSaved();
        } catch {
          toast.error("Kunne ikke lagre rapporten - prøv igjen før du legger til bilder.");
          return;
        }
      }
      for (const file of files) {
        const localId = crypto.randomUUID();
        // Compress BEFORE upload - raw phone photos routinely exceed Netlify
        // Functions' 6MB body limit, so uncompressed uploads fail at the
        // platform layer (the "photos not showing / count stuck" bug).
        const { blob, filename } = await compressImageForUpload(file);
        const previewUrl = URL.createObjectURL(blob);
        setPending((prev) => [...prev, { localId, category, previewUrl, status: "uploading" }]);
        try {
          const row = await uploadImage(reportId, { id: localId, category, file: blob, filename });
          onImagesChange((prev) => [...prev, row]);
          setPending((prev) => prev.filter((p) => p.localId !== localId));
          URL.revokeObjectURL(previewUrl);
        } catch (err) {
          if (err instanceof ApiError) {
            toast.error(`Opplasting feilet: ${err.message || filename}`);
            setPending((prev) => prev.filter((p) => p.localId !== localId));
            URL.revokeObjectURL(previewUrl);
            continue;
          }
          // Network failure (offline) - queue for background sync instead
          // of losing the photo. Kept visible as "queued-offline" so the
          // inspector sees it wasn't dropped, not removed like a real error.
          await queueImageForSync({
            id: localId,
            reportId,
            category,
            blob,
            originalFilename: filename,
            contentType: blob.type || file.type,
            sortOrder: 0,
          });
          setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: "queued-offline" } : p)));
        }
      }
    },
    [isSaved, ensureSaved, reportId, onImagesChange],
  );

  async function handleDelete(image: ReportImage) {
    onImagesChange((prev) => prev.filter((i) => i.id !== image.id));
    try {
      await deleteImage(reportId, image.id);
    } catch {
      toast.error("Kunne ikke slette bildet");
      onImagesChange((prev) => [...prev, image]);
    }
  }

  return (
    <Tabs value={active} onValueChange={(v) => setActive(v as ImageCategory)}>
      <TabsList className="flex w-full flex-wrap h-auto">
        {IMAGE_CATEGORIES.map((cat) => {
          const count = images.filter((i) => i.category === cat).length;
          return (
            <TabsTrigger key={cat} value={cat} className="gap-1.5">
              {CATEGORY_LABELS[cat]}
              {count > 0 && (
                <Badge variant="secondary" className="px-1.5 text-[10px]">
                  {count}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {IMAGE_CATEGORIES.map((cat) => (
        <TabsContent key={cat} value={cat}>
          <CategoryDropzone
            category={cat}
            images={images.filter((i) => i.category === cat)}
            pending={pending.filter((p) => p.category === cat)}
            onDrop={(files) => handleDrop(cat, files)}
            onDelete={handleDelete}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function CategoryDropzone({
  images,
  pending,
  onDrop,
  onDelete,
}: {
  category: ImageCategory;
  images: ReportImage[];
  pending: PendingUpload[];
  onDrop: (files: File[]) => void;
  onDelete: (image: ReportImage) => void;
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
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm text-muted-foreground transition-colors ${
          isDragActive ? "border-[#12a5c9] bg-[#12a5c9]/5" : "border-muted-foreground/25"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-6 w-6" />
        <p>Dra og slipp bilder her, eller klikk for å velge filer</p>
      </div>

      {(images.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((img) => (
            <div key={img.id} className="group relative aspect-square overflow-hidden rounded-md border">
              <img src={imageUrl(img.id)} alt={img.originalFilename ?? ""} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onDelete(img)}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.localId} className="relative aspect-square overflow-hidden rounded-md border">
              <img src={p.previewUrl} alt="" className="h-full w-full object-cover opacity-50" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                {p.status === "uploading" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <CloudOff className="h-5 w-5 text-white" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
