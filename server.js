require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const methodOverride = require("method-override");
const Stripe = require("stripe");
const { Pool } = require("pg");
const slugify = require("slugify");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const CANONICAL_PUBLIC_HOST = "www.myurlc.com";
const SITE_NAME = "myurlc.com";
const DEFAULT_META_DESCRIPTION = "Create a free link in bio page for your brand, business, or creator profile on myurlc.com. Publish links, collect leads, and grow organically.";
const REFERRAL_CODE_MAX_LENGTH = 12;
const BASE_URL = normalizeBaseUrl(process.env.BASE_URL || `http://localhost:${PORT}`);
const SESSION_SECRET = process.env.SESSION_SECRET || "dev_secret_change_me";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || "";
const OFFER_PRICE_DISPLAY = process.env.OFFER_PRICE_DISPLAY || "$1";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "info@myurlc.com";
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 7);
const PLAN_NAME = process.env.PLAN_NAME || "myurlc.com Pro";
const PLAN_PRICE_DISPLAY = process.env.PLAN_PRICE_DISPLAY || "$9/month";
const BILLING_PRICE_ID = process.env.BILLING_PRICE_ID || STRIPE_PRICE_ID;
const BILLING_CHECKOUT_MODE = process.env.BILLING_CHECKOUT_MODE || "payment";
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const DATABASE_SSL = String(process.env.DATABASE_SSL || "").trim().toLowerCase();
const STORE_SNAPSHOT_KEY = "primary";

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const dbPool = DATABASE_URL ? new Pool(buildDatabaseConnectionOptions()) : null;

const THEME_OPTIONS = [
  { value: "midnight", label: "Midnight Glass" },
  { value: "linen", label: "Linen Studio" },
  { value: "sunset", label: "Sunset Pop" }
];

const LINK_SECTION_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "offers", label: "Offers" },
  { value: "contact", label: "Contact" },
  { value: "social", label: "Social Icons" }
];

const SOCIAL_LINK_SUGGESTIONS = [
  { label: "Instagram", placeholder: "instagram.com/yourname" },
  { label: "Facebook", placeholder: "facebook.com/yourpage" },
  { label: "TikTok", placeholder: "tiktok.com/@yourname" },
  { label: "LinkedIn", placeholder: "linkedin.com/in/yourname" },
  { label: "YouTube", placeholder: "youtube.com/@yourchannel" },
  { label: "X (Twitter)", placeholder: "x.com/yourname" },
  { label: "WhatsApp", placeholder: "wa.me/15555555555" },
  { label: "Custom Link", placeholder: "yourdomain.com/anything" }
];

const THEME_ALIASES = {
  dark: "midnight",
  light: "linen"
};

const STATUS_OPTIONS = ["submitted", "in_review", "ready", "published", "draft"];
const PAYMENT_STATUS_OPTIONS = ["manual", "paid", "unpaid"];
const DEFAULT_LINK_SECTION = "featured";
const INITIAL_VISIBLE_LINK_ROWS = 6;
const MAX_LINKS = 20;
const STUDIO_LINK_ROWS = MAX_LINKS;
const PAGE_REVISION_LIMIT = Number(process.env.PAGE_REVISION_LIMIT || 25);
const PLAN_ACCESS_DAYS = Number(process.env.PLAN_ACCESS_DAYS || 30);
const REFERRAL_BONUS_MONTHS_MAX = Number(process.env.REFERRAL_BONUS_MONTHS_MAX || 12);
const FOUNDING_MEMBER_LIMIT = Number(process.env.FOUNDING_MEMBER_LIMIT || 500);
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const USERNAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_USERNAMES = new Set([
  "admin",
  "analytics",
  "api",
  "billing",
  "buy",
  "health",
  "intake",
  "login",
  "logout",
  "p",
  "public",
  "r",
  "ref",
  "signup",
  "studio",
  "thank-you",
  "uploads"
]);

const dataDir = fs.existsSync("/data") ? "/data" : path.join(__dirname, "data");
const uploadDir = path.join(dataDir, "uploads");
const dataFile = path.join(dataDir, "linkbio.json");
let activeStore = normalizeStore();
let storeLoadedFrom = "memory";
let databaseReady = false;
let databaseLastError = "";
let storePersistenceQueue = Promise.resolve();
const storeReadyPromise = initializeStore();

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadDir));

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 12,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  }
}));

app.use((req, res, next) => {
  const hostname = String(req.hostname || "").toLowerCase();
  if (hostname === "myurlc.com") {
    return res.redirect(301, `https://${CANONICAL_PUBLIC_HOST}${req.originalUrl}`);
  }

  return next();
});

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const safeBase = path
      .basename(file.originalname || "upload", extension)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 60) || "upload";
    cb(null, `${Date.now()}-${safeBase}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024
  },
  fileFilter(req, file, cb) {
    if (!file.mimetype) {
      return cb(new Error("Please upload a valid image or video file."));
    }

    if (file.fieldname === "background_image") {
      if (file.mimetype.startsWith("image/")) {
        return cb(null, true);
      }
      return cb(new Error("Background images must be image files."));
    }

    if (["profile_media", "profile_image"].includes(file.fieldname)) {
      if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
        return cb(null, true);
      }
      return cb(new Error("Profile media must be an image or video file."));
    }

    if (file.mimetype.startsWith("image/")) {
      return cb(null, true);
    }

    return cb(new Error("Please upload a valid image or video file."));
  }
});

const assetUpload = upload.fields([
  { name: "profile_media", maxCount: 1 },
  { name: "profile_image", maxCount: 1 },
  { name: "background_image", maxCount: 1 }
]);

function normalizeStore(store = {}) {
  return {
    users: Array.isArray(store.users) ? store.users : [],
    orders: Array.isArray(store.orders) ? store.orders : [],
    page_revisions: Array.isArray(store.page_revisions) ? store.page_revisions : [],
    usernames: Array.isArray(store.usernames) ? store.usernames : [],
    analytics_events: Array.isArray(store.analytics_events) ? store.analytics_events : [],
    leads: Array.isArray(store.leads) ? store.leads : [],
    support_tickets: Array.isArray(store.support_tickets) ? store.support_tickets : []
  };
}

function cloneStore(store = activeStore) {
  return JSON.parse(JSON.stringify(normalizeStore(store)));
}

function buildDatabaseConnectionOptions() {
  const useSsl = DATABASE_SSL === "require"
    || (DATABASE_SSL !== "disable" && !/localhost|127\.0\.0\.1/i.test(DATABASE_URL));

  return {
    connectionString: DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  };
}

function readStoreFromDisk() {
  try {
    if (!fs.existsSync(dataFile)) {
      return normalizeStore();
    }

    return normalizeStore(JSON.parse(fs.readFileSync(dataFile, "utf8")));
  } catch (error) {
    return normalizeStore();
  }
}

function persistStoreToDisk(store) {
  fs.writeFileSync(dataFile, JSON.stringify(syncStore(store), null, 2));
}

async function ensureDatabaseSchema() {
  if (!dbPool) {
    return;
  }

  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS app_store_snapshots (
      store_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function readStoreFromDatabase() {
  if (!dbPool) {
    return null;
  }

  const result = await dbPool.query(
    "SELECT payload FROM app_store_snapshots WHERE store_key = $1 LIMIT 1",
    [STORE_SNAPSHOT_KEY]
  );

  if (!result.rows[0] || !result.rows[0].payload) {
    return null;
  }

  return normalizeStore(result.rows[0].payload);
}

async function persistStoreToDatabase(store) {
  if (!dbPool) {
    return;
  }

  await dbPool.query(
    `
      INSERT INTO app_store_snapshots (store_key, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (store_key)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `,
    [STORE_SNAPSHOT_KEY, JSON.stringify(syncStore(store))]
  );
}

function queueDatabaseStoreWrite(store) {
  if (!dbPool) {
    return storePersistenceQueue;
  }

  const snapshot = cloneStore(store);
  storePersistenceQueue = storePersistenceQueue
    .then(async () => {
      await persistStoreToDatabase(snapshot);
      databaseReady = true;
      databaseLastError = "";
    })
    .catch((error) => {
      databaseReady = false;
      databaseLastError = error.message;
    });

  return storePersistenceQueue;
}

async function initializeStore() {
  const fileStore = readStoreFromDisk();
  activeStore = syncStore(fileStore);

  if (!fs.existsSync(dataFile)) {
    persistStoreToDisk(activeStore);
  }

  if (!dbPool) {
    storeLoadedFrom = fs.existsSync(dataFile) ? "volume-json" : "memory";
    return activeStore;
  }

  try {
    await ensureDatabaseSchema();
    const databaseStore = await readStoreFromDatabase();
    if (databaseStore) {
      activeStore = syncStore(databaseStore);
      storeLoadedFrom = "postgres";
      persistStoreToDisk(activeStore);
    } else {
      await persistStoreToDatabase(activeStore);
      storeLoadedFrom = fs.existsSync(dataFile) ? "volume-json-seeded-to-postgres" : "postgres-seeded";
    }

    databaseReady = true;
    databaseLastError = "";
  } catch (error) {
    databaseReady = false;
    databaseLastError = error.message;
    storeLoadedFrom = fs.existsSync(dataFile) ? "volume-json-fallback" : "memory-fallback";
  }

  return activeStore;
}

function readStore() {
  return cloneStore(activeStore);
}

function writeStore(store) {
  activeStore = syncStore(store);
  persistStoreToDisk(activeStore);
  queueDatabaseStoreWrite(activeStore);
  return cloneStore(activeStore);
}

function nextId(records) {
  return records.reduce((maxId, record) => Math.max(maxId, Number(record.id) || 0), 0) + 1;
}

function formatDateTime(value) {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return "";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function arrayify(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return [value];
}

function normalizeTheme(value) {
  const normalized = THEME_ALIASES[value] || value;
  return THEME_OPTIONS.some((option) => option.value === normalized) ? normalized : "midnight";
}

function sanitizeAccentColor(value) {
  const trimmed = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : "#2563eb";
}

function sanitizeLeadPrompt(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.slice(0, 140) : "Send me a quick message";
}

function normalizeBaseUrl(value) {
  const fallback = `http://localhost:${PORT}`;
  const raw = String(value || "").trim();
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === "myurlc.com" || hostname === CANONICAL_PUBLIC_HOST) {
      return `https://${CANONICAL_PUBLIC_HOST}`;
    }

    const useHttp = hostname === "localhost" || hostname === "127.0.0.1";
    const protocol = useHttp ? parsed.protocol : "https:";
    const port = parsed.port ? `:${parsed.port}` : "";
    return `${protocol}//${parsed.hostname}${port}`;
  } catch (error) {
    return fallback;
  }
}

