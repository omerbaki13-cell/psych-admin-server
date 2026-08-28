const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

// --- Duyuru (Announcement) ---

// Oyun bunu her açılışta / menüde periyodik çeker
app.get("/announcement", (req, res) => {
  const data = loadData();
  res.json({
    message: data.announcement || "",
    date: data.announcementDate,
  });
});

// Admin panelden yeni duyuru gönderir
app.post("/announcement", (req, res) => {
  const { message } = req.body;
  if (typeof message !== "string") {
    return res.status(400).json({ error: "message gerekli (string)" });
  }
  const data = loadData();
  data.announcement = message;
  data.announcementDate = new Date().toISOString();
  saveData(data);
  res.json({ ok: true });
});

// --- Liderlik Tablosu (Leaderboard) ---

// Oyun maç bitince buraya skor gönderir
// body: { player: "isim", points: 3 }  (points = 100'er nota bazlı puan)
app.post("/score", (req, res) => {
  const { player, points } = req.body;
  if (typeof player !== "string" || typeof points !== "number") {
    return res.status(400).json({ error: "player (string) ve points (number) gerekli" });
  }
  const data = loadData();
  const existing = data.scores.find((s) => s.player === player);
  if (existing) {
    existing.points += points;
    existing.lastPlayed = new Date().toISOString();
  } else {
    data.scores.push({
      player,
      points,
      lastPlayed: new Date().toISOString(),
    });
  }
  saveData(data);
  res.json({ ok: true, total: existing ? existing.points : points });
});

// Panel ve oyun sıralamayı okur
app.get("/leaderboard", (req, res) => {
  const data = loadData();
  const sorted = [...data.scores].sort((a, b) => b.points - a.points);
  res.json(sorted);
});

// Admin panelden bir oyuncuyu silmek için
app.delete("/score/:player", (req, res) => {
  const data = loadData();
  data.scores = data.scores.filter((s) => s.player !== req.params.player);
  saveData(data);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT} portunda çalışıyor`));
