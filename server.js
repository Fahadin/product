require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const db = new Database("shop.db");
const PORT = process.env.PORT || 3000;
const STORE_NAME = process.env.STORE_NAME || "AnyShop";
const CURRENCY = process.env.STORE_CURRENCY || "BDT";
const notifyEmail = process.env.ORDER_NOTIFY_EMAIL || "kawsarkamal59@gmail.com";

if (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD) {
  console.error("Set SESSION_SECRET and ADMIN_PASSWORD in your .env file.");
  process.exit(1);
}

db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT DEFAULT 'General',
 description TEXT DEFAULT '', price REAL NOT NULL, image TEXT DEFAULT '', stock INTEGER DEFAULT 0,
 active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, email TEXT NOT NULL,
 phone TEXT NOT NULL, address TEXT NOT NULL, notes TEXT DEFAULT '', items_json TEXT NOT NULL,
 total REAL NOT NULL, status TEXT DEFAULT 'New', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);
const adminEmail = (process.env.ADMIN_EMAIL || "kawsarkamal59@gmail.com").toLowerCase();
const existingAdmin = db.prepare("SELECT id FROM admins WHERE email = ?").get(adminEmail);
if (!existingAdmin) {
  db.prepare("INSERT INTO admins (email,password_hash) VALUES (?,?)")
    .run(adminEmail, bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12));
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.db", dir: "." }),
  secret: process.env.SESSION_SECRET,
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));
const loginLimiter = rateLimit({ windowMs: 15 *  60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: "Please log in as admin." });
  next();
}
function cleanText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
function money(value) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: CURRENCY, maximumFractionDigits: 2 }).format(value);
}
function mailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

app.get("/api/store", (req, res) => {
  const products = db.prepare("SELECT id,name,category,description,price,image,stock FROM products WHERE active=1 AND stock>0 ORDER BY id DESC").all();
  res.json({ storeName: STORE_NAME, currency: CURRENCY, products });
});
app.post("/api/orders", async (req, res) => {
  try {
    const name = cleanText(req.body.name, 100), email = cleanText(req.body.email, 160);
    const phone = cleanText(req.body.phone, 40), address = cleanText(req.body.address, 500);
    const notes = cleanText(req.body.notes, 500);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || !address)
      return res.status(400).json({ error: "Please complete your name, valid email, phone and delivery address." });
    const requested = Array.isArray(req.body.items) ? req.body.items : [];
    if (!requested.length || requested.length > 30) return res.status(400).json({ error: "Your cart is empty or too large." });

    const getProduct = db.prepare("SELECT id,name,price,stock FROM products WHERE id=? AND active=1");
    const orderItems = [];
    let total = 0;
    const decrement = db.prepare("UPDATE products SET stock=stock-? WHERE id=? AND stock>=?");
    const insertOrder = db.prepare(`INSERT INTO orders (customer_name,email,phone,address,notes,items_json,total)
      VALUES (?,?,?,?,?,?,?)`);
    const placeOrder = db.transaction(() => {
      for (const item of requested) {
        const id = Number(item.id), qty = Math.max(1, Math.min(99, Math.floor(Number(item.quantity))));
        const product = getProduct.get(id);
        if (!product || !Number.isInteger(qty) || product.stock < qty) throw new Error("One or more items are no longer available in the requested quantity.");
        orderItems.push({ id: product.id, name: product.name, price: product.price, quantity: qty });
        total += product.price * qty;
      }
      for (const item of orderItems) {
        const result = decrement.run(item.quantity, item.id, item.quantity);
        if (!result.changes) throw new Error("Stock changed while placing your order. Please try again.");
      }
      return insertOrder.run(name, email, phone, address, notes, JSON.stringify(orderItems), total).lastInsertRowid;
    });
    const orderId = placeOrder();

    const lines = orderItems.map(i => `${i.name} × ${i.quantity} — ${money(i.price * i.quantity)}`).join("\n");
    const transport = mailer();
    if (transport) {
      await transport.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: notifyEmail,
        subject: `New order #${orderId} — ${STORE_NAME}`,
        text: `A new order was placed.\n\nOrder: #${orderId}\nCustomer: ${name}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}\n\nItems:\n${lines}\n\nTotal: ${money(total)}\nNotes: ${notes || "None"}`
      });
    } else {
      console.warn("Order saved, but email was not sent: SMTP settings are missing.");
    }
    res.status(201).json({ message: "Order received!", orderId, emailConfigured: !!transport });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not place order." });
  }
});

app.post("/api/admin/login", loginLimiter, (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const admin = db.prepare("SELECT * FROM admins WHERE email=?").get(email);
  if (!admin || !bcrypt.compareSync(String(req.body.password || ""), admin.password_hash))
    return res.status(401).json({ error: "Incorrect email or password." });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start a secure session." });
    req.session.adminId = admin.id;
    res.json({ ok: true });
  });
});
app.post("/api/admin/logout", requireAdmin, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/admin/me", requireAdmin, (req, res) => res.json({ ok: true, email: adminEmail }));
app.get("/api/admin/products", requireAdmin, (req, res) => res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all()));
app.post("/api/admin/products", requireAdmin, (req, res) => {
  const p = req.body;
  const name = cleanText(p.name, 120), category = cleanText(p.category, 80) || "General";
  const description = cleanText(p.description, 1000), image = cleanText(p.image, 1000);
  const price = Number(p.price), stock = Math.floor(Number(p.stock));
  if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0)
    return res.status(400).json({ error: "Enter a product name, valid price and stock quantity." });
  const result = db.prepare("INSERT INTO products (name,category,description,price,image,stock,active) VALUES (?,?,?,?,?,?,?)")
    .run(name, category, description, price, image, stock, p.active === false ? 0 : 1);
  res.status(201).json({ id: result.lastInsertRowid });
});
app.put("/api/admin/products/:id", requireAdmin, (req, res) => {
  const p = req.body, name = cleanText(p.name, 120), price = Number(p.price), stock = Math.floor(Number(p.stock));
  if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0)
    return res.status(400).json({ error: "Enter a product name, valid price and stock quantity." });
  const result = db.prepare(`UPDATE products SET name=?,category=?,description=?,price=?,image=?,stock=?,active=? WHERE id=?`)
    .run(name, cleanText(p.category,80)||"General", cleanText(p.description,1000), price, cleanText(p.image,1000), stock, p.active === false ? 0 : 1, Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Product not found." });
  res.json({ ok: true });
});
app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM products WHERE id=?").run(Number(req.params.id));
  res.json({ ok: true });
});
app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const orders = db.prepare("SELECT * FROM orders ORDER BY id DESC").all().map(o => ({ ...o, items: JSON.parse(o.items_json) }));
  res.json(orders);
});
app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const allowed = ["New","Processing","Shipped","Completed","Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Invalid order status." });
  db.prepare("UPDATE orders SET status=? WHERE id=?").run(req.body.status, Number(req.params.id));
  res.json({ ok: true });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`${STORE_NAME} running at http://localhost:${PORT}`));
