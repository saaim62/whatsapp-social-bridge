# DropRoute API

NestJS backend for DropRoute: WhatsApp (Baileys) ingestion, product batch
extraction (Gemini), media processing, and Meta Graph API publishing.

## Run

From the repo root:

```bash
npm install
npm run dev        # API on port 3001
```

Production runs via Docker — see the deployment's `docker-compose.prod.yml`.

## Notes

- Database schema is managed with Prisma (`prisma/schema.prisma`); this
  project uses `prisma db push` rather than checked-in migrations.
- The OCR worker is a separate Python service: `ocr_server.py` in this
  folder. The API reaches it via `REMOTE_OCR_SERVER_URL`.
