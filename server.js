const express = require("express");
const path = require("path");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ADMIN_PASSWORD = "121624";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

console.log("SUPABASE_URL DEGERI:", SUPABASE_URL);
console.log("SUPABASE_KEY VAR MI:", !!SUPABASE_KEY);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("HATA: SUPABASE_URL veya SUPABASE_SERVICE_KEY environment variable eksik!");
}

// createClient eksik env ile throw eder ve sunucu hiç ayaga kalkmaz.
// Bunun yerine null birakip her istekte anlasilir hata donduruyoruz.
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

function requireSupabase(res) {
  if (!supabase) {
    res.status(500).json({
      error:
        "Supabase baglantisi yok. Render > Environment kisminda SUPABASE_URL ve " +
        "SUPABASE_SERVICE_ROLE_KEY degiskenlerini ekleyip servisi yeniden deploy et.",
    });
    return false;
  }
  return true;
}

// Supabase hatasini okunabilir metne cevir
function supaError(error) {
  const parts = [error.message];
  if (error.details) parts.push("detay: " + error.details);
  if (error.hint) parts.push("ipucu: " + error.hint);
  if (error.code) parts.push("kod: " + error.code);
  return parts.filter(Boolean).join(" | ");
}

// --- Teshis: /health ---
app.get("/health", async (req, res) => {
  const out = {
    supabaseUrlVar: !!SUPABASE_URL,
    supabaseKeyVar: !!SUPABASE_KEY,
    keyType: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? "service_role (dogru)"
      : process.env.SUPABASE_SERVICE_KEY
      ? "SUPABASE_SERVICE_KEY"
      : "yok",
    tables: {},
  };

  if (!supabase) {
    out.ok = false;
    out.error = "Supabase client olusturulamadi (env eksik).";
    return res.status(500).json(out);
  }

  for (const table of ["announcement", "scores", "users"]) {
    const { error } = await supabase.from(table).select("*").limit(1);
    out.tables[table] = error ? "HATA: " + supaError(error) : "OK";
  }

  out.ok = Object.values(out.tables).every((v) => v === "OK");
  res.json(out);
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
  if (!requireSupabase(res)) return;
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

  const { data: existing, error: findError } = await supabase
    .from("users")
    .select("username")
    .ilike("username", username)
    .maybeSingle();

  if (findError) {
    return res.status(500).json({ error: "Sunucu hatası: " + findError.message });
  }
  if (existing) {
    return res.status(409).json({ error: "Bu kullanıcı adı zaten alınmış" });
  }

  const { error: insertError } = await supabase.from("users").insert([{ username, password }]);
  if (insertError) {
    return res.status(500).json({ error: "Sunucu hatası: " + insertError.message });
  }

  res.json({ ok: true });
});

// --- Kullanıcı girişi (oyundan) ---
app.post("/login", async (req, res) => {
  if (!requireSupabase(res)) return;
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Kullanıcı adı/şifre gerekli" });
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("username, password")
    .ilike("username", username)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: "Sunucu hatası: " + error.message });
  }
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Kullanıcı adı veya şifre yanlış" });
  }

  res.json({ ok: true, username: user.username });
});

// --- Duyuru ---
app.get("/announcement", async (req, res) => {
  if (!requireSupabase(res)) return;
  const { data, error } = await supabase
    .from("announcement")
    .select("*")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Duyuru okuma hatasi:", error);
    return res.status(500).json({ error: "Supabase: " + supaError(error) });
  }

  res.json({
    message: data ? data.message : "",
    date: data ? data.announcement_date : null,
  });
});

app.post("/announcement", async (req, res) => {
  if (!checkPassword(req, res)) return;
  if (!requireSupabase(res)) return;
  const { message } = req.body;
  if (typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({ error: "message gerekli" });
  }

  const spaceIndex = message.indexOf(" ");
  const formatted =
    spaceIndex === -1 ? message : message.substring(0, spaceIndex) + ": " + message.substring(spaceIndex + 1);

  const { error } = await supabase
    .from("announcement")
    .insert([{ message: formatted, announcement_date: new Date().toISOString() }]);

  if (error) {
    console.error("Duyuru insert hatasi:", error);
    return res.status(500).json({ error: "Supabase: " + supaError(error) });
  }

  res.json({ ok: true });
});