function absoluteUrl(pathname = "/") {
  const raw = String(pathname || "").trim();
  if (!raw || raw === "/") {
    return BASE_URL;
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  return `${BASE_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function buildPublicPagePath(slug) {
  const normalized = normalizeUsername(slug);
  return normalized ? `/${normalized}` : "/";
}

function buildPublicLeadPath(slug) {
  const normalized = normalizeUsername(slug);
  return normalized ? `/${normalized}/lead` : "/lead";
}

function sanitizeMetaText(value, fallback = DEFAULT_META_DESCRIPTION, maxLength = 160) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  const text = normalized || fallback;

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function buildSeoData(overrides = {}) {
  return {
    metaDescription: sanitizeMetaText(overrides.metaDescription, DEFAULT_META_DESCRIPTION),
    canonicalUrl: overrides.canonicalUrl || BASE_URL,
    metaRobots: overrides.metaRobots || "index,follow",
    ogType: overrides.ogType || "website",
    ogImage: overrides.ogImage || "",
    structuredData: overrides.structuredData || null
  };
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatSitemapDate(value) {
  const parsed = parseDateValue(value);
  return parsed ? parsed.toISOString() : new Date().toISOString();
}

function buildHomeStructuredData() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: BASE_URL
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: BASE_URL,
      description: DEFAULT_META_DESCRIPTION
    }
  ];
}

function buildProfileStructuredData(order, description) {
  const sameAs = Array.isArray(order.social_links)
    ? order.social_links.map((link) => link.url).filter(Boolean).slice(0, 10)
    : [];
  const entityType = order.business_name ? "Organization" : "Person";
  const entity = {
    "@type": entityType,
    name: order.business_name || order.full_name || order.slug,
    description
  };

  if (sameAs.length > 0) {
    entity.sameAs = sameAs;
  }

  if (order.profile_media && order.profile_media_type === "image") {
    entity.image = absoluteUrl(order.profile_media);
  }

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `${order.business_name || order.full_name || order.slug} on ${SITE_NAME}`,
    url: order.public_url,
    description,
    mainEntity: entity
  };
}

function buildSitemapEntries() {
  const latestPublishedDate = listOrders()
    .filter((order) => order.is_published)
    .map((order) => formatSitemapDate(order.updated_at || order.created_at))
    .sort()
    .reverse()[0] || new Date().toISOString();

  const staticEntries = [
    { loc: absoluteUrl("/"), lastmod: latestPublishedDate, changefreq: "daily", priority: "1.0" },
    { loc: absoluteUrl("/signup"), lastmod: latestPublishedDate, changefreq: "weekly", priority: "0.9" },
    { loc: absoluteUrl("/buy"), lastmod: latestPublishedDate, changefreq: "weekly", priority: "0.8" }
  ];

  const profileEntries = listOrders()
    .filter((order) => order.is_published)
    .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime())
    .map((order) => ({
      loc: absoluteUrl(buildPublicPagePath(order.slug)),
      lastmod: formatSitemapDate(order.updated_at || order.created_at),
      changefreq: "weekly",
      priority: "0.7"
    }));

  return [...staticEntries, ...profileEntries];
}

function makeSlug(text) {
  return slugify(text || "", { lower: true, strict: true, trim: true });
}

function normalizeUsername(value) {
  return makeSlug(String(value || "").trim());
}

function isReservedUsername(slug) {
  return RESERVED_USERNAMES.has(String(slug || "").trim().toLowerCase());
}

function validateExplicitUsername(value) {
  const raw = String(value || "").trim();
  const normalized = normalizeUsername(raw);

  if (!raw) {
    return {
      slug: null,
      error: "Enter a username using lowercase letters, numbers, and hyphens."
    };
  }

  if (!normalized) {
    return {
      slug: null,
      error: "Usernames can only use lowercase letters, numbers, and hyphens."
    };
  }

  if (normalized.length < USERNAME_MIN_LENGTH || normalized.length > USERNAME_MAX_LENGTH) {
    return {
      slug: null,
      error: `Usernames must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters long. Try "${normalized}".`
    };
  }

  if (!USERNAME_PATTERN.test(normalized)) {
    return {
      slug: null,
      error: "Usernames can only use lowercase letters, numbers, and single hyphens."
    };
  }

  if (raw !== normalized) {
    return {
      slug: null,
      error: `Use only lowercase letters, numbers, and hyphens in the username. Try "${normalized}".`
    };
  }

  return {
    slug: normalized,
    error: null
  };
}

function buildUsernameRegistry(orders = []) {
  const seen = new Map();

  orders.forEach((order) => {
    const slug = normalizeUsername(order.slug);
    if (!slug || isReservedUsername(slug) || seen.has(slug)) {
      return;
    }

    seen.set(slug, {
      slug,
      order_id: order.id || null,
      owner_user_id: order.owner_user_id || null,
      business_name: order.business_name || "",
      updated_at: order.created_at || new Date().toISOString()
    });
  });

  return Array.from(seen.values()).sort((left, right) => left.slug.localeCompare(right.slug));
}

function syncUsernameRegistry(store) {
  const normalized = normalizeStore(store);
  return {
    ...normalized,
    usernames: buildUsernameRegistry(normalized.orders)
  };
}

function buildReferralSeedList(user, orders = []) {
  const latestOrder = [...(Array.isArray(orders) ? orders : [])]
    .sort((left, right) => {
      return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
    })[0];

  return [
    latestOrder?.slug || "",
    getPrimaryReferralSeed(user.name),
    user.business_name || "",
    user.name || ""
  ];
}

function buildReferralCodeCandidates(seeds = []) {
  const seen = new Set();
  return arrayify(seeds)
    .map((seed) => sanitizeReferralCode(seed).slice(0, REFERRAL_CODE_MAX_LENGTH))
    .filter((candidate) => {
      if (!candidate || seen.has(candidate)) {
        return false;
      }

      seen.add(candidate);
      return true;
    });
}

function reserveAvailableReferralCode(existingCodes, seeds = []) {
  const candidates = buildReferralCodeCandidates(seeds);

  for (const candidate of candidates) {
    if (!existingCodes.has(candidate)) {
      return candidate;
    }

    for (let counter = 2; counter < 1000; counter += 1) {
      const suffix = String(counter);
      const base = candidate.slice(0, Math.max(1, REFERRAL_CODE_MAX_LENGTH - suffix.length));
      const nextCandidate = `${base}${suffix}`;
      if (!existingCodes.has(nextCandidate)) {
        return nextCandidate;
      }
    }
  }

  let randomCandidate = "";
  while (!randomCandidate || existingCodes.has(randomCandidate)) {
    randomCandidate = `MY${crypto.randomBytes(5).toString("hex").toUpperCase()}`.slice(0, REFERRAL_CODE_MAX_LENGTH);
  }

  return randomCandidate;
}

function shouldUpgradeLegacyReferralCode(currentCode, preferredCode) {
  if (!currentCode || !preferredCode || currentCode === preferredCode) {
    return false;
  }

  return currentCode.length <= 6 && preferredCode.length > currentCode.length && preferredCode.startsWith(currentCode);
}

function getPrimaryReferralSeed(value) {
  return String(value || "").trim().split(/\s+/)[0] || "";
}

function syncReferralCodes(store) {
  const normalized = normalizeStore(store);
  const ordersByUserId = normalized.orders.reduce((map, order) => {
    const key = String(order.owner_user_id || "");
    if (!key) {
      return map;
    }

    const bucket = map.get(key) || [];
    bucket.push(order);
    map.set(key, bucket);
    return map;
  }, new Map());
  const existingCodes = new Set();

  const users = normalized.users.map((user) => {
    const currentCode = sanitizeReferralCode(user.referral_code).slice(0, REFERRAL_CODE_MAX_LENGTH);
    const referralSeeds = buildReferralSeedList(user, ordersByUserId.get(String(user.id)) || []);
    const preferredCode = buildReferralCodeCandidates(referralSeeds)[0] || "";
    let nextCode = currentCode;

    if (!nextCode) {
      nextCode = reserveAvailableReferralCode(existingCodes, referralSeeds);
    } else if (shouldUpgradeLegacyReferralCode(nextCode, preferredCode) && !existingCodes.has(preferredCode)) {
      nextCode = preferredCode;
    } else if (existingCodes.has(nextCode)) {
      nextCode = reserveAvailableReferralCode(existingCodes, [nextCode, ...referralSeeds]);
    }

    existingCodes.add(nextCode);
    return {
      ...user,
      referral_code: nextCode
    };
  });

  return {
    ...normalized,
    users
  };
}

function syncStore(store) {
  const normalized = syncFoundingMembers(syncReferralCodes(normalizeStore(store)));
  return {
    ...normalized,
    usernames: buildUsernameRegistry(normalized.orders)
  };
}

function syncFoundingMembers(store) {
  const normalized = normalizeStore(store);
  const users = [...normalized.users].map((user) => ({
    ...user,
    founding_member: Boolean(user.founding_member),
    founder_slot_number: Number(user.founder_slot_number) > 0 ? Number(user.founder_slot_number) : null,
    founding_member_granted_at: user.founding_member_granted_at || null
  }));
  const claimedSlots = new Set(
    users
      .filter((user) => user.founding_member && user.founder_slot_number)
      .map((user) => Number(user.founder_slot_number))
  );
  const eligibleUsers = users
    .filter((user) => !user.founding_member && !user.founder_slot_number)
    .sort((left, right) => {
      const leftTime = new Date(left.created_at || 0).getTime();
      const rightTime = new Date(right.created_at || 0).getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return Number(left.id || 0) - Number(right.id || 0);
    });

  let nextSlot = 1;
  const reserveNextSlot = () => {
    while (claimedSlots.has(nextSlot)) {
      nextSlot += 1;
    }
    return nextSlot;
  };

  eligibleUsers.forEach((user) => {
    if (claimedSlots.size >= FOUNDING_MEMBER_LIMIT) {
      return;
    }

    const slot = reserveNextSlot();
    user.founding_member = true;
    user.founder_slot_number = slot;
    user.founding_member_granted_at = user.founding_member_granted_at || user.created_at || new Date().toISOString();
    claimedSlots.add(slot);
    nextSlot += 1;
  });

  return {
    ...normalized,
    users
  };
}

function getFoundingOfferStats() {
  const founders = getUsers()
    .filter((user) => Boolean(user.founding_member))
    .sort((left, right) => {
      const leftSlot = Number(left.founder_slot_number || 0);
      const rightSlot = Number(right.founder_slot_number || 0);
      if (leftSlot !== rightSlot) {
        return leftSlot - rightSlot;
      }
      return Number(left.id || 0) - Number(right.id || 0);
    });

  const claimed = founders.length;
  const remaining = Math.max(0, FOUNDING_MEMBER_LIMIT - claimed);

  return {
    limit: FOUNDING_MEMBER_LIMIT,
    claimed,
    remaining,
    is_open: remaining > 0,
    next_slot: remaining > 0 ? claimed + 1 : null,
    founders
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseDateValue(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function maxDateValue(...values) {
  const candidates = values
    .map((value) => value instanceof Date ? value : parseDateValue(value))
    .filter(Boolean);

  if (candidates.length === 0) {
    return null;
  }

  return new Date(Math.max(...candidates.map((candidate) => candidate.getTime())));
}

function formatDate(value) {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return "";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatRelativeTime(value) {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return "";
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / (60 * 1000)));
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function normalizeBillingStatus(status) {
  const allowed = ["trialing", "active", "referral_active", "payment_required", "founding_member"];
  return allowed.includes(status) ? status : "trialing";
}

function toCustomerViewModel(user) {
  if (!user) {
    return null;
  }

  const createdAt = parseDateValue(user.created_at) || new Date();
  const trialStartedAt = parseDateValue(user.trial_started_at) || createdAt;
  const trialEndsAt = parseDateValue(user.trial_ends_at) || addDays(trialStartedAt, TRIAL_DAYS);
  const now = new Date();
  const referralBonusMonthsEarned = clampNumber(user.referral_bonus_months_earned, 0, REFERRAL_BONUS_MONTHS_MAX);
  const foundingMember = Boolean(user.founding_member);
  const founderSlotNumber = Number(user.founder_slot_number) > 0 ? Number(user.founder_slot_number) : null;
  const referralAccessEndsAt = addDays(trialEndsAt, referralBonusMonthsEarned * PLAN_ACCESS_DAYS);
  const legacyActive = normalizeBillingStatus(user.billing_status || "trialing") === "active" && !user.paid_access_ends_at;
  const paidAccessEndsAt = parseDateValue(user.paid_access_ends_at) || (
    legacyActive
      ? addDays(maxDateValue(now, user.paid_at, trialEndsAt) || now, PLAN_ACCESS_DAYS)
      : null
  );
  const accessEndsAt = foundingMember ? null : (maxDateValue(trialEndsAt, referralAccessEndsAt, paidAccessEndsAt) || trialEndsAt);
  const trialActive = now.getTime() <= trialEndsAt.getTime();
  const paidActive = paidAccessEndsAt ? now.getTime() <= paidAccessEndsAt.getTime() : false;
  const referralActive = !paidActive && !trialActive && now.getTime() <= referralAccessEndsAt.getTime();
  const billingStatus = foundingMember
    ? "founding_member"
    : (paidActive
    ? "active"
    : (trialActive ? "trialing" : (referralActive ? "referral_active" : "payment_required")));
  const trialDaysRemaining = trialActive
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;
  const referralDaysRemaining = referralActive
    ? Math.max(0, Math.ceil((referralAccessEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;
  const paidDaysRemaining = paidActive && paidAccessEndsAt
    ? Math.max(0, Math.ceil((paidAccessEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;
  const successfulReferralsCount = countReferralSignupsForUser(user.id);
  const referralMonthsRemainingToEarn = Math.max(0, REFERRAL_BONUS_MONTHS_MAX - referralBonusMonthsEarned);

  return {
    ...user,
    trial_started_at: trialStartedAt.toISOString(),
    trial_ends_at: trialEndsAt.toISOString(),
    referral_access_ends_at: referralAccessEndsAt.toISOString(),
    paid_access_ends_at: paidAccessEndsAt ? paidAccessEndsAt.toISOString() : null,
    access_ends_at: accessEndsAt ? accessEndsAt.toISOString() : null,
    billing_status: billingStatus,
    founding_member: foundingMember,
    founder_slot_number: founderSlotNumber,
    founding_member_granted_at: user.founding_member_granted_at || null,
    trial_expired: !trialActive,
    trial_days_remaining: trialDaysRemaining,
    referral_days_remaining: referralDaysRemaining,
    paid_days_remaining: paidDaysRemaining,
    referral_bonus_months_earned: referralBonusMonthsEarned,
    successful_referrals_count: successfulReferralsCount,
    referral_months_remaining_to_earn: referralMonthsRemainingToEarn,
    referral_code: sanitizeReferralCode(user.referral_code),
    has_active_plan: paidActive || foundingMember,
    has_lifetime_plan: foundingMember,
    has_bonus_access: referralActive,
    can_access_studio: foundingMember || now.getTime() <= accessEndsAt.getTime(),
    formatted_trial_end: formatDate(trialEndsAt.toISOString()),
    formatted_referral_access_end: formatDate(referralAccessEndsAt.toISOString()),
    formatted_paid_access_end: foundingMember ? "Lifetime" : (paidAccessEndsAt ? formatDate(paidAccessEndsAt.toISOString()) : ""),
    formatted_access_end: foundingMember ? "Lifetime" : formatDate(accessEndsAt.toISOString()),
    formatted_founding_member_granted_at: user.founding_member_granted_at ? formatDate(user.founding_member_granted_at) : "",
    referral_share_url: sanitizeReferralCode(user.referral_code) ? `${BASE_URL}/ref/${encodeURIComponent(sanitizeReferralCode(user.referral_code))}` : ""
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return false;
  }

  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) {
    return false;
  }

  try {
    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    if (actual.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(actual, expected);
  } catch (error) {
    return false;
  }
}

function padLinks(links, minRows = STUDIO_LINK_ROWS) {
  const safeLinks = Array.isArray(links) ? links : [];
  return [
    ...safeLinks.map((link) => ({
      label: String(link?.label || ""),
      url: String(link?.url || ""),
      section: normalizeLinkSection(link?.section || inferLinkSection(link?.label, link?.url))
    })),
    ...Array.from({ length: Math.max(0, minRows - safeLinks.length) }, () => ({
      label: "",
      url: "",
      section: DEFAULT_LINK_SECTION
    }))
  ];
}

function readLinks(linksJson) {
  try {
    const parsed = JSON.parse(linksJson || "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((link) => ({
        label: String(link?.label || "").trim(),
        url: String(link?.url || "").trim(),
        section: normalizeLinkSection(link?.section || inferLinkSection(link?.label, link?.url))
      }))
      .filter((link) => link.label && link.url);
  } catch (error) {
    return [];
  }
}

function buildLinkRows(source, minRows = STUDIO_LINK_ROWS) {
  const labels = arrayify(source.link_label);
  const urls = arrayify(source.link_url);
  const sections = arrayify(source.link_section);
  const rowCount = Math.max(labels.length, urls.length, sections.length, minRows);

  return Array.from({ length: rowCount }, (_, index) => ({
    label: String(labels[index] || ""),
    url: String(urls[index] || ""),
    section: normalizeLinkSection(sections[index] || inferLinkSection(labels[index], urls[index]))
  }));
}

function normalizeLinkSection(value) {
  const candidate = String(value || "").trim().toLowerCase();
  if (LINK_SECTION_OPTIONS.some((option) => option.value === candidate)) {
    return candidate;
  }
  return DEFAULT_LINK_SECTION;
}

function getLinkSectionLabel(value) {
  return LINK_SECTION_OPTIONS.find((option) => option.value === value)?.label || "Featured";
}

function detectLinkPlatform(label, url) {
  const lowerLabel = String(label || "").toLowerCase();
  const lowerUrl = String(url || "").toLowerCase();

  if (lowerLabel.includes("instagram") || lowerUrl.includes("instagram.com")) {
    return "instagram";
  }
  if (lowerLabel.includes("facebook") || lowerUrl.includes("facebook.com")) {
    return "facebook";
  }
  if (lowerLabel.includes("tiktok") || lowerUrl.includes("tiktok.com")) {
    return "tiktok";
  }
  if (lowerLabel.includes("linkedin") || lowerUrl.includes("linkedin.com")) {
    return "linkedin";
  }
  if (lowerLabel.includes("youtube") || lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) {
    return "youtube";
  }
  if (lowerLabel === "x" || lowerLabel.includes("twitter") || lowerLabel.includes("x (twitter)") || lowerUrl.includes("x.com") || lowerUrl.includes("twitter.com")) {
    return "x";
  }
  if (lowerLabel.includes("whatsapp") || lowerUrl.includes("wa.me") || lowerUrl.includes("whatsapp.com")) {
    return "whatsapp";
  }
  if (lowerUrl.startsWith("mailto:") || lowerLabel.includes("email")) {
    return "email";
  }
  if (lowerUrl.startsWith("tel:") || lowerLabel.includes("call") || lowerLabel.includes("phone") || lowerLabel.includes("text")) {
    return "phone";
  }

  return "custom";
}

function inferLinkSection(label, url) {
  const platform = detectLinkPlatform(label, url);
  if (["instagram", "facebook", "tiktok", "linkedin", "youtube", "x", "whatsapp"].includes(platform)) {
    return "social";
  }

  const lowerLabel = String(label || "").toLowerCase();
  const lowerUrl = String(url || "").toLowerCase();
  if (
    platform === "email" ||
    platform === "phone" ||
    lowerLabel.includes("contact") ||
    lowerLabel.includes("message") ||
    lowerUrl.startsWith("mailto:") ||
    lowerUrl.startsWith("tel:")
  ) {
    return "contact";
  }

  if (
    lowerLabel.includes("shop") ||
    lowerLabel.includes("store") ||
    lowerLabel.includes("menu") ||
    lowerLabel.includes("book") ||
    lowerLabel.includes("pricing") ||
    lowerLabel.includes("service") ||
    lowerLabel.includes("offer")
  ) {
    return "offers";
  }

  return DEFAULT_LINK_SECTION;
}

function getPlatformIconText(platform) {
  return {
    instagram: "IG",
    facebook: "FB",
    tiktok: "TT",
    linkedin: "in",
    youtube: "YT",
    x: "X",
    whatsapp: "WA",
    email: "@",
    phone: "TL",
    custom: "GO"
  }[platform] || "GO";
}

function buildPhoneContactActions(phone) {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 7) {
    return [];
  }

  const smsTarget = raw.startsWith("+") ? `+${digits}` : digits;
  return [
    {
      platform: "text",
      label: "Text",
      href: `sms:${smsTarget}`,
      icon: "text"
    },
    {
      platform: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/${digits}`,
      icon: "whatsapp"
    }
  ];
}

