import { ref } from 'vue';
import { useNotify } from './useNotify';

export interface BatchDownloadOptions {
  url: string;
  fallbackFileName: string;
  singular: string;
  plural: string;
}

const REASONS: Record<string, string> = {
  CANCELLED: 'cancelled',
  PDF_NOT_READY: 'PDF not ready',
  NOT_FOUND: 'not found',
};

function fileNameFrom(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename="(.+)"/);
  return match ? match[1] : fallback;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Downloads the PDFs of several documents as one ZIP. */
export function useBatchDownload(options: BatchDownloadOptions) {
  const notify = useNotify();
  const downloading = ref(false);

  /** Resolves with the ids the server rejected, so the caller can deselect them. */
  async function download(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    downloading.value = true;
    try {
      const res = await fetch(options.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; ids?: unknown };
        if (Array.isArray(body.ids)) {
          const rejected = body.ids as number[];
          const count = rejected.length;
          const reason = REASONS[body.error ?? ''] ?? 'invalid';
          notify.error(
            `${count} ${count > 1 ? options.plural : options.singular} cannot be downloaded: ${reason}. ${count > 1 ? 'They have' : 'It has'} been deselected.`,
          );
          return rejected;
        }
        notify.error('Download failed. Please try again.');
        return [];
      }
      saveBlob(
        await res.blob(),
        fileNameFrom(res.headers.get('Content-Disposition'), options.fallbackFileName),
      );
      return [];
    } catch {
      notify.error('Download failed. Please try again.');
      return [];
    } finally {
      downloading.value = false;
    }
  }

  return { download, downloading };
}
