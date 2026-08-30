require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "121624";

// --- Supabase/Postgres bağlantısı ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function checkPassword(req, res) {
  if (req.body.password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Yanlış şifre" });
    return false;
  }
  return true;
}

// --- Admin giriş kontrolü ---
app.post("/admin/login", (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false });
  }
  res.json({ ok: true });
});

// --- Kullanıcı kaydı (oyundan) ---
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.includes(" ") ||
    username.length === 0 ||
    password.length === 0
  ) {
    return res.status(400).json({ error: "Kullanıcı adı/şifre geçersiz" });
  }
  try {
    const existing = await pool.query(
      "SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)",
      [username]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: "Bu kullanıcı adı zaten alınmış" });
    }
    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, password]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// --- Kullanıcı girişi (oyundan) ---
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Kullanıcı adı/şifre gerekli" });
  }
  try {
    const result = await pool.query(
      "SELECT username FROM users WHERE LOWER(username) = LOWER($1) AND password = $2",
      [username, password]
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Kullanıcı adı veya şifre yanlış" });
    }
    res.json({ ok: true, username: result.rows[0].username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// --- Duyuru ---
app.get("/announcement", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT announcement, announcement_date FROM settings WHERE id = 1"
    );
    const row = result.rows[0] || {};
    res.json({ message: row.announcement || "", date: row.announcement_date });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

app.post("/announcement", async (req, res) => {
  if (!checkPassword(req, res)) return;
  const { message } = req.body;
  if (typeof message !== "string") {
    return res.status(400).json({ error: "message gerekli" });
  }
  const spaceIndex = message.indexOf(" ");
  const formatted =
    spaceIndex === -1
      ? message
      : message.substring(0, spaceIndex) + ": " + message.substring(spaceIndex + 1);
  try {
    await pool.query(
      "UPDATE settings SET announcement = $1, announcement_date = NOW() WHERE id = 1",
      [formatted]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// --- Skor gönderme (oyundan) ---
app.post("/score", async (req, res) => {
  const { player, points } = req.body;
  if (typeof player !== "string" || typeof points !== "number") {
    return res.status(400).json({ error: "player ve points gerekli" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO scores (player, points, last_played)
       VALUES ($1, $2, NOW())
       ON CONFLICT (player)
       DO UPDATE SET points = scores.points + EXCLUDED.points, last_played = NOW()
       RETURNING points`,
      [player, points]
    );
    res.json({ ok: true, total: result.rows[0].points });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// --- Admin panelden manuel puan verme ---
app.post("/admin/give-points", async (req, res) => {
  if (!checkPassword(req, res)) return;
  const { target, points } = req.body;
  if (typeof points !== "number") {
    return res.status(400).json({ error: "points gerekli" });
  }
  try {
    if (target === "all" || target === "All") {
      await pool.query("UPDATE scores SET points = points + $1", [points]);
    } else {
      if (typeof target !== "string" || target.includes(" ") || target.length === 0) {
        return res.status(400).json({ error: "Kullanıcı adı geçersiz (boşluk olamaz)" });
      }
      await pool.query(
        `INSERT INTO scores (player, points, last_played)
         VALUES ($1, $2, NOW())
         ON CONFLICT (player)
         DO UPDATE SET points = scores.points + EXCLUDED.points, last_played = NOW()`,
        [target, points]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// --- Liderlik tablosu ---
app.get("/leaderboard", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT player, points, last_played AS \"lastPlayed\" FROM scores ORDER BY points DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// --- Oyuncu silme ---
app.delete("/score/:player", async (req, res) => {
  try {
    await pool.query("DELETE FROM scores WHERE player = $1", [req.params.player]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT} portunda çalışıyor`));
  
