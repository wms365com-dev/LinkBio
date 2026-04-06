require("dotenv").config();

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

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const THEME_OPTIONS = [
  { value: "midnight", label: "Midnight Glass" },
  { value: "linen", label: "Linen Studio" },
  { value: "sunset", label: "Sunset Pop" }
];

const THEME_ALIASES = {
  dark: "midnight",
  light: "linen"
};

const STATUS_OPTIONS = ["submitted", "in_review", "ready", "published", "draft"];
const PAYMENT_STATUS_OPTIONS = ["manual", "paid", "unpaid"];

const dataDir = fs.existsSync("/data") ? "/data" : path.join(__dirname, "data");
const uploadDir = path.join(dataDir, "uploads");
const dataFile = path.join(dataDir, "linkbio.json");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify({ orders: [] }, null, 2));
}

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
  res.locals.baseUrl = BASE_URL;
  res.locals.offerPriceDisplay = OFFER_PRICE_DISPLAY;
  res.locals.themeOptions = THEME_OPTIONS;
  next();
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
    fileSize: 3 * 1024 * 1024
  },
  fileFilter(req, file, cb) {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      return cb(null, true);
    }
    return cb(new Error("Please upload a valid image file."));
  }
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect("/admin/login");
}

function readStore() {
  try {
    const raw = fs.readFileSync(dataFile, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.orders)) {
      return { orders: [] };
    }
    return parsed;
  } catch (error) {
    return { orders: [] };
  }
}

