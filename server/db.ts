import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const file = process.env.DATABASE_PATH || "./data/wedding.sqlite";
fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
export const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
export const transaction = <T>(fn: () => T): T => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, couple TEXT NOT NULL, date TEXT NOT NULL, location TEXT NOT NULL, guests INTEGER NOT NULL DEFAULT 0, budget REAL NOT NULL DEFAULT 0, notes TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Planning', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS functions(id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, name TEXT NOT NULL, date TEXT NOT NULL, time TEXT DEFAULT '', venue TEXT DEFAULT '', description TEXT DEFAULT '', status TEXT DEFAULT 'Planned');
CREATE TABLE IF NOT EXISTS venues(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, location TEXT NOT NULL, capacity INTEGER NOT NULL, price REAL NOT NULL, type TEXT NOT NULL, facilities TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, is_demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS vendors(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, location TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, is_demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS packages(id INTEGER PRIMARY KEY, vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', price REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1, is_demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, resource_type TEXT NOT NULL CHECK(resource_type IN ('venue','package')), resource_id INTEGER NOT NULL, package_id INTEGER REFERENCES packages(id), title TEXT NOT NULL, date TEXT NOT NULL, price REAL NOT NULL, details TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected','Cancelled','Completed')), status_note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS booking_history(id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE, status TEXT NOT NULL, note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL, category TEXT NOT NULL, description TEXT NOT NULL, estimated REAL NOT NULL DEFAULT 0, actual REAL NOT NULL DEFAULT 0, due_date TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS guests(id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, name TEXT NOT NULL, email TEXT DEFAULT '', phone TEXT DEFAULT '', rsvp TEXT NOT NULL DEFAULT 'Pending' CHECK(rsvp IN ('Pending','Yes','No')), function_id INTEGER REFERENCES functions(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Published','Hidden')), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id); CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id); CREATE INDEX IF NOT EXISTS idx_bookings_resource_date ON bookings(resource_type,resource_id,date,status); CREATE INDEX IF NOT EXISTS idx_guests_event ON guests(event_id); CREATE INDEX IF NOT EXISTS idx_expenses_event ON expenses(event_id);
`);
for (const [table, column] of [
  ["venues", "is_demo"],
  ["vendors", "is_demo"],
  ["packages", "is_demo"],
]) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`,
    );
    db.exec(`UPDATE ${table} SET ${column}=1`);
  }
}
const seeded = db.prepare("SELECT COUNT(*) n FROM venues").get() as {
  n: number;
};
if (!seeded.n) {
  const venues = [
    [
      "The Gulmohar Courtyard",
      "A restored haveli courtyard framed by flowering trees and warm sandstone.",
      "Jaipur, Rajasthan",
      320,
      285000,
      "Heritage",
      "Courtyard, bridal suite, catering kitchen, valet",
      "/images/gulmohar.svg",
    ],
    [
      "Serein by the Lake",
      "A quiet lakeside estate with lawns that catch the last light beautifully.",
      "Udaipur, Rajasthan",
      240,
      420000,
      "Lakeside",
      "Lake lawn, indoor hall, rooms, boat access",
      "/images/serein.svg",
    ],
    [
      "House of Banyan",
      "A contemporary garden venue with generous shade and a clean modern pavilion.",
      "Goa",
      180,
      195000,
      "Garden",
      "Garden, pavilion, sound system, parking",
      "/images/banyan.svg",
    ],
  ];
  const add = db.prepare(
    "INSERT INTO venues(name,description,location,capacity,price,type,facilities,image,is_demo) VALUES(?,?,?,?,?,?,?,?,1)",
  );
  venues.forEach((v) => add.run(...v));
  const vendors = [
    [
      "Saffron & Salt",
      "Seasonal menus rooted in regional Indian kitchens, served with quiet precision.",
      "Catering",
      "Jaipur",
      "/images/catering.svg",
      "hello@saffronandsalt.in",
    ],
    [
      "Mogra Studio",
      "Floral installations and intimate tablescapes using locally sourced blooms.",
      "Decoration",
      "Udaipur",
      "/images/flowers.svg",
      "studio@mogra.in",
    ],
    [
      "The Still Hour",
      "Documentary wedding photography with an honest, film-inspired eye.",
      "Photography",
      "Mumbai",
      "/images/photo.svg",
      "hello@stillhour.in",
    ],
    [
      "Aangan Lights",
      "Thoughtful lighting and stage design that brings the architecture forward.",
      "Lighting",
      "Jaipur",
      "/images/lights.svg",
      "team@aangan.in",
    ],
  ];
  const addVendor = db.prepare(
    "INSERT INTO vendors(name,description,category,location,image,contact,is_demo) VALUES(?,?,?,?,?,?,1)",
  );
  vendors.forEach((v) => addVendor.run(...v));
  const addPack = db.prepare(
    "INSERT INTO packages(vendor_id,name,description,price,is_demo) VALUES(?,?,?,?,1)",
  );
  [
    [
      1,
      "Gathering Table",
      "Regional vegetarian and non-vegetarian menu for 100 guests",
      185000,
    ],
    [
      1,
      "The Grand Feast",
      "Five-course celebration menu with live counters",
      320000,
    ],
    [2, "Mogra & Marigold", "Ceremony flowers and dining tablescape", 145000],
    [
      3,
      "Full Story",
      "Two photographers across three wedding functions",
      210000,
    ],
    [4, "Evening Glow", "Ambient lighting plan and custom stage", 175000],
  ].forEach((p) => addPack.run(...p));
}
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (
  adminEmail &&
  adminPassword &&
  !db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail)
) {
  db.prepare(
    "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
  ).run(
    process.env.ADMIN_NAME || "Administrator",
    adminEmail,
    bcrypt.hashSync(adminPassword, 12),
    "admin",
  );
}
