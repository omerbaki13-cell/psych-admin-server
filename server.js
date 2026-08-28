const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ADMIN_PASSWORD = "121624";
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { announcement: "", announcementDate: null, scores: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

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

// --- Duyuru ---
app.get("/announcement", (req, res) => {
  const data = loadData();
  res.json({ message: data.announcement || "", date: data.announcementDate });
});

app.post("/announcement", (req, res) => {
  if (!checkPassword(req, res)) return;
  const { message } = req.body;
  if (typeof message !== "string") {
    return res.status(400).json({ error: "message gerekli" });
  }
  const data = loadData();
  data.announcement = message;
  data.announcementDate = new Date().toISOString();
  saveData(data);
  res.json({ ok: true });
});

// --- Skor gönderme (oyundan) ---
app.post("/score", (req, res) => {
  const { player, points } = req.body;
  if (typeof player !== "string" || typeof points !== "number") {
    return res.status(400).json({ error: "player ve points gerekli" });
  }
  const data = loadData();
  const existing = data.scores.find((s) => s.player === player);
  if (existing) {
    existing.points += points;
    existing.lastPlayed = new Date().toISOString();
  } else {
    data.scores.push({ player, points, lastPlayed: new Date().toISOString() });
  }
  saveData(data);
  res.json({ ok: true, total: existing ? existing.points : points });
});

// --- Admin panelden manuel puan verme ---
app.post("/admin/give-points", (req, res) => {
  if (!checkPassword(req, res)) return;
  const { target, points } = req.body;
  if (typeof points !== "number") {
    return res.status(400).json({ error: "points gerekli" });
  }

  const data = loadData();

  if (target === "all" || target === "All") {
    data.scores.forEach((s) => (s.points += points));
  } else {
    if (typeof target !== "string" || target.includes(" ") || target.length === 0) {
      return res.status(400).json({ error: "Kullanıcı adı geçersiz (boşluk olamaz)" });
    }
    const existing = data.scores.find((s) => s.player === target);
    if (existing) {
      existing.points += points;
      existing.lastPlayed = new Date().toISOString();
    } else {
      data.scores.push({ player: target, points, lastPlayed: new Date().toISOString() });
    }
  }

  saveData(data);
  res.json({ ok: true });
});

// --- Liderlik tablosu ---
app.get("/leaderboard", (req, res) => {
  const data = loadData();
  res.json([...data.scores].sort((a, b) => b.points - a.points));
});

// --- Oyuncu silme ---
app.delete("/score/:player", (req, res) => {
  const data = loadData();
  data.scores = data.scores.filter((s) => s.player !== req.params.player);
  saveData(data);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT} portunda çalışıyor`));
