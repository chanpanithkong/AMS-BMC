"use client";

import { Eye, FileText, ImageIcon, Paperclip, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFormatters } from "@/lib/api/hooks";
import type { Attachment } from "@/lib/api/types/common";
import { cn } from "@/lib/utils";

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const DEFAULT_MAX_MB = 10;

const isImage = (type: string) => type.startsWith("image/");
const sizeText = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  maxSizeMb?: number;
  disabled?: boolean;
}

/** Drag-and-drop or browse for PDFs and images; rejects other types and oversized files. */
export function FileDropzone({ onFiles, maxSizeMb = DEFAULT_MAX_MB, disabled }: FileDropzoneProps) {
  const t = useTranslations("files.attachments");
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const inputId = useId();

  const accept = (list: FileList | null) => {
    const ok: File[] = [];
    for (const file of Array.from(list ?? [])) {
      if (!ACCEPTED.includes(file.type)) toast.error(t("badType", { name: file.name }));
      else if (file.size > maxSizeMb * 1_048_576) toast.error(t("tooLarge", { name: file.name, size: maxSizeMb }));
      else ok.push(file);
    }
    if (ok.length) onFiles(ok);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) accept(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors",
        over && "border-primary bg-primary/5",
        disabled && "opacity-50",
      )}
    >
      <Upload className="size-5 text-muted-foreground" aria-hidden />
      <p>
        {t("drop")}{" "}
        <label htmlFor={inputId} className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline focus-within:underline">
          {t("browse")}
          <input
            ref={input}
            id={inputId}
            type="file"
            multiple
            accept={ACCEPTED.join(",")}
            disabled={disabled}
            className="sr-only"
            onChange={(e) => {
              accept(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </p>
      <p className="text-xs text-muted-foreground">{t("hint", { size: maxSizeMb })}</p>
    </div>
  );
}

interface PdfPreviewProps {
  url: string | null | undefined;
  title?: string;
  /** DRAFT watermark for unposted documents (SRS §15.4). */
  draft?: boolean;
  className?: string;
}

/** Inline PDF preview with an optional DRAFT watermark (SRS SCR-09). */
export function PdfPreview({ url, title, draft, className }: PdfPreviewProps) {
  const t = useTranslations("files.pdf");
  return (
    <div className={cn("relative overflow-hidden rounded-lg border bg-muted/30", className)}>
      {url ? (
        <iframe src={url} title={title ?? t("title")} className="h-full min-h-96 w-full" />
      ) : (
        <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">{t("unavailable")}</div>
      )}
      {draft && (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-bold tracking-widest text-destructive/20 select-none"
          style={{ transform: "rotate(-30deg)" }}
          data-testid="draft-watermark"
        >
          {t("draft")}
        </span>
      )}
    </div>
  );
}

interface AttachmentPanelProps {
  attachments: Attachment[];
  /** Upload handler; omit (or set readOnly) for posted records. */
  onUpload?: (files: File[]) => void;
  onRemove?: (attachment: Attachment) => void;
  readOnly?: boolean;
  maxSizeMb?: number;
}

/** Attachments of a document: drag-and-drop upload, list, and preview of images and PDFs (SRS §14.5). */
export function AttachmentPanel({ attachments, onUpload, onRemove, readOnly, maxSizeMb }: AttachmentPanelProps) {
  const t = useTranslations("files.attachments");
  const format = useFormatters();
  const [preview, setPreview] = useState<Attachment | null>(null);

  return (
    <section aria-label={t("title")} className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Paperclip className="size-4" aria-hidden />
        {t("title")}
        <span className="font-normal text-muted-foreground">({attachments.length})</span>
      </h3>
      {!readOnly && onUpload && <FileDropzone onFiles={onUpload} maxSizeMb={maxSizeMb} />}
      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {attachments.map((file) => (
            <li key={file.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
              {isImage(file.content_type) ? <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{file.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {sizeText(file.size)} · {file.uploaded_by} · {format.dateTime(file.uploaded_at)}
                </p>
              </div>
              {file.url && (
                <Button variant="ghost" size="icon" onClick={() => setPreview(file)} aria-label={t("preview", { name: file.file_name })}>
                  <Eye aria-hidden />
                </Button>
              )}
              {!readOnly && onRemove && (
                <Button variant="ghost" size="icon" onClick={() => onRemove(file)} aria-label={t("remove", { name: file.file_name })}>
                  <Trash2 aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.file_name}</DialogTitle>
            <DialogDescription>{preview && sizeText(preview.size)}</DialogDescription>
          </DialogHeader>
          {preview?.url && isImage(preview.content_type) ? (
            // eslint-disable-next-line @next/next/no-img-element -- attachment URLs are short-lived signed links, not optimisable assets
            <img src={preview.url} alt={preview.file_name} className="max-h-[70vh] w-full rounded-lg object-contain" />
          ) : (
            <PdfPreview url={preview?.url} title={preview?.file_name} className="h-[70vh]" />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Object URL for a file picked in the browser, released when no longer needed. */
export function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const created = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is an external resource tied to this effect's lifetime
    setUrl(created);
    return () => {
      URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [file]);
  return url;
}
