import { InvalidRangeHeaderError, RangeNotSatisfiableError, parseRangeHeader } from "@/lib/byte-range";
import { SourceFileNotFoundError, SourceTransientError } from "@/lib/source-errors";
import type { StorageProvider } from "@/lib/storage/provider";

const CACHE_CONTROL = "private, no-store, max-age=0";

export interface StorageAssetDescriptor {
  sourceId: string;
  fileName: string;
  contentType: string;
}

export async function storageAssetResponse(
  request: Request,
  providerSource: StorageProvider | (() => Promise<StorageProvider>),
  asset: StorageAssetDescriptor,
): Promise<Response> {
  let range;
  try {
    range = parseRangeHeader(request.headers.get("range"));
  } catch (error) {
    if (error instanceof InvalidRangeHeaderError) return rangeErrorResponse();
    throw error;
  }

  let providerId = "unresolved";
  try {
    const provider = typeof providerSource === "function" ? await providerSource() : providerSource;
    providerId = provider.id;
    if (!provider.openFile) throw new Error("De storageprovider ondersteunt nog geen streaming.");
    const opened = await provider.openFile(asset.sourceId, {
      range,
      headOnly: request.method === "HEAD",
      signal: request.signal,
    });
    const headers = new Headers({
      "Accept-Ranges": opened.acceptRanges ? "bytes" : "none",
      "Cache-Control": CACHE_CONTROL,
      "Content-Disposition": `inline; filename="${safeFileName(asset.fileName)}"`,
      "Content-Length": String(opened.contentLength),
      "Content-Type": asset.contentType || opened.contentType || "application/octet-stream",
    });
    if (opened.contentRange) headers.set("Content-Range", opened.contentRange);
    if (safeHeaderValue(opened.etag)) headers.set("ETag", opened.etag);
    if (safeHeaderValue(opened.lastModified)) headers.set("Last-Modified", opened.lastModified);

    if (request.method !== "HEAD" && !opened.body) throw new Error("De provider leverde geen bestandsstream.");
    return new Response(request.method === "HEAD" ? null : opened.body, {
      status: opened.contentRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    if (error instanceof RangeNotSatisfiableError) return rangeErrorResponse(error.totalLength);
    if (error instanceof SourceFileNotFoundError || isNodeError(error, "ENOENT")) {
      return new Response("Het bronbestand bestaat niet meer.", { status: 404, headers: noStoreHeaders() });
    }
    const transient = error instanceof SourceTransientError;
    console.error("Asset streaming failed.", { provider: providerId, errorType: error instanceof Error ? error.name : typeof error });
    return new Response("Het bronbestand kon tijdelijk niet worden gelezen.", {
      status: transient ? 503 : 502,
      headers: noStoreHeaders(),
    });
  }
}

export function mimeTypeForExtension(extension: string): string {
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function rangeErrorResponse(totalLength?: number): Response {
  const headers = noStoreHeaders();
  headers.set("Accept-Ranges", "bytes");
  if (totalLength !== undefined) headers.set("Content-Range", `bytes */${totalLength}`);
  return new Response("Het gevraagde bytebereik is niet beschikbaar.", { status: 416, headers });
}

function noStoreHeaders(): Headers {
  return new Headers({ "Cache-Control": CACHE_CONTROL });
}

function safeFileName(value: string): string {
  return value.replace(/["\r\n]/g, "");
}

function safeHeaderValue(value: string | undefined): value is string {
  return Boolean(value && !/[\r\n]/.test(value));
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}
