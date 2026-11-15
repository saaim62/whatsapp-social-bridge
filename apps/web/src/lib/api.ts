import { getSession } from 'next-auth/react';
import { useDemoStore } from './demo-store';
import { demoFetch } from './demo-data';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  // Demo mode (logged-out visitor): serve sample data, gate real actions.
  if (useDemoStore.getState().active) {
    return demoFetch(url, options);
  }

  const session: any = await getSession();

  // No session = demo mode, even if the demo flag hasn't flipped yet.
  // On first paint a page's fetch can fire before AppShell's effect
  // activates demo mode; without this, that first fetch goes out
  // unauthenticated and the page renders empty until a later refetch.
  if (!session) {
    return demoFetch(url, options);
  }

  const headers = new Headers(options.headers || {});

  if (session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }

  // Ensure JSON content type for body if not set
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