// --- ŞARKI ÇALMA (Admin panelden seçilen sabit şarkılar) ---
let currentSong = { song: null, startedAt: null };

app.get("/song", (req, res) => {
  res.json(currentSong);
});

app.post("/song", (req, res) => {
  if (!checkPassword(req, res)) return;
  const { song } = req.body;
  const allowed = ["sarki1.mp3","sarki2.mp3","sarki3.mp3","sarki4.mp3","sarki5.mp3","sarki6.mp3"];
  if (!allowed.includes(song)) {
    return res.status(400).json({ error: "Geçersiz şarkı adı" });
  }
  currentSong = { song, startedAt: Date.now() };
  res.json({ ok: true });
});

// --- Skor gönderme (oyundan) ---
app.post("/score", async (req, res) => {
  if (!requireSupabase(res)) return;
  const { player, points } = req.body;
  if (typeof player !== "string" || typeof points !== "number") {
    return res.status(400).json({ error: "player ve points gerekli" });
  }

  const { data: existing, error: findError } = await supabase
    .from("scores")
    .select("*")
    .eq("player", player)
    .maybeSingle();

  if (findError) {
    return res.status(500).json({ error: "Sunucu hatası: " + findError.message });
  }

  if (existing) {
    const newPoints = existing.points + points;
    const { error: updateError } = await supabase
      .from("scores")
      .update({ points: newPoints, last_played: new Date().toISOString() })
      .eq("player", player);
    if (updateError) {
      return res.status(500).json({ error: "Sunucu hatası: " + updateError.message });
    }
    return res.json({ ok: true, total: newPoints });
  } else {
    const { error: insertError } = await supabase
      .from("scores")
      .insert([{ player, points, last_played: new Date().toISOString() }]);
    if (insertError) {
      return res.status(500).json({ error: "Sunucu hatası: " + insertError.message });
    }
    return res.json({ ok: true, total: points });
  }
});

// --- Admin panelden manuel puan verme ---
app.post("/admin/give-points", async (req, res) => {
  if (!checkPassword(req, res)) return;
  if (!requireSupabase(res)) return;
  const { target, points } = req.body;
  if (typeof points !== "number") {
    return res.status(400).json({ error: "points gerekli" });
  }

  if (target === "all" || target === "All") {
    const { data: allScores, error: fetchError } = await supabase.from("scores").select("*");
    if (fetchError) {
      return res.status(500).json({ error: "Sunucu hatası: " + fetchError.message });
    }
    for (const s of allScores) {
      await supabase
        .from("scores")
        .update({ points: s.points + points, last_played: new Date().toISOString() })
        .eq("player", s.player);
    }
  } else {
    if (typeof target !== "string" || target.includes(" ") || target.length === 0) {
      return res.status(400).json({ error: "Kullanıcı adı geçersiz (boşluk olamaz)" });
    }
    const { data: existing, error: findError } = await supabase
      .from("scores")
      .select("*")
      .eq("player", target)
      .maybeSingle();

    if (findError) {
      return res.status(500).json({ error: "Sunucu hatası: " + findError.message });
    }

    if (existing) {
      await supabase
        .from("scores")
        .update({ points: existing.points + points, last_played: new Date().toISOString() })
        .eq("player", target);
    } else {
      await supabase
        .from("scores")
        .insert([{ player: target, points, last_played: new Date().toISOString() }]);
    }
  }

  res.json({ ok: true });
});

// --- Liderlik tablosu ---
app.get("/leaderboard", async (req, res) => {
  if (!requireSupabase(res)) return;
  const { data, error } = await supabase.from("scores").select("*").order("points", { ascending: false });
  if (error) {
    return res.status(500).json({ error: "Sunucu hatası: " + error.message });
  }
  res.json(
    data.map((row) => ({
      player: row.player,
      points: row.points,
      lastPlayed: row.last_played,
    }))
  );
});

// --- Oyuncu silme ---
app.delete("/score/:player", async (req, res) => {
  if (!requireSupabase(res)) return;
  const { error } = await supabase.from("scores").delete().eq("player", req.params.player);
  if (error) {
    return res.status(500).json({ error: "Sunucu hatası: " + error.message });
  }
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT} portunda çalışıyor`));