function iconSvg(name) {
  const icons = {
    brand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.9 5.4L19 9.3l-4.1 3 1.6 5.3L12 14.4 7.5 17.6l1.6-5.3-4.1-3 5.1-1.9L12 2z" fill="currentColor"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5h4v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 14L19 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    subscribe: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a2.5 2.5 0 0 0 2.3-1.5h-4.6A2.5 2.5 0 0 0 12 21z" fill="currentColor"/><path d="M18 16H6l1.4-1.7V10a4.6 4.6 0 1 1 9.2 0v4.3L18 16z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    help: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h7a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3l4 0z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.4 9.2a2.7 2.7 0 0 1 5 .8c0 1.5-1.5 2.1-2.1 2.6-.5.4-.8.7-.8 1.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="16.9" r="1" fill="currentColor"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.1" cy="6.9" r="1" fill="currentColor"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 20v-6h2.4l.4-3h-2.8V9.2c0-.9.3-1.5 1.6-1.5h1.4V5.1c-.2 0-1-.1-2-.1-2 0-3.4 1.2-3.4 3.5V11H9v3h2.5v6h2z" fill="currentColor"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5c.7 1.2 1.8 2.1 3.2 2.4v2.4c-1.2 0-2.3-.4-3.2-1.1V14a4.5 4.5 0 1 1-4.5-4.5c.3 0 .5 0 .8.1V12a2.3 2.3 0 1 0 1.5 2.1V4.9h2.2z" fill="currentColor"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 8.7A1.4 1.4 0 1 0 7.2 6a1.4 1.4 0 0 0 0 2.7zM6 10.2h2.4V18H6v-7.8zM10 10.2h2.3v1.1h.1c.3-.6 1.1-1.4 2.4-1.4 2.5 0 2.9 1.6 2.9 3.8V18h-2.4v-3.8c0-.9 0-2.1-1.3-2.1s-1.5 1-1.5 2V18H10v-7.8z" fill="currentColor"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 8.5c-.2-.9-.9-1.6-1.8-1.8C16.7 6.3 12 6.3 12 6.3s-4.7 0-6.2.4c-.9.2-1.6.9-1.8 1.8-.4 1.5-.4 3.5-.4 3.5s0 2 .4 3.5c.2.9.9 1.6 1.8 1.8 1.5.4 6.2.4 6.2.4s4.7 0 6.2-.4c.9-.2 1.6-.9 1.8-1.8.4-1.5.4-3.5.4-3.5s0-2-.4-3.5z" fill="currentColor"/><path d="M10.3 14.7v-5.4l4.7 2.7-4.7 2.7z" fill="#fff"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h3.4l3 4.2L16 5h2.2l-4.7 5.5L19 19h-3.4l-3.2-4.6L8.4 19H6.1l5.1-6-5.2-8z" fill="currentColor"/></svg>',
    text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6.5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-4 3v-3H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 10h7M8.5 13h4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 0 0-6.9 12l-1.1 4 4.1-1.1A8 8 0 1 0 12 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.7 9.5c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .5.5l.4 1.1c.1.3.1.5-.1.7l-.3.4c-.1.1-.2.3 0 .6.2.4.9 1.4 2.1 1.9.3.1.5 0 .6-.1l.5-.5c.2-.2.4-.2.7-.1l1 .5c.3.1.4.3.4.5v.5c0 .2-.1.4-.4.6-.3.2-1 .5-1.8.3-1-.2-2.1-.9-3.4-2.2-1.5-1.5-2.2-3-2.3-4-.1-.7.2-1.4.5-1.8z" fill="currentColor"/></svg>',
    email: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 8l6.5 5 6.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.8 4.8h2.4l1.1 3.1-1.5 1.5c.8 1.6 2.1 2.9 3.7 3.7l1.5-1.5 3.1 1.1v2.4c0 .8-.7 1.5-1.5 1.5C10.1 16.6 7.4 13.9 7.4 8.4c0-.8.6-1.5 1.4-1.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    custom: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 12h16M12 4c2.2 2.2 3.3 5 3.3 8s-1.1 5.8-3.3 8c-2.2-2.2-3.3-5-3.3-8s1.1-5.8 3.3-8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6.5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="17.5" r="1.6" fill="currentColor"/></svg>'
  };

  return icons[name] || icons.brand;
}

function normalizeMediaType(value) {
  return value === "video" ? "video" : value === "image" ? "image" : null;
}

function getMediaTypeFromFile(file) {
  if (!file?.mimetype) {
    return null;
  }
  if (file.mimetype.startsWith("video/")) {
    return "video";
  }
  if (file.mimetype.startsWith("image/")) {
    return "image";
  }
  return null;
}

function getUploadedAsset(req, fieldName) {
  const files = req.files?.[fieldName];
  const file = Array.isArray(files) ? files[0] : null;
  if (!file) {
    return null;
  }

  return {
    url: `/uploads/${file.filename}`,
    type: getMediaTypeFromFile(file)
  };
}

function normalizeLinkUrl(value) {
  let candidate = String(value || "").trim();
  if (!candidate) {
    return "";
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) && !candidate.startsWith("mailto:")) {
    candidate = `mailto:${candidate}`;
  } else if (/^\+?[0-9()\-\s]{7,}$/.test(candidate) && !candidate.startsWith("tel:")) {
    const phone = candidate.replace(/[^\d+]/g, "");
    candidate = phone ? `tel:${phone}` : "";
  } else if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  if (!candidate) {
    return "";
  }

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) {
      return "";
    }
    return candidate;
  } catch (error) {
    return "";
  }
}

function parseLinks(body, options = {}) {
  const rows = buildLinkRows(body, options.minRows || 0);
  const links = [];

  rows.forEach((row) => {
    const label = row.label.trim();
    const url = normalizeLinkUrl(row.url);
    const section = normalizeLinkSection(row.section || inferLinkSection(label, url));

    if (label && url) {
      links.push({ label, url, section });
    }
  });

  return links.slice(0, MAX_LINKS);
}

function buildLinkCollections(source, options = {}) {
  const rows = Array.isArray(source) ? source : buildLinkRows(source, STUDIO_LINK_ROWS);
  const orderId = options.orderId || null;
  const links = rows
    .filter((row) => String(row.label || "").trim() || String(row.url || "").trim())
    .map((row, index) => {
      const label = String(row.label || "").trim() || "Untitled Link";
      const url = normalizeLinkUrl(row.url) || String(row.url || "").trim();
      const platform = detectLinkPlatform(label, url);
      const section = normalizeLinkSection(row.section || inferLinkSection(label, url));

      return {
        label,
        url,
        section,
        section_label: getLinkSectionLabel(section),
        platform,
        icon_text: getPlatformIconText(platform),
        href: orderId ? `/r/${orderId}/${index}` : (url || "#")
      };
    })
    .slice(0, MAX_LINKS);

  const populatedLinks = links.length > 0
    ? links
    : (options.includePlaceholder
      ? [{
          label: "Your first link",
          url: "#",
          section: DEFAULT_LINK_SECTION,
          section_label: getLinkSectionLabel(DEFAULT_LINK_SECTION),
          platform: "custom",
          icon_text: getPlatformIconText("custom"),
          href: "#"
        }]
      : []);

  return {
    links: populatedLinks,
    social_links: populatedLinks.filter((link) => link.section === "social"),
    sections: LINK_SECTION_OPTIONS
      .filter((option) => option.value !== "social")
      .map((option) => ({
        ...option,
        links: populatedLinks.filter((link) => link.section === option.value)
      }))
      .filter((section) => section.links.length > 0)
  };
}

function sanitizeReferralCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, REFERRAL_CODE_MAX_LENGTH);
}

function generateReferralCode(users, ...seeds) {
  const existingCodes = new Set((Array.isArray(users) ? users : []).map((user) => sanitizeReferralCode(user.referral_code)));
  return reserveAvailableReferralCode(existingCodes, seeds);
}

function getUsers() {
  return readStore().users;
}

function listUsers() {
  return [...getUsers()].sort((left, right) => Number(right.id) - Number(left.id));
}

function getUserById(id) {
  return getUsers().find((user) => String(user.id) === String(id)) || null;
}

function getUserByEmail(email) {
  const normalized = normalizeEmail(email);
  return getUsers().find((user) => normalizeEmail(user.email) === normalized) || null;
}

function getUserByReferralCode(code) {
  const normalized = sanitizeReferralCode(code);
  if (!normalized) {
    return null;
  }

  const users = getUsers();
  const exactMatch = users.find((user) => sanitizeReferralCode(user.referral_code) === normalized);
  if (exactMatch) {
    return exactMatch;
  }

  if (normalized.length <= 6) {
    const legacyMatches = users.filter((user) => {
      const candidate = sanitizeReferralCode(user.referral_code);
      return candidate.length > normalized.length && candidate.startsWith(normalized);
    });

    if (legacyMatches.length === 1) {
      return legacyMatches[0];
    }
  }

  return null;
}

function countReferralSignupsForUser(userId) {
  return getUsers().filter((user) => String(user.referred_by_user_id || "") === String(userId)).length;
}

function listReferralSignupsForUser(userId, limit = null) {
  const referrals = listUsers()
    .filter((user) => String(user.referred_by_user_id || "") === String(userId));

  return limit === null ? referrals : referrals.slice(0, limit);
}

function createUser(input) {
  const store = readStore();
  const now = new Date();
  const referredByUserId = input.referred_by_user_id ? String(input.referred_by_user_id) : null;
  const user = {
    id: nextId(store.users),
    name: String(input.name || "").trim(),
    business_name: String(input.business_name || "").trim(),
    email: normalizeEmail(input.email),
    password_hash: hashPassword(input.password),
    billing_status: "trialing",
    trial_started_at: now.toISOString(),
    trial_ends_at: addDays(now, TRIAL_DAYS).toISOString(),
    paid_access_ends_at: null,
    paid_at: null,
    billing_checkout_session_id: null,
    referral_code: generateReferralCode(store.users, getPrimaryReferralSeed(input.name), input.business_name, input.name),
    referred_by_user_id: referredByUserId,
    referral_bonus_months_earned: 0,
    created_at: now.toISOString()
  };

  store.users.push(user);
  writeStore(store);
  return toCustomerViewModel(getUserById(user.id));
}

function updateUser(id, updates) {
  const store = readStore();
  const index = store.users.findIndex((user) => String(user.id) === String(id));

  if (index === -1) {
    return null;
  }

  const existingUser = store.users[index];
  const nextUser = {
    ...existingUser,
    ...updates,
    email: normalizeEmail(updates.email ?? existingUser.email),
    billing_status: normalizeBillingStatus(updates.billing_status ?? existingUser.billing_status ?? "trialing"),
    referral_code: sanitizeReferralCode(updates.referral_code ?? existingUser.referral_code),
    referred_by_user_id: updates.referred_by_user_id ?? existingUser.referred_by_user_id ?? null,
    referral_bonus_months_earned: clampNumber(
      updates.referral_bonus_months_earned ?? existingUser.referral_bonus_months_earned ?? 0,
      0,
      REFERRAL_BONUS_MONTHS_MAX
    )
  };

  store.users[index] = nextUser;
  writeStore(store);
  return toCustomerViewModel(getUserById(id));
}

function ensureUserReferralCode(userId) {
  const user = getUserById(userId);
  if (!user) {
    return null;
  }

  if (sanitizeReferralCode(user.referral_code)) {
    return toCustomerViewModel(user);
  }

  return updateUser(userId, {
    referral_code: generateReferralCode(getUsers(), getPrimaryReferralSeed(user.name), user.business_name, user.name)
  });
}

function extendUserPaidAccess(userId, days, options = {}) {
  const user = getUserById(userId);
  if (!user) {
    return null;
  }

  const currentCustomer = toCustomerViewModel(user);
  const baseline = maxDateValue(
    new Date(),
    options.stackFromCurrentAccess ? currentCustomer.access_ends_at : null,
    user.paid_access_ends_at
  ) || new Date();
  const nextPaidAccessEnd = addDays(baseline, days);

  return updateUser(userId, {
    billing_status: "active",
    paid_at: options.paidAt || new Date().toISOString(),
    paid_access_ends_at: nextPaidAccessEnd.toISOString(),
    billing_checkout_session_id: options.checkoutSessionId ?? user.billing_checkout_session_id ?? null
  });
}