function writeStore(store) {
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

function getOrders() {
  return readStore().orders;
}

function listOrders() {
  return [...getOrders()].sort((left, right) => Number(right.id) - Number(left.id));
}

function createOrder(input) {
  const store = readStore();
  const nextId = store.orders.reduce((maxId, order) => Math.max(maxId, Number(order.id) || 0), 0) + 1;
  const order = {
    id: nextId,
    email: input.email || "",
    full_name: input.full_name || "",
    business_name: input.business_name || "",
    slug: input.slug,
    bio: input.bio || "",
    phone: input.phone || "",
    profile_image: input.profile_image || null,
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

  const nextOrder = {
    ...store.orders[index],
    ...updates,
    theme: normalizeTheme(updates.theme ?? store.orders[index].theme),
    accent_color: sanitizeAccentColor(updates.accent_color ?? store.orders[index].accent_color)
  };

  store.orders[index] = nextOrder;
  writeStore(store);
  return nextOrder;
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

function makeSlug(text) {
  return slugify(text || "", { lower: true, strict: true, trim: true });
}

function readLinks(linksJson) {
  try {
    const parsed = JSON.parse(linksJson || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function buildLinkRows(source) {
  const labels = arrayify(source.link_label);
  const urls = arrayify(source.link_url);
  const rowCount = Math.max(labels.length, urls.length, 5);

  return Array.from({ length: rowCount }, (_, index) => ({
    label: labels[index] || "",
    url: urls[index] || ""
  }));
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

function parseLinks(body) {
  const rows = buildLinkRows(body);
  const links = [];

  rows.forEach((row) => {
    const label = row.label.trim();
    const url = normalizeLinkUrl(row.url);
    if (label && url) {
      links.push({ label, url });
    }
  });

  return links.slice(0, 8);
}

function buildIntakeValues(body = {}) {
  return {
    email: String(body.email || "").trim(),
    full_name: String(body.full_name || "").trim(),
    business_name: String(body.business_name || "").trim(),
    slug: String(body.slug || "").trim(),
    bio: String(body.bio || "").trim(),
    phone: String(body.phone || "").trim(),
    theme: normalizeTheme(body.theme),
    accent_color: sanitizeAccentColor(body.accent_color),
    links: buildLinkRows(body)
  };
}

function toOrderViewModel(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    theme: normalizeTheme(row.theme),
    accent_color: sanitizeAccentColor(row.accent_color),
    links: readLinks(row.links_json),
    public_url: `${BASE_URL}/p/${row.slug}`
  };
}

function buildAdminOrderValues(row, body = {}) {
  const order = toOrderViewModel(row);

  if (!body || Object.keys(body).length === 0) {
    return {
      ...order,
      links: [...order.links, ...Array.from({ length: Math.max(0, 5 - order.links.length) }, () => ({ label: "", url: "" }))]
    };
  }

  return {
    ...order,
    email: String(body.email || "").trim(),
    full_name: String(body.full_name || "").trim(),
    business_name: String(body.business_name || "").trim(),
    slug: String(body.slug || "").trim(),
    bio: String(body.bio || "").trim(),
    phone: String(body.phone || "").trim(),
    theme: normalizeTheme(body.theme),
    accent_color: sanitizeAccentColor(body.accent_color),
    status: STATUS_OPTIONS.includes(body.status) ? body.status : order.status,
    payment_status: PAYMENT_STATUS_OPTIONS.includes(body.payment_status) ? body.payment_status : order.payment_status,
    links: buildLinkRows(body),
    profile_image: body.remove_profile_image === "1" ? null : order.profile_image
  };
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

function ensureUniqueSlug(baseSlug, orderIdToIgnore) {
  let slug = baseSlug || `page-${Date.now()}`;
  let candidate = slug;
  let counter = 2;

  while (true) {
    const existing = getOrderBySlug(candidate);
    if (!existing || String(existing.id) === String(orderIdToIgnore || "")) {
      return candidate;
    }
    candidate = `${slug}-${counter++}`;
  }
}

async function verifyCheckoutSession(sessionId) {
  if (!stripe || !sessionId) {
    return { paid: false, email: "" };
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
    return {
      paid: checkoutSession.payment_status === "paid",
      email: checkoutSession.customer_details?.email || checkoutSession.customer_email || ""
    };
  } catch (error) {
    return { paid: false, email: "" };
  }
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
  const statusCode = options.statusCode || 200;

  return res.status(statusCode).render("admin-order", {
    pageTitle: `${order.business_name || "Order"} Details`,
    error: options.error || null,
    info: options.info || null,
    order,
    statusOptions: STATUS_OPTIONS,
    paymentStatusOptions: PAYMENT_STATUS_OPTIONS
  });
}

app.get("/", (req, res) => {
  const published = listOrders()
    .filter((order) => order.is_published)
    .slice(0, 6)
    .map(toOrderViewModel);

  res.render("home", {
    pageTitle: "Custom Link Pages",
    published
  });
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

app.post("/intake", upload.single("profile_image"), async (req, res) => {
  const values = buildIntakeValues(req.body);
  const links = parseLinks(req.body);
  const sessionId = String(req.body.session_id || "").trim();

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

  let slugBase = makeSlug(values.slug || values.business_name || values.full_name);
  if (!slugBase) {
    slugBase = `page-${Date.now()}`;
  }
  const slug = ensureUniqueSlug(slugBase);

  const profileImage = req.file ? `/uploads/${req.file.filename}` : null;

  createOrder({
    email: values.email,
    full_name: values.full_name,
    business_name: values.business_name,
    slug,
    bio: values.bio,
    phone: values.phone,
    profile_image: profileImage,
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
  const { password } = req.body;
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
  req.session.destroy(() => res.redirect("/"));
});

app.get("/admin", requireAdmin, (req, res) => {
  const orders = listOrders().map(toOrderViewModel);

  const stats = {
    total: orders.length,
    published: orders.filter((order) => order.is_published).length,
    paid: orders.filter((order) => order.payment_status === "paid").length,
    draft: orders.filter((order) => !order.is_published).length
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

  return renderAdminOrder(res, order, {
    info: req.query.saved ? "Order details saved." : null
  });
});

app.post("/admin/order/:id/update", requireAdmin, upload.single("profile_image"), (req, res) => {
  const order = getOrderById(req.params.id);
  if (!order) {
    return res.status(404).send("Order not found");
  }

  const values = buildAdminOrderValues(order, req.body);
  const links = parseLinks(req.body);

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

  let slugBase = makeSlug(values.slug || values.business_name || values.full_name);
  if (!slugBase) {
    slugBase = order.slug;
  }
  const slug = ensureUniqueSlug(slugBase, order.id);

  const profileImage = req.body.remove_profile_image === "1"
    ? null
    : (req.file ? `/uploads/${req.file.filename}` : order.profile_image);

  updateOrder(order.id, {
    email: values.email,
    full_name: values.full_name,
    business_name: values.business_name,
    slug,
    bio: values.bio,
    phone: values.phone,
    profile_image: profileImage,
    theme: values.theme,
    accent_color: values.accent_color,
    links_json: JSON.stringify(links),
    status: values.status,
    payment_status: values.payment_status,
    is_published: values.status === "published" ? 1 : 0
  });

  return res.redirect(`/admin/order/${order.id}?saved=1`);
});

app.post("/admin/order/:id/publish", requireAdmin, (req, res) => {
  updateOrder(req.params.id, { is_published: 1, status: "published" });
  res.redirect(`/admin/order/${req.params.id}?saved=1`);
});

app.post("/admin/order/:id/unpublish", requireAdmin, (req, res) => {
  updateOrder(req.params.id, { is_published: 0, status: "draft" });
  res.redirect(`/admin/order/${req.params.id}?saved=1`);
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
    order
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError || error.message === "Please upload a valid image file.") {
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
