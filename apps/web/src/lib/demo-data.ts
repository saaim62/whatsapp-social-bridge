import { useDemoStore } from "./demo-store";

/**
 * Demo mode data + fetch router.
 *
 * Logged-out visitors get the real DropRoute UI fed by this sample
 * catalogue — real product photos, real prices, the full pipeline —
 * so they can see exactly how the product looks and works. Reads are
 * served locally; writes never execute, they open the auth prompt.
 */

const img = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=80`;

const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

const media = (batchId: string, ids: string[]) =>
  ids.map((id, i) => ({
    id: `${batchId}-m${i + 1}`,
    mimeType: "image/jpeg",
    originalUrl: img(id),
    localPath: null,
    isProcessing: false,
  }));

export const DEMO_BATCHES: any[] = [
  {
    id: "demo-1",
    status: "READY",
    createdAt: minsAgo(12),
    senderName: "GRAND WATCHES (ONLINE)",
    senderId: "120363028475@g.us",
    rawText:
      "🔥 NEW STOCK ARRIVED 🔥\nChronograph Watch Leather Strap — sirf Rs. 1850/-\nPremium quality, box packing available\nBulk rates for resellers. Order on WhatsApp 📲",
    extractedData: {
      product_name: "Chronograph Watch — Leather Strap",
      price: "Rs. 1,850",
      selling_price: "Rs. 2,499",
      selling_price_value: 2499,
    },
    generatedContent: {
      instagramCaption:
        "⌚ Chronograph Watch — Leather Strap\n\nPremium look, honest price. Yours for {{PRICE}} only!\n\n📦 Cash on Delivery — all over Pakistan\n📩 DM to order\n\n#watchesofinstagram #mensstyle #chronograph #pakistanishopping #onlineshoppingpk",
      facebookCaption:
        "⌚ Chronograph Watch — Leather Strap\nPremium quality with box packing. Price: {{PRICE}}\nCash on Delivery available. Inbox to order!",
      storyText: "NEW ARRIVAL 🔥 Chronograph Watch — {{PRICE}}",
    },
    mediaAssets: media("demo-1", [
      "1523275335684-37898b6baf30",
      "1524592094714-0f0654e20314",
      "1434056886845-dac89ffe9b56",
      "1547996160-81dfa63595aa",
    ]),
    publications: [],
  },
  {
    id: "demo-2",
    status: "READY",
    createdAt: minsAgo(38),
    senderName: "Karachi Shoes Hub",
    senderId: "120363091122@g.us",
    rawText:
      "Running Shoes Red Edition 🔴\nSizes UK 6–11 available\nWholesale price Rs. 3200 fix\nRetailers rabta karein, stock limited hai ⚡",
    extractedData: {
      product_name: "Running Shoes — Red, UK 9",
      price: "Rs. 3,200",
      selling_price: "Rs. 4,299",
      selling_price_value: 4299,
    },
    generatedContent: {
      instagramCaption:
        "👟 Running Shoes — Red Edition\n\nLightweight, breathable, built for daily miles. Get yours for {{PRICE}}!\n\nSizes UK 6–11\n📦 COD available nationwide\n\n#runningshoes #sneakerspk #karachi #fitnesspk #shoestagram",
      facebookCaption:
        "👟 Running Shoes — Red Edition (UK 6–11)\nWholesale quality at {{PRICE}}. Cash on Delivery available. Inbox to order!",
      storyText: "JUST LANDED 👟 Red Runners — {{PRICE}}",
    },
    mediaAssets: media("demo-2", [
      "1542291026-7eec264c27ff",
      "1600185365483-26d7a4cc7519",
      "1549298916-b41d501d3772",
    ]),
    publications: [],
  },
  {
    id: "demo-3",
    status: "READY",
    createdAt: minsAgo(64),
    senderName: "Tech Gadgets PK",
    senderId: "120363055781@g.us",
    rawText:
      "Wireless Headphones Studio Sound 🎧\n40 hours battery, deep bass\nDealer price: Rs. 4450\n1 year warranty ke sath ✅",
    extractedData: {
      product_name: "Wireless Headphones — Studio Sound",
      price: "Rs. 4,450",
      selling_price: "Rs. 5,999",
      selling_price_value: 5999,
    },
    generatedContent: {
      instagramCaption:
        "🎧 Wireless Headphones — Studio Sound\n\n40-hour battery. Bass you can feel. Only {{PRICE}} with 1-year warranty!\n\n📦 Cash on Delivery\n📩 DM to order\n\n#headphones #techpk #gadgets #wireless #musiclovers",
      facebookCaption:
        "🎧 Wireless Headphones — Studio Sound\n40h battery, deep bass, 1-year warranty. Price: {{PRICE}}. Inbox to order!",
      storyText: "STUDIO SOUND 🎧 Now {{PRICE}}",
    },
    mediaAssets: media("demo-3", [
      "1505740420928-5e560c06d30e",
      "1583394838336-acd977736f90",
      "1546435770-a3e426bf472b",
    ]),
    publications: [],
  },
  {
    id: "demo-4",
    status: "APPROVED",
    createdAt: minsAgo(130),
    senderName: "Tech Gadgets PK",
    senderId: "120363055781@g.us",
    rawText:
      "Smart Watch Series 9 — 45mm ⌚\nAMOLED display, calls + notifications\nRs. 6999 dealer rate, market 9500 hai",
    extractedData: {
      product_name: "Smart Watch Series 9 — 45mm",
      price: "Rs. 6,999",
      selling_price: "Rs. 9,450",
      selling_price_value: 9450,
    },
    generatedContent: {
      instagramCaption:
        "⌚ Smart Watch Series 9 — 45mm AMOLED\n\nCalls, notifications, full health tracking. Yours for {{PRICE}}!\n\n📦 COD nationwide\n\n#smartwatch #techgadgets #wearables #pakistan",
      facebookCaption:
        "⌚ Smart Watch Series 9 (45mm) — AMOLED display, calls + health tracking. Price: {{PRICE}}. Inbox to order!",
      storyText: "SERIES 9 ⌚ AMOLED — {{PRICE}}",
    },
    mediaAssets: media("demo-4", [
      "1546868871-7041f2a55e12",
      "1579586337278-3befd40fd17a",
    ]),
    publications: [],
  },
  {
    id: "demo-5",
    status: "PUBLISHED",
    createdAt: minsAgo(320),
    senderName: "Fashion Wholesale LHR",
    senderId: "120363077310@g.us",
    rawText:
      "Aviator Sunglasses UV400 😎\nMetal frame, premium finishing\nRs. 950 wholesale — last 200 pieces",
    extractedData: {
      product_name: "Aviator Sunglasses — UV400",
      price: "Rs. 950",
      selling_price: "Rs. 1,299",
      selling_price_value: 1299,
    },
    generatedContent: {
      instagramCaption:
        "😎 Aviator Sunglasses — UV400\n\nThe classic frame, done right. Just {{PRICE}}!\n\n📦 Cash on Delivery\n\n#aviators #sunglasses #summerstyle #fashionpk",
      facebookCaption:
        "😎 Aviator Sunglasses UV400 — metal frame, premium finish. Price: {{PRICE}}. Inbox to order!",
      storyText: "AVIATORS 😎 {{PRICE}} only",
    },
    mediaAssets: media("demo-5", [
      "1572635196237-14b3f281503f",
      "1511499767150-a48a237f0083",
    ]),
    publications: [],
  },
  {
    id: "demo-6",
    status: "PUBLISHED",
    createdAt: minsAgo(480),
    senderName: "Fashion Wholesale LHR",
    senderId: "120363077310@g.us",
    rawText:
      "Ladies Handbag Tan Leather 👜\nOriginal leather, imported stitching\nWholesale Rs. 2850 — boutiques ke liye best margin",
    extractedData: {
      product_name: "Ladies Handbag — Tan Leather",
      price: "Rs. 2,850",
      selling_price: "Rs. 3,850",
      selling_price_value: 3850,
    },
    generatedContent: {
      instagramCaption:
        "👜 Ladies Handbag — Tan Leather\n\nReal leather, imported stitching, timeless shape. Yours for {{PRICE}}.\n\n📦 COD available\n📩 DM to order\n\n#handbag #leatherbag #ladiesfashion #boutiquepk",
      facebookCaption:
        "👜 Ladies Handbag — Tan Leather. Original leather, imported stitching. Price: {{PRICE}}. Inbox to order!",
      storyText: "TAN LEATHER 👜 {{PRICE}}",
    },
    mediaAssets: media("demo-6", [
      "1584917865442-de89df76afd3",
      "1548036328-c9fa89d128fa",
    ]),
    publications: [],
  },
  {
    id: "demo-7",
    status: "PROCESSING",
    createdAt: minsAgo(4),
    senderName: "GRAND WATCHES (ONLINE)",
    senderId: "120363028475@g.us",
    rawText:
      "Eau de Parfum — Oud 100ml 🌙\nLong lasting, Arabic oud blend\nDealer price Rs. 5500",
    extractedData: {
      product_name: "Eau de Parfum — Oud, 100ml",
      price: "Rs. 5,500",
      selling_price: "Rs. 7,425",
      selling_price_value: 7425,
    },
    generatedContent: {
      instagramCaption: "",
      facebookCaption: "",
      storyText: "",
    },
    mediaAssets: media("demo-7", [
      "1541643600914-78b084683601",
      "1594035910387-fea47794261f",
    ]),
    publications: [],
  },
  {
    id: "demo-8",
    status: "FAILED",
    createdAt: minsAgo(1500),
    senderName: "Karachi Shoes Hub",
    senderId: "120363091122@g.us",
    rawText: "Leather Wallet Bifold — Rs. 1150",
    extractedData: {
      product_name: "Leather Wallet — Bifold",
      price: "Rs. 1,150",
      selling_price: "Rs. 1,550",
      selling_price_value: 1550,
    },
    generatedContent: {
      instagramCaption: "",
      facebookCaption: "",
      storyText: "",
    },
    mediaAssets: media("demo-8", ["1627123424574-724758594e93"]),
    publications: [],
  },
];

export const DEMO_SOURCES: any[] = [
  { id: "demo-src-1", name: "GRAND WATCHES (ONLINE)", jid: "120363028475@g.us", type: "GROUP", isEnabled: true },
  { id: "demo-src-2", name: "Karachi Shoes Hub", jid: "120363091122@g.us", type: "GROUP", isEnabled: true },
  { id: "demo-src-3", name: "Tech Gadgets PK", jid: "120363055781@g.us", type: "CHANNEL", isEnabled: true },
  { id: "demo-src-4", name: "Fashion Wholesale LHR", jid: "120363077310@g.us", type: "GROUP", isEnabled: false },
];

export const DEMO_SETTINGS: any = {
  isSyncActive: true,
  historySyncDepthHours: 24,
  marginType: "PERCENT",
  marginValue: 35,
  priceRounding: 50,
  captionFooter: "📦 DM to order — Cash on Delivery available all over Pakistan 🇵🇰",
};

export const DEMO_WA_STATUS: any = {
  isReady: true,
  phoneNumber: "+92 300 1234567",
  qrUrl: null,
};

export const DEMO_SOCIAL_ACCOUNTS: any[] = [
  {
    id: "demo-meta",
    platform: "META",
    facebookPageId: "109283746510",
    facebookPageName: "Demo Store PK",
    instagramUsername: "demostore.pk",
  },
];

function actionLabelFor(path: string): string {
  if (path.includes("publish")) return "publish";
  if (path.includes("approve")) return "approve";
  if (path.includes("delete")) return "delete";
  if (path.includes("oauth")) return "connect Facebook & Instagram";
  if (path.includes("whatsapp")) return "manage WhatsApp";
  if (path.includes("sources")) return "change your sources";
  if (path.includes("settings")) return "save settings";
  if (path.includes("media")) return "edit media";
  if (path.includes("rename")) return "rename";
  if (path.includes("send")) return "send";
  return "do this";
}

function fakeResponse(payload: any) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

/** Serves demo reads locally; turns every write into the auth prompt. */
export function demoFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();
  const path = url.replace(/^https?:\/\/[^/]+/, "");

  if (method !== "GET") {
    // Internal notification bookkeeping stays silent; everything else
    // is a real product action and asks the visitor to sign in.
    if (!path.includes("/api/notifications")) {
      useDemoStore.getState().openPrompt(actionLabelFor(path));
    }
    return Promise.resolve(fakeResponse({ success: true, demo: true }));
  }

  if (path.includes("/api/social/oauth/facebook")) {
    useDemoStore.getState().openPrompt("connect Facebook & Instagram");
    return Promise.resolve(fakeResponse({}));
  }
  if (path.includes("/api/batches/worker-status")) {
    return Promise.resolve(fakeResponse({ isWorkerOnline: true }));
  }
  const single = path.match(/\/api\/batches\/([^/?#]+)$/);
  if (single) {
    const batch = DEMO_BATCHES.find((b) => b.id === single[1]) || DEMO_BATCHES[0];
    return Promise.resolve(fakeResponse(batch));
  }
  if (path.includes("/api/batches")) {
    return Promise.resolve(fakeResponse(DEMO_BATCHES));
  }
  if (path.includes("/api/sources")) {
    return Promise.resolve(fakeResponse(DEMO_SOURCES));
  }
  if (path.includes("/api/settings")) {
    return Promise.resolve(fakeResponse(DEMO_SETTINGS));
  }
  if (path.includes("/api/whatsapp/status")) {
    return Promise.resolve(fakeResponse(DEMO_WA_STATUS));
  }
  if (path.includes("/api/social/accounts")) {
    return Promise.resolve(fakeResponse(DEMO_SOCIAL_ACCOUNTS));
  }
  if (path.includes("/api/notifications")) {
    return Promise.resolve(fakeResponse([]));
  }
  return Promise.resolve(fakeResponse({}));
}
