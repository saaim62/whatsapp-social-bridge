# WhatsApp Social Bridge

A full-stack prototype that automatically converts product messages received through WhatsApp into social media posts on Instagram and Facebook.

## Tech Stack
- **Frontend**: Next.js (App Router), Tailwind CSS
- **Backend**: NestJS, BullMQ (Redis)
- **Database**: PostgreSQL (Prisma ORM)
- **AI**: Gemini Flash 1.5 (Product extraction & Captions)

## QUICK START — 15 MINUTE TEST

Follow these exact commands to test the prototype locally in Development Mode without needing Meta Webhook approval:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start Infrastructure (PostgreSQL & Redis):**
   ```bash
   docker-compose up -d
   ```

3. **Initialize Database:**
   ```bash
   cd apps/api
   npx prisma db push
   npx prisma generate
   ```

4. **Start Backend API:**
   ```bash
   # From root directory
   npm run dev --workspace=apps/api
   ```
   *(API will start on http://localhost:3001)*

5. **Start Frontend App:**
   Open a new terminal and run:
   ```bash
   # From root directory
   npm run dev --workspace=apps/web
   ```
   *(Frontend will start on http://localhost:3000)*

6. **Test the Application:**
   - Open your browser to `http://localhost:3000`
   - Navigate to **Test Mode** (sidebar)
   - Upload multiple product images
   - Paste a sample WhatsApp message (e.g., "Nike Air Max 270\nPrice: Rs. 24,999\nSizes: 40, 41, 42")
   - Click **Simulate Incoming Webhook**
   - Navigate to **Products**, select the newly received product, watch it process, extract details via AI, and generate captions.
   - Click **Approve & Publish** to see it simulate publishing to Meta APIs!

---

## META CONFIGURATION

To connect the system to real Meta services, you must obtain API credentials and configure the application environments:

### Environment Variables (.env in `apps/api`)
```env
# Meta Configuration
WHATSAPP_ACCESS_TOKEN=your_whatsapp_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
WHATSAPP_VERIFY_TOKEN=your_secure_verify_token_here
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
INSTAGRAM_ACCOUNT_ID=your_ig_id
FACEBOOK_PAGE_ID=your_fb_page_id
FACEBOOK_PAGE_ACCESS_TOKEN=your_fb_token

# AI Configuration
LLM_API_KEY=your_gemini_api_key
```

### Steps to connect:
1. **WhatsApp Webhook:** Go to your Meta Developer Dashboard > WhatsApp > Configuration. Set the Callback URL to `https://your-domain.com/webhooks/whatsapp` and set the Verify Token to match `WHATSAPP_VERIFY_TOKEN`.
2. **Instagram & Facebook:** Ensure your Meta App has `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts` permissions. Replace the mocked `social.service.ts` implementations with real Axios requests to `graph.facebook.com`.