function applyReferralReward(referrerId) {
  const referrer = getUserById(referrerId);
  if (!referrer) {
    return null;
  }

  const currentBonusMonths = clampNumber(referrer.referral_bonus_months_earned, 0, REFERRAL_BONUS_MONTHS_MAX);
  const nextBonusMonths = Math.min(currentBonusMonths + 1, REFERRAL_BONUS_MONTHS_MAX);

  if (nextBonusMonths === currentBonusMonths) {
    return toCustomerViewModel(referrer);
  }

  return updateUser(referrerId, {
    referral_bonus_months_earned: nextBonusMonths
  });
}

function getAnalyticsEvents() {
  return readStore().analytics_events;
}

function listAnalyticsEvents() {
  return [...getAnalyticsEvents()].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function normalizeReferrerHost(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase();
  } catch (error) {
    return "";
  }
}

function getRequestClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  return forwarded || req.ip || req.socket?.remoteAddress || "";
}

function isLikelyBotRequest(req) {
  const userAgent = String(req.get("user-agent") || "");
  return /(bot|crawl|spider|slurp|headless|facebookexternalhit|preview|monitor|uptime|wget|curl|linkedinbot|embedly|discordbot|telegrambot|whatsapp)/i.test(userAgent);
}

function buildVisitorKey(req) {
  if (!req || isLikelyBotRequest(req)) {
    return "";
  }

  const ip = getRequestClientIp(req);
  const userAgent = String(req.get("user-agent") || "").trim();
  if (!ip && !userAgent) {
    return "";
  }

  return crypto
    .createHash("sha256")
    .update(`${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, 24);
}

function buildRequestAnalyticsContext(req) {
  const referrerUrl = String(req.get("referer") || req.get("referrer") || "").trim();
  return {
    visitor_key: buildVisitorKey(req),
    referrer_host: normalizeReferrerHost(referrerUrl),
    referrer_url: referrerUrl,
    request_path: String(req.originalUrl || req.path || "").trim(),
    user_agent: String(req.get("user-agent") || "").trim().slice(0, 255)
  };
}

function createAnalyticsEvent(input) {
  const store = readStore();
  const linkIndex = Number(input.link_index);
  const event = {
    id: nextId(store.analytics_events),
    order_id: input.order_id || null,
    owner_user_id: input.owner_user_id || null,
    event_type: input.event_type,
    link_label: input.link_label || null,
    link_url: input.link_url || null,
    link_index: Number.isInteger(linkIndex) ? linkIndex : null,
    visitor_key: String(input.visitor_key || "").trim() || null,
    referrer_host: normalizeReferrerHost(input.referrer_host || input.referrer_url || ""),
    referrer_url: String(input.referrer_url || "").trim().slice(0, 500) || null,
    request_path: String(input.request_path || "").trim().slice(0, 255) || null,
    user_agent: String(input.user_agent || "").trim().slice(0, 255) || null,
    created_at: new Date().toISOString()
  };

  store.analytics_events.push(event);
  writeStore(store);
  return event;
}

function getLeads() {
  return readStore().leads;
}

function listLeads() {
  return [...getLeads()].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function createLead(input) {
  const store = readStore();
  const lead = {
    id: nextId(store.leads),
    order_id: input.order_id || null,
    owner_user_id: input.owner_user_id || null,
    name: String(input.name || "").trim(),
    email: normalizeEmail(input.email),
    message: String(input.message || "").trim(),
    visitor_key: String(input.visitor_key || "").trim() || null,
    referrer_host: normalizeReferrerHost(input.referrer_host || ""),
    created_at: new Date().toISOString()
  };

  store.leads.push(lead);
  writeStore(store);
  return lead;
}

function startOfDay(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseDateValue(value) || new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addCalendarDays(value, days) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseDateValue(value) || new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date;
}

function formatPercent(part, whole) {
  if (!whole) {
    return 0;
  }

  return Number(((part / whole) * 100).toFixed(1));
}

function formatDayLabel(value) {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return "";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function humanizeEventType(type) {
  switch (type) {
    case "page_view":
      return "Page view";
    case "link_click":
      return "Link click";
    case "lead_submission":
      return "Lead submission";
    default:
      return "Activity";
  }
}

function humanizeReferrerHost(host) {
  const normalized = normalizeReferrerHost(host);
  if (!normalized) {
    return "Direct";
  }

  if ([CANONICAL_PUBLIC_HOST, "myurlc.com"].includes(normalized)) {
    return SITE_NAME;
  }

  return normalized.replace(/^www\./, "");
}

function buildAnalyticsSummary(events, leads) {
  const pageViews = events.filter((event) => event.event_type === "page_view");
  const linkClicks = events.filter((event) => event.event_type === "link_click");
  const uniqueVisitors = new Set(events.map((event) => event.visitor_key).filter(Boolean));

  return {
    page_views: pageViews.length,
    unique_visitors: uniqueVisitors.size,
    link_clicks: linkClicks.length,
    leads: leads.length,
    ctr_percent: formatPercent(linkClicks.length, pageViews.length),
    lead_rate_percent: formatPercent(leads.length, pageViews.length)
  };
}

function buildAnalyticsTrend(events, leads, days = 7) {
  const totalDays = Math.max(1, Number(days) || 7);
  const firstDay = addCalendarDays(startOfDay(new Date()), -(totalDays - 1));
  const rows = Array.from({ length: totalDays }, (_, index) => {
    const day = addCalendarDays(firstDay, index);
    const dayStart = startOfDay(day);
    const dayEnd = addCalendarDays(dayStart, 1);

    const eventBucket = events.filter((event) => {
      const createdAt = parseDateValue(event.created_at);
      return createdAt && createdAt >= dayStart && createdAt < dayEnd;
    });

    const leadBucket = leads.filter((lead) => {
      const createdAt = parseDateValue(lead.created_at);
      return createdAt && createdAt >= dayStart && createdAt < dayEnd;
    });

    return {
      key: dayStart.toISOString(),
      label: formatDayLabel(dayStart),
      page_views: eventBucket.filter((event) => event.event_type === "page_view").length,
      link_clicks: eventBucket.filter((event) => event.event_type === "link_click").length,
      leads: leadBucket.length
    };
  });

  const maxValue = Math.max(
    1,
    ...rows.map((row) => Math.max(row.page_views, row.link_clicks, row.leads))
  );

  return rows.map((row) => ({
    ...row,
    page_views_width: row.page_views > 0 ? Math.max(8, Math.round((row.page_views / maxValue) * 100)) : 0,
    link_clicks_width: row.link_clicks > 0 ? Math.max(8, Math.round((row.link_clicks / maxValue) * 100)) : 0,
    leads_width: row.leads > 0 ? Math.max(8, Math.round((row.leads / maxValue) * 100)) : 0
  }));
}

function buildOrderAnalyticsReport(order) {
  const events = listAnalyticsEvents().filter((event) => String(event.order_id || "") === String(order.id));
  const leads = listLeads().filter((lead) => String(lead.order_id || "") === String(order.id));
  const now = new Date();
  const last7Start = addCalendarDays(startOfDay(now), -6);
  const last30Start = addCalendarDays(startOfDay(now), -29);
  const events7 = events.filter((event) => {
    const createdAt = parseDateValue(event.created_at);
    return createdAt && createdAt >= last7Start;
  });
  const events30 = events.filter((event) => {
    const createdAt = parseDateValue(event.created_at);
    return createdAt && createdAt >= last30Start;
  });
  const leads7 = leads.filter((lead) => {
    const createdAt = parseDateValue(lead.created_at);
    return createdAt && createdAt >= last7Start;
  });
  const leads30 = leads.filter((lead) => {
    const createdAt = parseDateValue(lead.created_at);
    return createdAt && createdAt >= last30Start;
  });
  const clickCounts = new Map();

  events
    .filter((event) => event.event_type === "link_click")
    .forEach((event) => {
      const key = `${event.link_label || ""}||${event.link_url || ""}`;
      const existing = clickCounts.get(key) || {
        label: event.link_label || "Untitled Link",
        url: event.link_url || "",
        clicks: 0,
        last_clicked_at: null
      };
      existing.clicks += 1;
      existing.last_clicked_at = existing.last_clicked_at && parseDateValue(existing.last_clicked_at) > parseDateValue(event.created_at)
        ? existing.last_clicked_at
        : event.created_at;
      clickCounts.set(key, existing);
    });

  const topLinks = (order.links || [])
    .map((link) => {
      const key = `${link.label || ""}||${link.url || ""}`;
      const stats = clickCounts.get(key) || { clicks: 0, last_clicked_at: null };
      return {
        label: link.label,
        url: link.url,
        clicks: stats.clicks,
        last_clicked_at: stats.last_clicked_at,
        formatted_last_clicked_at: formatDateTime(stats.last_clicked_at),
        relative_last_clicked_at: stats.last_clicked_at ? formatRelativeTime(stats.last_clicked_at) : ""
      };
    })
    .sort((left, right) => right.clicks - left.clicks || left.label.localeCompare(right.label))
    .slice(0, 8);

  const topReferrers = Array.from(
    events30
      .reduce((map, event) => {
        const host = normalizeReferrerHost(event.referrer_host || "");
        const key = !host || [CANONICAL_PUBLIC_HOST, "myurlc.com"].includes(host) ? "direct" : host;
        const bucket = map.get(key) || { host: key, visits: 0 };
        bucket.visits += 1;
        map.set(key, bucket);
        return map;
      }, new Map())
      .values()
  )
    .sort((left, right) => right.visits - left.visits)
    .slice(0, 6)
    .map((item) => ({
      ...item,
      label: item.host === "direct" ? "Direct" : humanizeReferrerHost(item.host)
    }));

  const recentActivity = events
    .slice(0, 12)
    .map((event) => ({
      ...event,
      event_label: humanizeEventType(event.event_type),
      detail: event.event_type === "link_click"
        ? (event.link_label || "Clicked a link")
        : (event.event_type === "page_view"
          ? humanizeReferrerHost(event.referrer_host)
          : "New lead captured"),
      formatted_created_at: formatDateTime(event.created_at),
      relative_created_at: formatRelativeTime(event.created_at)
    }));

  const recentLeads = leads
    .slice(0, 10)
    .map((lead) => ({
      ...lead,
      formatted_created_at: formatDateTime(lead.created_at),
      relative_created_at: formatRelativeTime(lead.created_at),
      source_label: humanizeReferrerHost(lead.referrer_host)
    }));

  return {
    has_data: events.length > 0 || leads.length > 0,
    summary_all_time: buildAnalyticsSummary(events, leads),
    summary_7d: buildAnalyticsSummary(events7, leads7),
    summary_30d: buildAnalyticsSummary(events30, leads30),
    daily_series: buildAnalyticsTrend(events30, leads30, 7),
    top_links: topLinks,
    top_referrers: topReferrers,
    recent_activity: recentActivity,
    recent_leads: recentLeads
  };
}

function getSupportTickets() {
  return readStore().support_tickets;
}

function listSupportTickets() {
  return [...getSupportTickets()].sort((left, right) => {
    return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
  });
}

function getSupportTicketById(id) {
  return getSupportTickets().find((ticket) => String(ticket.id) === String(id)) || null;
}

function createSupportTicket(input) {
  const store = readStore();
  const ticket = {
    id: nextId(store.support_tickets),
    user_id: input.user_id || null,
    name: String(input.name || "").trim(),
    email: normalizeEmail(input.email),
    category: ["bug", "help", "billing", "feature"].includes(String(input.category || "").trim().toLowerCase())
      ? String(input.category || "").trim().toLowerCase()
      : "help",
    subject: String(input.subject || "").trim().slice(0, 140),
    message: String(input.message || "").trim().slice(0, 5000),
    page_url: String(input.page_url || "").trim().slice(0, 500),
    status: "open",
    created_at: new Date().toISOString()
  };

  store.support_tickets.push(ticket);
  writeStore(store);
  return ticket;
}

function updateSupportTicket(id, updates) {
  const store = readStore();
  const index = store.support_tickets.findIndex((ticket) => String(ticket.id) === String(id));

  if (index === -1) {
    return null;
  }

  const existing = store.support_tickets[index];
  const nextTicket = {
    ...existing,
    ...updates,
    email: normalizeEmail(updates.email ?? existing.email),
    status: ["open", "resolved"].includes(String(updates.status || existing.status || "open"))
      ? String(updates.status || existing.status || "open")
      : "open"
  };

  store.support_tickets[index] = nextTicket;
  writeStore(store);
  return nextTicket;
}

function getOrders() {
  return readStore().orders;
}

function listOrders() {
  return [...getOrders()].sort((left, right) => Number(right.id) - Number(left.id));
}

function getOrderById(id) {
  return getOrders().find((order) => String(order.id) === String(id)) || null;
}

function getOrderBySlug(slug) {
  const normalized = normalizeUsername(slug);
  return getOrders().find((order) => order.slug === normalized) || null;
}

function getUsernameClaims() {
  return readStore().usernames;
}

function getUsernameClaim(slug) {
  const normalized = normalizeUsername(slug);
  if (!normalized) {
    return null;
  }

  return getUsernameClaims().find((claim) => claim.slug === normalized) || null;
}

function isUsernameAvailable(slug, orderIdToIgnore = null) {
  const normalized = normalizeUsername(slug);
  if (!normalized || isReservedUsername(normalized)) {
    return false;
  }

  const existing = getUsernameClaim(normalized);
  return !existing || String(existing.order_id || "") === String(orderIdToIgnore || "");
}

function resolveSlugSelection(requestedValue, fallbackValue, options = {}) {
  const requestedSlug = String(requestedValue || "").trim();
  const fallbackSlug = normalizeUsername(fallbackValue || "");
  const currentOrderId = options.currentOrderId || null;
  const explicit = Boolean(requestedSlug);

  if (explicit) {
    const explicitValidation = validateExplicitUsername(requestedSlug);
    if (explicitValidation.error) {
      return explicitValidation;
    }

    if (isReservedUsername(explicitValidation.slug)) {
      return {
        slug: null,
        error: `The username "${explicitValidation.slug}" is reserved. Please choose another one.`
      };
    }

    if (!isUsernameAvailable(explicitValidation.slug, currentOrderId)) {
      return {
        slug: null,
        error: `The username "${explicitValidation.slug}" is already taken. Please choose another one.`
      };
    }

    return { slug: explicitValidation.slug, error: null };
  }

  const normalizedRequestedSlug = normalizeUsername(fallbackSlug);
  if (!normalizedRequestedSlug) {
    return {
      slug: null,
      error: "Enter a valid username using lowercase letters, numbers, and hyphens."
    };
  }

  if (normalizedRequestedSlug.length < USERNAME_MIN_LENGTH) {
    return {
      slug: ensureUniqueSlug(`page-${Date.now()}`, currentOrderId),
      error: null
    };
  }

  if (normalizedRequestedSlug.length > USERNAME_MAX_LENGTH) {
    return {
      slug: ensureUniqueSlug(normalizedRequestedSlug.slice(0, USERNAME_MAX_LENGTH), currentOrderId),
      error: null
    };
  }

  return {
    slug: ensureUniqueSlug(normalizedRequestedSlug, currentOrderId),
    error: null
  };
}

function getOrderByStripeSessionId(sessionId) {
  return getOrders().find((order) => order.stripe_session_id === sessionId) || null;
}

function getOrderByOwnerUserId(userId) {
  return getOrders().find((order) => String(order.owner_user_id || "") === String(userId)) || null;
}

function getPageRevisions() {
  return readStore().page_revisions;
}

function getPageRevisionById(orderId, revisionId) {
  return getPageRevisions().find((revision) => {
    return String(revision.order_id || "") === String(orderId) && String(revision.id || "") === String(revisionId);
  }) || null;
}

function sanitizeOrderSnapshot(order) {
  if (!order) {
    return null;
  }

  return {
    id: order.id,
    owner_user_id: order.owner_user_id || null,
    source: order.source || "manual",
    email: order.email || "",
    full_name: order.full_name || "",
    business_name: order.business_name || "",
    slug: normalizeUsername(order.slug),
    bio: order.bio || "",
    phone: order.phone || "",
    lead_form_enabled: order.lead_form_enabled ? 1 : 0,
    lead_form_prompt: sanitizeLeadPrompt(order.lead_form_prompt),
    profile_image: order.profile_image || null,
    profile_media: order.profile_media || order.profile_image || null,
    profile_media_type: normalizeMediaType(order.profile_media_type) || ((order.profile_media || order.profile_image) ? "image" : null),
    background_image: order.background_image || null,
    theme: normalizeTheme(order.theme),
    accent_color: sanitizeAccentColor(order.accent_color),
    links_json: order.links_json || "[]",
    status: order.status || "draft",
    payment_status: order.payment_status || "manual",
    stripe_session_id: order.stripe_session_id || null,
    is_published: order.is_published ? 1 : 0,
    created_at: order.created_at || new Date().toISOString(),
    updated_at: order.updated_at || new Date().toISOString()
  };
}

function createPageRevision(order, options = {}) {
  const snapshot = sanitizeOrderSnapshot(order);
  if (!snapshot?.id) {
    return null;
  }

  const store = readStore();
  const revision = {
    id: nextId(store.page_revisions),
    order_id: snapshot.id,
    actor_type: String(options.actorType || "system").trim() || "system",
    actor_user_id: options.actorUserId || null,
    actor_label: String(options.actorLabel || "").trim().slice(0, 80) || null,
    reason: String(options.reason || "Automatic page backup").trim().slice(0, 140) || "Automatic page backup",
    snapshot,
    created_at: new Date().toISOString()
  };

  store.page_revisions.push(revision);

  const revisionIndexes = store.page_revisions
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => String(item.order_id || "") === String(snapshot.id))
    .sort((left, right) => new Date(left.item.created_at || 0).getTime() - new Date(right.item.created_at || 0).getTime());

  while (revisionIndexes.length > PAGE_REVISION_LIMIT) {
    const oldest = revisionIndexes.shift();
    if (!oldest) {
      break;
    }
    store.page_revisions.splice(oldest.index, 1);
    for (let index = 0; index < revisionIndexes.length; index += 1) {
      if (revisionIndexes[index].index > oldest.index) {
        revisionIndexes[index].index -= 1;
      }
    }
  }

  writeStore(store);
  return revision;
}

function listPageRevisionsForOrder(orderId) {
  return getPageRevisions()
    .filter((revision) => String(revision.order_id || "") === String(orderId))
    .sort((left, right) => {
      return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
    })
    .map((revision) => {
      const snapshot = sanitizeOrderSnapshot(revision.snapshot);
      const actorLabel = revision.actor_label
        || (revision.actor_type === "customer"
          ? "Customer"
          : (revision.actor_type === "admin" ? "Admin" : "System"));

      return {
        ...revision,
        snapshot,
        actor_label: actorLabel,
        formatted_created_at: formatDateTime(revision.created_at),
        relative_created_at: formatRelativeTime(revision.created_at),
        snapshot_status: snapshot?.is_published ? "Published" : "Draft",
        snapshot_slug: snapshot?.slug || ""
      };
    });
}

function buildRevisionRestorePayload(revision) {
  const snapshot = sanitizeOrderSnapshot(revision?.snapshot);
  if (!snapshot) {
    return null;
  }

  return {
    email: snapshot.email,
    full_name: snapshot.full_name,
    business_name: snapshot.business_name,
    slug: snapshot.slug,
    bio: snapshot.bio,
    phone: snapshot.phone,
    lead_form_enabled: snapshot.lead_form_enabled ? 1 : 0,
    lead_form_prompt: snapshot.lead_form_prompt,
    profile_media: snapshot.profile_media,
    profile_media_type: snapshot.profile_media_type,
    profile_image: snapshot.profile_image,
    background_image: snapshot.background_image,
    theme: snapshot.theme,
    accent_color: snapshot.accent_color,
    links_json: snapshot.links_json,
    status: snapshot.status,
    is_published: snapshot.is_published ? 1 : 0
  };
}

function createOrder(input) {
  const store = readStore();
  const timestamp = new Date().toISOString();
  const order = {
    id: nextId(store.orders),
    owner_user_id: input.owner_user_id || null,
    source: input.source || "manual",
    email: input.email || "",
    full_name: input.full_name || "",
    business_name: input.business_name || "",
    slug: normalizeUsername(input.slug),
    bio: input.bio || "",
    phone: input.phone || "",
    lead_form_enabled: input.lead_form_enabled ? 1 : 0,
    lead_form_prompt: sanitizeLeadPrompt(input.lead_form_prompt),
    profile_image: input.profile_image || null,
    profile_media: input.profile_media || input.profile_image || null,
    profile_media_type: normalizeMediaType(input.profile_media_type) || (input.profile_image ? "image" : null),
    background_image: input.background_image || null,
    theme: normalizeTheme(input.theme),
    accent_color: sanitizeAccentColor(input.accent_color),
    links_json: input.links_json || "[]",
    status: input.status || "submitted",
    payment_status: input.payment_status || "manual",
    stripe_session_id: input.stripe_session_id || null,
    is_published: input.is_published ? 1 : 0,
    created_at: timestamp,
    updated_at: timestamp
  };

  store.orders.push(order);
  writeStore(store);
  createPageRevision(order, {
    actorType: input.owner_user_id ? "customer" : "system",
    actorUserId: input.owner_user_id || null,
    actorLabel: input.owner_user_id ? "Customer" : "System",
    reason: "Initial page created"
  });
  return order;
}

function updateOrder(id, updates, options = {}) {
  const store = readStore();
  const index = store.orders.findIndex((order) => String(order.id) === String(id));

  if (index === -1) {
    return null;
  }

  const existingOrder = store.orders[index];
  const nextProfileMedia = updates.profile_media ?? existingOrder.profile_media ?? existingOrder.profile_image ?? null;
  const nextProfileMediaType = normalizeMediaType(
    updates.profile_media_type ?? existingOrder.profile_media_type ?? (nextProfileMedia ? "image" : null)
  );
  const nextOrder = {
    ...existingOrder,
    ...updates,
    slug: normalizeUsername(updates.slug ?? existingOrder.slug),
    profile_media: nextProfileMedia,
    profile_media_type: nextProfileMediaType,
    profile_image: nextProfileMediaType === "image" ? nextProfileMedia : null,
    background_image: updates.background_image ?? existingOrder.background_image ?? null,
    theme: normalizeTheme(updates.theme ?? existingOrder.theme),
    accent_color: sanitizeAccentColor(updates.accent_color ?? existingOrder.accent_color),
    updated_at: new Date().toISOString()
  };

  store.orders[index] = nextOrder;
  writeStore(store);

  if (options.revisionReason) {
    createPageRevision(existingOrder, {
      actorType: options.revisionActorType || "system",
      actorUserId: options.revisionActorUserId || null,
      actorLabel: options.revisionActorLabel || "",
      reason: options.revisionReason
    });
  }

  return nextOrder;
}

function ensureUniqueSlug(baseSlug, orderIdToIgnore) {
  const fallbackRoot = normalizeUsername(`page-${Date.now()}`);
  const rootSlug = (normalizeUsername(baseSlug) || fallbackRoot)
    .slice(0, USERNAME_MAX_LENGTH)
    .replace(/-+$/g, "") || fallbackRoot;
  let candidate = rootSlug;
  let counter = 2;

  while (true) {
    if (!isReservedUsername(candidate) && isUsernameAvailable(candidate, orderIdToIgnore)) {
      return candidate;
    }

    const suffix = `-${counter++}`;
    const base = rootSlug.slice(0, Math.max(USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH - suffix.length)).replace(/-+$/g, "") || fallbackRoot;
    candidate = `${base}${suffix}`;
  }
}

function toOrderViewModel(row) {
  if (!row) {
    return null;
  }

  const linkCollections = buildLinkCollections(readLinks(row.links_json), { orderId: row.id });
  const profileMedia = row.profile_media || row.profile_image || null;
  const profileMediaType = normalizeMediaType(row.profile_media_type) || (profileMedia ? "image" : null);
  const owner = row.owner_user_id ? getUserById(row.owner_user_id) : null;
  const ownerReferralCode = owner ? sanitizeReferralCode(owner.referral_code) : "";

  return {
    ...row,
    theme: normalizeTheme(row.theme),
    accent_color: sanitizeAccentColor(row.accent_color),
    links: linkCollections.links,
    social_links: linkCollections.social_links,
    link_sections: linkCollections.sections,
    lead_form_enabled: row.lead_form_enabled ? 1 : 0,
    lead_form_prompt: sanitizeLeadPrompt(row.lead_form_prompt),
    profile_media: profileMedia,
    profile_media_type: profileMediaType,
    profile_image: profileMediaType === "image" ? profileMedia : row.profile_image || null,
    background_image: row.background_image || null,
    is_published: row.is_published ? 1 : 0,
    public_path: buildPublicPagePath(row.slug),
    lead_form_action_path: buildPublicLeadPath(row.slug),
    public_url: absoluteUrl(buildPublicPagePath(row.slug)),
    owner_referral_share_url: ownerReferralCode ? `${BASE_URL}/ref/${encodeURIComponent(ownerReferralCode)}` : ""
  };
}

function buildIntakeValues(body = {}) {
  return {
    email: normalizeEmail(body.email),
    full_name: String(body.full_name || "").trim(),
    business_name: String(body.business_name || "").trim(),
    slug: String(body.slug || "").trim(),
    bio: String(body.bio || "").trim(),
    phone: String(body.phone || "").trim(),
    theme: normalizeTheme(body.theme),
    accent_color: sanitizeAccentColor(body.accent_color),
    links: buildLinkRows(body, STUDIO_LINK_ROWS),
    profile_media: null,
    profile_media_type: null,
    background_image: null
  };
}

function buildAdminOrderValues(row, body = {}) {
  const order = toOrderViewModel(row);

  if (!body || Object.keys(body).length === 0) {
    return {
      ...order,
      lead_form_enabled: order.lead_form_enabled,
      lead_form_prompt: order.lead_form_prompt,
      links: padLinks(order.links, STUDIO_LINK_ROWS)
    };
  }

  return {
    ...order,
    email: normalizeEmail(body.email),
    full_name: String(body.full_name || "").trim(),
    business_name: String(body.business_name || "").trim(),
    slug: String(body.slug || "").trim(),
    bio: String(body.bio || "").trim(),
    phone: String(body.phone || "").trim(),
    lead_form_enabled: body.lead_form_enabled === "1",
    lead_form_prompt: sanitizeLeadPrompt(body.lead_form_prompt),
    theme: normalizeTheme(body.theme),
    accent_color: sanitizeAccentColor(body.accent_color),
    status: STATUS_OPTIONS.includes(body.status) ? body.status : order.status,
    payment_status: PAYMENT_STATUS_OPTIONS.includes(body.payment_status) ? body.payment_status : order.payment_status,
    links: buildLinkRows(body, STUDIO_LINK_ROWS),
    profile_media: body.remove_profile_media === "1" ? null : order.profile_media,
    profile_media_type: body.remove_profile_media === "1" ? null : order.profile_media_type,
    background_image: body.remove_background_image === "1" ? null : order.background_image
  };
}

function buildCustomerValues(body = {}) {
  return {
    full_name: String(body.full_name || "").trim(),
    business_name: String(body.business_name || "").trim(),
    email: normalizeEmail(body.email),
    referral_code: sanitizeReferralCode(body.referral_code)
  };
}

function buildStudioValues(user, row, body = {}) {
  const order = toOrderViewModel(row);

  if (!body || Object.keys(body).length === 0) {
    return {
      full_name: order?.full_name || user.name || "",
      email: user.email || "",
      business_name: order?.business_name || user.business_name || "",
      slug: order?.slug || "",
      bio: order?.bio || "",
      phone: order?.phone || "",
      lead_form_enabled: order?.lead_form_enabled || 0,
      lead_form_prompt: order?.lead_form_prompt || "Send me a quick message",
      theme: order?.theme || "midnight",
      accent_color: order?.accent_color || "#2563eb",
      links: padLinks(order?.links || [], STUDIO_LINK_ROWS),
      profile_media: order?.profile_media || null,
      profile_media_type: order?.profile_media_type || null,
      background_image: order?.background_image || null
    };
  }

  return {
    full_name: String(body.full_name || "").trim(),
    email: user.email || "",
    business_name: String(body.business_name || "").trim(),
    slug: String(body.slug || "").trim(),
    bio: String(body.bio || "").trim(),
    phone: String(body.phone || "").trim(),
    lead_form_enabled: body.lead_form_enabled === "1",
    lead_form_prompt: sanitizeLeadPrompt(body.lead_form_prompt),
    theme: normalizeTheme(body.theme),
    accent_color: sanitizeAccentColor(body.accent_color),
    links: buildLinkRows(body, STUDIO_LINK_ROWS),
    profile_media: body.remove_profile_media === "1" ? null : (order?.profile_media || null),
    profile_media_type: body.remove_profile_media === "1" ? null : (order?.profile_media_type || null),
    background_image: body.remove_background_image === "1" ? null : (order?.background_image || null)
  };
}

function buildStudioPreview(values, row, options = {}) {
  const order = toOrderViewModel(row);
  const profileMedia = options.profile_media !== undefined
    ? options.profile_media
    : (values.profile_media || order?.profile_media || null);
  const profileMediaType = options.profile_media_type !== undefined
    ? options.profile_media_type
    : (values.profile_media_type || order?.profile_media_type || (profileMedia ? "image" : null));
  const backgroundImage = options.background_image !== undefined
    ? options.background_image
    : (values.background_image || order?.background_image || null);
  const linkCollections = buildLinkCollections(values.links || values, { includePlaceholder: true });

  return {
    business_name: values.business_name || "Your brand",
    bio: values.bio || "Add a short bio so people know what you do.",
    phone: values.phone || "",
    theme: normalizeTheme(values.theme),
    accent_color: sanitizeAccentColor(values.accent_color),
    profile_media: profileMedia,
    profile_media_type: normalizeMediaType(profileMediaType) || (profileMedia ? "image" : null),
    background_image: backgroundImage,
    links: linkCollections.links,
    social_links: linkCollections.social_links,
    link_sections: linkCollections.sections,
    lead_form_enabled: values.lead_form_enabled ? 1 : 0,
    lead_form_prompt: sanitizeLeadPrompt(values.lead_form_prompt),
    slug: values.slug || order?.slug || "your-brand",
    is_published: options.is_published !== undefined ? options.is_published : (order?.is_published || 0)
  };
}

function getCurrentCustomer(req) {
  if (!req.session || !req.session.customerUserId) {
    return null;
  }

  const customer = ensureUserReferralCode(req.session.customerUserId);
  if (!customer) {
    delete req.session.customerUserId;
    return null;
  }

  return customer;
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect("/admin/login");
}

function requireCustomer(req, res, next) {
  const customer = getCurrentCustomer(req);
  if (customer) {
    req.currentCustomer = customer;
    return next();
  }
  return res.redirect("/login");
}

function requireGuest(req, res, next) {
  if (getCurrentCustomer(req)) {
    return res.redirect("/studio");
  }
  return next();
}

function ensureCustomerPage(user) {
  const existing = getOrderByOwnerUserId(user.id);
  if (existing) {
    return existing;
  }

  const slugBase = makeSlug(user.business_name || user.name || `page-${user.id}`);
  const slug = ensureUniqueSlug(slugBase);

  return createOrder({
    owner_user_id: user.id,
    source: "self_serve",
    email: user.email,
    full_name: user.name,
    business_name: user.business_name || user.name,
    slug,
    bio: "",
    phone: "",
    profile_image: null,
    profile_media: null,
    profile_media_type: null,
    background_image: null,
    theme: "midnight",
    accent_color: "#2563eb",
    links_json: "[]",
    status: "draft",
    payment_status: "manual",
    is_published: 0
  });
}

async function verifyCheckoutSession(sessionId) {
  if (!stripe || !sessionId) {
    return { paid: false, email: "" };
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
    return {
      paid: checkoutSession.payment_status === "paid",
      email: normalizeEmail(checkoutSession.customer_details?.email || checkoutSession.customer_email || "")
    };
  } catch (error) {
    return { paid: false, email: "" };
  }
}

function renderAuthPage(res, view, options = {}) {
  const statusCode = options.statusCode || 200;
  return res.status(statusCode).render(view, {
    pageTitle: options.pageTitle,
    error: options.error || null,
    info: options.info || null,
    values: options.values || {},
    founderOffer: getFoundingOfferStats(),
    ...buildSeoData(options.seo)
  });
}

function renderIntake(res, options = {}) {
  const values = buildIntakeValues(options.values);
  const statusCode = options.statusCode || 200;
  return res.status(statusCode).render("intake", {
    pageTitle: "Customer Intake",
    error: options.error || null,
    paid: Boolean(options.paid),
    sessionId: options.sessionId || "",
    values,
    ...buildSeoData({
      canonicalUrl: absoluteUrl("/intake"),
      metaRobots: "noindex,nofollow",
      metaDescription: "Internal intake form for myurlc.com page setup."
    })
  });
}

function renderAdminOrder(res, row, options = {}) {
  const order = buildAdminOrderValues(row, options.values);
  const ownerUser = row && row.owner_user_id ? toCustomerViewModel(getUserById(row.owner_user_id)) : null;
  const statusCode = options.statusCode || 200;
  const pageRevisions = options.pageRevisions || listPageRevisionsForOrder(order.id).slice(0, 8);

  return res.status(statusCode).render("admin-order", {
    pageTitle: `${order.business_name || "Order"} Details`,
    error: options.error || null,
    info: options.info || null,
    order,
    ownerUser,
    analyticsSummary: options.analyticsSummary || { total: 0, clicks: 0 },
    recentLeads: options.recentLeads || [],
    pageRevisions,
    statusOptions: STATUS_OPTIONS,
    paymentStatusOptions: PAYMENT_STATUS_OPTIONS,
    ...buildSeoData({
      canonicalUrl: absoluteUrl(`/admin/order/${order.id}`),
      metaRobots: "noindex,nofollow",
      metaDescription: "Internal admin order details."
    })
  });
}

function renderStudio(res, user, row, options = {}) {
  const order = toOrderViewModel(row);
  const values = buildStudioValues(user, row, options.values);
  const preview = buildStudioPreview(values, row, {
    profile_media: options.preview_profile_media,
    profile_media_type: options.preview_profile_media_type,
    background_image: options.preview_background_image,
    is_published: options.is_published
  });
  const statusCode = options.statusCode || 200;
  const analyticsSnapshot = options.analyticsSnapshot || buildAnalyticsSnapshot(order);

  return res.status(statusCode).render("studio", {
    pageTitle: "Page Studio",
    error: options.error || null,
    info: options.info || null,
    user,
    order,
    values,
    preview,
    analyticsSnapshot,
    ...buildSeoData({
      canonicalUrl: absoluteUrl("/studio"),
      metaRobots: "noindex,nofollow",
      metaDescription: "Create and update your myurlc.com link in bio page."
    })
  });
}

function renderBilling(res, user, row, options = {}) {
  const order = toOrderViewModel(row);
  const statusCode = options.statusCode || 200;
  const analyticsSnapshot = options.analyticsSnapshot || buildAnalyticsSnapshot(order);

  return res.status(statusCode).render("billing", {
    pageTitle: "Billing",
    error: options.error || null,
    info: options.info || null,
    user,
    order,
    analyticsSnapshot,
    billingConfigured: Boolean(stripe && BILLING_PRICE_ID),
    trialExpired: user.trial_expired,
    ...buildSeoData({
      canonicalUrl: absoluteUrl("/billing"),
      metaRobots: "noindex,nofollow",
      metaDescription: "Manage billing, founder access, and referral rewards on myurlc.com."
    })
  });
}

function buildSupportValues(body = {}, customer = null) {
  return {
    name: String(body.name || customer?.name || "").trim(),
    email: normalizeEmail(body.email || customer?.email || ""),
    category: ["bug", "help", "billing", "feature"].includes(String(body.category || "").trim().toLowerCase())
      ? String(body.category || "").trim().toLowerCase()
      : "bug",
    subject: String(body.subject || "").trim(),
    message: String(body.message || "").trim(),
    page_url: String(body.page_url || "").trim()
  };
}

function renderSupportPage(res, options = {}) {
  const statusCode = options.statusCode || 200;
  return res.status(statusCode).render("support", {
    pageTitle: "Help & Support",
    error: options.error || null,
    info: options.info || null,
    values: options.values || buildSupportValues({}, options.customer || null),
    currentCustomer: options.customer || null,
    ...buildSeoData({
      canonicalUrl: absoluteUrl("/support"),
      metaRobots: "noindex,follow",
      metaDescription: "Get help or report a bug for your myurlc.com page."
    })
  });
}

function buildAnalyticsSnapshot(order) {
  if (!order) {
    return {
      has_data: false,
      summary_30d: {
        page_views: 0,
        unique_visitors: 0,
        link_clicks: 0,
        leads: 0
      },
      top_link: null
    };
  }

  const report = buildOrderAnalyticsReport(order);
  return {
    has_data: report.has_data,
    summary_30d: report.summary_30d,
    top_link: report.top_links.find((link) => link.clicks > 0) || report.top_links[0] || null
  };
}

function renderAnalytics(res, user, row, report, options = {}) {
  const order = toOrderViewModel(row);
  const statusCode = options.statusCode || 200;

  return res.status(statusCode).render("analytics", {
    pageTitle: "Analytics",
    error: options.error || null,
    info: options.info || null,
    user,
    order,
    report,
    ...buildSeoData({
      canonicalUrl: absoluteUrl("/analytics"),
      metaRobots: "noindex,nofollow",
      metaDescription: "View analytics and reports for your myurlc.com page."
    })
  });
}

function buildCustomerExportPayload(user, order) {
  const report = buildOrderAnalyticsReport(order);
  const leads = listLeads()
    .filter((lead) => String(lead.order_id || "") === String(order.id))
    .map((lead) => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      message: lead.message,
      created_at: lead.created_at
    }));

  return {
    exported_at: new Date().toISOString(),
    site_name: SITE_NAME,
    export_type: "page_backup",
    version: 1,
    user: {
      id: user.id,
      name: user.name,
      business_name: user.business_name,
      email: user.email,
      referral_code: user.referral_code
    },
    page: {
      id: order.id,
      slug: order.slug,
      public_url: order.public_url,
      full_name: order.full_name,
      business_name: order.business_name,
      bio: order.bio,
      phone: order.phone,
      theme: order.theme,
      accent_color: order.accent_color,
      lead_form_enabled: Boolean(order.lead_form_enabled),
      lead_form_prompt: order.lead_form_prompt,
      profile_media: order.profile_media,
      profile_media_type: order.profile_media_type,
      background_image: order.background_image,
      links: order.links.map((link) => ({
        label: link.label,
        url: link.url,
        section: link.section,
        platform: link.platform
      })),
      is_published: Boolean(order.is_published),
      status: order.status,
      created_at: order.created_at,
      updated_at: order.updated_at
    },
    analytics_summary: report.summary_all_time,
    leads
  };
}

app.use((req, res, next) => {
  res.locals.baseUrl = BASE_URL;
  res.locals.siteName = SITE_NAME;
  res.locals.currentPath = req.path;
  res.locals.databaseConfigured = Boolean(dbPool);
  res.locals.databaseReady = databaseReady;
  res.locals.storeLoadedFrom = storeLoadedFrom;
  res.locals.offerPriceDisplay = OFFER_PRICE_DISPLAY;
  res.locals.trialDays = TRIAL_DAYS;
  res.locals.planName = PLAN_NAME;
  res.locals.planPriceDisplay = PLAN_PRICE_DISPLAY;
  res.locals.planAccessDays = PLAN_ACCESS_DAYS;
  res.locals.referralBonusMonthsMax = REFERRAL_BONUS_MONTHS_MAX;
  res.locals.themeOptions = THEME_OPTIONS;
  res.locals.linkSectionOptions = LINK_SECTION_OPTIONS;
  res.locals.socialLinkSuggestions = SOCIAL_LINK_SUGGESTIONS;
  res.locals.supportEmail = SUPPORT_EMAIL;
  res.locals.buildPhoneContactActions = buildPhoneContactActions;
  res.locals.iconSvg = iconSvg;
  res.locals.initialVisibleLinkRows = INITIAL_VISIBLE_LINK_ROWS;
  res.locals.maxLinks = MAX_LINKS;
  res.locals.currentCustomer = getCurrentCustomer(req);
  res.locals.founderOffer = getFoundingOfferStats();
  Object.assign(res.locals, buildSeoData({
    canonicalUrl: absoluteUrl(req.path || "/")
  }));
  next();
});

app.get("/", (req, res) => {
  const published = listOrders()
    .filter((order) => order.is_published)
    .slice(0, 6)
    .map(toOrderViewModel);
  const recentSignups = listUsers()
    .slice(0, 8)
    .map((user) => {
      const firstName = String(user.name || "Someone").trim().split(/\s+/)[0] || "Someone";
      return {
        business_name: user.business_name || "New brand",
        message: `${firstName} from ${user.business_name || "a new brand"} just started a myurlc.com page.`,
        relative_created_at: formatRelativeTime(user.created_at),
        created_at: user.created_at
      };
    });

  res.render("home", {
    pageTitle: "Free Link in Bio Pages for Creators",
    published,
    recentSignups,
    founderOffer: getFoundingOfferStats(),
    ...buildSeoData({
      canonicalUrl: absoluteUrl("/"),
      metaDescription: "Launch a free link in bio page for your creator brand, business, or personal profile. myurlc.com helps you share links, collect leads, and grow through organic search.",
      structuredData: buildHomeStructuredData()
    })
  });
});

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send([
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /admin/",
    "Disallow: /billing",
    "Disallow: /health",
    "Disallow: /intake",
    "Disallow: /login",
    "Disallow: /logout",
    "Disallow: /ref/",
    "Disallow: /studio",
    "Disallow: /support",
    "Disallow: /thank-you",
    "",
    `Sitemap: ${absoluteUrl("/sitemap.xml")}`
  ].join("\n"));
});

app.get("/sitemap.xml", (req, res) => {
  const entries = buildSitemapEntries();
  const xml = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
    ...entries.map((entry) => [
      "  <url>",
      `    <loc>${escapeXml(entry.loc)}</loc>`,
      `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`,
      `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`,
      `    <priority>${escapeXml(entry.priority)}</priority>`,
      "  </url>"
    ].join("\n")),
    "</urlset>"
  ].join("\n");

  res.type("application/xml").send(xml);
});

app.get("/support", (req, res) => {
  const customer = getCurrentCustomer(req);
  const values = buildSupportValues({
    page_url: String(req.query.from || "").trim()
  }, customer);

  return renderSupportPage(res, {
    customer,
    values,
    info: req.query.sent ? `Ticket received. You can also email ${SUPPORT_EMAIL} directly if needed.` : null
  });
});

app.post("/support", (req, res) => {
  const customer = getCurrentCustomer(req);
  const values = buildSupportValues(req.body, customer);

  if (!values.name || !values.email || !values.subject || !values.message) {
    return renderSupportPage(res, {
      statusCode: 400,
      customer,
      values,
      error: "Name, email, subject, and message are required."
    });
  }

  createSupportTicket({
    user_id: customer?.id || null,
    name: values.name,
    email: values.email,
    category: values.category,
    subject: values.subject,
    message: values.message,
    page_url: values.page_url
  });

  return renderSupportPage(res, {
    customer,
    values: buildSupportValues({}, customer),
    info: `Ticket received. We will review it at ${SUPPORT_EMAIL}.`
  });
});

app.get("/signup", requireGuest, (req, res) => {
  const referralCode = sanitizeReferralCode(req.query.ref || "");
  const referrer = getUserByReferralCode(referralCode);

  renderAuthPage(res, "signup", {
    pageTitle: "Start Your Free Link in Bio Page",
    values: {
      referral_code: referrer ? referrer.referral_code : referralCode
    },
    info: referrer ? `Referred by ${referrer.business_name || referrer.name}.` : null,
    seo: {
      canonicalUrl: absoluteUrl("/signup"),
      metaDescription: "Create your free myurlc.com link in bio page. The first 500 users get lifetime access, and everyone else starts with a free trial."
    }
  });
});

app.get("/ref/:code", (req, res) => {
  const referralCode = sanitizeReferralCode(req.params.code);
  res.set("X-Robots-Tag", "noindex, nofollow");
  return res.redirect(`/signup${referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ""}`);
});

app.post("/signup", requireGuest, (req, res) => {
  const values = {
    ...buildCustomerValues(req.body),
    password: String(req.body.password || "")
  };
  const referrer = values.referral_code ? getUserByReferralCode(values.referral_code) : null;

  if (!values.full_name || !values.business_name || !values.email || !values.password) {
    return renderAuthPage(res, "signup", {
      statusCode: 400,
      pageTitle: "Start Your Free Link in Bio Page",
      error: "Name, business name, email, and password are required.",
      values,
      seo: {
        canonicalUrl: absoluteUrl("/signup"),
        metaDescription: "Create your free myurlc.com link in bio page."
      }
    });
  }

  if (values.password.length < 8) {
    return renderAuthPage(res, "signup", {
      statusCode: 400,
      pageTitle: "Start Your Free Link in Bio Page",
      error: "Use at least 8 characters for the password.",
      values,
      seo: {
        canonicalUrl: absoluteUrl("/signup"),
        metaDescription: "Create your free myurlc.com link in bio page."
      }
    });
  }

  if (getUserByEmail(values.email)) {
    return renderAuthPage(res, "signup", {
      statusCode: 400,
      pageTitle: "Start Your Free Link in Bio Page",
      error: "That email already has an account. Try logging in instead.",
      values,
      seo: {
        canonicalUrl: absoluteUrl("/signup"),
        metaDescription: "Create your free myurlc.com link in bio page."
      }
    });
  }

  if (values.referral_code && !referrer) {
    return renderAuthPage(res, "signup", {
      statusCode: 400,
      pageTitle: "Start Your Free Link in Bio Page",
      error: "That referral code was not found.",
      values,
      seo: {
        canonicalUrl: absoluteUrl("/signup"),
        metaDescription: "Create your free myurlc.com link in bio page."
      }
    });
  }

  if (referrer && normalizeEmail(referrer.email) === values.email) {
    return renderAuthPage(res, "signup", {
      statusCode: 400,
      pageTitle: "Start Your Free Link in Bio Page",
      error: "You cannot use your own referral code for this account.",
      values,
      seo: {
        canonicalUrl: absoluteUrl("/signup"),
        metaDescription: "Create your free myurlc.com link in bio page."
      }
    });
  }

  const user = createUser({
    name: values.full_name,
    business_name: values.business_name,
    email: values.email,
    password: values.password,
    referred_by_user_id: referrer ? referrer.id : null
  });

  if (referrer) {
    applyReferralReward(referrer.id);
  }

  ensureCustomerPage(user);
  req.session.customerUserId = user.id;
  return res.redirect("/studio");
});

app.get("/login", requireGuest, (req, res) => {
  renderAuthPage(res, "login", {
    pageTitle: "Log In",
    values: {},
    seo: {
      canonicalUrl: absoluteUrl("/login"),
      metaDescription: "Log in to manage your myurlc.com link in bio page.",
      metaRobots: "noindex,nofollow"
    }
  });
});

app.post("/login", requireGuest, (req, res) => {
  const values = {
    email: normalizeEmail(req.body.email),
    password: String(req.body.password || "")
  };

  const user = getUserByEmail(values.email);
  if (!user || !verifyPassword(values.password, user.password_hash)) {
    return renderAuthPage(res, "login", {
      statusCode: 401,
      pageTitle: "Log In",
      error: "Incorrect email or password.",
      values: { email: values.email },
      seo: {
        canonicalUrl: absoluteUrl("/login"),
        metaDescription: "Log in to manage your myurlc.com link in bio page.",
        metaRobots: "noindex,nofollow"
      }
    });
  }

  req.session.customerUserId = user.id;
  return res.redirect("/studio");
});

app.post("/logout", (req, res) => {
  if (req.session) {
    delete req.session.customerUserId;
  }
  res.redirect("/");
});

app.get("/billing", requireCustomer, (req, res) => {
  const order = ensureCustomerPage(req.currentCustomer);
  renderBilling(res, req.currentCustomer, order, {
    info: req.query.success ? "Payment recorded. Your account is active." : null
  });
});

app.post("/billing/create-checkout-session", requireCustomer, async (req, res) => {
  if (!stripe || !BILLING_PRICE_ID) {
    return renderBilling(res, req.currentCustomer, ensureCustomerPage(req.currentCustomer), {
      statusCode: 400,
      error: "Stripe billing is not configured yet. You can activate accounts manually for now."
    });
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: BILLING_CHECKOUT_MODE,
      line_items: [{ price: BILLING_PRICE_ID, quantity: 1 }],
      customer_email: req.currentCustomer.email,
      success_url: `${BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/billing`,
      metadata: {
        customer_user_id: String(req.currentCustomer.id)
      }
    });

    updateUser(req.currentCustomer.id, {
      billing_checkout_session_id: checkoutSession.id
    });

    return res.redirect(checkoutSession.url);
  } catch (error) {
    return renderBilling(res, req.currentCustomer, ensureCustomerPage(req.currentCustomer), {
      statusCode: 500,
      error: `Billing checkout failed: ${error.message}`
    });
  }
});

app.get("/billing/success", requireCustomer, async (req, res) => {
  const sessionId = String(req.query.session_id || "").trim();
  const checkoutSession = await verifyCheckoutSession(sessionId);

  if (!sessionId || !checkoutSession.paid) {
    return renderBilling(res, req.currentCustomer, ensureCustomerPage(req.currentCustomer), {
      statusCode: 400,
      error: "Payment could not be verified yet. If you were charged, refresh in a moment or check Stripe."
    });
  }

  extendUserPaidAccess(req.currentCustomer.id, PLAN_ACCESS_DAYS, {
    stackFromCurrentAccess: true,
    checkoutSessionId: sessionId
  });

  updateOrder(ensureCustomerPage(req.currentCustomer).id, {
    payment_status: "paid"
  });

  return res.redirect("/billing?success=1");
});

app.get("/analytics", requireCustomer, (req, res) => {
  const order = ensureCustomerPage(req.currentCustomer);
  const report = buildOrderAnalyticsReport(toOrderViewModel(order));

  renderAnalytics(res, req.currentCustomer, order, report, {
    info: !order.is_published ? "Publish your page to start collecting live traffic data." : null
  });
});

app.get("/studio/export", requireCustomer, (req, res) => {
  const order = toOrderViewModel(ensureCustomerPage(req.currentCustomer));
  const payload = buildCustomerExportPayload(req.currentCustomer, order);
  const filename = `${order.slug || "myurlc-page"}-backup.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(JSON.stringify(payload, null, 2));
});

app.get("/studio", requireCustomer, (req, res) => {
  if (!req.currentCustomer.can_access_studio) {
    return res.redirect("/billing");
  }

  const order = ensureCustomerPage(req.currentCustomer);
  renderStudio(res, req.currentCustomer, order, {
    info: req.query.saved ? "Changes saved." : null
  });
});

app.post("/studio", requireCustomer, assetUpload, (req, res) => {
  const customer = req.currentCustomer;
  if (!customer.can_access_studio) {
    return res.redirect("/billing");
  }

  const order = ensureCustomerPage(customer);
  const values = buildStudioValues(customer, order, req.body);
  const intent = String(req.body.intent || "save_draft");
  const validLinks = parseLinks(req.body);
  const uploadedProfileMedia = getUploadedAsset(req, "profile_media") || getUploadedAsset(req, "profile_image");
  const uploadedBackgroundImage = getUploadedAsset(req, "background_image");

  if (!values.full_name || !values.business_name) {
    return renderStudio(res, customer, order, {
      statusCode: 400,
      error: "Your name and business name are required.",
      values: req.body,
      preview_profile_media: uploadedProfileMedia?.url,
      preview_profile_media_type: uploadedProfileMedia?.type,
      preview_background_image: uploadedBackgroundImage?.url
    });
  }

  if (intent === "publish" && validLinks.length === 0) {
    return renderStudio(res, customer, order, {
      statusCode: 400,
      error: "Add at least one working link before publishing.",
      values: req.body,
      preview_profile_media: uploadedProfileMedia?.url,
      preview_profile_media_type: uploadedProfileMedia?.type,
      preview_background_image: uploadedBackgroundImage?.url
    });
  }

  const slugSelection = resolveSlugSelection(values.slug, values.business_name || values.full_name || order.slug, {
    currentOrderId: order.id
  });
  if (slugSelection.error) {
    return renderStudio(res, customer, order, {
      statusCode: 400,
      error: slugSelection.error,
      values: req.body,
      preview_profile_media: uploadedProfileMedia?.url,
      preview_profile_media_type: uploadedProfileMedia?.type,
      preview_background_image: uploadedBackgroundImage?.url
    });
  }

  const slug = slugSelection.slug;
  const profileMedia = req.body.remove_profile_media === "1"
    ? null
    : (uploadedProfileMedia?.url || order.profile_media || order.profile_image || null);
  const profileMediaType = req.body.remove_profile_media === "1"
    ? null
    : (uploadedProfileMedia?.type || order.profile_media_type || (profileMedia ? "image" : null));
  const backgroundImage = req.body.remove_background_image === "1"
    ? null
    : (uploadedBackgroundImage?.url || order.background_image || null);

  const isPublished = intent === "publish" ? 1 : 0;
  const status = isPublished ? "published" : "draft";

  updateUser(customer.id, {
    name: values.full_name,
    business_name: values.business_name
  });

  updateOrder(order.id, {
    owner_user_id: customer.id,
    source: "self_serve",
    email: customer.email,
    full_name: values.full_name,
    business_name: values.business_name,
    slug,
    bio: values.bio,
    phone: values.phone,
    lead_form_enabled: values.lead_form_enabled ? 1 : 0,
    lead_form_prompt: values.lead_form_prompt,
    profile_media: profileMedia,
    profile_media_type: profileMediaType,
    profile_image: profileMediaType === "image" ? profileMedia : null,
    background_image: backgroundImage,
    theme: values.theme,
    accent_color: values.accent_color,
    links_json: JSON.stringify(validLinks),
    status,
    is_published: isPublished
  }, {
    revisionReason: intent === "publish"
      ? (order.is_published ? "Before customer live update" : "Before first customer publish")
      : (intent === "unpublish" ? "Before customer unpublish" : "Before customer draft save"),
    revisionActorType: "customer",
    revisionActorUserId: customer.id,
    revisionActorLabel: "Customer"
  });

  return res.redirect("/studio?saved=1");
});

app.get("/buy", (req, res) => {
  res.render("buy", {
    pageTitle: "Buy Your Page",
    stripeEnabled: Boolean(stripe && STRIPE_PRICE_ID),
    ...buildSeoData({
      canonicalUrl: absoluteUrl("/buy"),
      metaDescription: "Order a done-for-you link in bio page from myurlc.com for your business, creator profile, or personal brand."
    })
  });
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    if (!stripe || !STRIPE_PRICE_ID) {
      return res.status(400).send("Stripe is not configured yet.");
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${BASE_URL}/intake?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/buy`,
      allow_promotion_codes: true
    });

    return res.redirect(checkoutSession.url);
  } catch (error) {
    return res.status(500).send(`Checkout error: ${error.message}`);
  }
});

app.get("/intake", async (req, res) => {
  const sessionId = String(req.query.session_id || "").trim();
  const verification = await verifyCheckoutSession(sessionId);

  renderIntake(res, {
    paid: verification.paid,
    sessionId,
    values: {
      email: verification.email
    }
  });
});

app.post("/intake", assetUpload, async (req, res) => {
  const values = buildIntakeValues(req.body);
  const links = parseLinks(req.body);
  const sessionId = String(req.body.session_id || "").trim();
  const uploadedProfileMedia = getUploadedAsset(req, "profile_media") || getUploadedAsset(req, "profile_image");
  const uploadedBackgroundImage = getUploadedAsset(req, "background_image");

  if (!values.email || !values.full_name || !values.business_name) {
    return renderIntake(res, {
      statusCode: 400,
      error: "Email, full name, and business name are required.",
      paid: false,
      sessionId,
      values: req.body
    });
  }

  if (links.length === 0) {
    return renderIntake(res, {
      statusCode: 400,
      error: "Add at least one working link for the finished page.",
      paid: false,
      sessionId,
      values: req.body
    });
  }

  if (sessionId && getOrderByStripeSessionId(sessionId)) {
    return renderIntake(res, {
      statusCode: 400,
      error: "That payment session has already been used for an order.",
      paid: true,
      sessionId,
      values: req.body
    });
  }

  const verification = await verifyCheckoutSession(sessionId);
  const paymentStatus = sessionId ? (verification.paid ? "paid" : "unpaid") : "manual";
  const slugSelection = resolveSlugSelection(values.slug, values.business_name || values.full_name || `page-${Date.now()}`);
  if (slugSelection.error) {
    return renderIntake(res, {
      statusCode: 400,
      error: slugSelection.error,
      paid: Boolean(sessionId ? verification?.paid : false),
      sessionId,
      values: req.body
    });
  }

  const slug = slugSelection.slug;
  const profileMedia = uploadedProfileMedia?.url || null;
  const profileMediaType = uploadedProfileMedia?.type || null;
  const backgroundImage = uploadedBackgroundImage?.url || null;

  createOrder({
    owner_user_id: null,
    source: "manual",
    email: values.email,
    full_name: values.full_name,
    business_name: values.business_name,
    slug,
    bio: values.bio,
    phone: values.phone,
    lead_form_enabled: 0,
    lead_form_prompt: "Send me a quick message",
    profile_media: profileMedia,
    profile_media_type: profileMediaType,
    profile_image: profileMediaType === "image" ? profileMedia : null,
    background_image: backgroundImage,
    theme: values.theme,
    accent_color: values.accent_color,
    links_json: JSON.stringify(links),
    status: "submitted",
    payment_status: paymentStatus,
    stripe_session_id: sessionId || null,
    is_published: 0
  });

  return res.redirect("/thank-you");
});

app.get("/thank-you", (req, res) => {
  res.render("thank-you", {
    pageTitle: "Thank You",
    ...buildSeoData({
      canonicalUrl: absoluteUrl("/thank-you"),
      metaRobots: "noindex,nofollow",
      metaDescription: "Thank you for submitting your page details."
    })
  });
});

app.get("/admin/login", (req, res) => {
  res.render("admin-login", {
    pageTitle: "Admin Login",
    error: null,
    ...buildSeoData({
      canonicalUrl: absoluteUrl("/admin/login"),
      metaRobots: "noindex,nofollow",
      metaDescription: "Internal admin login."
    })
  });
});

app.post("/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect("/admin");
  }

  return res.status(401).render("admin-login", {
    pageTitle: "Admin Login",
    error: "Wrong password.",
    ...buildSeoData({
      canonicalUrl: absoluteUrl("/admin/login"),
      metaRobots: "noindex,nofollow",
      metaDescription: "Internal admin login."
    })
  });
});

app.post("/admin/logout", (req, res) => {
  if (req.session) {
    delete req.session.isAdmin;
  }
  res.redirect("/");
});

app.get("/admin", requireAdmin, (req, res) => {
  const orders = listOrders().map(toOrderViewModel);
  const analyticsEvents = listAnalyticsEvents();
  const leads = listLeads();
  const supportTickets = listSupportTickets();
  const users = listUsers().map(toCustomerViewModel);
  const founderOffer = getFoundingOfferStats();
  const stats = {
    total: orders.length,
    published: orders.filter((order) => order.is_published).length,
    paid: orders.filter((order) => order.payment_status === "paid").length,
    draft: orders.filter((order) => !order.is_published).length,
    clicks: analyticsEvents.filter((event) => event.event_type === "link_click").length,
    leads: leads.length,
    tickets: supportTickets.length,
    users: users.length,
    referralMonths: users.reduce((sum, user) => sum + (user.referral_bonus_months_earned || 0), 0),
    founderMembers: founderOffer.claimed,
    founderRemaining: founderOffer.remaining
  };

  res.render("admin", {
    pageTitle: "Admin Dashboard",
    orders,
    stats,
    recentSupportTickets: supportTickets.slice(0, 8),
    ...buildSeoData({
      canonicalUrl: absoluteUrl("/admin"),
      metaRobots: "noindex,nofollow",
      metaDescription: "Internal admin dashboard."
    })
  });
});

app.post("/admin/ticket/:id/resolve", requireAdmin, (req, res) => {
  const ticket = getSupportTicketById(req.params.id);
  if (!ticket) {
    return res.status(404).send("Ticket not found");
  }

  updateSupportTicket(req.params.id, { status: "resolved" });
  return res.redirect("/admin?supportSaved=1");
});

app.get("/admin/order/:id", requireAdmin, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) {
    return res.status(404).send("Order not found");
  }

  const analyticsSummary = listAnalyticsEvents()
    .filter((event) => String(event.order_id) === String(order.id))
    .reduce((summary, event) => {
      summary.total += 1;
      if (event.event_type === "link_click") {
        summary.clicks += 1;
      }
      return summary;
    }, { total: 0, clicks: 0 });

  const recentLeads = listLeads()
    .filter((lead) => String(lead.order_id) === String(order.id))
    .slice(0, 10)
    .map((lead) => ({
      ...lead,
      formatted_created_at: formatDateTime(lead.created_at)
    }));

  return renderAdminOrder(res, order, {
    info: req.query.restored
      ? "Previous page version restored."
      : (req.query.saved ? "Order details saved." : null),
    analyticsSummary,
    recentLeads
  });
});

app.post("/admin/order/:id/update", requireAdmin, assetUpload, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) {
    return res.status(404).send("Order not found");
  }

  const values = buildAdminOrderValues(order, req.body);
  const links = parseLinks(req.body, { minRows: STUDIO_LINK_ROWS });
  const uploadedProfileMedia = getUploadedAsset(req, "profile_media") || getUploadedAsset(req, "profile_image");
  const uploadedBackgroundImage = getUploadedAsset(req, "background_image");

  if (!values.email || !values.full_name || !values.business_name) {
    return renderAdminOrder(res, order, {
      statusCode: 400,
      error: "Email, full name, and business name are required.",
      values: req.body
    });
  }

  if (links.length === 0) {
    return renderAdminOrder(res, order, {
      statusCode: 400,
      error: "Keep at least one link on the page.",
      values: req.body
    });
  }

  const slugSelection = resolveSlugSelection(values.slug, values.business_name || values.full_name || order.slug, {
    currentOrderId: order.id
  });
  if (slugSelection.error) {
    return renderAdminOrder(res, order, {
      statusCode: 400,
      error: slugSelection.error,
      values: req.body
    });
  }

  const slug = slugSelection.slug;
  const profileMedia = req.body.remove_profile_media === "1"
    ? null
    : (uploadedProfileMedia?.url || order.profile_media || order.profile_image || null);
  const profileMediaType = req.body.remove_profile_media === "1"
    ? null
    : (uploadedProfileMedia?.type || order.profile_media_type || (profileMedia ? "image" : null));
  const backgroundImage = req.body.remove_background_image === "1"
    ? null
    : (uploadedBackgroundImage?.url || order.background_image || null);

  updateOrder(order.id, {
    email: values.email,
    full_name: values.full_name,
    business_name: values.business_name,
    slug,
    bio: values.bio,
    phone: values.phone,
    lead_form_enabled: values.lead_form_enabled ? 1 : 0,
    lead_form_prompt: values.lead_form_prompt,
    profile_media: profileMedia,
    profile_media_type: profileMediaType,
    profile_image: profileMediaType === "image" ? profileMedia : null,
    background_image: backgroundImage,
    theme: values.theme,
    accent_color: values.accent_color,
    links_json: JSON.stringify(links),
    status: values.status,
    payment_status: values.payment_status,
    is_published: values.status === "published" ? 1 : 0
  }, {
    revisionReason: "Before admin page edit",
    revisionActorType: "admin",
    revisionActorLabel: "Admin"
  });

  return res.redirect(`/admin/order/${order.id}?saved=1`);
});

app.post("/admin/order/:id/revisions/:revisionId/restore", requireAdmin, (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) {
    return res.status(404).send("Order not found");
  }

  const revision = getPageRevisionById(req.params.id, req.params.revisionId);
  if (!revision) {
    return res.status(404).send("Revision not found");
  }

  const restorePayload = buildRevisionRestorePayload(revision);
  if (!restorePayload) {
    return res.status(400).send("Revision payload is not valid");
  }

  updateOrder(order.id, restorePayload, {
    revisionReason: `Before restoring revision #${revision.id}`,
    revisionActorType: "admin",
    revisionActorLabel: "Admin"
  });

  return res.redirect(`/admin/order/${order.id}?restored=1`);
});

