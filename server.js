require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const methodOverride = require("method-override");
const Stripe = require("stripe");
const slugify = require("slugify");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev_secret_change_me";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || "";
const OFFER_PRICE_DISPLAY = process.env.OFFER_PRICE_DISPLAY || "$1";
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 7);
const PLAN_NAME = process.env.PLAN_NAME || "LinkBio Pro";
const PLAN_PRICE_DISPLAY = process.env.PLAN_PRICE_DISPLAY || "$9/month";
const BILLING_PRICE_ID = process.env.BILLING_PRICE_ID || STRIPE_PRICE_ID;
const BILLING_CHECKOUT_MODE = process.env.BILLING_CHECKOUT_MODE || "payment";

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

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
const PLAN_ACCESS_DAYS = Number(process.env.PLAN_ACCESS_DAYS || 30);
const REFERRAL_BONUS_MONTHS_MAX = Number(process.env.REFERRAL_BONUS_MONTHS_MAX || 12);

const dataDir = fs.existsSync("/data") ? "/data" : path.join(__dirname, "data");
const uploadDir = path.join(dataDir, "uploads");
const dataFile = path.join(dataDir, "linkbio.json");

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
    analytics_events: Array.isArray(store.analytics_events) ? store.analytics_events : [],
    leads: Array.isArray(store.leads) ? store.leads : []
  };
}

if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify(normalizeStore(), null, 2));
}

function readStore() {
  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    return normalizeStore();
  }
}

