import { getPublicAsset } from "@/lib/repositories";
import { getStorageProvider } from "@/lib/storage";

const mimeTypes: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getPublicAsset(id);
  if (!asset) return new Response("Niet gevonden.", { status: 404 });

  try {
    const content = await getStorageProvider().readFile(asset.relativePath);
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": mimeTypes[asset.extension] ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${asset.fileName.replaceAll('"', "")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("Het bronbestand kon niet worden gelezen.", { status: 404 });
  }
}