app.post("/admin/customer/:userId/activate", requireAdmin, (req, res) => {
  extendUserPaidAccess(req.params.userId, PLAN_ACCESS_DAYS, {
    stackFromCurrentAccess: true
  });
  res.redirect(req.get("referer") || "/admin");
});

app.post("/admin/customer/:userId/deactivate", requireAdmin, (req, res) => {
  updateUser(req.params.userId, {
    billing_status: "payment_required",
    paid_access_ends_at: new Date(0).toISOString()
  });
  res.redirect(req.get("referer") || "/admin");
});

app.post("/admin/order/:id/publish", requireAdmin, (req, res) => {
  updateOrder(req.params.id, { is_published: 1, status: "published" }, {
    revisionReason: "Before admin publish",
    revisionActorType: "admin",
    revisionActorLabel: "Admin"
  });
  res.redirect(`/admin/order/${req.params.id}?saved=1`);
});

app.post("/admin/order/:id/unpublish", requireAdmin, (req, res) => {
  updateOrder(req.params.id, { is_published: 0, status: "draft" }, {
    revisionReason: "Before admin unpublish",
    revisionActorType: "admin",
    revisionActorLabel: "Admin"
  });
  res.redirect(`/admin/order/${req.params.id}?saved=1`);
});

function renderPublicPageNotFound(req, res) {
  return res.status(404).render("not-found", {
    pageTitle: "Page Not Found",
    ...buildSeoData({
      canonicalUrl: absoluteUrl(req.path),
      metaRobots: "noindex,nofollow",
      metaDescription: "The page you are looking for could not be found."
    })
  });
}

