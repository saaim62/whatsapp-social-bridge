# DropRoute Web

Next.js dashboard for DropRoute: review product batches pulled from
WhatsApp sources, edit extracted products, and publish to Facebook and
Instagram via the Meta Graph API.

## Run

From the repo root:

```bash
npm install
npm run dev        # web on port 3000
```

The dashboard talks to the API in `apps/api` (`NEXT_PUBLIC_API_URL`).
Authentication uses NextAuth; its routes live under `src/app/api/auth`.