function writeStore(store) {
  fs.writeFileSync(dataFile, JSON.stringify(normalizeStore(store), null, 2));
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

function makeSlug(text) {
  return slugify(text || "", { lower: true, strict: true, trim: true });
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
  const allowed = ["trialing", "active", "referral_active", "payment_required"];
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
  const referralAccessEndsAt = addDays(trialEndsAt, referralBonusMonthsEarned * PLAN_ACCESS_DAYS);
  const legacyActive = normalizeBillingStatus(user.billing_status || "trialing") === "active" && !user.paid_access_ends_at;
  const paidAccessEndsAt = parseDateValue(user.paid_access_ends_at) || (
    legacyActive
      ? addDays(maxDateValue(now, user.paid_at, trialEndsAt) || now, PLAN_ACCESS_DAYS)
      : null
  );
  const accessEndsAt = maxDateValue(trialEndsAt, referralAccessEndsAt, paidAccessEndsAt) || trialEndsAt;
  const trialActive = now.getTime() <= trialEndsAt.getTime();
  const paidActive = paidAccessEndsAt ? now.getTime() <= paidAccessEndsAt.getTime() : false;
  const referralActive = !paidActive && !trialActive && now.getTime() <= referralAccessEndsAt.getTime();
  const billingStatus = paidActive
    ? "active"
    : (trialActive ? "trialing" : (referralActive ? "referral_active" : "payment_required"));
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
    access_ends_at: accessEndsAt.toISOString(),
    billing_status: billingStatus,
    trial_expired: !trialActive,
    trial_days_remaining: trialDaysRemaining,
    referral_days_remaining: referralDaysRemaining,
    paid_days_remaining: paidDaysRemaining,
    referral_bonus_months_earned: referralBonusMonthsEarned,
    successful_referrals_count: successfulReferralsCount,
    referral_months_remaining_to_earn: referralMonthsRemainingToEarn,
    referral_code: sanitizeReferralCode(user.referral_code),
    has_active_plan: paidActive,
    has_bonus_access: referralActive,
    can_access_studio: now.getTime() <= accessEndsAt.getTime(),
    formatted_trial_end: formatDate(trialEndsAt.toISOString()),
    formatted_referral_access_end: formatDate(referralAccessEndsAt.toISOString()),
    formatted_paid_access_end: paidAccessEndsAt ? formatDate(paidAccessEndsAt.toISOString()) : "",
    formatted_access_end: formatDate(accessEndsAt.toISOString()),
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
    .slice(0, 12);
}

function generateReferralCode(users, seed = "") {
  const existingCodes = new Set((Array.isArray(users) ? users : []).map((user) => sanitizeReferralCode(user.referral_code)));
  let candidate = sanitizeReferralCode(seed).slice(0, 6);

  while (!candidate || existingCodes.has(candidate)) {
    candidate = `LB${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  }

  return candidate;
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

  return getUsers().find((user) => sanitizeReferralCode(user.referral_code) === normalized) || null;
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
    referral_code: generateReferralCode(store.users, input.business_name || input.name),
    referred_by_user_id: referredByUserId,
    referral_bonus_months_earned: 0,
    created_at: now.toISOString()
  };

  store.users.push(user);
  writeStore(store);
  return toCustomerViewModel(user);
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
  return toCustomerViewModel(nextUser);
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
    referral_code: generateReferralCode(getUsers(), user.business_name || user.name)
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

function createAnalyticsEvent(input) {
  const store = readStore();
  const event = {
    id: nextId(store.analytics_events),
    order_id: input.order_id || null,
    owner_user_id: input.owner_user_id || null,
    event_type: input.event_type,
    link_label: input.link_label || null,
    link_url: input.link_url || null,
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
    created_at: new Date().toISOString()
  };

  store.leads.push(lead);
  writeStore(store);
  return lead;
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
  return getOrders().find((order) => order.slug === slug) || null;
}

function getOrderByStripeSessionId(sessionId) {
  return getOrders().find((order) => order.stripe_session_id === sessionId) || null;
}

function getOrderByOwnerUserId(userId) {
  return getOrders().find((order) => String(order.owner_user_id || "") === String(userId)) || null;
}

function createOrder(input) {
  const store = readStore();
  const order = {
    id: nextId(store.orders),
    owner_user_id: input.owner_user_id || null,
    source: input.source || "manual",
    email: input.email || "",
    full_name: input.full_name || "",
    business_name: input.business_name || "",
    slug: input.slug,
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
    created_at: new Date().toISOString()
  };

  store.orders.push(order);
  writeStore(store);
  return order;
}

function updateOrder(id, updates) {
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
    profile_media: nextProfileMedia,
    profile_media_type: nextProfileMediaType,
    profile_image: nextProfileMediaType === "image" ? nextProfileMedia : null,
    background_image: updates.background_image ?? existingOrder.background_image ?? null,
    theme: normalizeTheme(updates.theme ?? existingOrder.theme),
    accent_color: sanitizeAccentColor(updates.accent_color ?? existingOrder.accent_color)
  };

  store.orders[index] = nextOrder;
  writeStore(store);
  return nextOrder;
}

function ensureUniqueSlug(baseSlug, orderIdToIgnore) {
  const rootSlug = baseSlug || `page-${Date.now()}`;
  let candidate = rootSlug;
  let counter = 2;

  while (true) {
    const existing = getOrderBySlug(candidate);
    if (!existing || String(existing.id) === String(orderIdToIgnore || "")) {
      return candidate;
    }
    candidate = `${rootSlug}-${counter++}`;
  }
}

function toOrderViewModel(row) {
  if (!row) {
    return null;
  }

  const linkCollections = buildLinkCollections(readLinks(row.links_json), { orderId: row.id });
  const profileMedia = row.profile_media || row.profile_image || null;
  const profileMediaType = normalizeMediaType(row.profile_media_type) || (profileMedia ? "image" : null);

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
    public_url: `${BASE_URL}/p/${row.slug}`
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
    values: options.values || {}
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
    values
  });
}

function renderAdminOrder(res, row, options = {}) {
  const order = buildAdminOrderValues(row, options.values);
  const ownerUser = row && row.owner_user_id ? toCustomerViewModel(getUserById(row.owner_user_id)) : null;
  const statusCode = options.statusCode || 200;

  return res.status(statusCode).render("admin-order", {
    pageTitle: `${order.business_name || "Order"} Details`,
    error: options.error || null,
    info: options.info || null,
    order,
    ownerUser,
    analyticsSummary: options.analyticsSummary || { total: 0, clicks: 0 },
    recentLeads: options.recentLeads || [],
    statusOptions: STATUS_OPTIONS,
    paymentStatusOptions: PAYMENT_STATUS_OPTIONS
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

  return res.status(statusCode).render("studio", {
    pageTitle: "Page Studio",
    error: options.error || null,
    info: options.info || null,
    user,
    order,
    values,
    preview
  });
}

function renderBilling(res, user, row, options = {}) {
  const order = toOrderViewModel(row);
  const statusCode = options.statusCode || 200;

  return res.status(statusCode).render("billing", {
    pageTitle: "Billing",
    error: options.error || null,
    info: options.info || null,
    user,
    order,
    billingConfigured: Boolean(stripe && BILLING_PRICE_ID),
    trialExpired: user.trial_expired
  });
}

app.use((req, res, next) => {
  res.locals.baseUrl = BASE_URL;
  res.locals.offerPriceDisplay = OFFER_PRICE_DISPLAY;
  res.locals.trialDays = TRIAL_DAYS;
  res.locals.planName = PLAN_NAME;
  res.locals.planPriceDisplay = PLAN_PRICE_DISPLAY;
  res.locals.planAccessDays = PLAN_ACCESS_DAYS;
  res.locals.referralBonusMonthsMax = REFERRAL_BONUS_MONTHS_MAX;
  res.locals.themeOptions = THEME_OPTIONS;
  res.locals.linkSectionOptions = LINK_SECTION_OPTIONS;
  res.locals.socialLinkSuggestions = SOCIAL_LINK_SUGGESTIONS;
  res.locals.initialVisibleLinkRows = INITIAL_VISIBLE_LINK_ROWS;
  res.locals.maxLinks = MAX_LINKS;
  res.locals.currentCustomer = getCurrentCustomer(req);
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
        message: `${firstName} from ${user.business_name || "a new brand"} just started a LinkBio page.`,
        relative_created_at: formatRelativeTime(user.created_at),
        created_at: user.created_at
      };
    });

  res.render("home", {
    pageTitle: "Custom Link Pages",
    published,
    recentSignups
  });
});

app.get("/signup", requireGuest, (req, res) => {
  const referralCode = sanitizeReferralCode(req.query.ref || "");
  const referrer = getUserByReferralCode(referralCode);

  renderAuthPage(res, "signup", {
    pageTitle: "Create Your Account",
    values: {
      referral_code: referrer ? referrer.referral_code : referralCode
    },
    info: referrer ? `Referred by ${referrer.business_name || referrer.name}.` : null
  });
});

app.get("/ref/:code", (req, res) => {
  const referralCode = sanitizeReferralCode(req.params.code);
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
      pageTitle: "Create Your Account",
      error: "Name, business name, email, and password are required.",
      values
    });
  }

  if (values.password.length < 8) {
    return renderAuthPage(res, "signup", {
      statusCode: 400,
      pageTitle: "Create Your Account",
      error: "Use at least 8 characters for the password.",
      values
    });
  }

  if (getUserByEmail(values.email)) {
    return renderAuthPage(res, "signup", {
      statusCode: 400,
      pageTitle: "Create Your Account",
      error: "That email already has an account. Try logging in instead.",
      values
    });
  }

  if (values.referral_code && !referrer) {
    return renderAuthPage(res, "signup", {
      statusCode: 400,
      pageTitle: "Create Your Account",
      error: "That referral code was not found.",
      values
    });
  }

  if (referrer && normalizeEmail(referrer.email) === values.email) {
    return renderAuthPage(res, "signup", {
      statusCode: 400,
      pageTitle: "Create Your Account",
      error: "You cannot use your own referral code for this account.",
      values
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
    values: {}
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
      values: { email: values.email }
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

  const slugBase = makeSlug(values.slug || values.business_name || values.full_name) || order.slug;
  const slug = ensureUniqueSlug(slugBase, order.id);
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
  });

  return res.redirect("/studio?saved=1");
});

app.get("/buy", (req, res) => {
  res.render("buy", {
    pageTitle: "Buy Your Page",
    stripeEnabled: Boolean(stripe && STRIPE_PRICE_ID)
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
  const slugBase = makeSlug(values.slug || values.business_name || values.full_name) || `page-${Date.now()}`;
  const slug = ensureUniqueSlug(slugBase);
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
    pageTitle: "Thank You"
  });
});

app.get("/admin/login", (req, res) => {
  res.render("admin-login", {
    pageTitle: "Admin Login",
    error: null
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
    error: "Wrong password."
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
  const users = listUsers().map(toCustomerViewModel);
  const stats = {
    total: orders.length,
    published: orders.filter((order) => order.is_published).length,
    paid: orders.filter((order) => order.payment_status === "paid").length,
    draft: orders.filter((order) => !order.is_published).length,
    clicks: analyticsEvents.filter((event) => event.event_type === "link_click").length,
    leads: leads.length,
    users: users.length,
    referralMonths: users.reduce((sum, user) => sum + (user.referral_bonus_months_earned || 0), 0)
  };

  res.render("admin", {
    pageTitle: "Admin Dashboard",
    orders,
    stats
  });
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
    info: req.query.saved ? "Order details saved." : null,
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

  const slugBase = makeSlug(values.slug || values.business_name || values.full_name) || order.slug;
  const slug = ensureUniqueSlug(slugBase, order.id);
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
  });

  return res.redirect(`/admin/order/${order.id}?saved=1`);
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
  updateOrder(req.params.id, { is_published: 1, status: "published" });
  res.redirect(`/admin/order/${req.params.id}?saved=1`);
});

app.post("/admin/order/:id/unpublish", requireAdmin, (req, res) => {
  updateOrder(req.params.id, { is_published: 0, status: "draft" });
  res.redirect(`/admin/order/${req.params.id}?saved=1`);
});

app.get("/r/:orderId/:linkIndex", (req, res) => {
  const order = toOrderViewModel(getOrderById(req.params.orderId));
  if (!order || !order.is_published) {
    return res.status(404).render("not-found", {
      pageTitle: "Page Not Found"
    });
  }

  const linkIndex = Number(req.params.linkIndex);
  const link = Number.isInteger(linkIndex) ? order.links[linkIndex] : null;
  if (!link) {
    return res.status(404).render("not-found", {
      pageTitle: "Page Not Found"
    });
  }

  createAnalyticsEvent({
    order_id: order.id,
    owner_user_id: order.owner_user_id || null,
    event_type: "link_click",
    link_label: link.label,
    link_url: link.url
  });

  return res.redirect(link.url);
});

app.post("/p/:slug/lead", (req, res) => {
  const order = toOrderViewModel(getOrderBySlug(req.params.slug));
  if (!order || !order.is_published || !order.lead_form_enabled) {
    return res.status(404).render("not-found", {
      pageTitle: "Page Not Found"
    });
  }

  const name = String(req.body.name || "").trim();
  const email = normalizeEmail(req.body.email);
  const message = String(req.body.message || "").trim();

  if (!name || !email || !message) {
    return res.status(400).render("profile", {
      pageTitle: order.business_name,
      order,
      leadError: "Name, email, and message are required.",
      leadSuccess: null
    });
  }

  createLead({
    order_id: order.id,
    owner_user_id: order.owner_user_id || null,
    name,
    email,
    message
  });

  createAnalyticsEvent({
    order_id: order.id,
    owner_user_id: order.owner_user_id || null,
    event_type: "lead_submission"
  });

  return res.status(200).render("profile", {
    pageTitle: order.business_name,
    order,
    leadError: null,
    leadSuccess: "Message sent. The page owner can now follow up with you."
  });
});

app.get("/p/:slug", (req, res) => {
  const order = toOrderViewModel(getOrderBySlug(req.params.slug));
  if (!order || !order.is_published) {
    return res.status(404).render("not-found", {
      pageTitle: "Page Not Found"
    });
  }

  return res.render("profile", {
    pageTitle: order.business_name,
    order,
    leadError: null,
    leadSuccess: null
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    users: listUsers().length,
    pages: listOrders().length,
    leads: listLeads().length,
    events: listAnalyticsEvents().length
  });
});

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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LinkBio MVP running on port ${PORT}`);
  });
}

module.exports = app;