function getPublishedOrderBySlug(slug) {
  const order = toOrderViewModel(getOrderBySlug(slug));
  if (!order || !order.is_published) {
    return null;
  }
  return order;
}

function renderPublishedProfile(req, res, order, options = {}) {
  const shouldTrackView = options.trackView !== false;
  const leadError = options.leadError || null;
  const leadSuccess = options.leadSuccess || null;

  if (shouldTrackView) {
    createAnalyticsEvent({
      order_id: order.id,
      owner_user_id: order.owner_user_id || null,
      event_type: "page_view",
      ...buildRequestAnalyticsContext(req)
    });
  }

  const profileDescription = sanitizeMetaText(order.bio || `${order.business_name || order.full_name || order.slug} on ${SITE_NAME}.`);
  return res.status(options.statusCode || 200).render("profile", {
    pageTitle: order.business_name,
    order,
    leadError,
    leadSuccess,
    ...buildSeoData({
      canonicalUrl: order.public_url,
      metaDescription: profileDescription,
      ogType: "profile",
      ogImage: order.profile_media && order.profile_media_type === "image" ? absoluteUrl(order.profile_media) : "",
      structuredData: buildProfileStructuredData(order, profileDescription)
    })
  });
}

app.get("/r/:orderId/:linkIndex", (req, res) => {
  const order = toOrderViewModel(getOrderById(req.params.orderId));
  if (!order || !order.is_published) {
    return renderPublicPageNotFound(req, res);
  }

  const linkIndex = Number(req.params.linkIndex);
  const link = Number.isInteger(linkIndex) ? order.links[linkIndex] : null;
  if (!link) {
    return renderPublicPageNotFound(req, res);
  }

  createAnalyticsEvent({
    order_id: order.id,
    owner_user_id: order.owner_user_id || null,
    event_type: "link_click",
    link_label: link.label,
    link_url: link.url,
    link_index: linkIndex,
    ...buildRequestAnalyticsContext(req)
  });

  return res.redirect(link.url);
});

