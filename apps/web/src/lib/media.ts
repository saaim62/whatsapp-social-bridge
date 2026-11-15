import { API_URL } from '@/lib/api';

/**
 * Resolve the display URL for a media asset (P1-5).
 *
 * Uploads are no longer served from a public static path. The API
 * attaches a short-lived signed `mediaUrl` to assets that have a
 * local file, and the dashboard loads media through it. Fallbacks,
 * in order:
 *   1. mediaUrl   — signed URL issued by the API (local files)
 *   2. originalUrl — external object URL (demo assets, R2-only media)
 *   3. /api/media/:id — the JWT-guarded endpoint (older API responses
 *      that carry an id + localPath but no mediaUrl)
 *   4. legacy static path (last resort for very old cached data)
 */
export function mediaSrcFor(m: any): string | null {
  if (!m) return null;
  if (m.mediaUrl) return m.mediaUrl;
  if (m.originalUrl) return m.originalUrl;
  if (m.localPath && m.id) return `${API_URL}/api/media/${m.id}`;
  if (m.localPath) return `${API_URL}/${m.localPath}`;
  return null;
}
