import "dotenv/config";
import express from "express";
import session from "express-session";
import path from "node:path";
import fs from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import multer from "multer";
import { z } from "zod";
import { db, transaction } from "./db.js";
import { LocalSessionStore } from "./sessionStore.js";
import { authRoutes, current, admin } from "./auth.js";

const app = express();
const port = Number(process.env.PORT || 4000);
fs.mkdirSync("data", { recursive: true });
fs.mkdirSync("uploads", { recursive: true });
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET)
  throw new Error("SESSION_SECRET is required in production.");
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    name: "everafter.sid",
    store: new LocalSessionStore(),
    secret: process.env.SESSION_SECRET || randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 86400000,
    },
  }),
);
app.use("/uploads", express.static(path.resolve("uploads")));
authRoutes(app);
app.patch("/api/profile", current, (req, res) => {
  const { name, email } = req.body || {};
  if (
    typeof name !== "string" ||
    name.trim().length < 2 ||
    typeof email !== "string" ||
    !/^\S+@\S+\.\S+$/.test(email)
  )
    return res
      .status(400)
      .json({ error: "Enter a name and valid email address." });
  const normalizedEmail = email.toLowerCase();
  const existing = db
    .prepare("SELECT id FROM users WHERE email=? AND id<>?")
    .get(normalizedEmail, req.session.user!.id);
  if (existing)
    return res.status(409).json({ error: "That email is already in use." });
  db.prepare("UPDATE users SET name=?,email=? WHERE id=?").run(
    name.trim(),
    normalizedEmail,
    req.session.user!.id,
  );
  req.session.user = {
    ...req.session.user!,
    name: name.trim(),
    email: normalizedEmail,
  };
  res.json(req.session.user);
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
app.post("/api/upload", current, upload.single("image"), async (req, res) => {
  const file = req.file;
  if (!file)
    return res
      .status(400)
      .json({ error: "Choose a JPG, PNG or WebP image under 5 MB." });
  const bytes = file.buffer;
  const ext =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? ".jpg"
      : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? ".png"
        : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP"
          ? ".webp"
          : "";
  if (!ext)
    return res
      .status(400)
      .json({ error: "The file contents are not a supported image." });
  const filename = `${randomUUID()}${ext}`;
  await writeFile(path.resolve("uploads", filename), bytes, { flag: "wx" });
  res.status(201).json({ url: `/uploads/${filename}` });
});
app.get("/api/catalog", (req, res) => {
  const search = String(req.query.q || "").toLowerCase();
  const venues = db
    .prepare(
      "SELECT * FROM venues WHERE active=1 AND (lower(name) LIKE ? OR lower(location) LIKE ?)",
    )
    .all(`%${search}%`, `%${search}%`);
  const vendors = db
    .prepare(
      "SELECT v.*, (SELECT json_group_array(json_object('id',p.id,'name',p.name,'description',p.description,'price',p.price)) FROM packages p WHERE p.vendor_id=v.id AND p.active=1) packages FROM vendors v WHERE v.active=1 AND (lower(v.name) LIKE ? OR lower(v.category) LIKE ? OR lower(v.location) LIKE ?)",
    )
    .all(`%${search}%`, `%${search}%`, `%${search}%`);
  res.json({ venues, vendors });
});
app.get("/api/catalog/vendors/:id/reviews", (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT r.rating,r.body,u.name customer,r.created_at FROM reviews r JOIN users u ON u.id=r.user_id JOIN bookings b ON b.id=r.booking_id JOIN packages p ON p.id=b.package_id WHERE p.vendor_id=? AND r.status='Published' ORDER BY r.created_at DESC LIMIT 5",
      )
      .all(req.params.id),
  ),
);
app.get("/api/catalog/venues/:id/reviews", (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT r.rating,r.body,u.name customer,r.created_at FROM reviews r JOIN users u ON u.id=r.user_id JOIN bookings b ON b.id=r.booking_id WHERE b.resource_type='venue' AND b.resource_id=? AND r.status='Published' ORDER BY r.created_at DESC LIMIT 5",
      )
      .all(req.params.id),
  ),
);
const eventSchema = z.object({
  name: z.string().min(2).max(100),
  couple: z.string().min(2).max(100),
  date: z.string().min(8),
  location: z.string().min(2).max(150),
  guests: z.coerce.number().int().min(0).max(100000),
  budget: z.coerce.number().min(0),
  notes: z.string().max(2000).optional(),
});
const ownsEvent = (id: number, userId: number) =>
  db
    .prepare("SELECT * FROM events WHERE id=? AND user_id=?")
    .get(id, userId) as any;