function handlePublicLeadSubmit(req, res) {
  const order = getPublishedOrderBySlug(req.params.slug);
  if (!order || !order.lead_form_enabled) {
    return renderPublicPageNotFound(req, res);
  }

  const name = String(req.body.name || "").trim();
  const email = normalizeEmail(req.body.email);
  const message = String(req.body.message || "").trim();

  if (!name || !email || !message) {
    return renderPublishedProfile(req, res, order, {
      statusCode: 400,
      trackView: false,
      leadError: "Name, email, and message are required."
    });
  }

  createLead({
    order_id: order.id,
    owner_user_id: order.owner_user_id || null,
    name,
    email,
    message,
    ...buildRequestAnalyticsContext(req)
  });

  createAnalyticsEvent({
    order_id: order.id,
    owner_user_id: order.owner_user_id || null,
    event_type: "lead_submission",
    ...buildRequestAnalyticsContext(req)
  });

  return renderPublishedProfile(req, res, order, {
    trackView: false,
    leadSuccess: "Message sent. The page owner can now follow up with you."
  });
}

function handlePublicProfileRequest(req, res) {
  const order = getPublishedOrderBySlug(req.params.slug);
  if (!order) {
    return renderPublicPageNotFound(req, res);
  }

  return renderPublishedProfile(req, res, order);
}

