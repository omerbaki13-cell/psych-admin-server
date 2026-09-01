try {
  require("dotenv").config();
} catch (e) {
  // dotenv yuklu degilse Render uzerindeki ortam degiskenleriyle devam eder
}

const express = require("express");
const path = require("path");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ADMIN_PASSWORD = "121624";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

console.log("SUPABASE_URL DEGERI:", supabaseUrl);
console.log("KEY VAR MI:", supabaseKey ? "EVET, uzunluk: " + supabaseKey.length : "HAYIR, BOS");

const supabase = createClient(supabaseUrl, supabaseKey);

function checkPassword(req, res) {
  if (req.body.password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Yanlis sifre" });
    return false;
  }
  return true;
}

app.post("/admin/login", (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false });
  }
  res.json({ ok: true });
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string" || username.includes(" ") || username.length === 0 || password.length === 0) {
    return res.status(400).json({ error: "Kullanici adi/sifre gecersiz" });
  }
  const { data: existing } = await supabase
    .from("users")
    .select("username")
    .ilike("username", username)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: "Bu kullanici adi zaten alinmis" });
  }

  const { error } = await supabase.from("users").insert({ username, password });
  if (error) {
    return res.status(500).json({ error: "Sunucu hatasi" });
  }
  res.json({ ok: true });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Kullanici adi/sifre gerekli" });
  }
  const { data: user } = await supabase
    .from("users")
    .select("username, password")
    .ilike("username", username)
    .maybeSingle();

  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Kullanici adi veya sifre yanlis" });
  }
  res.json({ ok: true, username: user.username });
});

app.get("/announcement", async (req, res) => {
  const { data } = await supabase
    .from("announcement")
    .select("message, announcement_date")
    .eq("id", 1)
    .maybeSingle();
  res.json({ message: data?.message || "", date: data?.announcement_date || null });
});

app.post("/announcement", async (req, res) => {
  if (!checkPassword(req, res)) return;
  const { message } = req.body;
  if (typeof message !== "string") {
    return res.status(400).json({ error: "message gerekli" });
  }
  const spaceIndex = message.indexOf(" ");
  const formatted = spaceIndex === -1 ? message : message.substring(0, spaceIndex) + ": " + message.substring(spaceIndex + 1);

  const { error } = await supabase
    .from("announcement")
    .update({ message: formatted, announcement_date: new Date().toISOString() })
    .eq("id", 1);

  if (error) {
    return res.status(500).json({ error: "Sunucu hatasi" });
  }
  res.json({ ok: true });
});

app.post("/score", async (req, res) => {
  const { player, points } = req.body;
  if (typeof player !== "string" || typeof points !== "number") {
    return res.status(400).json({ error: "player ve points gerekli" });
  }

  const { data: existing } = await supabase
    .from("scores")
    .select("player, points")
    .eq("player", player)
    .maybeSingle();

  let total;
  if (existing) {
    total = existing.points + points;
    await supabase
      .from("scores")
      .update({ points: total, last_played: new Date().toISOString() })
      .eq("player", player);
  } else {
    total = points;
    await supabase
      .from("scores")
      .insert({ player, points, last_played: new Date().toISOString() });
  }

  res.json({ ok: true, total });
});

app.post("/admin/give-points", async (req, res) => {
  if (!checkPassword(req, res)) return;
  const { target, points } = req.body;
  if (typeof points !== "number") {
    return res.status(400).json({ error: "points gerekli" });
  }

  if (target === "all" || target === "All") {
    const { data: allScores } = await supabase.from("scores").select("player, points");
    for (const s of allScores || []) {
      await supabase.from("scores").update({ points: s.points + points }).eq("player", s.player);
    }
  } else {
    if (typeof target !== "string" || target.includes(" ") || target.length === 0) {
      return res.status(400).json({ error: "Kullanici adi gecersiz (bosluk olamaz)" });
    }
    const { data: existing } = await supabase
      .from("scores")
      .select("player, points")
      .eq("player", target)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("scores")
        .update({ points: existing.points + points, last_played: new Date().toISOString() })
        .eq("player", target);
    } else {
      await supabase
        .from("scores")
        .insert({ player: target, points, last_played: new Date().toISOString() });
    }
  }

  res.json({ ok: true });
});

app.get("/leaderboard", async (req, res) => {
  const { data } = await supabase
    .from("scores")
    .select("player, points, last_played")
    .order("points", { ascending: false });
  res.json((data || []).map((s) => ({ player: s.player, points: s.points, lastPlayed: s.last_played })));
});

app.delete("/score/:player", async (req, res) => {
  await supabase.from("scores").delete().eq("player", req.params.player);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT} portunda calisiyor`));