app.get("/api/events", current, (req, res) =>
  res.json(
    db
      .prepare("SELECT * FROM events WHERE user_id=? ORDER BY date")
      .all(req.session.user!.id),
  ),
);
app.post("/api/events", current, (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0].message });
  const e = parsed.data;
  const r = db
    .prepare(
      "INSERT INTO events(user_id,name,couple,date,location,guests,budget,notes) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(
      req.session.user!.id,
      e.name,
      e.couple,
      e.date,
      e.location,
      e.guests,
      e.budget,
      e.notes || "",
    );
  res
    .status(201)
    .json(db.prepare("SELECT * FROM events WHERE id=?").get(r.lastInsertRowid));
});
app.put("/api/events/:id", current, (req, res) => {
  const id = Number(req.params.id);
  if (!ownsEvent(id, req.session.user!.id)) return res.sendStatus(404);
  const p = eventSchema.safeParse(req.body);
  if (!p.success)
    return res.status(400).json({ error: p.error.issues[0].message });
  const e = p.data;
  db.prepare(
    "UPDATE events SET name=?,couple=?,date=?,location=?,guests=?,budget=?,notes=? WHERE id=?",
  ).run(
    e.name,
    e.couple,
    e.date,
    e.location,
    e.guests,
    e.budget,
    e.notes || "",
    id,
  );
  res.json(ownsEvent(id, req.session.user!.id));
});
app.delete("/api/events/:id", current, (req, res) => {
  const id = Number(req.params.id);
  if (!ownsEvent(id, req.session.user!.id)) return res.sendStatus(404);
  db.prepare("DELETE FROM events WHERE id=?").run(id);
  res.json({ ok: true });
});
app.get("/api/events/:id/functions", current, (req, res) => {
  if (!ownsEvent(Number(req.params.id), req.session.user!.id))
    return res.sendStatus(404);
  res.json(
    db
      .prepare("SELECT * FROM functions WHERE event_id=? ORDER BY date,time")
      .all(req.params.id),
  );
});
app.post("/api/events/:id/functions", current, (req, res) => {
  if (!ownsEvent(Number(req.params.id), req.session.user!.id))
    return res.sendStatus(404);
  const {
    name,
    date,
    time = "",
    venue = "",
    description = "",
  } = req.body || {};
  if (!name || !date)
    return res
      .status(400)
      .json({ error: "Function name and date are required." });
  const r = db
    .prepare(
      "INSERT INTO functions(event_id,name,date,time,venue,description) VALUES(?,?,?,?,?,?)",
    )
    .run(req.params.id, name, date, time, venue, description);
  res
    .status(201)
    .json(
      db.prepare("SELECT * FROM functions WHERE id=?").get(r.lastInsertRowid),
    );
});
app.put("/api/functions/:id", current, (req, res) => {
  const row = db
    .prepare(
      "SELECT f.id,e.user_id FROM functions f JOIN events e ON e.id=f.event_id WHERE f.id=?",
    )
    .get(req.params.id) as any;
  if (!row || row.user_id !== req.session.user!.id) return res.sendStatus(404);
  const {
    name,
    date,
    time = "",
    venue = "",
    description = "",
    status = "Planned",
  } = req.body || {};
  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  )
    return res
      .status(400)
      .json({ error: "Function name and date are required." });
  db.prepare(
    "UPDATE functions SET name=?,date=?,time=?,venue=?,description=?,status=? WHERE id=?",
  ).run(
    name.trim(),
    date,
    String(time).slice(0, 30),
    String(venue).slice(0, 180),
    String(description).slice(0, 1000),
    status,
    row.id,
  );
  res.json(db.prepare("SELECT * FROM functions WHERE id=?").get(row.id));
});
app.delete("/api/functions/:id", current, (req, res) => {
  const row = db
    .prepare(
      "SELECT f.id,e.user_id FROM functions f JOIN events e ON e.id=f.event_id WHERE f.id=?",
    )
    .get(req.params.id) as any;
  if (!row || row.user_id !== req.session.user!.id) return res.sendStatus(404);
  db.prepare("DELETE FROM functions WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.get("/api/bookings", current, (req, res) =>
  res.json(
    req.session.user!.role === "admin"
      ? db
          .prepare(
            "SELECT b.*,u.name customer,e.name event FROM bookings b JOIN users u ON u.id=b.user_id JOIN events e ON e.id=b.event_id ORDER BY b.created_at DESC",
          )
          .all()
      : db
          .prepare(
            "SELECT b.*,e.name event FROM bookings b JOIN events e ON e.id=b.event_id WHERE b.user_id=? ORDER BY b.created_at DESC",
          )
          .all(req.session.user!.id),
  ),
);
app.post("/api/bookings", current, (req, res) => {
  const {
    eventId,
    resourceType,
    resourceId,
    packageId,
    date,
    details = "",
  } = req.body || {};
  const event = ownsEvent(Number(eventId), req.session.user!.id);
  if (!event)
    return res.status(404).json({ error: "Wedding event not found." });
  let title = "",
    price = 0;
  if (resourceType === "venue") {
    const row = db
      .prepare("SELECT name,price FROM venues WHERE id=? AND active=1")
      .get(resourceId) as any;
    if (!row) return res.status(404).json({ error: "Venue not available." });
    title = row.name;
    price = row.price;
  } else if (resourceType === "package") {
    const row = db
      .prepare(
        "SELECT p.name,p.price,v.name vendor FROM packages p JOIN vendors v ON v.id=p.vendor_id WHERE p.id=? AND p.active=1 AND v.active=1",
      )
      .get(packageId || resourceId) as any;
    if (!row) return res.status(404).json({ error: "Package not available." });
    title = `${row.vendor} — ${row.name}`;
    price = row.price;
  } else return res.status(400).json({ error: "Choose a venue or package." });
  if (!date)
    return res.status(400).json({ error: "Requested date is required." });
  const id = transaction(() => {
    const r = db
      .prepare(
        "INSERT INTO bookings(user_id,event_id,resource_type,resource_id,package_id,title,date,price,details) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        req.session.user!.id,
        eventId,
        resourceType,
        resourceType === "package" ? packageId || resourceId : resourceId,
        resourceType === "package" ? packageId || resourceId : null,
        title,
        date,
        price,
        String(details).slice(0, 1000),
      );
    db.prepare(
      "INSERT INTO booking_history(booking_id,status,note) VALUES(?,?,?)",
    ).run(r.lastInsertRowid, "Pending", "Request submitted by customer");
    return r.lastInsertRowid;
  });
  res.status(201).json(db.prepare("SELECT * FROM bookings WHERE id=?").get(id));
});
app.put("/api/bookings/:id/status", current, admin, (req, res) => {
  const { status, note = "" } = req.body || {};
  if (!["Approved", "Rejected", "Completed"].includes(status))
    return res.status(400).json({ error: "Choose an allowed booking status." });
  const b = db
    .prepare("SELECT * FROM bookings WHERE id=?")
    .get(req.params.id) as any;
  if (!b) return res.sendStatus(404);
  try {
    transaction(() => {
      if (status === "Approved") {
        const conflict = db
          .prepare(
            "SELECT id FROM bookings WHERE id<>? AND resource_type=? AND resource_id=? AND date=? AND status='Approved'",
          )
          .get(b.id, b.resource_type, b.resource_id, b.date);
        if (conflict)
          throw Object.assign(new Error("Booking conflict"), {
            code: "BOOKING_CONFLICT",
          });
      }
      db.prepare("UPDATE bookings SET status=?,status_note=? WHERE id=?").run(
        status,
        String(note).slice(0, 500),
        b.id,
      );
      db.prepare(
        "INSERT INTO booking_history(booking_id,status,note) VALUES(?,?,?)",
      ).run(b.id, status, String(note).slice(0, 500));
    });
  } catch (error) {
    if ((error as any).code === "BOOKING_CONFLICT")
      return res.status(409).json({
        error: "That resource already has an approved booking for this date.",
      });
    throw error;
  }
  res.json(db.prepare("SELECT * FROM bookings WHERE id=?").get(b.id));
});
app.post("/api/bookings/:id/cancel", current, (req, res) => {
  const b = db
    .prepare("SELECT * FROM bookings WHERE id=? AND user_id=?")
    .get(req.params.id, req.session.user!.id) as any;
  if (!b) return res.sendStatus(404);
  if (!["Pending", "Approved"].includes(b.status))
    return res.status(400).json({ error: "This booking cannot be cancelled." });
  transaction(() => {
    db.prepare("UPDATE bookings SET status='Cancelled' WHERE id=?").run(b.id);
    db.prepare(
      "INSERT INTO booking_history(booking_id,status,note) VALUES(?,'Cancelled','Cancelled by customer')",
    ).run(b.id);
  });
  res.json({ ok: true });
});
app.get("/api/events/:id/expenses", current, (req, res) => {
  if (!ownsEvent(Number(req.params.id), req.session.user!.id))
    return res.sendStatus(404);
  res.json({
    items: db
      .prepare("SELECT * FROM expenses WHERE event_id=? ORDER BY due_date")
      .all(req.params.id),
    totals: db
      .prepare(
        "SELECT COALESCE(SUM(estimated),0) estimated,COALESCE(SUM(actual),0) actual FROM expenses WHERE event_id=?",
      )
      .get(req.params.id),
  });
});
app.post("/api/events/:id/expenses", current, (req, res) => {
  if (!ownsEvent(Number(req.params.id), req.session.user!.id))
    return res.sendStatus(404);
  const {
    category,
    description,
    estimated = 0,
    actual = 0,
    dueDate = "",
  } = req.body || {};
  if (
    !category ||
    !description ||
    !Number.isFinite(Number(estimated)) ||
    !Number.isFinite(Number(actual)) ||
    Number(estimated) < 0 ||
    Number(actual) < 0
  )
    return res.status(400).json({
      error: "Enter a category, description and non-negative amounts.",
    });
  const r = db
    .prepare(
      "INSERT INTO expenses(event_id,category,description,estimated,actual,due_date) VALUES(?,?,?,?,?,?)",
    )
    .run(req.params.id, category, description, estimated, actual, dueDate);
  res
    .status(201)
    .json(
      db.prepare("SELECT * FROM expenses WHERE id=?").get(r.lastInsertRowid),
    );
});
app.put("/api/expenses/:id", current, (req, res) => {
  const row = db
    .prepare(
      "SELECT x.*,e.user_id FROM expenses x JOIN events e ON e.id=x.event_id WHERE x.id=?",
    )
    .get(req.params.id) as any;
  if (!row || row.user_id !== req.session.user!.id) return res.sendStatus(404);
  const {
    category,
    description,
    estimated,
    actual,
    dueDate = "",
  } = req.body || {};
  if (!category || !description || Number(estimated) < 0 || Number(actual) < 0)
    return res
      .status(400)
      .json({ error: "Valid category, description and amounts are required." });
  db.prepare(
    "UPDATE expenses SET category=?,description=?,estimated=?,actual=?,due_date=? WHERE id=?",
  ).run(category, description, estimated, actual, dueDate, row.id);
  res.json({ ok: true });
});
app.delete("/api/expenses/:id", current, (req, res) => {
  const row = db
    .prepare(
      "SELECT x.id,e.user_id FROM expenses x JOIN events e ON e.id=x.event_id WHERE x.id=?",
    )
    .get(req.params.id) as any;
  if (!row || row.user_id !== req.session.user!.id) return res.sendStatus(404);
  db.prepare("DELETE FROM expenses WHERE id=?").run(row.id);
  res.json({ ok: true });
});
app.get("/api/events/:id/guests", current, (req, res) => {
  if (!ownsEvent(Number(req.params.id), req.session.user!.id))
    return res.sendStatus(404);
  res.json(
    db
      .prepare(
        "SELECT g.*,f.name function_name FROM guests g LEFT JOIN functions f ON f.id=g.function_id WHERE g.event_id=? ORDER BY g.name",
      )
      .all(req.params.id),
  );
});
app.post("/api/events/:id/guests", current, (req, res) => {
  if (!ownsEvent(Number(req.params.id), req.session.user!.id))
    return res.sendStatus(404);
  const {
    name,
    email = "",
    phone = "",
    rsvp = "Pending",
    functionId = null,
  } = req.body || {};
  if (!name) return res.status(400).json({ error: "Guest name is required." });
  if (
    functionId &&
    !db
      .prepare("SELECT id FROM functions WHERE id=? AND event_id=?")
      .get(functionId, req.params.id)
  )
    return res
      .status(400)
      .json({ error: "Choose a function from this wedding." });
  const r = db
    .prepare(
      "INSERT INTO guests(event_id,name,email,phone,rsvp,function_id) VALUES(?,?,?,?,?,?)",
    )
    .run(req.params.id, name, email, phone, rsvp, functionId);
  res
    .status(201)
    .json(db.prepare("SELECT * FROM guests WHERE id=?").get(r.lastInsertRowid));
});
app.patch("/api/guests/:id", current, (req, res) => {
  const row = db
    .prepare(
      "SELECT g.id,e.user_id FROM guests g JOIN events e ON e.id=g.event_id WHERE g.id=?",
    )
    .get(req.params.id) as any;
  if (!row || row.user_id !== req.session.user!.id) return res.sendStatus(404);
  const { rsvp, functionId = null } = req.body;
  if (!rsvp || !["Pending", "Yes", "No"].includes(rsvp))
    return res.status(400).json({ error: "Invalid RSVP." });
  if (
    functionId &&
    !db
      .prepare(
        "SELECT id FROM functions WHERE id=? AND event_id=(SELECT event_id FROM guests WHERE id=?)",
      )
      .get(functionId, row.id)
  )
    return res
      .status(400)
      .json({ error: "Choose a function from this wedding." });
  db.prepare("UPDATE guests SET rsvp=?,function_id=? WHERE id=?").run(
    rsvp,
    functionId,
    row.id,
  );
  res.json({ ok: true });
});
app.delete("/api/guests/:id", current, (req, res) => {
  const row = db
    .prepare(
      "SELECT g.id,e.user_id FROM guests g JOIN events e ON e.id=g.event_id WHERE g.id=?",
    )
    .get(req.params.id) as any;
  if (!row || row.user_id !== req.session.user!.id) return res.sendStatus(404);
  db.prepare("DELETE FROM guests WHERE id=?").run(row.id);
  res.json({ ok: true });
});
app.post("/api/bookings/:id/reviews", current, (req, res) => {
  const b = db
    .prepare(
      "SELECT * FROM bookings WHERE id=? AND user_id=? AND status='Completed'",
    )
    .get(req.params.id, req.session.user!.id) as any;
  if (!b)
    return res
      .status(403)
      .json({ error: "A review is available after a booking is completed." });
  const { rating, body } = req.body;
  if (
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    typeof body !== "string" ||
    body.trim().length < 8
  )
    return res
      .status(400)
      .json({ error: "Choose a rating and write at least 8 characters." });
  try {
    db.prepare(
      "INSERT INTO reviews(user_id,booking_id,rating,body) VALUES(?,?,?,?)",
    ).run(req.session.user!.id, b.id, rating, body.trim());
    res.status(201).json({ ok: true });
  } catch {
    res.status(409).json({ error: "You have already reviewed this booking." });
  }
});
app.get("/api/admin/summary", current, admin, (_req, res) =>
  res.json({
    customers: (
      db
        .prepare("SELECT COUNT(*) n FROM users WHERE role='customer'")
        .get() as any
    ).n,
    venues: (
      db.prepare("SELECT COUNT(*) n FROM venues WHERE active=1").get() as any
    ).n,
    services: (
      db.prepare("SELECT COUNT(*) n FROM vendors WHERE active=1").get() as any
    ).n,
    pending: (
      db
        .prepare("SELECT COUNT(*) n FROM bookings WHERE status='Pending'")
        .get() as any
    ).n,
    approved: (
      db
        .prepare("SELECT COUNT(*) n FROM bookings WHERE status='Approved'")
        .get() as any
    ).n,
    rejected: (
      db
        .prepare("SELECT COUNT(*) n FROM bookings WHERE status='Rejected'")
        .get() as any
    ).n,
    recent: db
      .prepare(
        "SELECT b.*,u.name customer,e.name event FROM bookings b JOIN users u ON u.id=b.user_id JOIN events e ON e.id=b.event_id ORDER BY b.created_at DESC LIMIT 8",
      )
      .all(),
  }),
);
app.get("/api/admin/catalog", current, admin, (_req, res) =>
  res.json({
    venues: db.prepare("SELECT * FROM venues ORDER BY active DESC,name").all(),
    vendors: db
      .prepare(
        "SELECT v.*, (SELECT json_group_array(json_object('id',p.id,'name',p.name,'description',p.description,'price',p.price,'active',p.active)) FROM packages p WHERE p.vendor_id=v.id) packages FROM vendors v ORDER BY v.active DESC,v.name",
      )
      .all(),
  }),
);
app.get("/api/admin/reviews", current, admin, (_req, res) =>
  res.json(
    db
      .prepare(
        "SELECT r.*,u.name customer,b.title FROM reviews r JOIN users u ON u.id=r.user_id JOIN bookings b ON b.id=r.booking_id ORDER BY r.created_at DESC",
      )
      .all(),
  ),
);
app.patch("/api/admin/reviews/:id", current, admin, (req, res) => {
  if (!["Published", "Hidden"].includes(req.body.status))
    return res.status(400).json({ error: "Invalid moderation status." });
  db.prepare("UPDATE reviews SET status=? WHERE id=?").run(
    req.body.status,
    req.params.id,
  );
  res.json({ ok: true });
});
app.post("/api/admin/venues", current, admin, (req, res) => {
  const {
    name,
    description,
    location,
    capacity,
    price,
    type,
    facilities = "",
    image = "",
  } = req.body;
  if (
    !name ||
    !description ||
    !location ||
    Number(capacity) < 1 ||
    Number(price) < 0
  )
    return res.status(400).json({ error: "Complete required venue fields." });
  const r = db
    .prepare(
      "INSERT INTO venues(name,description,location,capacity,price,type,facilities,image) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(name, description, location, capacity, price, type, facilities, image);
  res.status(201).json({ id: r.lastInsertRowid });
});
app.put("/api/admin/venues/:id", current, admin, (req, res) => {
  const {
    name,
    description,
    location,
    capacity,
    price,
    type,
    facilities = "",
    image = "",
    active = 1,
  } = req.body;
  db.prepare(
    "UPDATE venues SET name=?,description=?,location=?,capacity=?,price=?,type=?,facilities=?,image=?,active=? WHERE id=?",
  ).run(
    name,
    description,
    location,
    capacity,
    price,
    type,
    facilities,
    image,
    active,
    req.params.id,
  );
  res.json({ ok: true });
});
app.delete("/api/admin/venues/:id", current, admin, (req, res) => {
  db.prepare("UPDATE venues SET active=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.post("/api/admin/vendors", current, admin, (req, res) => {
  const {
    name,
    description,
    category,
    location,
    image = "",
    contact = "",
  } = req.body;
  if (!name || !description || !category || !location)
    return res.status(400).json({ error: "Complete required service fields." });
  const r = db
    .prepare(
      "INSERT INTO vendors(name,description,category,location,image,contact) VALUES(?,?,?,?,?,?)",
    )
    .run(name, description, category, location, image, contact);
  res.status(201).json({ id: r.lastInsertRowid });
});
app.put("/api/admin/vendors/:id", current, admin, (req, res) => {
  const {
    name,
    description,
    category,
    location,
    image = "",
    contact = "",
    active = 1,
  } = req.body;
  db.prepare(
    "UPDATE vendors SET name=?,description=?,category=?,location=?,image=?,contact=?,active=? WHERE id=?",
  ).run(
    name,
    description,
    category,
    location,
    image,
    contact,
    active,
    req.params.id,
  );
  res.json({ ok: true });
});
app.delete("/api/admin/vendors/:id", current, admin, (req, res) => {
  db.prepare("UPDATE vendors SET active=0 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.post("/api/admin/packages", current, admin, (req, res) => {
  const { vendorId, name, description = "", price } = req.body;
  if (!vendorId || !name || Number(price) < 0)
    return res
      .status(400)
      .json({ error: "Enter package, provider and price." });
  const r = db
    .prepare(
      "INSERT INTO packages(vendor_id,name,description,price) VALUES(?,?,?,?)",
    )
    .run(vendorId, name, description, price);
  res.status(201).json({ id: r.lastInsertRowid });
});
app.put("/api/admin/packages/:id", current, admin, (req, res) => {
  const { name, description = "", price, active = 1 } = req.body;
  if (!name || !Number.isFinite(Number(price)) || Number(price) < 0)
    return res
      .status(400)
      .json({ error: "Enter a package name and non-negative price." });
  db.prepare(
    "UPDATE packages SET name=?,description=?,price=?,active=? WHERE id=?",
  ).run(name, description, price, active, req.params.id);
  res.json({ ok: true });
});
app.delete("/api/admin/packages/:id", current, admin, (req, res) => {
  const used = db
    .prepare("SELECT id FROM bookings WHERE package_id=? LIMIT 1")
    .get(req.params.id);
  if (used)
    return res.status(409).json({
      error: "This package has booking history. Deactivate it instead.",
    });
  db.prepare("DELETE FROM packages WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.delete("/api/admin/venues/:id/permanent", current, admin, (req, res) => {
  db.prepare("DELETE FROM venues WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.delete("/api/admin/vendors/:id/permanent", current, admin, (req, res) => {
  const used = db
    .prepare(
      "SELECT b.id FROM bookings b JOIN packages p ON p.id=b.package_id WHERE p.vendor_id=? LIMIT 1",
    )
    .get(req.params.id);
  if (used)
    return res.status(409).json({
      error:
        "This provider has booking history. Deactivate the provider instead.",
    });
  db.prepare("DELETE FROM vendors WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.get("/api/admin/customers", current, admin, (_req, res) =>
  res.json(
    db
      .prepare(
        "SELECT id,name,email,created_at FROM users WHERE role='customer' ORDER BY created_at DESC",
      )
      .all(),
  ),
);
app.delete("/api/admin/customers/:id", current, admin, (req, res) => {
  const customer = db
    .prepare("SELECT id FROM users WHERE id=? AND role='customer'")
    .get(req.params.id);
  if (!customer) return res.sendStatus(404);
  db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});
app.listen(port, () =>
  console.log(`Everafter API listening at http://localhost:${port}`),
);
