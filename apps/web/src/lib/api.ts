import { getSession } from 'next-auth/react';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const session: any = await getSession();
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