app.post("/p/:slug/lead", handlePublicLeadSubmit);
app.post("/:slug/lead", handlePublicLeadSubmit);
app.get("/p/:slug", (req, res) => {
  const path = buildPublicPagePath(req.params.slug);
  return res.redirect(301, path);
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    storage: {
      uploads: "volume",
      app_data: dbPool ? (databaseReady ? "postgres+volume-mirror" : "volume-json-fallback") : "volume-json",
      database_configured: Boolean(dbPool),
      database_ready: databaseReady,
      store_loaded_from: storeLoadedFrom
    },
    users: listUsers().length,
    pages: listOrders().length,
    leads: listLeads().length,
    events: listAnalyticsEvents().length
  });
});

app.get("/:slug", handlePublicProfileRequest);

app.use((error, req, res, next) => {
  if (
    error instanceof multer.MulterError ||
    [
      "Please upload a valid image or video file.",
      "Background images must be image files.",
      "Profile media must be an image or video file."
    ].includes(error.message)
  ) {
    if (req.path === "/studio") {
      const customer = getCurrentCustomer(req);
      if (!customer) {
        return res.redirect("/login");
      }

      return renderStudio(res, customer, ensureCustomerPage(customer), {
        statusCode: 400,
        error: error.message,
        values: req.body
      });
    }

    if (req.path.startsWith("/admin/order/")) {
      const order = getOrderById(req.params.id);
      if (!order) {
        return res.status(404).send("Order not found");
      }

      return renderAdminOrder(res, order, {
        statusCode: 400,
        error: error.message,
        values: req.body
      });
    }

    return renderIntake(res, {
      statusCode: 400,
      error: error.message,
      sessionId: String((req.body && req.body.session_id) || ""),
      values: req.body
    });
  }

  return next(error);
});

async function startServer() {
  await storeReadyPromise;
  app.listen(PORT, () => {
    const appDataMode = dbPool ? (databaseReady ? "postgres + volume mirror" : "volume JSON fallback") : "volume JSON";
    console.log(`myurlc.com app running on port ${PORT} (${appDataMode}, source: ${storeLoadedFrom})`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start myurlc.com:", error);
    process.exit(1);
  });
}

module.exports = app;
module.exports.storeReadyPromise = storeReadyPromise;
