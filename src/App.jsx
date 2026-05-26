import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Play, Plus, Search, Check, Trash2, Edit2, ChevronRight, ChevronLeft,
  Download, Upload, X, Loader2, Youtube, Link, FolderPlus, MoreVertical,
  Eye, EyeOff, BarChart2, Folder, Volume2, VolumeX, Sparkles, RefreshCw,
  Home, Settings, Menu } from "lucide-react";

// ─── CONFIGURAÇÃO DA API ──────────────────────────────────────────────────────
const API_URL = "https://web-production-99f91.up.railway.app";

const GOOGLE_CLIENT_ID = "383400445525-3qjgurkm6toomftsrrtec6bgg5fr9dph.apps.googleusercontent.com";

// ─── STORAGE POLYFILL ─────────────────────────────────────────────────────────
// window.storage só existe no Claude artifact.
// Em produção (Vercel/navegador normal) usa localStorage automaticamente.
const wlStorage = {
  async get(key) {
    try {
      if (typeof window !== "undefined" && window.storage && typeof window.storage.get === "function") {
        return await wlStorage.get(key);
      }
      const v = localStorage.getItem(key);
      return v !== null ? { key, value: v } : null;
    } catch { return null; }
  },
  async set(key, value) {
    try {
      if (typeof window !== "undefined" && window.storage && typeof window.storage.set === "function") {
        return await wlStorage.set(key, value);
      }
      localStorage.setItem(key, String(value));
      return { key, value };
    } catch { return null; }
  },
  async delete(key) {
    try {
      if (typeof window !== "undefined" && window.storage && typeof window.storage.delete === "function") {
        return await wlStorage.delete(key);
      }
      localStorage.removeItem(key);
      return { key, deleted: true };
    } catch { return null; }
  }
};

// API helper
async function apiFetch(path, options = {}, token = null) {
  const headers = { "Content-Type": "application/json", ...(options.headers||{}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(API_URL + path, { ...options, headers });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getCatPath(catId, cats) {
  if (!catId) return [];
  const path = [];
  let cur = cats.find(c => c.id === catId);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? cats.find(c => c.id === cur.parentId) : null;
  }
  return path;
}

function getCatFullName(catId, cats) {
  return getCatPath(catId, cats).map(c => c.name).join(" › ");
}

function getAllLinksInTree(catId, cats, links) {
  const sub = cats.filter(c => c.parentId === catId).map(c => c.id);
  return links.filter(l => l.categoryId === catId || sub.includes(l.categoryId));
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function detectPlatform(url = "") {
  const h = url.toLowerCase();
  if (h.includes("youtube.com") || h.includes("youtu.be")) return "youtube";
  if (h.includes("tiktok.com")) return "tiktok";
  if (h.includes("instagram.com")) return "instagram";
  if (h.includes("twitter.com") || h.includes("x.com")) return "twitter";
  if (h.includes("twitch.tv")) return "twitch";
  return "other";
}

function extractVideoId(url = "") {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v") || (u.pathname.includes("/shorts/") ? u.pathname.split("/shorts/")[1]?.split("/")[0] : "");
    }
  } catch {}
  return "";
}

function thumbUrl(raw) {
  if (!raw) return "";
  const clean = raw.replace(/^https?:\/\//, "");
  return `https://wsrv.nl/?url=${clean}&output=jpg&n=-1`;
}

function ytThumb(videoId, q = "hqdefault") {
  if (!videoId) return "";
  return thumbUrl(`i.ytimg.com/vi/${videoId}/${q}.jpg`);
}

async function fetchMeta(url) {
  try {
    const r = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}&maxwidth=640`);
    if (!r.ok) throw new Error();
    const d = await r.json();
    if (d.error || !d.title) throw new Error();
    return { title: d.title || "", rawThumb: d.thumbnail_url || "", ok: true };
  } catch {
    return { title: "", rawThumb: "", ok: false };
  }
}

const PLAT = {
  youtube:   { label:"YouTube",   color:"#FF0000", bg:"#FF0000" },
  tiktok:    { label:"TikTok",    color:"#fff",    bg:"#010101" },
  instagram: { label:"Instagram", color:"#fff",    bg:"linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)" },
  twitter:   { label:"Twitter/X", color:"#fff",    bg:"#1a8cd8" },
  twitch:    { label:"Twitch",    color:"#fff",    bg:"#9147ff" },
  other:     { label:"Web",       color:"#fff",    bg:"#444" },
};

const CAT_COLORS = ["#e50914","#1565c0","#2e7d32","#7b1fa2","#00695c","#e65100","#37474f","#c62828"];

const CAT_GRAD = {
  0: "linear-gradient(145deg,#3d0006,#8b0000,#c62828)",
  1: "linear-gradient(145deg,#0a1628,#0d3880,#1976d2)",
  2: "linear-gradient(145deg,#0a2010,#1b5e20,#43a047)",
  3: "linear-gradient(145deg,#1a0030,#4a148c,#8e24aa)",
  4: "linear-gradient(145deg,#001520,#006064,#00acc1)",
  5: "linear-gradient(145deg,#3e1200,#bf360c,#ff6d00)",
  6: "linear-gradient(145deg,#0d1117,#263238,#455a64)",
  7: "linear-gradient(145deg,#1a0000,#7a0008,#b71c1c)",
};

function catGrad(idx) { return CAT_GRAD[idx % 8]; }

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#0a0a0a;color:#fff;font-family:'Inter',sans-serif;min-height:100vh;}
.wl{background:#0a0a0a;min-height:100vh;}

/* ── HEADER ─────────────────────────────────────────────── */
html,body{overflow-x:hidden;max-width:100%;background:#0a0a0a;}
*{box-sizing:border-box;min-width:0;}
.hdr{position:fixed;top:0;left:0;right:0;z-index:900;height:64px;padding:0 48px;display:flex;align-items:center;justify-content:space-between;background:rgba(10,10,10,.95);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid #1a1a1a;transition:transform .3s ease;}
.hdr.up{transform:translateY(0);}.hdr.dn{transform:translateY(-100%);}
.logo{font-size:20px;font-weight:900;color:#e50914;letter-spacing:-.5px;cursor:pointer;flex-shrink:0;font-family:'Inter',sans-serif;text-transform:uppercase;}
.logo em{color:#fff;font-style:normal;}
.nav{display:flex;gap:0;}
.nav-btn{background:none;border:none;color:#a0a0a0;font-size:14px;font-weight:500;cursor:pointer;padding:8px 16px;font-family:'Inter',sans-serif;transition:color .2s;border-radius:4px;letter-spacing:.2px;}
.nav-btn:hover,.nav-btn.on{color:#fff;}
.hdr-r{display:flex;align-items:center;gap:8px;}
.srch-wrap{position:relative;display:flex;align-items:center;}
.srch-inp{background:rgba(255,255,255,.06);border:1px solid #1a1a1a;color:#fff;padding:8px 36px 8px 12px;border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;width:190px;outline:none;transition:all .3s;}
.srch-inp::placeholder{color:#555;}
.srch-inp:focus{border-color:#e50914;background:rgba(229,9,20,.05);width:256px;}
.srch-ico{position:absolute;right:10px;pointer-events:none;color:#555;}
.btn-primary{background:#e50914;color:#fff;border:none;cursor:pointer;padding:9px 20px;border-radius:6px;font-size:13px;font-weight:700;font-family:'Inter',sans-serif;transition:all .2s ease;display:flex;align-items:center;gap:6px;white-space:nowrap;letter-spacing:.2px;}
.btn-primary:hover{background:#f40612;transform:translateY(-1px);box-shadow:0 4px 20px rgba(229,9,20,.35);}

/* ── HERO ────────────────────────────────────────────────── */
.hero{position:relative;height:82vh;min-height:480px;max-height:780px;display:flex;align-items:flex-end;overflow:hidden;margin-bottom:40px;margin-top:64px;}

/* ── HERO VIDEO ──────────────────────────────────────────── */
.hero-bg{position:absolute;inset:0;background-size:cover;background-position:center top;filter:brightness(.32) saturate(.75);transform:scale(1.06);transition:background-image .4s,opacity .8s ease;}
.hero-video-wrap{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1;clip-path:inset(0);}
.hero-iframe{
  position:absolute;top:50%;left:50%;
  /* Extend beyond container to clip YouTube play button / controls / logo */
  width:calc(177.78vh + 360px);
  height:calc(56.25vw + 200px);
  min-width:calc(100% + 360px);
  min-height:calc(100% + 200px);
  transform:translate(-50%,-50%);
  border:none;pointer-events:none;
  opacity:0;transition:opacity 1.2s ease;
}
.hero-iframe.vis{opacity:1;}
.hero-mute-btn{background:rgba(0,0,0,.65);border:1.5px solid rgba(255,255,255,.28);color:#fff;cursor:pointer;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;}
.hero-mute-btn:hover{background:rgba(0,0,0,.9);border-color:#fff;}
.hero-dots{position:absolute;bottom:28px;right:52px;display:flex;gap:7px;align-items:center;z-index:5;}
.hero-dot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.28);border:none;cursor:pointer;transition:all .35s ease;padding:0;}
.hero-dot.on{width:22px;border-radius:4px;background:#e50914;}
.hero-dot:hover:not(.on){background:rgba(255,255,255,.55);}
.hero-timer{position:absolute;bottom:0;left:0;height:3px;background:#e50914;opacity:.55;transition:none;}

/* ── POPUP VIDEO ─────────────────────────────────────────── */
.pop-iframe{
  position:absolute;
  /* Extend beyond .pop-top bounds to clip YouTube player UI */
  top:-60px;left:-60px;
  width:calc(100% + 120px);
  height:calc(100% + 120px);
  border:none;pointer-events:none;
  z-index:2;
}
.pop-mute-btn{position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,.72);border:1.5px solid rgba(255,255,255,.28);color:#fff;cursor:pointer;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:all .15s;z-index:8;pointer-events:all;}
.pop-mute-btn:hover{background:rgba(0,0,0,.95);border-color:#fff;}
.hero-grd-l{position:absolute;inset:0;background:linear-gradient(to right,#0a0a0a 38%,rgba(10,10,10,.6) 60%,transparent 78%);}
.hero-grd-b{position:absolute;inset:0;background:linear-gradient(to top,#0a0a0a 0%,rgba(10,10,10,.7) 20%,transparent 55%);}
.hero-body{position:relative;z-index:2;padding:0 60px 72px;max-width:620px;}
.hero-tags{display:flex;gap:8px;align-items:center;margin-bottom:18px;flex-wrap:wrap;}
.hero-plat-badge{display:inline-flex;align-items:center;font-size:10px;font-weight:800;padding:3px 9px;border-radius:4px;text-transform:uppercase;letter-spacing:.7px;}
.hero-new-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:800;padding:3px 9px;border-radius:4px;background:#f5a623;color:#000;text-transform:uppercase;letter-spacing:.7px;}
.hero-cat-badge{font-size:11px;color:#a0a0a0;font-weight:600;letter-spacing:.3px;}
.hero-title{font-size:3rem;font-weight:900;line-height:1.05;margin-bottom:14px;letter-spacing:-1.5px;font-family:'Inter',sans-serif;text-shadow:0 2px 20px rgba(0,0,0,.5);}
.hero-meta{font-size:13px;color:#a0a0a0;margin-bottom:24px;font-weight:500;}
.hero-acts{display:flex;gap:12px;flex-wrap:wrap;}
.btn-hero-p{background:#e50914;color:#fff;border:none;cursor:pointer;padding:13px 32px;border-radius:6px;font-size:15px;font-weight:700;font-family:'Inter',sans-serif;transition:all .2s;display:flex;align-items:center;gap:8px;text-decoration:none;letter-spacing:.2px;}
.btn-hero-p:hover{background:#f40612;transform:scale(1.02);box-shadow:0 6px 24px rgba(229,9,20,.4);}
.btn-hero-o{background:rgba(255,255,255,.1);color:#fff;border:2px solid rgba(255,255,255,.35);cursor:pointer;padding:13px 32px;border-radius:6px;font-size:15px;font-weight:700;font-family:'Inter',sans-serif;transition:all .2s;display:flex;align-items:center;gap:8px;letter-spacing:.2px;}
.btn-hero-o:hover{border-color:#fff;background:rgba(255,255,255,.18);}
.btn-hero-o.done{border-color:#4caf50;color:#4caf50;background:rgba(76,175,80,.1);}
.hero-empty{height:calc(100vh - 64px);min-height:480px;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 40%,#111 0%,#0a0a0a 70%);}
.hero-empty-inner{text-align:center;max-width:420px;display:flex;flex-direction:column;align-items:center;gap:0;}
.hero-empty-ico{font-size:72px;margin-bottom:20px;opacity:.2;}
.hero-empty-t{font-size:26px;font-weight:800;margin-bottom:8px;font-family:'Inter',sans-serif;letter-spacing:-.5px;}
.hero-empty-s{font-size:14px;color:#a0a0a0;margin-bottom:28px;line-height:1.65;}

/* ── ROWS ────────────────────────────────────────────────── */
.rows{padding-bottom:80px;}
.row-sec{margin-bottom:44px;}
.row-hdr{display:flex;align-items:flex-end;justify-content:space-between;padding:0 48px;margin-bottom:8px;}
.row-hdr-l{display:flex;align-items:center;gap:14px;}
.row-title{font-size:20px;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-family:'Inter',sans-serif;transition:color .2s;}
.row-title:hover{color:#e50914;cursor:pointer;}
.row-cnt{font-size:12px;color:#a0a0a0;font-weight:600;letter-spacing:.3px;}
.row-prog-wrap{padding:0 48px;margin-bottom:14px;}
.row-prog{height:3px;background:#1a1a1a;border-radius:2px;overflow:hidden;}
.row-fill{height:100%;background:#e50914;border-radius:2px;transition:width .6s ease;}
.row-fill.full{background:#4caf50;}
.row-wrap{position:relative;}
.row-scroll-outer{overflow-x:auto;overflow-y:clip;scroll-behavior:smooth;scrollbar-width:none;}
.row-scroll-outer::-webkit-scrollbar{display:none;}
.row-scroll{display:flex;gap:16px;padding:4px 48px 120px;-webkit-overflow-scrolling:touch;overflow:visible;}
.row-scroll::-webkit-scrollbar{display:none;}
.row-wrap::before,.row-wrap::after{content:'';position:absolute;top:0;bottom:12px;width:100px;pointer-events:none;z-index:5;}
.row-wrap::before{left:0;background:linear-gradient(to right,#0a0a0a,transparent);}
.row-wrap::after{right:0;background:linear-gradient(to left,#0a0a0a,transparent);}
.scroll-btn{position:absolute;top:50%;transform:translateY(-60%);background:rgba(10,10,10,.92);border:1px solid #1a1a1a;color:#fff;width:38px;height:80px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;z-index:10;opacity:0;pointer-events:none;}
.row-wrap:hover .scroll-btn{opacity:1;pointer-events:all;}
.scroll-btn:hover{background:#e50914;border-color:#e50914;}
.sl{left:4px;}.sr{right:4px;}

/* ── CARD ────────────────────────────────────────────────── */
/* ── NETFLIX CARD EXPANSION ─────────────────────────────────────────────── */
.card{
  position:relative;
  flex:0 0 272px;width:272px;height:153px;
  border-radius:8px;
  overflow:visible; /* allow detail panel to extend below */
  cursor:pointer;
  background:#111111;
  border:1px solid #1a1a1a;
  z-index:1;
  /* Delay before animating — avoids triggering on accidental mouse pass */
  transition:
    transform .45s cubic-bezier(.4,0,.2,1) .12s,
    box-shadow .45s cubic-bezier(.4,0,.2,1) .12s,
    z-index 0s .57s;
}
/* Clip the thumbnail within the card */
.card-bg-wrap{
  position:absolute;inset:0;
  border-radius:8px;
  overflow:hidden;
  transition:border-radius .45s cubic-bezier(.4,0,.2,1) .12s;
}
.card:hover{
  transform:scale(1.58);
  z-index:200;
  box-shadow:0 32px 80px rgba(0,0,0,.95),
             0 0 0 2px #e50914,
             0 0 40px rgba(229,9,20,.25);
  transition:
    transform .3s cubic-bezier(.2,0,0,1) .2s,
    box-shadow .3s cubic-bezier(.2,0,0,1) .2s,
    z-index 0s .2s;
}
.card:hover .card-bg-wrap{border-radius:8px 8px 0 0;}

/* ── DETAIL PANEL — slides below on hover ──────────────────────────────── */
.card-detail{
  position:absolute;
  top:calc(100% - 2px);left:0;right:0;
  background:#111;
  border:1px solid rgba(255,255,255,.1);
  border-top:1px solid rgba(255,255,255,.07);
  border-radius:0 0 8px 8px;
  padding:0;
  max-height:0;
  overflow:hidden;
  opacity:0;
  transition:
    max-height .4s cubic-bezier(.4,0,.2,1) .15s,
    opacity .3s ease .2s,
    padding .3s ease .15s;
  pointer-events:none;
}
.card:hover .card-detail{
  max-height:180px;
  opacity:1;
  padding:10px 12px 12px;
  pointer-events:all;
}
/* ── TAG BAR — colored stripe at bottom showing assigned tags ─────────── */
.card-tag-bar{
  position:absolute;bottom:0;left:0;right:0;height:3px;
  display:flex;gap:1px;border-radius:0 0 8px 8px;overflow:hidden;
  opacity:.7;transition:opacity .3s;
}
.card:hover .card-tag-bar{opacity:0;} /* hide when detail panel is open */
.card-tag-segment{flex:1;height:100%;}

/* Watched overlay */
.card-watched-overlay{
  position:absolute;inset:0;
  background:rgba(0,0,0,.55);
  display:flex;align-items:center;justify-content:center;
  border-radius:8px;
  pointer-events:none;
  opacity:0;transition:opacity .3s;
}
.card.watched-card .card-watched-overlay{opacity:1;}
.card-watched-check{
  width:32px;height:32px;border-radius:50%;
  background:rgba(34,197,94,.9);
  display:flex;align-items:center;justify-content:center;
  font-size:16px;color:#fff;
}

.card-detail-title{
  font-size:12px;font-weight:700;color:#fff;font-family:'Inter',sans-serif;
  line-height:1.35;margin-bottom:8px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.card-detail-meta{
  display:flex;align-items:center;gap:6px;margin-bottom:9px;flex-wrap:wrap;
}
.card-detail-plat{
  font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;
  padding:2px 7px;border-radius:3px;
}
.card-detail-tag{
  font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;
  border:1px solid;
}
.card-detail-acts{
  display:flex;gap:6px;
}
.card-detail-btn{
  flex:1;padding:7px 0;border-radius:5px;font-size:11px;font-weight:700;
  font-family:'Inter',sans-serif;cursor:pointer;border:none;
  display:flex;align-items:center;justify-content:center;gap:4px;
  transition:all .15s;
}
.card-detail-btn.primary{background:#fff;color:#000;}
.card-detail-btn.primary:hover{background:#e0e0e0;}
.card-detail-btn.secondary{background:rgba(255,255,255,.1);color:#fff;border:1.5px solid rgba(255,255,255,.25);}
.card-detail-btn.secondary:hover{background:rgba(255,255,255,.2);}
.card-detail-btn.danger{background:rgba(248,113,113,.12);color:#f87171;border:1.5px solid rgba(248,113,113,.25);}
.card-detail-btn.danger:hover{background:rgba(248,113,113,.25);}
.card-bg-grad{position:absolute;inset:0;}
.card-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;transition:opacity .4s;}
.card-grd{position:absolute;bottom:0;left:0;right:0;height:75%;background:linear-gradient(to top,rgba(0,0,0,.96) 0%,rgba(0,0,0,.55) 50%,transparent 100%);pointer-events:none;z-index:1;}
.card-plat{position:absolute;top:8px;left:8px;font-size:9px;font-weight:800;padding:2px 7px;border-radius:3px;text-transform:uppercase;letter-spacing:.5px;z-index:4;line-height:1.6;}
.card-title{position:absolute;bottom:9px;left:10px;right:10px;font-size:13px;font-weight:700;line-height:1.3;color:#fff;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-family:'Inter',sans-serif;z-index:4;}

/* Card hover overlay */
.card-hover-over{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;opacity:0;transition:opacity .2s ease;z-index:5;}
.card:hover .card-hover-over{opacity:1;}
.card-play-circle{width:52px;height:52px;background:rgba(229,9,20,.92);border-radius:50%;display:flex;align-items:center;justify-content:center;transition:transform .15s;box-shadow:0 4px 24px rgba(229,9,20,.5);}
.card:hover .card-play-circle{transform:scale(1.08);}
.card-hover-acts{display:flex;gap:7px;}
.card-hover-btn{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);color:#fff;cursor:pointer;padding:5px 12px;border-radius:20px;font-size:10px;font-weight:700;font-family:'Inter',sans-serif;transition:all .15s;white-space:nowrap;display:flex;align-items:center;gap:4px;}
.card-hover-btn:hover{background:rgba(255,255,255,.25);}
.card-hover-btn.mark{background:rgba(76,175,80,.15);border-color:rgba(76,175,80,.4);color:#4caf50;}
.card-hover-btn.mark:hover{background:rgba(76,175,80,.3);}

/* Card watched state */
.card-wd-layer{position:absolute;inset:0;z-index:2;}
.card-wd-dim{position:absolute;inset:0;background:rgba(0,0,0,.62);}
.card-wd-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
.card-wd-circle{width:56px;height:56px;background:rgba(76,175,80,.9);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 28px rgba(76,175,80,.5);}
.card-wd-circle.anim{animation:checkPop .45s cubic-bezier(.175,.885,.32,1.275) both;}
@keyframes checkPop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.3)}80%{transform:scale(.88)}100%{transform:scale(1);opacity:1}}
.card-wd-banner{position:absolute;bottom:0;left:0;right:0;padding:20px 8px 8px;background:linear-gradient(to top,rgba(30,100,50,.85),transparent);text-align:center;font-size:10px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:1.2px;font-family:'Inter',sans-serif;z-index:3;}
.card-unwatch{position:absolute;bottom:28px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.88);border:1px solid rgba(255,255,255,.2);color:#fff;cursor:pointer;padding:5px 12px;border-radius:20px;font-size:10px;font-weight:700;font-family:'Inter',sans-serif;white-space:nowrap;opacity:0;transition:opacity .2s;z-index:6;pointer-events:none;}
.card:hover .card-unwatch{opacity:1;pointer-events:all;}
@keyframes greenFlash{0%{opacity:0}20%{opacity:.38}100%{opacity:0}}
.card-flash{position:absolute;inset:0;background:#4caf50;border-radius:6px;animation:greenFlash .55s ease forwards;pointer-events:none;z-index:10;}

/* Card 3-dot menu */
.card-menu-btn{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.72);border:1px solid rgba(255,255,255,.18);color:#fff;cursor:pointer;width:28px;height:28px;border-radius:5px;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s,background .15s;z-index:10;}
.card:hover .card-menu-btn{opacity:1;}
.card-menu-btn:hover{background:rgba(229,9,20,.8);border-color:#e50914;}
.card-dropdown{position:absolute;top:40px;right:8px;background:#1a1a1a;border:1px solid #222;border-radius:10px;padding:5px;z-index:20;min-width:178px;box-shadow:0 16px 48px rgba(0,0,0,.88);animation:popIn .15s ease;}
.card-dd-item{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;color:#a0a0a0;font-family:'Inter',sans-serif;transition:all .15s;border:none;background:none;width:100%;text-align:left;}
.card-dd-item:hover{background:rgba(255,255,255,.07);color:#fff;}
.card-dd-item.danger{color:#f87171;}
.card-dd-item.danger:hover{background:rgba(248,113,113,.1);}
.card-dd-sep{height:1px;background:#222;margin:4px 0;}

/* ── FOLDER CARD ─────────────────────────────────────────── */
.folder-card{position:relative;flex:0 0 170px;width:170px;height:96px;border-radius:6px;cursor:pointer;background:#111111;border:1.5px solid #1a1a1a;transition:transform .22s,box-shadow .22s,border-color .22s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;overflow:hidden;}
.folder-card::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(245,166,35,.07) 0%,transparent 65%);}
.folder-card:hover{transform:scale(1.06);box-shadow:0 12px 40px rgba(0,0,0,.8);border-color:rgba(245,166,35,.45);}
.folder-card-ico{color:#f5a623;}
.folder-card-name{font-size:12px;font-weight:700;color:#fff;text-align:center;padding:0 10px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-family:'Inter',sans-serif;}
.folder-card-cnt{font-size:10px;color:#a0a0a0;font-weight:600;}

/* ── POPUP ───────────────────────────────────────────────── */
@keyframes popIn{from{transform:scale(.93) translateY(8px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
.pop{position:fixed;z-index:9999;width:340px;border-radius:10px;overflow:hidden;background:#111111;box-shadow:0 0 0 1px #1a1a1a,0 32px 80px rgba(0,0,0,.96);animation:popIn .2s cubic-bezier(.16,1,.3,1);}
.pop-top{position:relative;width:100%;height:191px;overflow:hidden;}
.pop-thumb{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;}
.pop-grd{position:absolute;bottom:0;left:0;right:0;height:65%;background:linear-gradient(to top,#111111,transparent);}
.pop-plat{position:absolute;top:10px;left:10px;font-size:10px;font-weight:800;padding:3px 8px;border-radius:3px;text-transform:uppercase;letter-spacing:.5px;z-index:5;}
.pop-play-btn{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-decoration:none;}
.pop-play-circle{width:52px;height:52px;background:rgba(229,9,20,.9);border-radius:50%;display:flex;align-items:center;justify-content:center;transition:transform .15s;box-shadow:0 4px 20px rgba(229,9,20,.45);}
.pop-play-btn:hover .pop-play-circle{transform:scale(1.1);}
.pop-card-title{position:absolute;bottom:10px;left:12px;right:12px;font-size:13px;font-weight:800;color:#fff;line-height:1.25;font-family:'Inter',sans-serif;}
.pop-body{padding:14px 16px 16px;}
.pop-acts{display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap;}
.pop-btn{border:1.5px solid rgba(255,255,255,.22);background:transparent;color:#fff;cursor:pointer;padding:7px 14px;border-radius:20px;font-size:12px;font-weight:700;font-family:'Inter',sans-serif;transition:all .15s;display:inline-flex;align-items:center;gap:5px;text-decoration:none;white-space:nowrap;}
.pop-btn:hover{border-color:#fff;background:rgba(255,255,255,.08);}
.pop-btn.watch-btn{background:rgba(76,175,80,.1);border-color:rgba(76,175,80,.4);color:#4caf50;}
.pop-btn.watch-btn:hover{background:rgba(76,175,80,.22);}
.pop-btn.del-btn{border-color:rgba(255,80,80,.28);color:rgba(255,120,120,.9);}
.pop-btn.del-btn:hover{background:rgba(255,60,60,.15);}
.pop-meta{display:flex;flex-wrap:wrap;gap:5px;align-items:center;}
.pop-tag{font-size:11px;color:#a0a0a0;font-weight:500;}
.pop-sep{font-size:10px;color:#333;}
.pop-wd-pill{font-size:10px;font-weight:700;color:#4caf50;border:1px solid rgba(76,175,80,.35);padding:2px 8px;border-radius:10px;}

/* ── BREADCRUMBS ─────────────────────────────────────────── */
.breadcrumbs{padding:12px 48px 0;display:flex;align-items:center;gap:4px;flex-wrap:wrap;}
.bc-btn{font-size:13px;font-weight:600;color:#a0a0a0;cursor:pointer;transition:color .2s;font-family:'Inter',sans-serif;background:none;border:none;padding:4px 8px;border-radius:4px;letter-spacing:.2px;}
.bc-btn:hover{color:#fff;background:rgba(255,255,255,.06);}
.bc-btn.cur{color:#fff;cursor:default;font-weight:700;}
.bc-sep{color:#333;font-size:12px;padding:0 2px;}

/* ── STATS ───────────────────────────────────────────────── */
.stats{padding:36px 48px 72px;border-top:1px solid #1a1a1a;}
.stats-h{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.8px;margin-bottom:20px;color:#a0a0a0;font-family:'Inter',sans-serif;display:flex;align-items:center;gap:8px;}
.stats-g{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
.stat{background:#111111;border:1px solid #1a1a1a;border-radius:8px;padding:20px 18px;transition:border-color .2s;}
.stat:hover{border-color:#333;}
.stat-ico{font-size:20px;margin-bottom:12px;opacity:.8;}
.stat-val{font-size:36px;font-weight:900;line-height:1;margin-bottom:5px;font-family:'Inter',sans-serif;}
.stat-lbl{font-size:11px;font-weight:700;color:#a0a0a0;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;}
.stat-sub{font-size:11px;color:#555;}
.stat-bar{height:3px;background:#1a1a1a;border-radius:2px;margin-top:12px;overflow:hidden;}
.stat-bar-f{height:100%;background:#e50914;border-radius:2px;transition:width .6s;}
.export-row{display:flex;gap:8px;margin-top:20px;}
.btn-export{flex:1;background:rgba(255,255,255,.04);color:#a0a0a0;border:1px solid #1a1a1a;cursor:pointer;padding:10px;border-radius:6px;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px;}
.btn-export:hover{background:rgba(255,255,255,.08);color:#fff;border-color:#333;}

/* ── MODAL ───────────────────────────────────────────────── */
.modal-bg{position:fixed;inset:0;overflow:hidden;background:rgba(0,0,0,.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;}
.modal{background:#111111;border:1px solid #1a1a1a;border-radius:12px;width:100%;max-width:500px;padding:28px 32px;position:relative;animation:popIn .22s ease;max-height:90vh;overflow-y:auto;}
.modal-t{font-size:21px;font-weight:800;margin-bottom:6px;font-family:'Inter',sans-serif;letter-spacing:-.3px;}
.modal-sub{font-size:13px;color:#a0a0a0;margin-bottom:24px;line-height:1.5;}
.modal-x{position:absolute;top:18px;right:18px;background:rgba(255,255,255,.05);border:1px solid #1a1a1a;color:#a0a0a0;cursor:pointer;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:all .2s;}
.modal-x:hover{background:rgba(255,255,255,.1);color:#fff;}
.fg{margin-bottom:16px;}
.fl{display:block;font-size:11px;font-weight:700;color:#555;margin-bottom:6px;text-transform:uppercase;letter-spacing:.8px;}
.fi{width:100%;background:#0a0a0a;border:1px solid #1a1a1a;color:#fff;padding:11px 14px;border-radius:6px;font-size:14px;font-family:'Inter',sans-serif;outline:none;transition:all .2s;}
.fi::placeholder{color:#2a2a2a;}
.fi:focus{border-color:#e50914;}
.fsel{width:100%;background:#0a0a0a;border:1px solid #1a1a1a;color:#fff;padding:11px 14px;border-radius:6px;font-size:14px;font-family:'Inter',sans-serif;outline:none;cursor:pointer;appearance:none;transition:all .2s;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23555' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;}
.fsel:focus{border-color:#e50914;}
.fetch-area{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:12px;display:flex;gap:10px;align-items:center;margin-top:8px;min-height:62px;}
.fetch-thumb{width:80px;height:45px;border-radius:4px;object-fit:cover;flex-shrink:0;}
.fetch-plat{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#e50914;margin-bottom:3px;}
.fetch-status{font-size:11px;color:#555;}
.cat-create-row{display:flex;gap:8px;margin-top:8px;}
.cat-create-inp{flex:1;background:#0a0a0a;border:1px solid #1a1a1a;color:#fff;padding:9px 12px;border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;outline:none;}
.cat-create-inp:focus{border-color:#4caf50;}
.btn-sm-green{background:rgba(76,175,80,.12);color:#4caf50;border:1px solid rgba(76,175,80,.3);cursor:pointer;padding:9px 14px;border-radius:6px;font-size:13px;font-weight:700;font-family:'Inter',sans-serif;transition:all .2s;display:flex;align-items:center;gap:5px;}
.btn-sm-green:hover{background:rgba(76,175,80,.25);}
.btn-add-cat-inline{background:none;border:1px dashed #1a1a1a;color:#555;cursor:pointer;padding:9px 12px;border-radius:6px;font-size:12px;font-family:'Inter',sans-serif;transition:all .2s;display:flex;align-items:center;gap:5px;width:100%;}
.btn-add-cat-inline:hover{border-color:#333;color:#a0a0a0;}
.modal-foot{display:flex;gap:8px;margin-top:20px;}
.btn-cancel{flex:1;background:rgba(255,255,255,.05);color:#a0a0a0;border:1px solid #1a1a1a;cursor:pointer;padding:13px;border-radius:6px;font-size:14px;font-weight:700;font-family:'Inter',sans-serif;transition:all .2s;}
.btn-cancel:hover{background:rgba(255,255,255,.08);color:#fff;}
.btn-save{flex:2;background:#e50914;color:#fff;border:none;cursor:pointer;padding:13px;border-radius:6px;font-size:14px;font-weight:700;font-family:'Inter',sans-serif;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;}
.btn-save:hover:not(:disabled){background:#f40612;box-shadow:0 4px 20px rgba(229,9,20,.35);}
.btn-save:disabled{opacity:.3;cursor:not-allowed;}

/* ── CAT MANAGER ─────────────────────────────────────────── */
.cat-list{display:flex;flex-direction:column;gap:2px;margin-bottom:16px;max-height:380px;overflow-y:auto;padding-right:4px;}
.cat-item{display:flex;align-items:center;gap:6px;padding:9px 10px;background:rgba(255,255,255,.03);border-radius:6px;transition:background .2s;user-select:none;border:1.5px solid transparent;}
.cat-item:hover{background:rgba(255,255,255,.06);}
.cat-item.dragging{opacity:.35;border-color:rgba(229,9,20,.4);}
.cat-item.drag-over{border-color:#e50914;background:rgba(229,9,20,.06);}
.cat-drag-handle{color:#333;cursor:grab;padding:2px;flex-shrink:0;font-size:14px;line-height:1;transition:color .15s;}
.cat-drag-handle:hover{color:#a0a0a0;}
.cat-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.cat-vert-line{width:2px;border-radius:2px;flex-shrink:0;align-self:stretch;}
.cat-name{flex:1;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;color:#fff;}
.cat-sub-label{font-size:9px;color:#555;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-left:6px;padding:1px 5px;background:rgba(255,255,255,.05);border-radius:3px;}
.cat-link-cnt{font-size:11px;color:#555;flex-shrink:0;}
.cat-actions{display:flex;gap:2px;opacity:0;transition:opacity .2s;flex-shrink:0;}
.cat-item:hover .cat-actions{opacity:1;}
.cat-act-btn{background:none;border:none;cursor:pointer;padding:4px 5px;border-radius:4px;color:#555;transition:all .15s;display:flex;align-items:center;font-size:12px;}
.cat-act-btn:hover{color:#fff;background:rgba(255,255,255,.08);}
.cat-act-btn:disabled{opacity:.2;cursor:not-allowed;}
.cat-act-btn.indent-btn:hover{color:#f5a623;background:rgba(245,166,35,.1);}
.cat-act-btn.outdent-btn:hover{color:#3b82f6;background:rgba(59,130,246,.1);}
.cat-act-btn.danger:hover{color:#f87171;background:rgba(248,113,113,.1);}
.cat-act-btn.add-sub:hover{color:#4caf50;background:rgba(76,175,80,.1);}

/* ── CINEMA MODE ─────────────────────────────────────────── */
.cinema-bg{position:fixed;inset:0;background:rgba(0,0,0,.97);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;animation:popIn .2s ease;}
.cinema-wrap{width:100%;max-width:1100px;}
.cinema-hdr{display:flex;align-items:center;justify-content:space-between;padding:0 0 14px;}
.cinema-title{font-size:19px;font-weight:800;color:#fff;font-family:'Inter',sans-serif;letter-spacing:-.3px;flex:1;margin-right:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cinema-close{background:rgba(255,255,255,.07);border:1px solid #1a1a1a;color:#fff;cursor:pointer;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;}
.cinema-close:hover{background:#e50914;border-color:#e50914;}
.cinema-video{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:10px;overflow:hidden;}
.cinema-iframe{position:absolute;inset:0;width:100%;height:100%;border:none;}
.cinema-no-video{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;height:100%;color:#a0a0a0;font-family:'Inter',sans-serif;}
.cinema-ftr{display:flex;justify-content:space-between;align-items:center;padding:12px 0 0;font-size:12px;color:#555;font-family:'Inter',sans-serif;}
.cinema-hint{display:flex;align-items:center;gap:6px;}
.cinema-key{background:#1a1a1a;border:1px solid #333;border-radius:4px;padding:2px 7px;font-size:11px;color:#a0a0a0;}

/* ── TAGS ────────────────────────────────────────────────── */
.tag-pill{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;font-family:'Inter',sans-serif;letter-spacing:.2px;white-space:nowrap;}
.tag-pill-sm{padding:1px 6px;font-size:9px;}
.tags-row{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;}
.tag-select{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.tag-toggle{padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;border:1.5px solid;font-family:'Inter',sans-serif;transition:all .15s;background:transparent;}

/* ── NOTES ───────────────────────────────────────────────── */
.notes-area{width:100%;background:#0a0a0a;border:1px solid #1a1a1a;color:#fff;padding:10px 14px;border-radius:6px;font-size:13px;font-family:'Inter',sans-serif;outline:none;resize:vertical;min-height:72px;line-height:1.5;transition:border-color .2s;}
.notes-area::placeholder{color:#2a2a2a;}
.notes-area:focus{border-color:#e50914;}
.pop-notes{margin-top:8px;padding:8px 10px;background:#0a0a0a;border-radius:6px;font-size:12px;color:#a0a0a0;line-height:1.5;border-left:2px solid #1a1a1a;}

/* ── ADVANCED SEARCH ─────────────────────────────────────── */
.advsearch{background:#111111;border-bottom:1px solid #1a1a1a;padding:10px 48px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;animation:slideDown .2s ease;}
@keyframes slideDown{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}
.filter-chip{padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid #1a1a1a;color:#a0a0a0;background:transparent;font-family:'Inter',sans-serif;transition:all .15s;display:flex;align-items:center;gap:5px;}
.filter-chip:hover{border-color:#333;color:#fff;}
.filter-chip.on{border-color:#e50914;color:#e50914;background:rgba(229,9,20,.08);}
.filter-sep{width:1px;height:20px;background:#1a1a1a;flex-shrink:0;}
.filter-label{font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.6px;}

/* ── UNDO TOAST ──────────────────────────────────────────── */
.undo-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:9100;background:#111111;border:1px solid #1a1a1a;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:14px;box-shadow:0 16px 48px rgba(0,0,0,.85);animation:nIn .25s ease;font-family:'Inter',sans-serif;min-width:320px;}
.undo-msg{flex:1;font-size:13px;font-weight:500;color:#fff;}
.undo-bar{position:absolute;bottom:0;left:0;height:2px;background:#e50914;border-radius:0 0 10px 10px;transition:width linear;}
.btn-undo{background:rgba(229,9,20,.12);border:1px solid rgba(229,9,20,.3);color:#e50914;cursor:pointer;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:700;font-family:'Inter',sans-serif;transition:all .15s;white-space:nowrap;}
.btn-undo:hover{background:rgba(229,9,20,.25);}

/* ── IMPORT PREVIEW ──────────────────────────────────────── */
.import-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0;}
.import-stat{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:14px;text-align:center;}
.import-stat-val{font-size:28px;font-weight:900;font-family:'Inter',sans-serif;line-height:1;}
.import-stat-lbl{font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-top:4px;}
.import-mode{display:flex;gap:8px;margin-top:12px;}
.import-mode-btn{flex:1;padding:10px;border-radius:6px;font-size:13px;font-weight:700;font-family:'Inter',sans-serif;cursor:pointer;border:1.5px solid;transition:all .15s;text-align:center;}
.import-mode-btn.selected{background:#e50914;border-color:#e50914;color:#fff;}
.import-mode-btn:not(.selected){background:transparent;border-color:#1a1a1a;color:#a0a0a0;}

/* ── MICRO-ANIMATIONS ────────────────────────────────────── */
@keyframes cardIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
.card{animation:cardIn .3s ease both;}
@keyframes rowIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
.row-sec{animation:rowIn .35s ease both;}

/* ── CARD DRAG (link reorder) ────────────────────────────── */
.card.card-dragging{opacity:.35;outline:2px solid #e50914;outline-offset:2px;}
.card.card-drag-over{outline:2px solid rgba(229,9,20,.5);outline-offset:2px;background:#111;}

/* ── SKELETON ENHANCED ───────────────────────────────────── */
@keyframes shimmer{0%{background-position:-800px 0}100%{background-position:800px 0}}
.skel{background:linear-gradient(90deg,#0f0f0f 25%,#1a1a1a 50%,#0f0f0f 75%);background-size:800px 100%;animation:shimmer 1.4s infinite ease-in-out;border-radius:6px;}
.skel-text{height:14px;border-radius:4px;margin-bottom:8px;}
.skel-hero{height:82vh;min-height:480px;background:linear-gradient(90deg,#0d0d0d 25%,#161616 50%,#0d0d0d 75%);background-size:800px 100%;animation:shimmer 1.4s infinite ease-in-out;margin-bottom:40px;}

/* ── EMPTY ───────────────────────────────────────────────── */
.row-empty{padding:20px 48px 8px;display:flex;align-items:center;gap:10px;color:#555;font-size:13px;}
.empty-state{padding:80px 48px;text-align:center;}
.empty-ico{font-size:56px;margin-bottom:16px;opacity:.15;}
.empty-t{font-size:22px;font-weight:700;margin-bottom:8px;font-family:'Inter',sans-serif;letter-spacing:-.3px;}
.empty-s{font-size:14px;color:#a0a0a0;margin-bottom:24px;line-height:1.6;}

/* ── NOTIF ───────────────────────────────────────────────── */
@keyframes nIn{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
.notif{position:fixed;bottom:28px;right:28px;z-index:9000;background:#111111;border:1px solid #1a1a1a;border-radius:8px;padding:14px 20px;font-size:14px;font-weight:600;animation:nIn .25s ease;box-shadow:0 16px 48px rgba(0,0,0,.8);display:flex;align-items:center;gap:8px;max-width:360px;font-family:'Inter',sans-serif;}

/* ── SCROLL ──────────────────────────────────────────────── */
::-webkit-scrollbar{width:3px;height:3px;}
::-webkit-scrollbar-track{background:#0a0a0a;}
::-webkit-scrollbar-thumb{background:#1a1a1a;border-radius:2px;}
::-webkit-scrollbar-thumb:hover{background:#333;}

@media(max-width:768px){
  .hdr{padding:0 20px;}.nav{display:none;}
  .hero-body{padding:0 24px 52px;}.hero-title{font-size:2rem;}
  .row-hdr,.row-prog-wrap{padding:0 20px;}
  .row-scroll{padding:4px 16px 100px;}
  .row-scroll-outer{margin:0;}
  .stats{padding:28px 20px 60px;}
  .stats-g{grid-template-columns:repeat(2,1fr);}
}
/* ─── CATEGORY TREE — layout & separators ────────────────────────────────── */

/* Root block: each root category + its subtree */
.cat-root-block {
  padding-bottom: 12px;
  margin-bottom: 4px;
  /* Thin separator between root categories using the modal border color */
  border-bottom: 1px solid #1a1a1a;
}
/* No separator after the very last root block */
.cat-root-block:last-child {
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0;
}

/* Subtree container — indented significantly so subs feel "inside" the parent */
.cat-subtree {
  position: relative;
  padding-left: 44px;   /* strong indentation — was 28px */
  margin-top: 6px;
  padding-bottom: 2px;
}
/* Vertical connecting line running down the left side of the subtree */
.cat-subtree::before {
  content: '';
  position: absolute;
  left: 22px;
  top: 0;
  bottom: 10px;
  width: 1px;
  background: rgba(255,255,255,.09);
  border-radius: 1px;
}

/* Each sub-item row with horizontal connector */
.cat-sub-row {
  position: relative;
  margin-bottom: 4px;
}
/* Horizontal connector from vertical line to the item */
.cat-sub-row::before {
  content: '';
  position: absolute;
  left: -22px;
  top: 50%;
  width: 18px;
  height: 1px;
  background: rgba(255,255,255,.09);
}

/* Drop indicator bar */
.cat-drop-bar {
  height: 2px;
  border-radius: 2px;
  background: #e50914;
  margin: 2px 0;
  transition: opacity .1s;
}
.cat-drop-bar.nest-bar { background: #4caf50; }

/* ═══════════════════════════════════════════════════════════
   MOBILE-FIRST RESPONSIVE SYSTEM
   Mobile  < 640px   (base)
   Tablet  640–1023px
   Desktop ≥ 1024px
═══════════════════════════════════════════════════════════ */

/* ── BOTTOM NAVIGATION (mobile only) ─────────────────────── */
.bottom-nav{
  display:none; /* hidden by default on desktop */
  position:fixed;bottom:0;left:0;right:0;z-index:500;
  background:rgba(10,10,10,.97);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border-top:1px solid #1a1a1a;
  padding:8px 0 max(8px,env(safe-area-inset-bottom));
  height:60px;
}
.bnav-inner{display:flex;align-items:center;justify-content:space-around;height:100%;padding:0 8px;}
.bnav-btn{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:3px;background:none;border:none;color:#555;cursor:pointer;
  padding:6px 12px;border-radius:8px;transition:all .2s;flex:1;min-width:0;
}
.bnav-btn.active{color:#e50914;}
.bnav-btn span{font-size:9px;font-weight:700;text-transform:uppercase;
  letter-spacing:.4px;font-family:'Inter',sans-serif;white-space:nowrap;}
.bnav-btn:hover{color:#fff;}
.bnav-add-btn{
  width:46px;height:46px;border-radius:50%;
  background:#e50914;border:none;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 16px rgba(229,9,20,.5);
  transition:all .2s;flex-shrink:0;
}
.bnav-add-btn:hover{background:#f40612;transform:scale(1.08);}

/* ── MOBILE SEARCH OVERLAY ────────────────────────────────── */
.mobile-search-overlay{
  position:fixed;inset:0;z-index:600;
  background:rgba(10,10,10,.98);
  display:flex;flex-direction:column;
  padding:16px;
  animation:popIn .15s ease;
}
.mobile-search-header{display:flex;align-items:center;gap:12px;margin-bottom:16px;}
.mobile-search-input{
  flex:1;background:#111;border:1px solid #1a1a1a;color:#fff;
  padding:14px 16px;border-radius:10px;font-size:16px;
  font-family:'Inter',sans-serif;outline:none;
}
.mobile-search-input:focus{border-color:#e50914;}
.mobile-search-cancel{
  background:none;border:none;color:#a0a0a0;cursor:pointer;
  font-size:14px;font-weight:600;font-family:'Inter',sans-serif;
  padding:8px;white-space:nowrap;
}

/* ── HEADER RESPONSIVE ────────────────────────────────────── */
@media (max-width: 767px) {
  .hdr{padding:0 16px;height:56px;}
  .logo{font-size:18px;}
  .hdr-nav{display:none;}
  /* Hide desktop controls in header on mobile */
  .hdr-r .srch-wrap,
  .hdr-r .filter-chip,
  .hdr-r .btn-primary{display:none!important;}
  /* Show hamburger */
  .hdr-menu-btn{display:flex!important;}
  /* Show bottom nav */
  .bottom-nav{display:block;}
  /* Add padding to main content so bottom nav doesn't cover it */
  .main-scroll{padding-bottom:72px!important;}
}
.hdr-menu-btn{
  display:none;
  background:rgba(255,255,255,.06);border:1px solid #1a1a1a;
  color:#fff;cursor:pointer;width:36px;height:36px;border-radius:8px;
  align-items:center;justify-content:center;transition:all .2s;
}

/* ── HERO RESPONSIVE ──────────────────────────────────────── */
@media (max-width: 767px) {
  .hero{min-height:52vw;max-height:70vw;padding:0;overflow:hidden;}
  .hero-body{padding:16px 16px 20px;}
  .hero-title{font-size:1.4rem!important;letter-spacing:-.5px;margin-bottom:10px;}
  .hero-acts{flex-wrap:wrap;gap:8px;}
  .btn-hero-p{padding:10px 20px;font-size:13px;}
  .btn-hero-o{padding:10px 16px;font-size:13px;}
  .hero-mute-btn{width:32px;height:32px;}
  .hero-dots{bottom:16px;right:16px;}
  .hero-tags{margin-bottom:8px;}
}
@media (min-width: 768px) and (max-width:1023px) {
  .hero{min-height:52vh;}
  .hero-title{font-size:2.2rem!important;}
}

/* ── ROWS RESPONSIVE ──────────────────────────────────────── */
@media (max-width: 767px) {
  .row-sec{padding:0 0 20px;}
  .row-hdr{padding:0 16px;margin-bottom:10px;}
  .row-title{font-size:13px;}
  .row-scroll-wrap{padding:0 16px;}
  .row-cards{gap:10px;}
  /* Hide prev/next arrows on mobile (use touch scroll) */
  .row-arrow{display:none!important;}
}
@media (min-width: 768px) and (max-width:1023px) {
  .row-sec{padding:0 0 28px;}
  .row-hdr{padding:0 32px;}
  .row-scroll-wrap{padding:0 32px;}
}

/* ── CARDS RESPONSIVE ─────────────────────────────────────── */
@media (max-width: 479px) {
  .card{width:130px;}
  .card-img{height:73px;}
  .card-title{font-size:10px;}
}
@media (min-width:480px) and (max-width:767px) {
  .card{width:150px;}
  .card-img{height:84px;}
}
@media (min-width:768px) and (max-width:1023px) {
  .card{width:170px;}
  .card-img{height:95px;}
}

/* ── MODALS RESPONSIVE ────────────────────────────────────── */
@media (max-width: 767px) {
  .modal-bg{align-items:flex-end;padding:0;}
  .modal{
    width:100%!important;max-width:100%!important;
    border-radius:20px 20px 0 0;
    max-height:92vh;overflow-y:auto;
    padding:20px 16px 32px;
    border-left:none;border-right:none;border-bottom:none;
    animation:slideUp .25s cubic-bezier(.32,.72,0,1);
  }
  @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
  .modal::before{
    content:'';display:block;width:36px;height:4px;
    background:#1a1a1a;border-radius:2px;margin:0 auto 20px;
  }
  .modal-t{font-size:17px;}
  .modal-x{top:12px;right:12px;}
  /* Full-width buttons in modals */
  .modal-foot{flex-direction:column;}
  .modal-foot .btn-save,.modal-foot .btn-cancel{width:100%;justify-content:center;}
}

/* ── POPUP RESPONSIVE (hover preview → tap on mobile) ──────── */
@media (max-width: 767px) {
  .pop{
    position:fixed!important;
    bottom:72px!important;left:8px!important;right:8px!important;
    top:auto!important;width:auto!important;max-width:calc(100vw - 16px)!important;
    border-radius:12px;
    z-index:490;
  }
}

/* ── CINEMA MODAL RESPONSIVE ──────────────────────────────── */
@media (max-width: 767px) {
  .cinema-bg{padding:0;align-items:flex-end;}
  .cinema-wrap{max-width:100%;border-radius:20px 20px 0 0;
    background:#111;padding:16px 16px 32px;}
  .cinema-title{font-size:14px;}
  .cinema-video{border-radius:8px;}
  .cinema-ftr{display:none;}
}

/* ── CATEGORY TREE RESPONSIVE ─────────────────────────────── */
@media (max-width: 767px) {
  .cat-list{max-height:55vh;}
  .cat-item.root-item{padding:12px;}
  .cat-subtree{padding-left:28px;}
}

/* ── ADVANCED SEARCH RESPONSIVE ───────────────────────────── */
@media (max-width: 767px) {
  .advsearch{padding:12px 16px;gap:8px;}
  .filter-chip{font-size:11px;padding:5px 10px;}
}

/* ── SETTINGS PAGE RESPONSIVE ─────────────────────────────── */
@media (max-width: 767px) {
  .settings-hdr{padding:0 16px;height:56px;}
  .settings-body{padding:72px 16px 100px;}
  .settings-row{padding:14px 16px;flex-wrap:wrap;gap:10px;}
}

/* ── UNDO TOAST RESPONSIVE ────────────────────────────────── */
@media (max-width: 767px) {
  .undo-toast{
    bottom:72px;left:8px;right:8px;
    transform:none;min-width:0;width:auto;
  }
}

/* ── LANDING PAGE RESPONSIVE (additional) ─────────────────── */
@media (max-width: 639px) {
  .land-nav{padding:0 16px;height:56px;}
  .land-nav-links{display:none;}
  .land-hero{padding:72px 16px 48px;min-height:auto;}
  .land-h1{font-size:2rem;letter-spacing:-1px;}
  .land-sub{font-size:15px;}
  .land-cta-group{flex-direction:column;}
  .btn-land-p,.btn-land-o{width:100%;justify-content:center;text-align:center;}
  .land-hero-visual{display:none;}
  .land-hero-inner{grid-template-columns:1fr;}
  .land-section{padding:60px 16px;}
  .feat-grid{grid-template-columns:1fr;}
  .steps{grid-template-columns:1fr;gap:24px;}
  .steps::before{display:none;}
  .pricing-grid{grid-template-columns:1fr;}
  .land-cta-section{margin:0 16px 60px;padding:36px 20px;}
  .land-cta-title{font-size:1.8rem;}
  .land-footer{flex-direction:column;gap:16px;text-align:center;padding:32px 16px;}
  .land-footer-links{flex-wrap:wrap;justify-content:center;}
}
@media (min-width:640px) and (max-width:1023px) {
  .feat-grid{grid-template-columns:repeat(2,1fr);}
  .land-hero-inner{grid-template-columns:1fr;}
  .land-hero-visual{display:none;}
}

/* ── LOGIN / ONBOARDING RESPONSIVE ────────────────────────── */
@media (max-width: 639px) {
  .login-card{border-radius:0;min-height:100vh;
    display:flex;flex-direction:column;justify-content:center;
    border:none;padding:32px 24px;}
  .onboard-card{border-radius:0;min-height:100vh;
    display:flex;flex-direction:column;justify-content:center;
    border:none;padding:32px 24px;}
}

/* ── MAIN APP EMPTY STATE ─────────────────────────────────── */
@media (max-width: 767px) {
  .main-scroll > div[style*="padding:80px"]{padding:48px 24px!important;}
  .main-scroll > div[style*="padding:72px"]{padding:48px 24px!important;}
}

/* ── TOUCH IMPROVEMENTS ────────────────────────────────────── */
@media (hover: none) and (pointer: coarse) {
  /* Touch devices: remove hover-only states */
  .cat-actions{opacity:1!important;}
  .row-arrow{opacity:.7!important;}
  /* Larger tap targets */
  .cat-act-btn{padding:8px 10px!important;}
  .bnav-btn{padding:8px!important;}
}

/* ── TABLET LAYOUT ────────────────────────────────────────── */
@media (min-width:768px) and (max-width:1023px) {
  .hdr{padding:0 24px;}
  .main-scroll{padding:0;}
  .hero-body{padding:24px 32px 32px;}
  .row-hdr,.row-scroll-wrap,.row-scroll-outer{padding-left:32px;padding-right:32px;}
  .row-scroll-outer .row-scroll{padding-left:0;padding-right:0;}
}

/* Safe area for notched phones */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .bottom-nav{padding-bottom:calc(8px + env(safe-area-inset-bottom));}
  .modal{padding-bottom:calc(32px + env(safe-area-inset-bottom));}
}
`;

// ─── SAMPLE DATA ─────────────────────────────────────────────────────────────
const SAMPLE_CATS = [
  { id:"c1", name:"Educação",      parentId:null, order:0 },
  { id:"c2", name:"Entretenimento",parentId:null, order:1 },
  { id:"c3", name:"Esportes",      parentId:null, order:2 },
  { id:"c4", name:"React / JS",    parentId:"c1", order:0 },
];

const PRESET_TAGS = [
  { label:"Favorito",    color:"#e50914" },
  { label:"Urgente",     color:"#f5a623" },
  { label:"Ver depois",  color:"#3b82f6" },
  { label:"Recomendado", color:"#22c55e" },
  { label:"Em progresso",color:"#9147ff" },
];

const SAMPLE_LINKS = [
  { id:"l1", url:"https://youtube.com/watch?v=dQw4w9WgXcQ", title:"Champions League — Melhores Momentos", thumbnail:"", rawThumb:"", platform:"youtube", videoId:"dQw4w9WgXcQ", categoryId:"c3", watched:false, notes:"", tags:["Favorito"], order:0, createdAt:new Date(Date.now()-600000).toISOString() },
  { id:"l2", url:"https://youtube.com/watch?v=9bZkp7q19f0", title:"React Avançado — Hooks e Performance",  thumbnail:"", rawThumb:"", platform:"youtube", videoId:"9bZkp7q19f0", categoryId:"c4", watched:true,  notes:"Revisar os hooks customizados", tags:[], order:0, createdAt:new Date(Date.now()-86400000).toISOString() },
  { id:"l3", url:"https://youtube.com/watch?v=kJQP7kiw5Fk", title:"Como a Música Dominou o Mundo",        thumbnail:"", rawThumb:"", platform:"youtube", videoId:"kJQP7kiw5Fk", categoryId:"c1", watched:false, notes:"", tags:["Ver depois"], order:0, createdAt:new Date(Date.now()-172800000).toISOString() },
  { id:"l4", url:"https://youtube.com/watch?v=JGwWNGJdvx8", title:"Show ao Vivo — Especial de Aniversário",thumbnail:"", rawThumb:"", platform:"youtube", videoId:"JGwWNGJdvx8", categoryId:"c2", watched:true,  notes:"", tags:[], order:0, createdAt:new Date(Date.now()-259200000).toISOString() },
  { id:"l5", url:"https://youtube.com/watch?v=hT_nvWreIhg", title:"Física Quântica para Todos",            thumbnail:"", rawThumb:"", platform:"youtube", videoId:"hT_nvWreIhg", categoryId:"c1", watched:false, notes:"Assistir com calma, tem exercícios", tags:["Urgente"], order:1, createdAt:new Date(Date.now()-345600000).toISOString() },
  { id:"l6", url:"https://www.instagram.com/p/abc/",         title:"Receitas Incríveis de Verão",           thumbnail:"", rawThumb:"", platform:"instagram", videoId:"", categoryId:"c2", watched:false, notes:"", tags:["Recomendado"], order:0, createdAt:new Date(Date.now()-432000000).toISOString() },
  { id:"l7", url:"https://youtube.com/watch?v=RgKAFK5djSk", title:"Top 10 Jogadas Históricas do Futebol",  thumbnail:"", rawThumb:"", platform:"youtube", videoId:"RgKAFK5djSk", categoryId:"c3", watched:false, notes:"", tags:[], order:1, createdAt:new Date(Date.now()-518400000).toISOString() },
  { id:"l8", url:"https://youtube.com/watch?v=OPf0YbXqDm0", title:"Tutorial Completo de TypeScript",       thumbnail:"", rawThumb:"", platform:"youtube", videoId:"OPf0YbXqDm0", categoryId:"c4", watched:false, notes:"Continuar do min 45:00", tags:["Em progresso"], order:1, createdAt:new Date(Date.now()-604800000).toISOString() },
];

// ─── FOLDER CARD ──────────────────────────────────────────────────────────────
function FolderCard({ cat, cats, links, onNavigate }) {
  const total = getAllLinksInTree(cat.id, cats, links).length;
  const subCount = cats.filter(c => c.parentId === cat.id).length;
  return (
    <div className="folder-card" onClick={() => onNavigate(cat.id)}>
      <Folder className="folder-card-ico" size={26}/>
      <div className="folder-card-name">{cat.name}</div>
      <div className="folder-card-cnt">
        {total} vídeo{total !== 1 ? "s" : ""}{subCount > 0 ? ` · ${subCount} pasta${subCount !== 1 ? "s" : ""}` : ""}
      </div>
    </div>
  );
}

// ─── BREADCRUMBS ──────────────────────────────────────────────────────────────
function Breadcrumbs({ catId, cats, onNavigate }) {
  const path = getCatPath(catId, cats);
  return (
    <div className="breadcrumbs">
      <button className="bc-btn" onClick={() => onNavigate(null)}>Início</button>
      {path.map((c, i) => (
        <span key={c.id} style={{display:"flex",alignItems:"center",gap:5}}>
          <span className="bc-sep">›</span>
          <button
            className={`bc-btn${i === path.length - 1 ? " cur" : ""}`}
            onClick={() => i < path.length - 1 ? onNavigate(c.id) : undefined}
          >{c.name}</button>
        </span>
      ))}
    </div>
  );
}

// ─── CINEMA MODAL ─────────────────────────────────────────────────────────────
function CinemaModal({ link, onClose }) {
  useEffect(() => {
    const fn = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const plat = PLAT[link.platform] || PLAT.other;
  const src = link.videoId
    ? `https://www.youtube-nocookie.com/embed/${link.videoId}?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`
    : null;

  return (
    <div className="cinema-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cinema-wrap">
        <div className="cinema-hdr">
          <div className="cinema-title">{link.title}</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:10,fontWeight:800,padding:"3px 8px",borderRadius:3,background:plat.bg,color:plat.color,textTransform:"uppercase"}}>{plat.label}</span>
            <button className="cinema-close" onClick={onClose}><X size={16}/></button>
          </div>
        </div>
        <div className="cinema-video">
          {src ? (
            <iframe className="cinema-iframe" src={src} allow="autoplay; encrypted-media" allowFullScreen frameBorder="0"/>
          ) : (
            <div className="cinema-no-video">
              <div style={{fontSize:40,opacity:.2}}>🎬</div>
              <div>Pré-visualização não disponível para esta plataforma</div>
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="btn-hero-p" style={{textDecoration:"none",fontSize:14,padding:"10px 24px"}}>
                <Play size={14}/> Abrir no site original
              </a>
            </div>
          )}
        </div>
        {link.notes && (
          <div style={{marginTop:10,padding:"8px 12px",background:"rgba(255,255,255,.04)",borderRadius:6,fontSize:12,color:"#a0a0a0",fontFamily:"'Inter',sans-serif"}}>
            📝 {link.notes}
          </div>
        )}
        <div className="cinema-ftr">
          <div style={{display:"flex",gap:6}}>
            {(link.tags||[]).map(t=>{
              const pt = PRESET_TAGS.find(p=>p.label===t);
              return <span key={t} className="tag-pill" style={{background:pt?.color+"22",color:pt?.color||"#a0a0a0",border:`1px solid ${pt?.color||"#333"}44`}}>{t}</span>;
            })}
          </div>
          <div className="cinema-hint">
            <span className="cinema-key">ESC</span><span style={{color:"#555"}}>fechar</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── IMPORT PREVIEW MODAL ─────────────────────────────────────────────────────
function ImportPreviewModal({ data, onConfirm, onClose }) {
  const [mode, setMode] = useState("merge"); // merge | replace
  const cats = data.categories || [];
  const lnks = data.links || [];
  return (
    <div className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-t">Importar Backup</div>
        <div className="modal-sub">Revise o que será importado antes de confirmar</div>
        <button className="modal-x" onClick={onClose}><X size={16}/></button>
        <div className="import-stats">
          <div className="import-stat">
            <div className="import-stat-val" style={{color:"#e50914"}}>{lnks.length}</div>
            <div className="import-stat-lbl">Vídeos</div>
          </div>
          <div className="import-stat">
            <div className="import-stat-val" style={{color:"#3b82f6"}}>{cats.length}</div>
            <div className="import-stat-lbl">Categorias</div>
          </div>
          <div className="import-stat">
            <div className="import-stat-val" style={{color:"#22c55e"}}>{lnks.filter(l=>l.watched).length}</div>
            <div className="import-stat-lbl">Assistidos</div>
          </div>
        </div>
        {data.exportedAt && (
          <div style={{fontSize:12,color:"#555",marginBottom:12}}>
            Backup de: {new Date(data.exportedAt).toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})}
          </div>
        )}
        <div className="fg">
          <label className="fl">Modo de importação</label>
          <div className="import-mode">
            <button className={`import-mode-btn${mode==="merge"?" selected":""}`} onClick={()=>setMode("merge")}>
              Mesclar — adicionar aos dados existentes
            </button>
            <button className={`import-mode-btn${mode==="replace"?" selected":""}`} onClick={()=>setMode("replace")} style={mode==="replace"?{}:{color:"#f87171",borderColor:"rgba(248,113,113,.3)"}}>
              Substituir — apagar tudo e importar
            </button>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-save" onClick={()=>onConfirm(cats,lnks,mode)}>
            <Download size={15}/> Confirmar importação
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EDIT MODAL ───────────────────────────────────────────────────────────────
function EditModal({ link, categories, onSave, onClose }) {
  const [title, setTitle]   = useState(link.title);
  const [rawThumb, setRaw]  = useState(link.rawThumb || "");
  const [catId, setCatId]   = useState(link.categoryId);
  const [thumbFile, setThumbFile] = useState(null);
  const [preview, setPreview]     = useState(() => link.videoId ? ytThumb(link.videoId) : thumbUrl(link.rawThumb));
  const [notes, setNotes]         = useState(link.notes || "");
  const [tags, setTags]           = useState(link.tags || []);

  const onFileChange = (e) => {
    const f = e.target.files[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = ev => { setThumbFile(ev.target.result); setPreview(ev.target.result); };
    reader.readAsDataURL(f);
  };

  const save = () => {
    onSave({ ...link, title: title.trim(), rawThumb: thumbFile ? thumbFile : rawThumb, categoryId: catId, notes: notes.trim(), tags });
  };
  const toggleTag = (label) => {
    setTags(prev => prev.includes(label) ? prev.filter(t=>t!==label) : [...prev, label]);
  };

  const plat = PLAT[link.platform] || PLAT.other;

  return (
    <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-t">Editar Item</div>
        <div className="modal-sub">Altere o título, thumbnail ou categoria</div>
        <button className="modal-x" onClick={onClose}><X size={16}/></button>

        {/* Thumbnail preview */}
        <div style={{display:"flex",gap:16,alignItems:"flex-start",marginBottom:20}}>
          <div style={{width:120,height:67,borderRadius:8,overflow:"hidden",background:catGrad(0),flexShrink:0,position:"relative"}}>
            {preview && <img src={preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>}
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <span style={{fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:3,background:plat.bg,color:plat.color,textTransform:"uppercase",letterSpacing:.5}}>{plat.label}</span>
            </div>
            <div style={{fontSize:11,color:"#606060",lineHeight:1.5}}>
              <a href={link.url} target="_blank" rel="noopener noreferrer" style={{color:"#606060",textDecoration:"none",wordBreak:"break-all"}}>{link.url.slice(0,50)}...</a>
            </div>
          </div>
        </div>

        <div className="fg">
          <label className="fl">Título</label>
          <input className="fi" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Título do vídeo..."/>
        </div>

        <div className="fg">
          <label className="fl">Thumbnail — URL ou arquivo</label>
          <input className="fi" value={rawThumb} onChange={e=>{setRaw(e.target.value);setPreview(thumbUrl(e.target.value));setThumbFile(null);}} placeholder="https://... (deixe vazio para usar a original)"/>
          <label style={{display:"flex",alignItems:"center",gap:8,marginTop:8,padding:"9px 12px",background:"rgba(255,255,255,.04)",border:"1px dashed rgba(255,255,255,.15)",borderRadius:8,cursor:"pointer",fontSize:12,color:"#808080",fontFamily:"'Manrope',sans-serif"}}>
            <Upload size={13}/> Ou faça upload de uma imagem
            <input type="file" accept="image/*" style={{display:"none"}} onChange={onFileChange}/>
          </label>
        </div>

        <div className="fg">
          <label className="fl">Mover para categoria</label>
          <select className="fsel" value={catId} onChange={e=>setCatId(e.target.value)}>
            {categories.filter(c=>!c.parentId).map(c=>(
              <optgroup key={c.id} label={c.name}>
                <option value={c.id}>{c.name}</option>
                {categories.filter(s=>s.parentId===c.id).map(s=>(
                  <option key={s.id} value={s.id}>{c.name} › {s.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="fg">
          <label className="fl">Tags</label>
          <div className="tag-select">
            {PRESET_TAGS.map(pt=>(
              <button key={pt.label} className="tag-toggle" onClick={()=>toggleTag(pt.label)}
                style={{borderColor:tags.includes(pt.label)?pt.color:"#1a1a1a",color:tags.includes(pt.label)?pt.color:"#555",background:tags.includes(pt.label)?pt.color+"18":"transparent"}}>
                {pt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="fg">
          <label className="fl">Notas pessoais</label>
          <textarea className="notes-area" placeholder="Timestamps, observações, onde parei..." value={notes} onChange={e=>setNotes(e.target.value)}/>
        </div>

        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-save" onClick={save} disabled={!title.trim()}>
            <Check size={16}/> Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CARD ─────────────────────────────────────────────────────────────────────
function Card({ link, catIdx, onPreviewShow, onPreviewHide, onToggle, onDelete, onEdit, onCinema, onDragStart, onDragOver, onDrop, onDragEnd, isDragging, isDragOver }) {
  const ref  = useRef(null);
  const timer = useRef(null);
  const prevWatched = useRef(link.watched);
  const [imgSrc, setImgSrc] = useState(() => link.videoId ? ytThumb(link.videoId) : thumbUrl(link.rawThumb));
  const [imgOk,  setImgOk]  = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [justWatched, setJustWatched] = useState(false);
  const grad = catGrad(catIdx);

  const handleErr = () => {
    if (imgSrc.includes("hqdefault")) setImgSrc(ytThumb(link.videoId,"mqdefault"));
    else if (imgSrc.includes("mqdefault")) setImgSrc(ytThumb(link.videoId,"default"));
    else setImgSrc("");
  };

  useEffect(() => {
    setImgSrc(link.videoId ? ytThumb(link.videoId) : thumbUrl(link.rawThumb));
    setImgOk(false);
  }, [link.videoId, link.rawThumb]);

  // Detect transition to watched → trigger animation
  useEffect(() => {
    if (link.watched && !prevWatched.current) {
      setJustWatched(true);
      setTimeout(() => setJustWatched(false), 700);
    }
    prevWatched.current = link.watched;
  }, [link.watched]);

  useEffect(() => {
    if (!menuOpen) return;
    const fn = () => setMenuOpen(false);
    setTimeout(() => document.addEventListener("click", fn), 50);
    return () => document.removeEventListener("click", fn);
  }, [menuOpen]);

  const onEnter = () => {
    if (menuOpen) return;
    timer.current = setTimeout(() => { if (ref.current) onPreviewShow(link, ref.current.getBoundingClientRect(), catIdx); }, 380);
  };
  const onLeave = () => { clearTimeout(timer.current); if (!menuOpen) onPreviewHide(); };

  // Direct click opens the link
  const openUrl = (e) => {
    if (e.target.closest(".card-menu-btn") || e.target.closest(".card-dropdown") || e.target.closest(".card-unwatch")) return;
    const a = document.createElement("a"); a.href=link.url; a.target="_blank"; a.rel="noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const plat = PLAT[link.platform] || PLAT.other;

  return (
    <div
      ref={ref}
      className={`card${isDragging?" card-dragging":""}${isDragOver?" card-drag-over":""}${link.watched?" watched-card":""}`}
      onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={openUrl}
      draggable onDragStart={e=>onDragStart&&onDragStart(e,link.id)}
      onDragOver={e=>{e.preventDefault();onDragOver&&onDragOver(e,link.id);}}
      onDrop={e=>onDrop&&onDrop(e,link.id)}
      onDragEnd={()=>onDragEnd&&onDragEnd()}
    >
      {/* card-bg-wrap clips thumbnail while card can overflow for detail panel */}
      <div className="card-bg-wrap">
      {/* Background gradient */}
      <div className="card-bg" style={{ background: grad }} />
      {/* Thumbnail */}
      {imgSrc && (
        <img
          className="card-img"
          src={imgSrc} alt="" loading="lazy"
          onLoad={()=>setImgOk(true)} onError={handleErr}
          style={{ opacity: imgOk ? 1 : 0, filter: link.watched ? "brightness(.28) saturate(.2)" : "none" }}
        />
      )}
      {/* Gradient + labels */}
      <div className="card-grd"/>
      <div className="card-plat" style={{background:plat.bg,color:plat.color}}>{plat.label}</div>
      {!link.watched && (
        <>
          <div className="card-title">{link.title}</div>
          {(link.tags||[]).length > 0 && (
            <div style={{position:"absolute",bottom:link.title?32:8,left:10,right:10,display:"flex",gap:3,flexWrap:"wrap",zIndex:4,pointerEvents:"none"}}>
              {(link.tags||[]).slice(0,2).map(t=>{
                const pt=PRESET_TAGS.find(p=>p.label===t);
                return <span key={t} className="tag-pill tag-pill-sm" style={{background:pt?.color+"33",color:pt?.color||"#a0a0a0",backdropFilter:"blur(4px)"}}>{t}</span>;
              })}
            </div>
          )}
        </>
      )}

      {/* HOVER OVERLAY — play button + quick actions */}
      {!link.watched && (
        <div className="card-hover-over" onClick={e=>e.stopPropagation()}>
          <div className="card-play-circle" onClick={openUrl}>
            <Play size={20} fill="white" color="white" style={{marginLeft:2}}/>
          </div>
          <div className="card-hover-acts">
            <button className="card-hover-btn mark" onClick={()=>onToggle(link.id)}>
              <Check size={10}/>Assistido
            </button>
            <button className="card-hover-btn" onClick={()=>onEdit(link)}>
              <Edit2 size={10}/>Editar
            </button>
          </div>
        </div>
      )}

      {/* WATCHED VISUAL */}
      {link.watched && (
        <div className="card-wd-layer">
          <div className="card-wd-dim"/>
          <div className="card-wd-center">
            <div className={`card-wd-circle${justWatched?" anim":""}`}>
              <Check size={26} color="#fff" strokeWidth={3}/>
            </div>
          </div>
          <div className="card-wd-banner">✓ Assistido</div>
          <div className="card-title" style={{zIndex:4}}>{link.title}</div>
          <button className="card-unwatch" onClick={e=>{e.stopPropagation();onToggle(link.id);}}>
            ↩ Marcar como não assistido
          </button>
        </div>
      )}

      {/* Green flash on mark */}
      {justWatched && <div className="card-flash"/>}

      {/* Tag bar — colored stripes at bottom for assigned tags */}
      {(link.tags||[]).length > 0 && (() => {
        const TAG_COLORS_MAP = {"Favorito":"#FF6B6B","Urgente":"#FFB74D","Ver depois":"#64B5F6","Recomendado":"#81C784","Em progresso":"#BA68C8"};
        const colors = (link.tags||[]).map(t=>TAG_COLORS_MAP[t]||"#555");
        return (<div className="card-tag-bar">{colors.map((c,i)=><div key={i} className="card-tag-segment" style={{background:c}}/>)}</div>);
      })()}
      {/* Watched overlay */}
      {link.watched && <div className="card-watched-overlay"><div className="card-watched-check">✓</div></div>}
      </div>{/* end card-bg-wrap */}

      {/* ── NETFLIX EXPANSION DETAIL PANEL ── */}
      <div className="card-detail" onClick={e=>e.stopPropagation()}>
        <div className="card-detail-title">{link.title}</div>
        <div className="card-detail-meta">
          {(() => { const p=PLAT[link.platform]||PLAT.other; return <span className="card-detail-plat" style={{background:p.bg,color:p.color}}>{p.label}</span>; })()}
          {(link.tags||[]).slice(0,2).map(t=>{ const pt=PRESET_TAGS.find(p=>p.label===t); return <span key={t} className="card-detail-tag" style={{color:pt?.color||"#a0a0a0",borderColor:(pt?.color||"#333")+"44",background:(pt?.color||"#333")+"18"}}>{t}</span>; })}
        </div>
        <div className="card-detail-acts">
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="card-detail-btn primary" onClick={e=>e.stopPropagation()} style={{textDecoration:"none"}}>
            <Play size={10} fill="#000" color="#000"/>Assistir
          </a>
          <button className="card-detail-btn secondary" onClick={()=>onToggle(link.id)}>
            {link.watched ? <><EyeOff size={10}/>Desfazer</> : <><Check size={10}/>Assistido</>}
          </button>
          {link.videoId && onCinema && (
            <button className="card-detail-btn secondary" onClick={()=>onCinema(link)} title="Cinema">🎬</button>
          )}
          <button className="card-detail-btn danger" onClick={()=>onDelete(link.id)}>
            <Trash2 size={10}/>
          </button>
        </div>
      </div>

      {/* 3-dot menu — secondary actions only */}
      <button
        className="card-menu-btn"
        onClick={e => { e.stopPropagation(); clearTimeout(timer.current); onPreviewHide(); setMenuOpen(m=>!m); }}
        title="Opções"
      >
        <MoreVertical size={14}/>
      </button>
      {menuOpen && (
        <div className="card-dropdown" onClick={e=>e.stopPropagation()}>
          <button className="card-dd-item" onClick={()=>{onToggle(link.id);setMenuOpen(false);}}>
            {link.watched ? <><EyeOff size={14}/>Marcar como não assistido</> : <><Eye size={14}/>Marcar como assistido</>}
          </button>
          <div className="card-dd-sep"/>
          {link.videoId && (
            <button className="card-dd-item" onClick={()=>{onCinema&&onCinema(link);setMenuOpen(false);}}>
              🎬 Modo Cinema
            </button>
          )}
          <button className="card-dd-item" onClick={()=>{onEdit(link);setMenuOpen(false);}}>
            <Edit2 size={14}/>Editar título / notas / tags
          </button>
          <button className="card-dd-item" onClick={()=>{onEdit(link);setMenuOpen(false);}}>
            <Folder size={14}/>Mover para categoria
          </button>
          <div className="card-dd-sep"/>
          <button className="card-dd-item danger" onClick={()=>{onDelete(link.id);setMenuOpen(false);}}>
            <Trash2 size={14}/>Excluir
          </button>
        </div>
      )}
    </div>
  );
}

// ─── POPUP ────────────────────────────────────────────────────────────────────
function Popup({ link, rect, catIdx, onToggle, onDelete, onEnter, onLeave, onCinema }) {
  const [muted, setMuted] = useState(true);
  const iframeRef = useRef(null);
  if (!link || !rect) return null;
  const W=340, H=330;
  let left = rect.left + rect.width/2 - W/2;
  left = Math.max(8, Math.min(window.innerWidth-W-8, left));
  let top = rect.bottom+8;
  if (top+H > window.innerHeight) top = rect.top-H-8;
  top = Math.max(74, top);
  const plat = PLAT[link.platform]||PLAT.other;
  const grad = catGrad(catIdx);
  const thumb = link.videoId ? ytThumb(link.videoId,"hqdefault") : thumbUrl(link.rawThumb);
  const openLink = () => { const a=document.createElement("a");a.href=link.url;a.target="_blank";a.rel="noopener noreferrer";document.body.appendChild(a);a.click();document.body.removeChild(a); };

  // Always starts muted — postMessage to mute/unmute (no src change = no restart)
  const embedSrc = link.videoId
    ? `https://www.youtube-nocookie.com/embed/${link.videoId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&loop=1&playlist=${link.videoId}`
    : null;

  const toggleMute = (e) => {
    e.stopPropagation();
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: "command",
        func: muted ? "unMute" : "mute",
        args: []
      }), "*");
    }
    setMuted(m => !m);
  };

  return (
    <div className="pop" style={{left,top}} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="pop-top">
        <div style={{position:"absolute",inset:0,background:grad,zIndex:0}}/>
        {/* Thumbnail as placeholder behind iframe */}
        {thumb && <img className="pop-thumb" src={thumb} alt="" onError={e=>{e.target.style.display="none";}} style={{zIndex:1}}/>}
        {/* YouTube iframe — key=link.id only, NEVER includes muted in key */}
        {embedSrc && (
          <iframe
            ref={iframeRef}
            key={link.id}
            className="pop-iframe"
            src={embedSrc}
            allow="autoplay; encrypted-media"
            allowFullScreen={false}
            frameBorder="0"
          />
        )}
        <div className="pop-grd" style={{zIndex:3}}/>
        <div className="pop-plat" style={{background:plat.bg,color:plat.color,zIndex:5}}>{plat.label}</div>
        {link.videoId && (
          <button className="pop-mute-btn" onClick={toggleMute} title={muted?"Ativar som":"Silenciar"}>
            {muted ? <VolumeX size={13}/> : <Volume2 size={13}/>}
          </button>
        )}
        <div className="pop-play-btn" onClick={openLink} style={{cursor:"pointer",zIndex:4}}>
          <div className="pop-play-circle"><Play size={22} fill="white" color="white" style={{marginLeft:2}}/></div>
        </div>
        <div className="pop-card-title" style={{zIndex:5}}>{link.title}</div>
      </div>
      <div className="pop-body">
        <div className="pop-acts">
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="pop-btn" style={{background:"#fff",color:"#000",borderColor:"#fff"}}>
            <Play size={12} fill="#000" color="#000"/> Assistir
          </a>
          {link.videoId && onCinema && (
            <button className="pop-btn" onClick={()=>onCinema(link)} title="Modo Cinema">🎬</button>
          )}
          <button className={`pop-btn${link.watched?" watch-btn":""}`} onClick={()=>onToggle(link.id)}>
            {link.watched ? <><EyeOff size={12}/>Desfazer</> : <><Eye size={12}/>Assistido</>}
          </button>
          <button className="pop-btn del-btn" onClick={()=>onDelete(link.id)}><Trash2 size={12}/></button>
        </div>
        {(link.tags||[]).length > 0 && (
          <div className="tags-row" style={{marginBottom:6}}>
            {(link.tags||[]).map(t=>{
              const pt = PRESET_TAGS.find(p=>p.label===t);
              return <span key={t} className="tag-pill tag-pill-sm" style={{background:pt?.color+"22",color:pt?.color||"#a0a0a0",border:`1px solid ${pt?.color||"#333"}44`}}>{t}</span>;
            })}
          </div>
        )}
        {link.notes && <div className="pop-notes">📝 {link.notes}</div>}
        <div className="pop-meta" style={{marginTop:8}}>
          <span className="pop-tag">{plat.label}</span>
          {link.watched && <><span className="pop-sep">•</span><span className="pop-wd-pill">✓ Assistido</span></>}
        </div>
      </div>
    </div>
  );
}

// ─── ROW ──────────────────────────────────────────────────────────────────────
function Row({ cat, subCats=[], links, catIdx, isOrphaned, allCats, allLinks, onToggle, onDelete, onEdit, onPreviewShow, onPreviewHide, onNavigate, onCinema, onReorderLinks }) {
  const ref = useRef(null);
  const scroll = dir => ref.current?.scrollBy({left:dir*580,behavior:"smooth"});
  const wd = links.filter(l=>l.watched).length;
  const pct = links.length > 0 ? Math.round((wd/links.length)*100) : 0;
  const isEmpty = subCats.length === 0 && links.length === 0;
  const [dragLinkId, setDragLinkId] = useState(null);
  const [dragOverLinkId, setDragOverLinkId] = useState(null);

  const handleLinkDragStart = (e, id) => { setDragLinkId(id); e.dataTransfer.effectAllowed = "move"; };
  const handleLinkDragOver  = (e, id) => { e.preventDefault(); if (id !== dragLinkId) setDragOverLinkId(id); };
  const handleLinkDrop      = (e, targetId) => {
    e.preventDefault();
    if (!dragLinkId || dragLinkId === targetId) { setDragLinkId(null); setDragOverLinkId(null); return; }
    onReorderLinks && onReorderLinks(cat.id, dragLinkId, targetId);
    setDragLinkId(null); setDragOverLinkId(null);
  };
  const handleLinkDragEnd   = () => { setDragLinkId(null); setDragOverLinkId(null); };

  return (
    <div className="row-sec">
      <div className="row-hdr">
        <div className="row-hdr-l">
          <div className="row-title" onClick={() => onNavigate && subCats.length > 0 && onNavigate(cat.id)} style={{...(subCats.length>0?{cursor:"pointer"}:{}),color:isOrphaned?"#f5a623":""}}>
            {cat.name}
            {isOrphaned && <span style={{fontSize:11,color:"#888",marginLeft:8,fontWeight:400}}>— links sem categoria (mova ou exclua)</span>}
          </div>
          {links.length > 0 && <div className="row-cnt">{wd} de {links.length} assistidos</div>}
          {subCats.length > 0 && <div className="row-cnt" style={{color:"#f5a623"}}>{subCats.length} pasta{subCats.length!==1?"s":""}</div>}
        </div>
      </div>
      {links.length > 0 && (
        <div className="row-prog-wrap"><div className="row-prog"><div className={`row-fill${pct===100?" full":""}`} style={{width:`${pct}%`}}/></div></div>
      )}
      <div className="row-wrap">
        <button className="scroll-btn sl" onClick={()=>scroll(-1)}><ChevronLeft size={18}/></button>
        <div className="row-scroll" ref={ref}>
          {isEmpty
            ? <div className="row-empty"><Link size={16}/>Nenhum vídeo aqui ainda. Clique em + para adicionar.</div>
            : <>
                {subCats.map(sc => (
                  <FolderCard key={sc.id} cat={sc} cats={allCats} links={allLinks} onNavigate={onNavigate}/>
                ))}
                {links.map(l => (
                  <Card key={l.id} link={l} catIdx={catIdx}
                    onPreviewShow={onPreviewShow} onPreviewHide={onPreviewHide}
                    onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} onCinema={onCinema}
                    onDragStart={handleLinkDragStart} onDragOver={handleLinkDragOver}
                    onDrop={handleLinkDrop} onDragEnd={handleLinkDragEnd}
                    isDragging={dragLinkId===l.id} isDragOver={dragOverLinkId===l.id}
                  />
                ))}
              </>
          }
        </div>
        <button className="scroll-btn sr" onClick={()=>scroll(1)}><ChevronRight size={18}/></button>
      </div>
    </div>
  );
}

// ─── ADD LINK MODAL ───────────────────────────────────────────────────────────
function AddModal({ categories, lastCatId, onSave, onClose }) {
  // ── Fix #3: validate lastCatId exists in categories (handles subcategories) ──
  const validLastCat = lastCatId && categories.some(c => c.id === lastCatId)
    ? lastCatId
    : (categories[0]?.id || "");

  const [url, setUrl]       = useState("");
  const [title, setTitle]   = useState("");
  const [catId, setCatId]   = useState(validLastCat);
  const [fetching, setFetching] = useState(false);
  const [fetchOk, setFetchOk]   = useState(false);
  const [rawThumb, setRawThumb] = useState("");
  const [platform, setPlatform] = useState("other");
  const [videoId, setVideoId]   = useState("");

  // Inline category creation state
  const [showCreate, setShowCreate]   = useState(categories.length === 0); // auto-open if no cats
  const [newCatName, setNewCatName]   = useState("");
  const [newCatType, setNewCatType]   = useState("root"); // "root" | "sub"
  const [newCatParent, setNewCatParent] = useState("");
  const [justCreated, setJustCreated] = useState(null); // { name }
  const [localCats, setLocalCats]     = useState(categories);
  const [pendingNewCats, setPendingNewCats] = useState([]);
  const newCatInputRef = useRef(null);
  const fetchTimer     = useRef(null);

  // Focus cat name input when form opens
  useEffect(() => {
    if (showCreate) setTimeout(() => newCatInputRef.current?.focus(), 80);
  }, [showCreate]);

  const doFetch = async (u) => {
    if (!u.trim()) return;
    setFetching(true); setFetchOk(false);
    const plat = detectPlatform(u);
    const vid  = extractVideoId(u);
    setPlatform(plat); setVideoId(vid);
    const { title: t, rawThumb: rt, ok } = await fetchMeta(u);
    if (ok && t) { setTitle(t); setRawThumb(rt); setFetchOk(true); }
    setFetching(false);
  };

  const onUrlChange = (v) => {
    setUrl(v); setFetchOk(false);
    clearTimeout(fetchTimer.current);
    fetchTimer.current = setTimeout(() => doFetch(v), 800);
    setPlatform(detectPlatform(v)); setVideoId(extractVideoId(v));
  };

  const createCatInline = () => {
    if (!newCatName.trim()) return;
    const parentId = newCatType === "sub" && newCatParent ? newCatParent : null;
    const nc = { id: uid(), name: newCatName.trim(), parentId, order: localCats.filter(c=>c.parentId===parentId).length };
    setLocalCats(p => [...p, nc]);
    setPendingNewCats(p => [...p, nc]);
    setCatId(nc.id);                    // auto-select the newly created category
    setJustCreated({ name: nc.name, isRoot: !parentId });
    setNewCatName(""); setNewCatType("root"); setNewCatParent("");
    setShowCreate(false);
    setTimeout(() => setJustCreated(null), 3000);
  };

  // Derive full path of currently selected category for display
  const selectedCatPath = (() => {
    const c = localCats.find(x => x.id === catId);
    if (!c) return "";
    if (!c.parentId) return c.name;
    const parent = localCats.find(x => x.id === c.parentId);
    return parent ? `${parent.name} › ${c.name}` : c.name;
  })();

  const plat = PLAT[platform]||PLAT.other;
  const thumb = videoId ? ytThumb(videoId) : thumbUrl(rawThumb);
  const rootCats = localCats.filter(c => !c.parentId);
  const hasCats  = localCats.length > 0;

  return (
    <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-t">Adicionar à Lista</div>
        <div className="modal-sub">Cole a URL e o título será buscado automaticamente</div>
        <button className="modal-x" onClick={onClose}><X size={16}/></button>

        {/* URL field */}
        <div className="fg">
          <label className="fl">URL do vídeo</label>
          <input className="fi" placeholder="https://youtube.com/watch?v=..." value={url} onChange={e=>onUrlChange(e.target.value)} autoFocus/>
          <div className="fetch-area">
            {fetching && <><Loader2 size={20} style={{color:"#e50914",animation:"spin 1s linear infinite",flexShrink:0}}/><div><div className="fetch-plat">Buscando metadados...</div><div className="fetch-status">aguarde</div></div></>}
            {!fetching && !fetchOk && !url && <><Link size={18} style={{color:"#404040",flexShrink:0}}/><div className="fetch-status">Cole uma URL — título e thumbnail serão buscados automaticamente</div></>}
            {!fetching && !fetchOk && url && <><div style={{width:80,height:45,borderRadius:6,background:plat.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:plat.color,flexShrink:0}}>{plat.label}</div><div><div className="fetch-plat">Plataforma: {plat.label}</div><div className="fetch-status">Título não encontrado — preencha manualmente</div></div></>}
            {!fetching && fetchOk && <>{thumb?<img className="fetch-thumb" src={thumb} alt="" onError={e=>{e.target.style.display="none";}}/>:<div style={{width:80,height:45,borderRadius:6,background:plat.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}/>}<div><div className="fetch-plat">✓ {plat.label} — metadados obtidos</div><div className="fetch-status" style={{color:"#22c55e",fontSize:10}}>Título e thumbnail carregados</div></div></>}
          </div>
        </div>

        {/* Title field */}
        <div className="fg">
          <label className="fl">Título</label>
          <input className="fi" placeholder="Nome do vídeo..." value={title} onChange={e=>setTitle(e.target.value)}/>
        </div>

        {/* ── Category field — Fix #1 + Fix #3 ── */}
        <div className="fg">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <label className="fl" style={{marginBottom:0}}>Categoria</label>
            {hasCats && (
              <button
                onClick={()=>setShowCreate(s=>!s)}
                style={{background:"none",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                  color:showCreate?"#4caf50":"#555",display:"flex",alignItems:"center",gap:4,
                  padding:"2px 0",transition:"color .2s",fontFamily:"'Inter',sans-serif"}}
              >
                <FolderPlus size={12}/> Nova categoria
              </button>
            )}
          </div>

          {/* Selector — shown when cats exist */}
          {hasCats && (
            <select className="fsel" value={catId} onChange={e=>setCatId(e.target.value)}>
              {rootCats.map(c=>(
                <optgroup key={c.id} label={c.name}>
                  <option value={c.id}>{c.name}</option>
                  {localCats.filter(s=>s.parentId===c.id).sort((a,b)=>a.order-b.order).map(s=>(
                    <option key={s.id} value={s.id}>{c.name} › {s.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}

          {/* Pre-selected subcategory indicator (Fix #3 visibility) */}
          {hasCats && catId && selectedCatPath && !showCreate && (
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:7,fontSize:12,color:"#555",fontFamily:"'Inter',sans-serif"}}>
              <span style={{color:"#333"}}>📍</span>
              <span>Selecionado: <strong style={{color:"#a0a0a0",fontWeight:600}}>{selectedCatPath}</strong></span>
            </div>
          )}

          {/* Feedback when category was just created */}
          {justCreated && (
            <div className="cat-just-created">
              <Check size={13}/> Categoria "{justCreated.name}" criada e selecionada
            </div>
          )}

          {/* ── Inline creation form (Fix #1) ── */}
          {/* Empty state: auto-shows creation form */}
          {!hasCats && !showCreate && (
            <div className="cat-empty-state">
              <div className="cat-empty-ico">📁</div>
              <div className="cat-empty-msg">Nenhuma categoria criada ainda</div>
              <div className="cat-empty-hint">Crie uma abaixo para organizar seus vídeos</div>
              <button className="btn-sm-green" style={{margin:"12px auto 0",width:"auto"}} onClick={()=>setShowCreate(true)}>
                <FolderPlus size={13}/> Criar primeira categoria
              </button>
            </div>
          )}

          {showCreate && (
            <div className="cat-create-form">
              <div className="cat-create-form-title">Nova categoria</div>

              {/* Type toggle — only when roots exist */}
              {rootCats.length > 0 && (
                <div className="cat-type-tabs" style={{marginBottom:12}}>
                  <button
                    className={`cat-type-tab${newCatType==="root"?" on":""}`}
                    onClick={()=>{ setNewCatType("root"); setNewCatParent(""); }}
                  >
                    📁 Categoria raiz
                  </button>
                  <button
                    className={`cat-type-tab${newCatType==="sub"?" on":""}`}
                    onClick={()=>setNewCatType("sub")}
                  >
                    └─ Subcategoria
                  </button>
                </div>
              )}

              {/* Visual tree preview — shows hierarchy as you type */}
              <div style={{
                background:"#0d0d0d",border:"1px solid #1a1a1a",
                borderRadius:8,padding:"12px 14px",marginBottom:12,
                fontFamily:"'Inter',sans-serif",
              }}>
                {newCatType === "root" ? (
                  /* Root preview */
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:15}}>📁</span>
                    <span style={{
                      fontSize:13,fontWeight:700,
                      color: newCatName.trim() ? "#fff" : "#333",
                      fontStyle: newCatName.trim() ? "normal" : "italic",
                    }}>
                      {newCatName.trim() || "Nome da categoria..."}
                    </span>
                    {newCatName.trim() && (
                      <span style={{fontSize:10,fontWeight:700,color:"#4caf50",padding:"1px 7px",
                        background:"rgba(76,175,80,.1)",borderRadius:10,border:"1px solid rgba(76,175,80,.25)"}}>
                        nova raiz
                      </span>
                    )}
                  </div>
                ) : (
                  /* Subcategory preview — shows parent + indented child */
                  <div>
                    {/* Parent */}
                    {newCatParent ? (
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <span style={{fontSize:14}}>📁</span>
                        <span style={{fontSize:13,fontWeight:700,color:"#a0a0a0"}}>
                          {rootCats.find(c=>c.id===newCatParent)?.name || "..."}
                        </span>
                      </div>
                    ) : (
                      <div style={{fontSize:12,color:"#333",marginBottom:6,fontStyle:"italic"}}>
                        ← selecione a pasta pai abaixo
                      </div>
                    )}
                    {/* Connector + child */}
                    <div style={{display:"flex",alignItems:"center",gap:0,paddingLeft:8}}>
                      {/* Tree connector */}
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginRight:10,flexShrink:0}}>
                        <div style={{width:1,height:10,background:"rgba(255,255,255,.15)"}}/>
                        <div style={{width:16,height:1,background:"rgba(255,255,255,.15)",alignSelf:"flex-start",marginLeft:0}}/>
                      </div>
                      <span style={{fontSize:13}}>📄</span>
                      <span style={{
                        fontSize:13,fontWeight:600,marginLeft:7,
                        color: newCatName.trim() ? "#fff" : "#333",
                        fontStyle: newCatName.trim() ? "normal" : "italic",
                      }}>
                        {newCatName.trim() || "Nome da subcategoria..."}
                      </span>
                      {newCatName.trim() && newCatParent && (
                        <span style={{fontSize:10,fontWeight:700,color:"#4caf50",marginLeft:8,padding:"1px 7px",
                          background:"rgba(76,175,80,.1)",borderRadius:10,border:"1px solid rgba(76,175,80,.25)"}}>
                          nova sub
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Parent selector when creating sub — visual cards instead of select */}
              {newCatType === "sub" && rootCats.length > 0 && (
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",
                    color:"#555",marginBottom:7,fontFamily:"'Inter',sans-serif"}}>
                    Dentro de qual pasta?
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {rootCats.map(c=>(
                      <button
                        key={c.id}
                        onClick={()=>setNewCatParent(c.id)}
                        style={{
                          display:"flex",alignItems:"center",gap:6,
                          padding:"6px 12px",borderRadius:6,cursor:"pointer",
                          fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:600,
                          background: newCatParent===c.id ? "rgba(76,175,80,.15)" : "rgba(255,255,255,.04)",
                          border: `1.5px solid ${newCatParent===c.id ? "rgba(76,175,80,.4)" : "#1a1a1a"}`,
                          color: newCatParent===c.id ? "#4caf50" : "#a0a0a0",
                          transition:"all .15s",
                        }}
                      >
                        <span style={{fontSize:13}}>📁</span>
                        {c.name}
                        {newCatParent===c.id && <Check size={11}/>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Name input */}
              <div className="cat-create-row" style={{marginBottom:6}}>
                <input
                  ref={newCatInputRef}
                  className="cat-create-inp"
                  placeholder={newCatType==="sub" ? "Nome da subcategoria..." : "Nome da categoria..."}
                  value={newCatName}
                  onChange={e=>setNewCatName(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter") createCatInline(); if(e.key==="Escape"){setShowCreate(false);setNewCatName("");} }}
                  style={{flex:1}}
                  autoFocus
                />
                <button
                  className="btn-sm-green"
                  onClick={createCatInline}
                  disabled={!newCatName.trim()||(newCatType==="sub"&&!newCatParent&&rootCats.length>0)}
                  style={{whiteSpace:"nowrap"}}
                >
                  <Check size={13}/> Criar
                </button>
                {hasCats && (
                  <button className="modal-x" style={{position:"static",width:34,height:34,flexShrink:0}}
                    onClick={()=>{setShowCreate(false);setNewCatName("");}}>
                    <X size={13}/>
                  </button>
                )}
              </div>
              <div style={{fontSize:10,color:"#2a2a2a",fontFamily:"'Inter',sans-serif"}}>
                Enter para criar • Esc para fechar
              </div>
            </div>
          )}
        </div>

        {/* ── Mini category editor — shown when pendingNewCats exist (Fix #3) ── */}
        {pendingNewCats.length > 0 && (
          <div className="cat-mini-tree">
            <div className="cat-mini-tree-title">
              <FolderPlus size={12}/>
              Categorias criadas aqui — edite a hierarquia antes de salvar
            </div>
            {/* Flat list of all localCats with indent/outdent controls */}
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {localCats.sort((a,b)=>{
                // Sort: roots first by order, then subs under their parent
                if (!a.parentId && !b.parentId) return a.order-b.order;
                if (!a.parentId) return -1;
                if (!b.parentId) return 1;
                if (a.parentId===b.parentId) return a.order-b.order;
                return 0;
              }).map(c => {
                const isPending = pendingNewCats.some(p=>p.id===c.id);
                const parent    = localCats.find(x=>x.id===c.parentId);
                const isRoot    = !c.parentId;
                const hasPrev   = localCats.filter(x=>x.parentId===c.parentId).sort((a,b)=>a.order-b.order).findIndex(x=>x.id===c.id) > 0;

                const moveInline = (op) => {
                  if (op==="indent" && !hasPrev) return;
                  if (op==="outdent" && isRoot) return;
                  if (op==="indent") {
                    // become child of previous sibling
                    const sibs = localCats.filter(x=>x.parentId===c.parentId).sort((a,b)=>a.order-b.order);
                    const myIdx = sibs.findIndex(x=>x.id===c.id);
                    if (myIdx===0) return;
                    const newParent = sibs[myIdx-1];
                    const newOrder  = localCats.filter(x=>x.parentId===newParent.id).length;
                    setLocalCats(p=>p.map(x=>x.id===c.id?{...x,parentId:newParent.id,order:newOrder}:x));
                    setPendingNewCats(p=>p.map(x=>x.id===c.id?{...x,parentId:newParent.id,order:newOrder}:x));
                  } else {
                    // promote to parent's level
                    const grandParent = localCats.find(x=>x.id===c.parentId)?.parentId||null;
                    const newOrder    = localCats.filter(x=>x.parentId===grandParent).length;
                    setLocalCats(p=>p.map(x=>x.id===c.id?{...x,parentId:grandParent,order:newOrder}:x));
                    setPendingNewCats(p=>p.map(x=>x.id===c.id?{...x,parentId:grandParent,order:newOrder}:x));
                  }
                };

                return (
                  <div key={c.id} style={{
                    display:"flex",alignItems:"center",gap:8,
                    padding:isRoot?"9px 10px":"7px 10px",
                    marginLeft:isRoot?0:20,
                    background:isRoot?"rgba(255,255,255,.04)":"rgba(255,255,255,.02)",
                    borderRadius:6,
                    border:`1px solid ${isPending?"rgba(76,175,80,.2)":"rgba(255,255,255,.04)"}`,
                    borderLeft: isRoot?`3px solid ${isPending?"#4caf50":"#1a1a1a"}`:`1px solid ${isPending?"rgba(76,175,80,.2)":"rgba(255,255,255,.04)"}`,
                  }}>
                    <span style={{fontSize:12,flexShrink:0}}>{isRoot?"📁":"📄"}</span>
                    <span style={{flex:1,fontSize:isRoot?13:12,fontWeight:isRoot?700:500,
                      color:isRoot?"#fff":"#b0b0b0",fontFamily:"'Inter',sans-serif",
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {parent ? <span style={{color:"#444",marginRight:4}}>{parent.name} ›</span> : null}
                      {c.name}
                    </span>
                    {isPending && (
                      <span style={{fontSize:9,fontWeight:700,color:"#4caf50",padding:"1px 6px",
                        background:"rgba(76,175,80,.1)",borderRadius:10,border:"1px solid rgba(76,175,80,.2)",
                        flexShrink:0,textTransform:"uppercase",letterSpacing:".5px"}}>nova</span>
                    )}
                    {/* Indent/Outdent buttons */}
                    <button onClick={()=>moveInline("outdent")} disabled={isRoot}
                      style={{background:"none",border:"none",cursor:isRoot?"not-allowed":"pointer",
                        color:isRoot?"#222":"#3b82f6",fontSize:12,padding:"3px 5px",borderRadius:4,
                        opacity:isRoot?.3:1,transition:"all .15s",fontFamily:"'Inter',sans-serif",fontWeight:700}}
                      title="← Promover a categoria raiz">←</button>
                    <button onClick={()=>moveInline("indent")} disabled={!hasPrev}
                      style={{background:"none",border:"none",cursor:!hasPrev?"not-allowed":"pointer",
                        color:!hasPrev?"#222":"#f5a623",fontSize:12,padding:"3px 5px",borderRadius:4,
                        opacity:!hasPrev?.3:1,transition:"all .15s",fontFamily:"'Inter',sans-serif",fontWeight:700}}
                      title="→ Tornar subcategoria da anterior">→</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button
            className="btn-save"
            onClick={()=>onSave({url:url.trim(),title:title.trim(),rawThumb,platform,videoId,categoryId:catId},pendingNewCats)}
            disabled={!url.trim()||!title.trim()||!catId}
          >
            <Check size={16}/> Salvar na Lista
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CATEGORY MANAGER ─────────────────────────────────────────────────────────
function CatModal({ categories, links, onSave, onClose }) {
  const [cats, setCats]             = useState(categories);
  const [newName, setNewName]       = useState("");
  const [editId, setEditId]         = useState(null);
  const [editName, setEditName]     = useState("");
  const [addSubOf, setAddSubOf]     = useState(null);
  const [subName, setSubName]       = useState("");
  const [delConfirm, setDelConfirm] = useState(null);
  // Enhanced DnD state
  const [dragId,    setDragId]    = useState(null);
  const [dropState, setDropState] = useState(null);
  // dropState = { targetId, mode: "before"|"after"|"nest" }
  const ghostRef = useRef(null);
  const dragDataRef = useRef({});

  // ── Tree helpers ──────────────────────────────────────────────────────────
  const siblings = (cat) => cats.filter(c => c.parentId === cat.parentId).sort((a,b)=>a.order-b.order);
  const siblingsOf = (parentId) => cats.filter(c => c.parentId === parentId).sort((a,b)=>a.order-b.order);
  const idx = (cat) => siblings(cat).findIndex(c => c.id === cat.id);

  // ── Operations ─────────────────────────────────────────────────────────────
  const addCat = () => {
    if (!newName.trim()) return;
    setCats(p=>[...p,{id:uid(),name:newName.trim(),parentId:null,order:p.filter(c=>!c.parentId).length}]);
    setNewName("");
  };
  const addSub = (parentId) => {
    if (!subName.trim()) return;
    setCats(p=>[...p,{id:uid(),name:subName.trim(),parentId,order:p.filter(c=>c.parentId===parentId).length}]);
    setSubName(""); setAddSubOf(null);
  };
  const rename = (id) => {
    if (!editName.trim()) { setEditId(null); return; }
    setCats(p=>p.map(c=>c.id===id?{...c,name:editName.trim()}:c)); setEditId(null);
  };
  const moveUp = (cat) => {
    const sibs = siblings(cat); const i = idx(cat);
    if (i === 0) return;
    const prev = sibs[i-1];
    setCats(p=>p.map(c=>{
      if (c.id===cat.id) return {...c,order:prev.order};
      if (c.id===prev.id) return {...c,order:cat.order};
      return c;
    }));
  };
  const moveDown = (cat) => {
    const sibs = siblings(cat); const i = idx(cat);
    if (i === sibs.length-1) return;
    const next = sibs[i+1];
    setCats(p=>p.map(c=>{
      if (c.id===cat.id) return {...c,order:next.order};
      if (c.id===next.id) return {...c,order:cat.order};
      return c;
    }));
  };
  const indent = (cat) => {
    // Become child of previous sibling
    const sibs = siblings(cat); const i = idx(cat);
    if (i === 0) return;
    const newParent = sibs[i-1];
    const newOrder = cats.filter(c=>c.parentId===newParent.id).length;
    setCats(p=>p.map(c=>c.id===cat.id?{...c,parentId:newParent.id,order:newOrder}:c));
  };
  const outdent = (cat) => {
    // Become child of grandparent (or root)
    if (!cat.parentId) return;
    const parent = cats.find(c=>c.id===cat.parentId);
    const newParentId = parent?.parentId||null;
    const newOrder = cats.filter(c=>c.parentId===newParentId).length;
    setCats(p=>p.map(c=>c.id===cat.id?{...c,parentId:newParentId,order:newOrder}:c));
  };
  const deleteCat = (id) => {
    const toDelete = new Set([id]);
    let changed = true;
    while (changed) { changed=false; cats.forEach(c=>{if(c.parentId&&toDelete.has(c.parentId)&&!toDelete.has(c.id)){toDelete.add(c.id);changed=true;}}); }
    setCats(p=>p.filter(c=>!toDelete.has(c.id))); setDelConfirm(null);
  };

  // ── Enhanced Drag and Drop ────────────────────────────────────────────────
  // Supports: drag up/down to reorder, drag right to NEST as subcategory
  const NEST_THRESHOLD_PX = 48; // px from left edge to trigger "nest inside" mode

  const onDragStart = (e, id, name) => {
    setDragId(id);
    dragDataRef.current = { id, name };
    e.dataTransfer.effectAllowed = "move";
    // Create custom ghost label
    const ghost = document.createElement("div");
    ghost.textContent = "📁 " + name;
    ghost.style.cssText = "position:fixed;top:-100px;left:-100px;background:#1a1a1a;border:1px solid #e50914;border-radius:6px;padding:7px 14px;font-size:13px;font-weight:600;color:#fff;font-family:Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.7);white-space:nowrap;z-index:9999;pointer-events:none;";
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => { if (ghostRef.current) { ghostRef.current.style.top = "-999px"; } }, 0);
  };

  const onDragOver = (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const dragged = cats.find(c => c.id === dragId);
    const target  = cats.find(c => c.id === targetId);
    if (!dragged || !target) return;
    // Don't allow nesting inside own children
    const isDescendant = (parentId, childId) => {
      let c = cats.find(x => x.id === childId);
      while (c) { if (c.id === parentId) return true; c = cats.find(x => x.id === c.parentId); }
      return false;
    };
    const rect = e.currentTarget.getBoundingClientRect();
    const relX  = e.clientX - rect.left;
    const relY  = e.clientY - rect.top;
    const isNestZone = relX > NEST_THRESHOLD_PX && !isDescendant(dragId, targetId) && targetId !== dragged.parentId;
    const mode = isNestZone ? "nest" : (relY < rect.height / 2 ? "before" : "after");
    setDropState({ targetId, mode });
  };

  const onDrop = (e, targetId) => {
    e.preventDefault();
    if (!dragId || !dropState || dragId === targetId) { clearDrag(); return; }
    const dragged = cats.find(c => c.id === dragId);
    const target  = cats.find(c => c.id === targetId);
    if (!dragged || !target) { clearDrag(); return; }

    if (dropState.mode === "nest") {
      // Make dragged a child of target
      const newOrder = cats.filter(c => c.parentId === targetId).length;
      setCats(p => p.map(c => c.id === dragId ? { ...c, parentId: targetId, order: newOrder } : c));
    } else {
      // Reorder — only within same parent level
      if (dragged.parentId !== target.parentId) { clearDrag(); return; }
      // Recompute orders
      const siblings = cats
        .filter(c => c.parentId === dragged.parentId && c.id !== dragId)
        .sort((a, b) => a.order - b.order);
      const targetIdx = siblings.findIndex(c => c.id === targetId);
      const insertIdx = dropState.mode === "before" ? targetIdx : targetIdx + 1;
      siblings.splice(insertIdx, 0, dragged);
      setCats(p => p.map(c => {
        const newOrder = siblings.findIndex(s => s.id === c.id);
        return newOrder >= 0 ? { ...c, order: newOrder } : c;
      }));
    }
    clearDrag();
  };

  const clearDrag = () => {
    setDragId(null); setDropState(null);
    if (ghostRef.current) { document.body.removeChild(ghostRef.current); ghostRef.current = null; }
  };
  const onDragEnd = clearDrag;

  const lkCount = (id) => links.filter(l=>l.categoryId===id).length;

  // ── Render tree: clear visual hierarchy with connecting lines ────────────
  const renderSubtree = (children, colorIdx) => {
    if (!children.length) return null;
    return (
      <div className="cat-subtree">
        {children.map((c, ci) => {
          const isLast = ci === children.length - 1;
          const subSubs = cats.filter(s => s.parentId === c.id).sort((a,b)=>a.order-b.order);
          const isDragging  = dragId === c.id;
          const isDropNest  = dropState?.targetId===c.id && dropState?.mode==="nest";
          const isDropBefore= dropState?.targetId===c.id && dropState?.mode==="before";
          const isDropAfter = dropState?.targetId===c.id && dropState?.mode==="after";
          const lk          = lkCount(c.id);
          const color       = CAT_COLORS[colorIdx%8];
          const sibs        = siblings(c);
          const si          = sibs.findIndex(x=>x.id===c.id);
          return (
            <div key={c.id} className="cat-sub-row">
              {isDropBefore && <div className="cat-drop-bar"/>}
              <div
                className={`cat-item sub-item${isDragging?" dragging":""}${isDropNest?" drag-over-nest":""}${isDropAfter||isDropBefore?" drag-over-reorder":""}`}
                draggable
                onDragStart={e=>onDragStart(e,c.id,c.name)}
                onDragOver={e=>onDragOver(e,c.id)}
                onDrop={e=>onDrop(e,c.id)}
                onDragEnd={onDragEnd}
                title="Arraste para mover • Arraste para a direita para aninhar dentro de outra pasta"
              >
                <span className="cat-drag-handle">⠿</span>
                <span className="cat-icon" style={{opacity:.5}}>📄</span>
                {editId===c.id ? (
                  <input className="cat-create-inp" style={{flex:1,padding:"3px 8px",fontSize:12,margin:"0 4px"}} value={editName}
                    onChange={e=>setEditName(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")rename(c.id);if(e.key==="Escape")setEditId(null);}}
                    autoFocus onBlur={()=>rename(c.id)}/>
                ) : (
                  <span className="cat-name sub-name" onDoubleClick={()=>{setEditId(c.id);setEditName(c.name);}}>
                    {c.name}
                    <span className="cat-sub-label">sub</span>
                  </span>
                )}
                {lk > 0 && <span className="cat-link-cnt">{lk}</span>}
                <div className="cat-actions">
                  <button className="cat-act-btn" title="↑ Subir" disabled={si===0} onClick={()=>moveUp(c)}>↑</button>
                  <button className="cat-act-btn" title="↓ Descer" disabled={si===sibs.length-1} onClick={()=>moveDown(c)}>↓</button>
                  <button className="cat-act-btn outdent-btn" title="← Promover a categoria raiz" onClick={()=>outdent(c)}>←</button>
                  <button className="cat-act-btn add-sub" title="Adicionar sub-subcategoria" onClick={()=>{setAddSubOf(c.id);setSubName("");}}>
                    <FolderPlus size={11}/>
                  </button>
                  <button className="cat-act-btn" title="Renomear" onClick={()=>{setEditId(c.id);setEditName(c.name);}}>
                    <Edit2 size={11}/>
                  </button>
                  {delConfirm===c.id
                    ? <button className="cat-act-btn danger" onClick={()=>deleteCat(c.id)}>✓ confirmar</button>
                    : <button className="cat-act-btn danger" title="Excluir" onClick={()=>setDelConfirm(c.id)}><Trash2 size={11}/></button>
                  }
                </div>
              </div>
              {isDropAfter && <div className="cat-drop-bar"/>}
              {addSubOf===c.id && (
                <div className="cat-create-form" style={{margin:"4px 0 4px 12px",padding:10}}>
                  <div className="cat-create-form-title" style={{fontSize:10,marginBottom:8}}>Sub-subcategoria em "{c.name}"</div>
                  <div className="cat-create-row">
                    <input className="cat-create-inp" placeholder="Nome..." value={subName}
                      onChange={e=>setSubName(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter")addSub(c.id);if(e.key==="Escape")setAddSubOf(null);}}
                      autoFocus style={{fontSize:12}}/>
                    <button className="btn-sm-green" onClick={()=>addSub(c.id)}><Check size={12}/></button>
                    <button className="modal-x" style={{position:"static",width:30,height:30,flexShrink:0}} onClick={()=>setAddSubOf(null)}><X size={12}/></button>
                  </div>
                </div>
              )}
              {renderSubtree(subSubs, colorIdx)}
            </div>
          );
        })}
      </div>
    );
  };

  const renderRoot = (c, colorIdx) => {
    const color = CAT_COLORS[colorIdx%8];
    const subs  = cats.filter(s => s.parentId === c.id).sort((a,b)=>a.order-b.order);
    const sibs  = siblings(c);
    const si    = sibs.findIndex(x=>x.id===c.id);
    const lk    = lkCount(c.id);
    const isDragging  = dragId===c.id;
    const isDropNest  = dropState?.targetId===c.id && dropState?.mode==="nest";
    const isDropBefore= dropState?.targetId===c.id && dropState?.mode==="before";
    const isDropAfter = dropState?.targetId===c.id && dropState?.mode==="after";

    return (
      <div key={c.id} className="cat-root-block">
        {isDropBefore && <div className="cat-drop-bar"/>}
        <div
          className={`cat-item root-item${isDragging?" dragging":""}${isDropNest?" drag-over-nest":""}${isDropAfter||isDropBefore?" drag-over-reorder":""}`}
          style={{borderLeftColor: color}}
          draggable
          onDragStart={e=>onDragStart(e,c.id,c.name)}
          onDragOver={e=>onDragOver(e,c.id)}
          onDrop={e=>onDrop(e,c.id)}
          onDragEnd={onDragEnd}
          title="Arraste para reordenar • Arraste para a direita para aninhar dentro de outra pasta"
        >
          <span className="cat-drag-handle">⠿</span>
          <span className="cat-icon">📁</span>
          {editId===c.id ? (
            <input className="cat-create-inp" style={{flex:1,padding:"4px 10px",fontSize:13,margin:"0 4px"}} value={editName}
              onChange={e=>setEditName(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")rename(c.id);if(e.key==="Escape")setEditId(null);}}
              autoFocus onBlur={()=>rename(c.id)}/>
          ) : (
            <span className="cat-name root-name" onDoubleClick={()=>{setEditId(c.id);setEditName(c.name);}}>
              {c.name}
            </span>
          )}
          {subs.length > 0 && (
            <span style={{fontSize:10,color:"#444",flexShrink:0,fontFamily:"'Inter',sans-serif",fontWeight:600}}>
              {subs.length} {subs.length===1?"pasta":"pastas"}
            </span>
          )}
          {lk > 0 && <span className="cat-link-cnt">{lk}</span>}
          <div className="cat-actions">
            <button className="cat-act-btn" title="↑ Subir" disabled={si===0} onClick={()=>moveUp(c)}>↑</button>
            <button className="cat-act-btn" title="↓ Descer" disabled={si===sibs.length-1} onClick={()=>moveDown(c)}>↓</button>
            {si>0 && <button className="cat-act-btn indent-btn" title="→ Tornar subcategoria da anterior" onClick={()=>indent(c)}>→</button>}
            <button className="cat-act-btn add-sub" title="Adicionar subcategoria" onClick={()=>{setAddSubOf(c.id);setSubName("");}}>
              <FolderPlus size={12}/>
            </button>
            <button className="cat-act-btn" title="Renomear (ou duplo clique)" onClick={()=>{setEditId(c.id);setEditName(c.name);}}>
              <Edit2 size={11}/>
            </button>
            {delConfirm===c.id
              ? <button className="cat-act-btn danger" onClick={()=>deleteCat(c.id)}>✓ confirmar</button>
              : <button className="cat-act-btn danger" title="Excluir" onClick={()=>setDelConfirm(c.id)}><Trash2 size={11}/></button>
            }
          </div>
        </div>
        {isDropAfter && !subs.length && <div className="cat-drop-bar"/>}
        {addSubOf===c.id && (
          <div className="cat-create-form" style={{margin:"4px 0 6px 16px",padding:12}}>
            <div className="cat-create-form-title" style={{fontSize:10,marginBottom:8}}>Nova subcategoria em "{c.name}"</div>
            <div className="cat-create-row">
              <input className="cat-create-inp" placeholder="Nome da subcategoria..." value={subName}
                onChange={e=>setSubName(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")addSub(c.id);if(e.key==="Escape")setAddSubOf(null);}}
                autoFocus style={{fontSize:13}}/>
              <button className="btn-sm-green" onClick={()=>addSub(c.id)}><Check size={13}/></button>
              <button className="modal-x" style={{position:"static",width:32,height:32,flexShrink:0}} onClick={()=>setAddSubOf(null)}><X size={13}/></button>
            </div>
          </div>
        )}
        {/* Subtree with connecting lines */}
        {subs.length > 0 && renderSubtree(subs, colorIdx)}
      </div>
    );
  };

  return (
    <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{maxWidth:560}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:6}}>
          <div>
            <div className="modal-t" style={{marginBottom:4}}>Gerenciar Categorias</div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              {[["⠿","arrastar"],["↑↓","mover"],["→","recuar"],["←","promover"],["✎","duplo clique"]].map(([icon,label])=>(
                <span key={label} style={{fontSize:10,color:"#333",display:"flex",alignItems:"center",gap:4,fontFamily:"'Inter',sans-serif"}}>
                  <span style={{background:"#1a1a1a",borderRadius:3,padding:"1px 5px",fontWeight:700,color:"#555"}}>{icon}</span>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <button className="modal-x" style={{position:"static",marginTop:4}} onClick={onClose}><X size={16}/></button>
        </div>

        {/* Legend */}
        <div style={{display:"flex",gap:16,marginBottom:12,marginTop:8,padding:"8px 12px",background:"rgba(255,255,255,.02)",borderRadius:6,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:"#333",fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:12}}>📁</span><span>Categoria raiz</span>
          </span>
          <span style={{fontSize:11,color:"#333",fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:12}}>📄</span><span>Subcategoria</span>
          </span>
          <span style={{fontSize:11,color:"#555",fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",gap:5}}>
            <span style={{background:"rgba(229,9,20,.3)",width:24,height:2,borderRadius:1,display:"inline-block"}}/>
            <span>arrastar para reordenar</span>
          </span>
          <span style={{fontSize:11,color:"#555",fontFamily:"'Inter',sans-serif",display:"flex",alignItems:"center",gap:5}}>
            <span style={{background:"rgba(76,175,80,.3)",width:24,height:2,borderRadius:1,display:"inline-block"}}/>
            <span>arrastar para a direita para aninhar</span>
          </span>
        </div>

        {/* Category tree */}
        <div className="cat-list">
          {cats.filter(c=>!c.parentId).sort((a,b)=>a.order-b.order).map((c,ci)=>renderRoot(c,ci))}
          {cats.filter(c=>!c.parentId).length===0 && (
            <div className="cat-empty-state">
              <div className="cat-empty-ico">📁</div>
              <div className="cat-empty-msg">Nenhuma categoria ainda</div>
              <div className="cat-empty-hint">Crie a primeira categoria abaixo para organizar seus vídeos</div>
            </div>
          )}
        </div>

        {/* Add root category */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".7px",color:"#444",marginBottom:8,fontFamily:"'Inter',sans-serif"}}>
            Nova categoria raiz
          </div>
          <div className="cat-create-row">
            <input
              className="cat-create-inp"
              placeholder="Nome da categoria..."
              value={newName}
              onChange={e=>setNewName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addCat()}
              style={{fontSize:13}}
            />
            <button className="btn-sm-green" onClick={addCat} disabled={!newName.trim()}>
              <Plus size={14}/> Criar
            </button>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn-cancel" onClick={onClose}>Fechar</button>
          <button className="btn-save" onClick={()=>onSave(cats)}><Check size={16}/> Salvar alterações</button>
        </div>
      </div>
    </div>
  );
}


// ─── BOTTOM NAV (mobile) ─────────────────────────────────────────────────────
function BottomNav({ activePage, onHome, onSearch, onAdd, onCats, onSettings }) {
  return (
    <nav className="bottom-nav">
      <div className="bnav-inner">
        <button className={`bnav-btn${activePage==="home"?" active":""}`} onClick={onHome}>
          <Home size={20}/><span>Início</span>
        </button>
        <button className={`bnav-btn${activePage==="search"?" active":""}`} onClick={onSearch}>
          <Search size={20}/><span>Buscar</span>
        </button>
        <button className="bnav-add-btn" onClick={onAdd} title="Adicionar vídeo">
          <Plus size={22} color="#fff"/>
        </button>
        <button className={`bnav-btn${activePage==="cats"?" active":""}`} onClick={onCats}>
          <Folder size={20}/><span>Pastas</span>
        </button>
        <button className={`bnav-btn${activePage==="settings"?" active":""}`} onClick={onSettings}>
          <Settings size={20}/><span>Perfil</span>
        </button>
      </div>
    </nav>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
function MainApp({ user, onSettings, onLogout, exportRef, importRef, onStatsChange }) {
  const [cats, setCats]   = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");
  const [search, setSearch]   = useState("");
  const [headerUp, setHeaderUp] = useState(true);
  const [notif, setNotif]       = useState(null);
  const [popup, setPopup]       = useState(null);
  const [showAdd, setShowAdd]           = useState(false);
  const [editLink, setEditLink]         = useState(null);
  const [cinemaLink, setCinemaLink]     = useState(null);
  const [importData, setImportData]     = useState(null);
  const [currentCatId, setCurrentCatId] = useState(null);
  const [showAdvSearch, setShowAdvSearch] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showOrganizar, setShowOrganizar] = useState(false);
  // Notes
  const [notes, setNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [noteFilter, setNoteFilter] = useState("inbox");
  const [noteSearch, setNoteSearch] = useState("");
  const [appPage, setAppPage] = useState("home"); // "home" | "notes"
  // Re-fetch cats from backend whenever Organizar modal opens
  useEffect(() => {
    if (!showOrganizar) return;
    const jwt = user?.jwtToken;
    if (!jwt || !API_URL) return;
    apiFetch("/api/categories", {}, jwt)
      .then(fresh => { if (Array.isArray(fresh)) saveCats(fresh); })
      .catch(() => {});
  }, [showOrganizar]);

  // Load notes when notes page opens
  useEffect(() => {
    if (appPage !== "notes") return;
    freshNotes();
  }, [appPage]);
  const [orgTab, setOrgTab] = useState("cats"); // "cats" | "tags"
  const [customTags, setCustomTags] = useState(()=>{try{return JSON.parse(localStorage.getItem("wl-custom-tags")||"[]");}catch{return [];}});
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterDate, setFilterDate]         = useState("all");
  const [filterTags, setFilterTags]         = useState([]);
  const [undoStack, setUndoStack]           = useState(null);
  const undoTimer = useRef(null);
  const [undoProgress, setUndoProgress]     = useState(100);

  // Storage key scoped by user ID — must be declared before any useEffect
  const userKey = user?.id || "demo";

  // Re-fetch from backend when tab regains focus (keeps app in sync with extension)
  useEffect(()=>{
    const onFocus = async () => {
      if (!user?.jwtToken || !API_URL) return;
      try {
        const [freshCats, freshLinks] = await Promise.all([
          apiFetch("/api/categories", {}, user.jwtToken),
          apiFetch("/api/links", {}, user.jwtToken),
        ]);
        if (Array.isArray(freshCats))  saveCats(freshCats);
        if (Array.isArray(freshLinks)) saveLinks(freshLinks);
      } catch {}
    };
    document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") onFocus(); });
    return ()=>document.removeEventListener("visibilitychange", onFocus);
  },[user?.jwtToken]);
  const undoProgInterval = useRef(null);
  const saveCount = useRef(0);
  const lastCatRef = useRef(null);
  const hideTimer  = useRef(null);
  const lastY      = useRef(0);
  const heroSectionRef = useRef(null); // ref to <section class="hero">
  const heroIframeRef  = useRef(null); // ref to hero <iframe>

  // Persist custom tags to localStorage
  useEffect(()=>{
    try{localStorage.setItem("wl-custom-tags", JSON.stringify(customTags));}catch{}
  },[customTags]);

  // Listen for tag updates from extension + listen for extension link additions
  useEffect(()=>{
    // StorageEvent: extension pushed tags via content.js
    const onStorage = (e) => {
      if(e.key === "wl-custom-tags" && e.newValue){
        try{
          const incoming = JSON.parse(e.newValue);
          if(Array.isArray(incoming)) setCustomTags(incoming);
        }catch{}
      }
    };
    window.addEventListener("storage", onStorage);

    // BroadcastChannel: receive all sync events from extension
    let bc;
    try {
      bc = new BroadcastChannel("watchlist-sync");
      bc.onmessage = (e) => {
        const {type} = e.data || {};
        if(type === "EXT_LINK_ADDED") {
          // Extension saved a new link — refresh links list
          freshLinks && freshLinks();
        }
        if(type === "CATS_UPDATED" && Array.isArray(e.data.cats)) {
          setCats(e.data.cats);
        }
      };
    } catch{}

    return () => {
      window.removeEventListener("storage", onStorage);
      try { bc?.close(); } catch{}
    };
  }, []);

  // Load data — from backend if JWT available, else localStorage
  useEffect(()=>{
    let cancelled = false;
    (async()=>{
      const jwt = user?.jwtToken || null;

      // Try backend first when JWT exists (keeps extension + app in sync)
      if (jwt && API_URL) {
        try {
          const [backCats, backLinks] = await Promise.all([
            apiFetch("/api/categories", {}, jwt),
            apiFetch("/api/links",      {}, jwt),
          ]);
          if (!cancelled) {
            if (Array.isArray(backCats))  { setCats(backCats);  await wlStorage.set(`wl2-cats-${userKey}`, JSON.stringify(backCats)); }
            if (Array.isArray(backLinks)) { setLinks(backLinks); await wlStorage.set(`wl2-links-${userKey}`, JSON.stringify(backLinks)); }
            setLoading(false);
          }
          return;
        } catch(e) {
          console.warn("Backend load failed, falling back to localStorage:", e);
        }
      }

      // Fallback: localStorage
      try {
        const rc = await wlStorage.get(`wl2-cats-${userKey}`);
        const rl = await wlStorage.get(`wl2-links-${userKey}`);
        const lc = await wlStorage.get(`wl2-lastcat-${userKey}`);
        const savedCats  = rc?.value ? JSON.parse(rc.value)  : null;
        const savedLinks = rl?.value ? JSON.parse(rl.value) : null;
        if (savedCats  && Array.isArray(savedCats))  setCats(savedCats);
        else setCats([]);
        if (savedLinks && Array.isArray(savedLinks)) setLinks(savedLinks);
        else setLinks([]);
        if (lc?.value) lastCatRef.current = lc.value;
        if (!savedCats || !savedLinks) {
          try {
            await wlStorage.set(`wl2-cats-${userKey}`,  JSON.stringify([]));
            await wlStorage.set(`wl2-links-${userKey}`, JSON.stringify([]));
          } catch{}
        }
      } catch(e) {
        console.warn("WatchList storage error:", e);
        setCats([]);
        setLinks([]);
      }
      if (!cancelled) setLoading(false);
    })();
    const _t = setTimeout(() => { if(!cancelled) setLoading(false); }, 4000);
    return () => { cancelled = true; clearTimeout(_t); };
  },[userKey]);

  const saveCats = useCallback(async v=>{
    setCats(v);
    // Write sync key so content.js picks it up and pushes to extension
    try { localStorage.setItem("wl-cats-sync", JSON.stringify(v)); } catch{}
    try { await wlStorage.set(`wl2-cats-${userKey}`,JSON.stringify(v)); } catch{}
    onStatsChange?.({ cats: v, links });
    // Sync to backend in background (best effort)
    // Note: batch update handled by individual CRUD ops; this is just local cache sync
  },[userKey, links, onStatsChange]);

  const saveLinks = useCallback(async (v, deletedIds=[])=>{
    setLinks(v);
    // Broadcast to extension immediately
    try { new BroadcastChannel("watchlist-sync").postMessage({type:"LINKS_UPDATED",links:v}); }catch{}
    try {
      await wlStorage.set(`wl2-links-${userKey}`,JSON.stringify(v));
      // Sync deletions to backend so they don't come back on next load
      const jwt = user?.jwtToken;
      if (jwt && API_URL && deletedIds.length > 0) {
        for (const id of deletedIds) {
          apiFetch(`/api/links/${id}`, { method:"DELETE" }, jwt).catch(()=>{});
        }
      }
      saveCount.current += 1;
      if (saveCount.current % 10 === 0) {
        await wlStorage.set(`wl2-backup-${userKey}`, JSON.stringify({
          categories: cats, links: v, exportedAt: new Date().toISOString(), autoBackup: true
        }));
      }
    } catch{}
    onStatsChange?.({ cats, links: v });
  },[userKey, cats, onStatsChange]);

  // Header scroll
  useEffect(()=>{
    const fn=()=>{ const y=window.scrollY; setHeaderUp(y<60||y<lastY.current); lastY.current=y; };
    window.addEventListener("scroll",fn,{passive:true});
    return()=>window.removeEventListener("scroll",fn);
  },[]);

  const notify = (msg,color="#22c55e") => { setNotif({msg,color}); setTimeout(()=>setNotif(null),3000); };

  const toggleWatched = useCallback(id=>{
    const l = links.find(l=>l.id===id);
    saveLinks(links.map(l=>l.id===id?{...l,watched:!l.watched}:l));
    setPopup(p=>p&&p.link.id===id?{...p,link:{...p.link,watched:!p.link.watched}}:p);
    notify(l?.watched?"↩ Desmarcado como assistido":"✓ Marcado como assistido!");
  },[links,saveLinks]);

  const deleteLink = useCallback(id=>{
    const link = links.find(l=>l.id===id);
    if (!link) return;
    saveLinks(links.filter(l=>l.id!==id));
    setPopup(null);
    // Undo stack
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (undoProgInterval.current) clearInterval(undoProgInterval.current);
    setUndoStack({ link, msg: `"${link.title.slice(0,32)}${link.title.length>32?"...":""}" removido` });
    setUndoProgress(100);
    const START = Date.now(); const DURATION = 5000;
    undoProgInterval.current = setInterval(()=>{
      const elapsed = Date.now()-START;
      setUndoProgress(Math.max(0, 100 - (elapsed/DURATION)*100));
    }, 50);
    undoTimer.current = setTimeout(()=>{
      setUndoStack(null); setUndoProgress(100);
      clearInterval(undoProgInterval.current);
    }, DURATION);
  },[links,saveLinks]);

  const handleUndo = useCallback(()=>{
    if (!undoStack) return;
    clearTimeout(undoTimer.current);
    clearInterval(undoProgInterval.current);
    saveLinks([undoStack.link, ...links]);
    setUndoStack(null); setUndoProgress(100);
    notify("↩ Restaurado com sucesso!");
  },[undoStack,links,saveLinks]);

  const saveEdit = useCallback(updated=>{
    saveLinks(links.map(l=>l.id===updated.id?updated:l));
    setEditLink(null);
    notify("✓ Item atualizado!");
  },[links,saveLinks]);

  const reorderLinks = useCallback((catId, dragId, targetId)=>{
    const catLinks = links.filter(l=>l.categoryId===catId).sort((a,b)=>(a.order||0)-(b.order||0));
    const dragIdx  = catLinks.findIndex(l=>l.id===dragId);
    const targetIdx= catLinks.findIndex(l=>l.id===targetId);
    if (dragIdx<0||targetIdx<0) return;
    const reordered = [...catLinks];
    const [moved] = reordered.splice(dragIdx,1);
    reordered.splice(targetIdx,0,moved);
    const updatedOrders = reordered.reduce((acc,l,i)=>({...acc,[l.id]:i}),{});
    saveLinks(links.map(l=>updatedOrders[l.id]!==undefined?{...l,order:updatedOrders[l.id]}:l));
  },[links,saveLinks]);

  const addLink = useCallback(async (data, newCats=[])=>{
    const allCats = newCats.length>0 ? [...cats,...newCats] : cats;
    if (newCats.length>0) saveCats(allCats);
    const link = { id:uid(), ...data, thumbnail:"", watched:false, notes:"", tags:[], order:0, createdAt:new Date().toISOString() };
    saveLinks([link,...links]);
    // Fix #3: store the EXACT categoryId (may be a subcategory ID)
    const savedCatId = data.categoryId;
    lastCatRef.current = savedCatId;
    try { await wlStorage.set(`wl2-lastcat-${userKey}`, savedCatId); } catch{}
    setShowAdd(false);
    // Show category name in confirmation toast
    const catName = allCats.find(c=>c.id===savedCatId)?.name || "";
    const parentCat = allCats.find(c=>c.id===allCats.find(x=>x.id===savedCatId)?.parentId);
    const catDisplay = parentCat ? `${parentCat.name} › ${catName}` : catName;
    notify(`✓ Adicionado em ${catDisplay || "sua lista"}!`);
  },[cats,links,saveCats,saveLinks,userKey]);

  // Wire refs so SettingsPage can call these
  useEffect(()=>{
    if (exportRef) exportRef.current = exportJSON;
    if (importRef) importRef.current = importJSON;
  });

  // Export/Import
  const exportJSON = () => {
    const data = JSON.stringify({version:"2.0",categories:cats,links,exportedAt:new Date().toISOString()},null,2);
    const a=document.createElement("a");a.href="data:application/json;charset=utf-8,"+encodeURIComponent(data);a.download="watchlist-backup.json";document.body.appendChild(a);a.click();document.body.removeChild(a);
    notify("📦 Backup exportado!");
  };
  const importJSON = (e) => {
    const f=e.target.files[0]; if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{ try { const d=JSON.parse(ev.target.result); if (!d.links) throw new Error(); setImportData(d); } catch{ notify("❌ Arquivo JSON inválido"); } };
    r.readAsText(f);
    e.target.value=""; // reset input
  };
  const confirmImport = (newCats, newLinks, mode) => {
    if (mode==="replace") { saveCats(newCats); saveLinks(newLinks); }
    else {
      const existIds = new Set(links.map(l=>l.id));
      const merged = [...links, ...newLinks.filter(l=>!existIds.has(l.id))];
      const existCatIds = new Set(cats.map(c=>c.id));
      const mergedCats = [...cats, ...newCats.filter(c=>!existCatIds.has(c.id))];
      saveCats(mergedCats); saveLinks(merged);
    }
    setImportData(null);
    notify("📥 Dados importados com sucesso!");
  };

  // Popup handlers
  const showPopup  = useCallback((link,rect,catIdx)=>{ clearTimeout(hideTimer.current); setPopup({link,rect,catIdx}); },[]);
  const startHide  = useCallback(()=>{ hideTimer.current=setTimeout(()=>setPopup(null),200); },[]);
  const cancelHide = useCallback(()=>clearTimeout(hideTimer.current),[]);

  // Filter links — includes advanced search filters
  const shown = useMemo(()=>{
    let ls = links;
    if (filter==="unwatched") ls=ls.filter(l=>!l.watched);
    else if (filter==="watched") ls=ls.filter(l=>l.watched);
    if (search) ls=ls.filter(l=>
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.url.toLowerCase().includes(search.toLowerCase()) ||
      (l.notes||"").toLowerCase().includes(search.toLowerCase())
    );
    if (filterPlatform!=="all") ls=ls.filter(l=>l.platform===filterPlatform);
    if (filterDate==="week") ls=ls.filter(l=>Date.now()-new Date(l.createdAt)<7*864e5);
    else if (filterDate==="month") ls=ls.filter(l=>Date.now()-new Date(l.createdAt)<30*864e5);
    if (filterTags.length>0) ls=ls.filter(l=>(l.tags||[]).some(t=>filterTags.includes(t)));
    return ls;
  },[links,filter,search,filterPlatform,filterDate,filterTags]);

  // Group by category (top-level first, then subs)
  const rowData = useMemo(() => {
    if (currentCatId === null) {
      // ROOT: top-level categories, each row shows subfolders + direct links
      const roots = cats.filter(c => !c.parentId).sort((a,b) => a.order-b.order);
      const rows = roots.map((cat, ci) => {
        const subCats = cats.filter(c => c.parentId === cat.id).sort((a,b) => a.order-b.order);
        const catLinks = shown.filter(l => l.categoryId === cat.id);
        if (subCats.length === 0 && catLinks.length === 0 && search) return null;
        return { cat, subCats, links: catLinks, catIdx: ci };
      }).filter(Boolean);
      // Orphaned links (categoryId not matching any existing category)
      const catIds = new Set(cats.map(c => c.id));
      const orphaned = shown.filter(l => !catIds.has(l.categoryId));
      if (orphaned.length > 0) {
        rows.push({ cat: { id:"__orphaned__", name:"⚠ Sem Categoria", parentId:null, order:9999 }, subCats:[], links:orphaned, catIdx:rows.length, isOrphaned:true });
      }
      return rows;
    } else {
      // INSIDE A FOLDER: show its subfolders as rows + direct links row
      const parentCat = cats.find(c => c.id === currentCatId);
      if (!parentCat) return [];
      const subCats = cats.filter(c => c.parentId === currentCatId).sort((a,b) => a.order-b.order);
      const directLinks = shown.filter(l => l.categoryId === currentCatId);
      const result = [];
      // Direct links row (if any)
      if (directLinks.length > 0) {
        result.push({ cat: parentCat, subCats: [], links: directLinks, catIdx: 0, isDirect: true });
      }
      // Sub-folder rows
      subCats.forEach((sc, si) => {
        const subSubs = cats.filter(c => c.parentId === sc.id).sort((a,b) => a.order-b.order);
        const subLinks = shown.filter(l => l.categoryId === sc.id);
        result.push({ cat: sc, subCats: subSubs, links: subLinks, catIdx: si + 1 });
      });
      // Empty state row if nothing
      if (result.length === 0) {
        result.push({ cat: parentCat, subCats: [], links: [], catIdx: 0 });
      }
      return result;
    }
  }, [cats, shown, currentCatId, search]);

  // ── Hero pool: only links with VALID category (not orphaned) ──────────────
  const heroPool = useMemo(() => {
    const catIds = new Set(cats.map(c => c.id));
    // Only links whose category actually exists in our cats list
    const validLinks = links.filter(l => catIds.has(l.categoryId));
    if (validLinks.length === 0) return []; // no valid links = no hero
    const unwatched = [...validLinks]
      .filter(l => !l.watched)
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
    if (unwatched.length > 0) return unwatched;
    return [...validLinks]
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
  }, [links, cats]);

  const [heroIdx,        setHeroIdx]        = useState(0);
  const [heroMuted,      setHeroMuted]      = useState(true);
  const [heroVideoOn,    setHeroVideoOn]    = useState(false);
  const [heroVideoKey,   setHeroVideoKey]   = useState(0);
  const [heroProgress,   setHeroProgress]   = useState(0); // 0-100 for progress bar
  const heroTimerRef = useRef(null);
  const heroProgRef  = useRef(null);

  // Only show hero when fully loaded and there are valid displayable links
  const hero        = (!loading && heroPool.length > 0) ? (heroPool[heroIdx % heroPool.length] || null) : null;
  const heroThumb   = hero?.videoId ? ytThumb(hero.videoId,"maxresdefault") : thumbUrl(hero?.rawThumb||"");
  const heroCatName = hero ? cats.find(c=>c.id===hero.categoryId)?.name||"" : "";
  const heroPlat    = hero ? (PLAT[hero.platform]||PLAT.other) : null;

  const switchHero = useCallback((idx, startVideo=true) => {
    setHeroIdx(idx);
    setHeroVideoOn(false);
    setHeroVideoKey(k=>k+1);
    setHeroProgress(0);
    if (startVideo) setTimeout(() => setHeroVideoOn(true), 2200);
  }, []);

  // Auto-rotate every 8s
  useEffect(() => {
    if (heroPool.length <= 1 || loading) return;
    const DURATION = 8000;
    setHeroProgress(0);
    const startTime = Date.now();
    heroProgRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setHeroProgress(Math.min((elapsed / DURATION) * 100, 100));
    }, 80);
    heroTimerRef.current = setTimeout(() => {
      setHeroIdx(i => (i + 1) % heroPool.length);
      setHeroVideoOn(false); setHeroVideoKey(k=>k+1); setHeroProgress(0);
      setTimeout(() => setHeroVideoOn(true), 2200);
    }, DURATION);
    return () => { clearTimeout(heroTimerRef.current); clearInterval(heroProgRef.current); };
  }, [heroIdx, heroPool.length, loading]);

  // Start video after 2s on page load (if YouTube)
  useEffect(() => {
    if (!hero?.videoId || loading) return;
    const t = setTimeout(() => setHeroVideoOn(true), 2200);
    return () => clearTimeout(t);
  }, [hero?.id, loading]);

  const heroEmbedSrc = hero?.videoId
    ? `https://www.youtube-nocookie.com/embed/${hero.videoId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`
    : null;

  // IntersectionObserver — pause hero when scrolled out of view
  useEffect(() => {
    const section = heroSectionRef.current;
    if (!section) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        // Hero left viewport → stop video
        setHeroVideoOn(false);
        setHeroVideoKey(k => k + 1);
      } else if (hero?.videoId && !loading) {
        // Hero returned to viewport → restart after short delay
        const t = setTimeout(() => setHeroVideoOn(true), 1500);
        return () => clearTimeout(t);
      }
    }, { threshold: 0.25 });
    obs.observe(section);
    return () => obs.disconnect();
  }, [hero?.id, loading]);

  // Hero mute via postMessage — no src change, no restart
  const toggleHeroMute = () => {
    const iframe = heroIframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: "command",
        func: heroMuted ? "unMute" : "mute",
        args: []
      }), "*");
    }
    setHeroMuted(m => !m);
  };

  // Stats
  const total  = links.length;
  const wCount = links.filter(l=>l.watched).length;
  const pct    = total>0 ? Math.round((wCount/total)*100) : 0;
  const week   = links.filter(l=>Date.now()-new Date(l.createdAt)<7*864e5).length;

  return (
    <>
      <style>{CSS}</style>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <div className="wl">

        {/* HEADER */}
        <header className={`hdr ${headerUp?"up":"dn"}`}>
          <div className="logo" onClick={()=>window.location.reload()} style={{cursor:"pointer"}}>Watch<em>List</em></div>
          <nav className="nav">
            {[["all","Início"],["unwatched","Para Assistir"],["watched","Assistidos"]].map(([f,l])=>(
              <button key={f} className={`nav-btn${filter===f?" on":""}`} onClick={()=>setFilter(f)}>{l}</button>
            ))}
            <button className={`nav-btn${appPage==="notes"?" on":""}`} onClick={()=>setAppPage("notes")}>📝 Notas</button>
            <button className="nav-btn" onClick={()=>setShowOrganizar(true)}>⊞ Organizar</button>
          </nav>
          <div className="hdr-r">
            {/* Desktop: search + filters + add + user */}
            <div className="srch-wrap">
              <input className="srch-inp" placeholder="Buscar título, URL, notas..." value={search} onChange={e=>setSearch(e.target.value)}/>
              <span className="srch-ico"><Search size={14}/></span>
            </div>
            <button
              className={`filter-chip${showAdvSearch?" on":""}`}
              style={{border:"1.5px solid",fontSize:12,padding:"7px 14px",borderRadius:6,cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:600}}
              onClick={()=>setShowAdvSearch(s=>!s)}
              title="Filtros avançados"
            >⚙ Filtros{(filterPlatform!=="all"||filterDate!=="all"||filterTags.length>0)?` (${[filterPlatform!=="all"?1:0,filterDate!=="all"?1:0,filterTags.length].reduce((a,b)=>a+b,0)})`:""}</button>
            <button className="btn-primary" onClick={()=>setShowAdd(true)}><Plus size={14}/> Adicionar</button>
            <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:4,paddingLeft:12,borderLeft:"1px solid #1a1a1a"}}>
              {user?.avatar
                ? <img src={user.avatar} alt="" style={{width:30,height:30,borderRadius:"50%",objectFit:"cover"}}/>
                : <div style={{width:30,height:30,borderRadius:"50%",background:"#e50914",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff"}}>{(user?.name||"U")[0].toUpperCase()}</div>
              }
              <button className="nav-btn" style={{padding:"6px 10px",fontSize:13}} onClick={onSettings} title="Configurações">⚙</button>
              <button className="nav-btn" style={{padding:"6px 10px",fontSize:13,color:"#555"}} onClick={onLogout} title="Sair">⏻</button>
            </div>
            {/* Mobile: search icon + menu */}
            <button className="hdr-menu-btn" onClick={()=>setShowMobileSearch(true)} title="Buscar">
              <Search size={18}/>
            </button>
          </div>
        </header>

        {/* ADVANCED SEARCH PANEL */}
        {showAdvSearch && (
          <div className="advsearch" style={{marginTop:64}}>
            <span className="filter-label">Plataforma:</span>
            {["all","youtube","tiktok","instagram","twitter","twitch"].map(p=>(
              <button key={p} className={`filter-chip${filterPlatform===p?" on":""}`} onClick={()=>setFilterPlatform(p)}>
                {p==="all"?"Todas":(PLAT[p]?.label||p)}
              </button>
            ))}
            <div className="filter-sep"/>
            <span className="filter-label">Período:</span>
            {[["all","Tudo"],["week","Semana"],["month","Mês"]].map(([v,l])=>(
              <button key={v} className={`filter-chip${filterDate===v?" on":""}`} onClick={()=>setFilterDate(v)}>{l}</button>
            ))}
            <div className="filter-sep"/>
            <span className="filter-label">Tags:</span>
            {PRESET_TAGS.map(pt=>(
              <button key={pt.label} className={`filter-chip${filterTags.includes(pt.label)?" on":""}`}
                onClick={()=>setFilterTags(prev=>prev.includes(pt.label)?prev.filter(t=>t!==pt.label):[...prev,pt.label])}
                style={filterTags.includes(pt.label)?{borderColor:pt.color,color:pt.color,background:pt.color+"18"}:{}}
              >{pt.label}</button>
            ))}
            {(filterPlatform!=="all"||filterDate!=="all"||filterTags.length>0) && (
              <button className="filter-chip" style={{color:"#f87171",borderColor:"rgba(248,113,113,.3)"}}
                onClick={()=>{setFilterPlatform("all");setFilterDate("all");setFilterTags([]);}}>
                ✕ Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* ── NOTES PAGE ── */}
        {appPage === "notes" && (
          <NotesPage
            notes={notes} links={links} cats={cats}
            selectedNoteId={selectedNoteId} setSelectedNoteId={setSelectedNoteId}
            filter={noteFilter} setFilter={setNoteFilter}
            search={noteSearch} setSearch={setNoteSearch}
            jwt={user?.jwtToken} onRefresh={freshNotes}
          />
        )}

        {/* HERO (hidden when notes page open) */}
        {appPage !== "notes" && <div style={{display:"contents"}}>
        {/* HERO */}
        {loading ? (
          <div className="skel-hero"/>
        ) : hero ? (
          <section className="hero" ref={heroSectionRef}>
            {/* Thumbnail background — fades when video starts */}
            {heroThumb && (
              <div className="hero-bg" style={{backgroundImage:`url(${heroThumb})`, opacity:heroVideoOn?0:1}}/>
            )}
            {!heroThumb && (
              <div style={{position:"absolute",inset:0,background:catGrad(rowData.find(r=>r.links.some(l=>l.id===hero.id))?.catIdx||0)}}/>
            )}

            {/* YouTube video background */}
            {hero.videoId && (
              <div className="hero-video-wrap">
                <iframe
                  ref={heroIframeRef}
                  key={heroVideoKey}
                  className={`hero-iframe${heroVideoOn?" vis":""}`}
                  src={heroVideoOn ? heroEmbedSrc : ""}
                  allow="autoplay; encrypted-media"
                  allowFullScreen={false}
                  frameBorder="0"
                />
              </div>
            )}

            <div className="hero-grd-l"/><div className="hero-grd-b"/>

            <div className="hero-body">
              <div className="hero-tags">
                {heroPlat && <span className="hero-plat-badge" style={{background:heroPlat.bg,color:heroPlat.color}}>{heroPlat.label}</span>}
                {!hero.watched && <span className="hero-new-badge"><Sparkles size={10}/>Novo</span>}
                {heroCatName && <span className="hero-cat-badge">{heroCatName}</span>}
              </div>
              <h1 className="hero-title">{hero.title}</h1>
              <div className="hero-acts">
                <a href={hero.url} target="_blank" rel="noopener noreferrer" className="btn-hero-p">
                  <Play size={18} fill="white" color="white"/> Assistir Agora
                </a>
                <button className={`btn-hero-o${hero.watched?" done":""}`} onClick={()=>toggleWatched(hero.id)}>
                  {hero.watched ? <><Check size={16}/>Assistido</> : <><Eye size={16}/>Já Assistido</>}
                </button>
                {hero.videoId && (
                  <>
                    <button className="btn-hero-o" style={{padding:"13px 20px"}} onClick={()=>setCinemaLink(hero)} title="Modo Cinema">🎬 Cinema</button>
                    <button className="hero-mute-btn" onClick={toggleHeroMute} title={heroMuted?"Ativar som":"Silenciar"}>
                      {heroMuted ? <VolumeX size={16}/> : <Volume2 size={16}/>}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Rotation dots */}
            {heroPool.length > 1 && (
              <div className="hero-dots">
                {heroPool.map((_, i) => (
                  <button key={i} className={`hero-dot${i===heroIdx%heroPool.length?" on":""}`} onClick={()=>switchHero(i)}/>
                ))}
              </div>
            )}

            {/* Progress bar (advances with rotation timer) */}
            {heroPool.length > 1 && (
              <div className="hero-timer" style={{width:`${heroProgress}%`}}/>
            )}
          </section>
        ) : (
          <div className="hero-empty">
            <div className="hero-empty-inner">
              <div className="hero-empty-ico">📺</div>
              <div className="hero-empty-t">
                {links.length > 0 && heroPool.length === 0
                  ? "Organize seus itens em categorias"
                  : "Sua WatchList está vazia"}
              </div>
              <div className="hero-empty-s">
                {links.length > 0 && heroPool.length === 0
                  ? "Você tem itens salvos mas sem categoria válida. Veja a seção ⚠ Sem Categoria abaixo para organizá-los ou excluí-los."
                  : "Salve vídeos do YouTube, TikTok, Instagram e qualquer URL para assistir depois."}
              </div>
              {(links.length === 0 || heroPool.length > 0) && (
                <button className="btn-primary" style={{padding:"12px 28px",fontSize:15,marginTop:4}} onClick={()=>setShowAdd(true)}>
                  <Plus size={15}/>Adicionar primeiro vídeo
                </button>
              )}
            </div>
          </div>
        )}

        {/* ROWS */}
        <div className="rows">
          {/* Breadcrumbs — only when inside a folder */}
          {currentCatId && (
            <Breadcrumbs catId={currentCatId} cats={cats} onNavigate={setCurrentCatId}/>
          )}

          {/* If links exist but nothing visible in rows, show a direct all-items view */}
          {!loading && links.length > 0 && rowData.filter(r=>!r.isOrphaned).length === 0 && !currentCatId && (
            <div style={{padding:"16px 48px 0",display:"flex",alignItems:"center",gap:12}}>
              <div style={{background:"rgba(245,166,35,.1)",border:"1px solid rgba(245,166,35,.3)",borderRadius:8,padding:"10px 16px",display:"flex",alignItems:"center",gap:10,color:"#f5a623",fontSize:13}}>
                <span>⚠</span>
                <span><strong>{links.length} item{links.length!==1?"s":""}</strong> salvo{links.length!==1?"s":""} sem categoria válida.</span>
                <button onClick={()=>setShowAdd(true)} style={{background:"rgba(245,166,35,.2)",border:"1px solid rgba(245,166,35,.4)",color:"#f5a623",cursor:"pointer",padding:"4px 12px",borderRadius:5,fontSize:11,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>Adicionar categoria</button>
              </div>
            </div>
          )}
          {!loading && links.length > 0 && rowData.filter(r=>!r.isOrphaned).length === 0 && !currentCatId && (
            <div className="row-sec" style={{padding:"8px 0 24px"}}>
              <div className="row-hdr" style={{padding:"0 48px 8px"}}>
                <div className="row-hdr-l">
                  <div className="row-title" style={{color:"#f5a623"}}>Todos os itens</div>
                  <span style={{fontSize:11,color:"#666",marginLeft:8}}>{links.length} sem categoria</span>
                </div>
              </div>
              <div className="row-scroll-outer row-scroll-wrap" style={{padding:"0 48px"}}>
                <div className="row-scroll">
                  {links.map((link,i)=>(
                    <Card key={link.id} link={link} catIdx={i%6}
                      onToggle={lnk=>saveLinks(links.map(l=>l.id===lnk?{...l,watched:!l.watched}:l))}
                      onDelete={id=>saveLinks(links.filter(l=>l.id!==id),[id])}
                      onEdit={lnk=>setEditLink(lnk)}
                      onCinema={lnk=>setCinemaLink(lnk)}
                      onPreviewShow={()=>{}} onPreviewHide={()=>{}}
                      onDragStart={()=>{}} onDragOver={()=>{}} onDrop={()=>{}} onDragEnd={()=>{}}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          {loading ? ([0,1,2].map(i=>(
            <div key={i} className="row-sec">
              <div className="row-hdr"><div className="skel" style={{width:200,height:24}}/></div>
              <div className="row-prog-wrap"><div className="row-prog"/></div>
              <div style={{display:"flex",gap:12,padding:"4px 48px 12px"}}>
                {[0,1,2,3].map(j=><div key={j} className="skel" style={{flex:"0 0 280px",height:157}}/>)}
              </div>
            </div>
          ))) : rowData.length>0 ? rowData.map(({cat,subCats,links:ls,catIdx,isOrphaned})=>(
            <Row key={cat.id} cat={cat} subCats={subCats||[]} links={ls} catIdx={catIdx}
              isOrphaned={!!isOrphaned}
              allCats={cats} allLinks={links}
              onToggle={toggleWatched} onDelete={deleteLink} onEdit={setEditLink}
              onPreviewShow={showPopup} onPreviewHide={startHide}
              onNavigate={setCurrentCatId}
              onCinema={setCinemaLink}
              onReorderLinks={reorderLinks}
            />
          )) : links.length === 0 ? null /* hero handles the true empty state */ : (
            <div style={{padding:"72px 48px",textAlign:"center",fontFamily:"'Inter',sans-serif"}}>
              <div style={{fontSize:52,marginBottom:20,opacity:.35}}>
                {search ? "🔍" : filter==="watched" ? "✅" : "📺"}
              </div>
              <div style={{fontSize:20,fontWeight:800,color:"#fff",letterSpacing:"-.4px",marginBottom:10}}>
                {search
                  ? `Sem resultados para "${search}"`
                  : filter==="watched"
                    ? "Nenhum vídeo marcado como assistido"
                    : filter==="unwatched"
                      ? "Todos os vídeos foram assistidos 🎉"
                      : "Nenhum item nesta categoria"}
              </div>
              <div style={{fontSize:14,color:"#555",lineHeight:1.7,maxWidth:380,margin:"0 auto 28px"}}>
                {search
                  ? "Tente buscar por outro título, URL ou nota."
                  : filter==="watched"
                    ? "Marque vídeos como assistidos para vê-los aqui."
                    : "Adicione conteúdos ou mude o filtro."}
              </div>
              {!search && (
                <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
                  <button className="btn-primary" style={{padding:"12px 28px"}} onClick={()=>setShowAdd(true)}>
                    <Plus size={14}/> Adicionar
                  </button>
                </div>
              )}
              {search && (
                <button onClick={()=>setSearch("")} style={{
                  background:"rgba(255,255,255,.06)",border:"1px solid #1a1a1a",color:"#a0a0a0",
                  padding:"10px 24px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600,
                  fontFamily:"'Inter',sans-serif",transition:"all .2s"
                }}>
                  ✕ Limpar busca
                </button>
              )}
            </div>
          )}

          {/* STATS */}
          {total>0 && (
            <div className="stats">
              <div className="stats-h"><BarChart2 size={14} style={{display:"inline",marginRight:8}}/>Estatísticas</div>
              <div className="stats-g">
                <div className="stat"><div className="stat-val" style={{color:"#e50914"}}>{total}</div><div className="stat-lbl">Total salvo</div><div className="stat-sub">{total-wCount} para assistir</div></div>
                <div className="stat"><div className="stat-val" style={{color:"#22c55e"}}>{wCount}</div><div className="stat-lbl">Assistidos</div><div className="stat-sub">de {total} no total</div></div>
                <div className="stat"><div className="stat-val" style={{color:"#f5a623"}}>{pct}%</div><div className="stat-lbl">Concluído</div><div className="stat-bar"><div className="stat-bar-f" style={{width:`${pct}%`}}/></div></div>
                <div className="stat"><div className="stat-val" style={{color:"#3b82f6"}}>{week}</div><div className="stat-lbl">Esta semana</div><div className="stat-sub">adicionados</div></div>
              </div>
              {/* Export/Import */}
              <div className="export-row" style={{marginTop:20}}>
                <button className="btn-export" onClick={exportJSON}><Download size={14}/>Exportar JSON</button>
                <label className="btn-export" style={{cursor:"pointer"}}>
                  <Upload size={14}/>Importar JSON
                  <input type="file" accept=".json" style={{display:"none"}} onChange={importJSON} key={importData?"busy":"ready"}/>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* POPUP */}
        {popup && <Popup link={popup.link} rect={popup.rect} catIdx={popup.catIdx} onToggle={toggleWatched} onDelete={deleteLink} onEnter={cancelHide} onLeave={startHide}/>}

        {/* ADD MODAL */}
        {showAdd && <AddModal categories={cats} lastCatId={lastCatRef.current} onSave={addLink} onClose={()=>setShowAdd(false)}/>}

        {/* CINEMA MODAL */}
        {cinemaLink && <CinemaModal link={cinemaLink} onClose={()=>setCinemaLink(null)}/>}

        {/* IMPORT PREVIEW */}
        {importData && <ImportPreviewModal data={importData} onConfirm={confirmImport} onClose={()=>setImportData(null)}/>}

        {/* EDIT MODAL */}
        {editLink && <EditModal link={editLink} categories={cats} onSave={saveEdit} onClose={()=>setEditLink(null)}/>}

        </div> /* end non-notes content */}

        {/* ORGANIZAR MODAL — dual-pane Categorias + Tags */}
        {showOrganizar && (
          <OrganizarModal
            cats={cats} customTags={customTags}
            onClose={()=>setShowOrganizar(false)}
            onDeleteCat={async(id)=>{
              const jwt = user?.jwtToken;
              // Iterative BFS to collect all descendants (avoids stack overflow on circular refs)
              const toRemove = new Set([id]);
              const queue = [id];
              while (queue.length > 0) {
                const pid = queue.shift();
                cats.forEach(c => {
                  if (c.parentId === pid && !toRemove.has(c.id)) {
                    toRemove.add(c.id);
                    queue.push(c.id);
                  }
                });
              }
              // Optimistic UI update
              saveCats(cats.filter(c => !toRemove.has(c.id)));
              // Single DELETE — backend handles cascade
              try {
                const res = await fetch(`${API_URL}/api/categories/${id}`, {
                  method: "DELETE",
                  headers: jwt ? { Authorization: `Bearer ${jwt}` } : {}
                });
                const body = await res.json().catch(() => ({}));
                console.log("[WL Delete]", res.status, JSON.stringify(body));
                if (!res.ok || body.deleted === 0) {
                  console.error("[WL Delete] FAILED — status:", res.status, "body:", body);
                  // Show visible error so user knows
                  const errMsg = `Erro ao deletar (${res.status}). Motivo: ${JSON.stringify(body)}`;
                  alert(errMsg);
                  // Rollback
                  const fresh = await apiFetch("/api/categories", {}, jwt).catch(() => null);
                  if (fresh) saveCats(fresh);
                  return;
                }
                console.log("[WL Delete] SUCCESS — deleted:", body.deleted);
                try { new BroadcastChannel("watchlist-sync").postMessage({type:"CATS_UPDATED", cats: cats.filter(c=>!toRemove.has(c.id))}); }catch{}
              } catch(e) { console.error("Delete network error:", e); }
            }}
            onCreateCat={async(name,parentId)=>{
              try{
                const res=await apiFetch("/api/categories",{method:"POST",body:JSON.stringify({name,parentId:parentId||null,order:cats.filter(c=>!c.parentId).length})},user?.jwtToken);
                const fresh=await apiFetch("/api/categories",{},user?.jwtToken);
                const newCats = Array.isArray(fresh)?fresh:[...cats,{id:res.catId,name,parentId:parentId||null,order:0}];
                saveCats(newCats);
                try{ new BroadcastChannel("watchlist-sync").postMessage({type:"CATS_UPDATED",cats:newCats}); }catch{}
              }catch(e){ console.error("Create cat error:",e); }
            }}
            onCreateTag={(tag)=>setCustomTags(prev=>[...prev,tag])}
            onDeleteTag={(id)=>setCustomTags(prev=>prev.filter(t=>t.id!==id&&t.label!==id))}
          />
        )}

        

        {/* MOBILE SEARCH OVERLAY */}
        {showMobileSearch && (
          <div className="mobile-search-overlay">
            <div className="mobile-search-header">
              <input
                className="mobile-search-input"
                placeholder="Buscar vídeos, URLs, notas..."
                value={search}
                onChange={e=>setSearch(e.target.value)}
                autoFocus
              />
              <button className="mobile-search-cancel" onClick={()=>setShowMobileSearch(false)}>
                Cancelar
              </button>
            </div>
            {/* Filter chips */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {["all","youtube","tiktok","instagram","twitter"].map(p=>(
                <button key={p} className={`filter-chip${filterPlatform===p?" on":""}`}
                  onClick={()=>setFilterPlatform(p)}>
                  {p==="all"?"Todas":(PLAT[p]?.label||p)}
                </button>
              ))}
            </div>
            {search && (
              <div style={{marginTop:20,color:"#555",fontSize:13,fontFamily:"'Inter',sans-serif",textAlign:"center"}}>
                Mostrando resultados para <strong style={{color:"#fff"}}>"{search}"</strong>
              </div>
            )}
          </div>
        )}


        {/* BOTTOM NAV — mobile only */}

        <BottomNav
          activePage={filter==="unwatched"?"watch":filter==="watched"?"watched":"home"}
          onHome={()=>{ setFilter("all"); setSearch(""); }}
          onSearch={()=>{ setShowMobileSearch(true); }}
          onAdd={()=>{ setShowAdd(true); }}
          onCats={()=>setShowOrganizar(true)}
          onSettings={()=>{ onSettings(); }}
        />

        {/* CatModal removed — use Organizar */}

        {/* NOTIF */}
        {/* UNDO TOAST */}
        {undoStack && (
          <div className="undo-toast">
            <div className="undo-bar" style={{width:`${undoProgress}%`,transition:undoProgress<100?"width 50ms linear":"none"}}/>
            <span className="undo-msg">🗑 {undoStack.msg}</span>
            <button className="btn-undo" onClick={handleUndo}>↩ Desfazer</button>
            <button onClick={()=>{clearTimeout(undoTimer.current);clearInterval(undoProgInterval.current);setUndoStack(null);}} style={{background:"none",border:"none",color:"#555",cursor:"pointer",padding:"4px",lineHeight:1}}>✕</button>
          </div>
        )}

        {notif && <div className="notif" style={{borderLeftColor:notif.color,borderLeftWidth:3}}>{notif.msg}</div>}
      </div>
    </>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// LANDING · LOGIN · ONBOARDING · SETTINGS · APP ROUTER
// ─────────────────────────────────────────────────────────────────────────────

const LANDING_CSS = `
/* ── LANDING PAGE ────────────────────────────────────────────────────────── */
.land{background:#0a0a0a;min-height:100vh;color:#fff;font-family:'Inter',sans-serif;overflow-x:hidden;width:100%;}
.land-nav{position:fixed;top:0;left:0;right:0;z-index:100;height:64px;padding:0 clamp(16px,5vw,60px);display:flex;align-items:center;justify-content:space-between;background:rgba(10,10,10,.92);backdrop-filter:blur(20px);border-bottom:1px solid #1a1a1a;}
.land-logo{font-size:22px;font-weight:900;color:#e50914;letter-spacing:-.5px;font-family:'Inter',sans-serif;text-transform:uppercase;}
.land-logo em{color:#fff;font-style:normal;}
.land-nav-links{display:flex;gap:8px;}
.land-nav-link{background:none;border:none;color:#a0a0a0;font-size:14px;font-weight:500;cursor:pointer;padding:8px 16px;font-family:'Inter',sans-serif;transition:color .2s;border-radius:4px;}
.land-nav-link:hover{color:#fff;}
.land-cta-nav{background:#e50914;color:#fff;border:none;cursor:pointer;padding:10px 22px;border-radius:6px;font-size:14px;font-weight:700;font-family:'Inter',sans-serif;transition:all .2s;}
.land-cta-nav:hover{background:#f40612;transform:translateY(-1px);}

/* HERO */
.land-hero{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:clamp(72px,10vh,120px) clamp(16px,5vw,60px) clamp(40px,6vh,60px);position:relative;overflow:hidden;}
.land-hero-grd{position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 40%,rgba(229,9,20,.12) 0%,transparent 70%);}
.land-hero-inner{max-width:1100px;width:100%;display:grid;grid-template-columns:1fr;gap:40px;align-items:center;}
.land-hero-text{}
.land-eyebrow{display:inline-flex;align-items:center;gap:8px;background:rgba(229,9,20,.1);border:1px solid rgba(229,9,20,.25);color:#e50914;font-size:12px;font-weight:700;padding:5px 14px;border-radius:20px;margin-bottom:24px;text-transform:uppercase;letter-spacing:.8px;}
.land-h1{font-size:clamp(2rem,5vw,3.6rem);font-weight:900;line-height:1.05;letter-spacing:-2px;margin-bottom:20px;font-family:'Inter',sans-serif;}
.land-h1 em{color:#e50914;font-style:normal;}
.land-sub{font-size:18px;color:#a0a0a0;line-height:1.6;margin-bottom:36px;font-weight:400;}
.land-cta-group{display:flex;gap:12px;align-items:center;flex-wrap:wrap;}
.btn-land-p{background:#e50914;color:#fff;border:none;cursor:pointer;padding:16px 36px;border-radius:8px;font-size:16px;font-weight:700;font-family:'Inter',sans-serif;transition:all .2s;display:inline-flex;align-items:center;gap:8px;text-decoration:none;}
.btn-land-p:hover{background:#f40612;transform:translateY(-2px);box-shadow:0 8px 32px rgba(229,9,20,.4);}
.btn-land-o{background:transparent;color:#fff;border:2px solid #1a1a1a;cursor:pointer;padding:16px 36px;border-radius:8px;font-size:16px;font-weight:700;font-family:'Inter',sans-serif;transition:all .2s;}
.btn-land-o:hover{border-color:#333;background:rgba(255,255,255,.04);}
.land-social-proof{display:flex;align-items:center;gap:8px;margin-top:24px;font-size:13px;color:#555;}
.land-avatars{display:flex;}
.land-avatar{width:28px;height:28px;border-radius:50%;background:#333;border:2px solid #0a0a0a;margin-left:-8px;display:flex;align-items:center;justify-content:center;font-size:11px;}

/* HERO VISUAL */
.land-hero-visual{position:relative;}
.land-screen{background:#111;border:1px solid #1a1a1a;border-radius:12px;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,.8);}
.land-screen-bar{height:40px;background:#0a0a0a;display:flex;align-items:center;padding:0 16px;gap:8px;border-bottom:1px solid #1a1a1a;}
.land-dot{width:10px;height:10px;border-radius:50%;}
.land-screen-body{padding:16px;}
.land-mock-hero{height:100px;border-radius:8px;background:linear-gradient(135deg,#1a0000,#7a0008,#c62828);margin-bottom:12px;display:flex;align-items:flex-end;padding:12px;}
.land-mock-title{font-size:12px;font-weight:700;color:#fff;}
.land-mock-row{margin-bottom:8px;}
.land-mock-row-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#555;margin-bottom:6px;}
.land-mock-cards{display:flex;gap:6px;}
.land-mock-card{width:72px;height:40px;border-radius:4px;flex-shrink:0;}
.land-badge{position:absolute;background:#111;border:1px solid #1a1a1a;border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.6);}
.land-badge-ico{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;}

/* FEATURES */
.land-section{padding:clamp(48px,8vw,100px) clamp(16px,5vw,60px);max-width:1200px;margin:0 auto;width:100%;}
.land-section-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#e50914;margin-bottom:12px;}
.land-section-title{font-size:clamp(1.6rem,4vw,2.4rem);font-weight:900;letter-spacing:-1px;margin-bottom:16px;font-family:'Inter',sans-serif;}
.land-section-sub{font-size:16px;color:#a0a0a0;max-width:500px;line-height:1.65;}
.feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:52px;}
.feat-card{background:#111;border:1px solid #1a1a1a;border-radius:10px;padding:24px;transition:border-color .2s,transform .2s;}
.feat-card:hover{border-color:#333;transform:translateY(-3px);}
.feat-ico{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:16px;}
.feat-title{font-size:15px;font-weight:700;margin-bottom:8px;font-family:'Inter',sans-serif;}
.feat-desc{font-size:13px;color:#a0a0a0;line-height:1.6;}

/* HOW IT WORKS */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;margin-top:52px;position:relative;}
.steps::before{content:'';position:absolute;top:28px;left:calc(16.66% + 16px);right:calc(16.66% + 16px);height:1px;background:linear-gradient(to right,#e50914,#e50914);opacity:.3;}
.step-num{width:56px;height:56px;border-radius:50%;background:#e50914;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;margin-bottom:20px;font-family:'Inter',sans-serif;}
.step-title{font-size:17px;font-weight:700;margin-bottom:8px;font-family:'Inter',sans-serif;}
.step-desc{font-size:14px;color:#a0a0a0;line-height:1.6;}

/* PRICING */
.pricing-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:700px;margin:52px auto 0;}
.plan-card{background:#111;border:1px solid #1a1a1a;border-radius:12px;padding:28px;position:relative;transition:border-color .2s;}
.plan-card.featured{border-color:#e50914;background:rgba(229,9,20,.04);}
.plan-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#e50914;color:#fff;font-size:11px;font-weight:800;padding:4px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;}
.plan-name{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#a0a0a0;margin-bottom:8px;}
.plan-price{font-size:40px;font-weight:900;letter-spacing:-2px;font-family:'Inter',sans-serif;margin-bottom:4px;}
.plan-price span{font-size:16px;color:#a0a0a0;font-weight:400;letter-spacing:0;}
.plan-desc{font-size:13px;color:#555;margin-bottom:20px;}
.plan-features{display:flex;flex-direction:column;gap:8px;}
.plan-feat{display:flex;align-items:center;gap:8px;font-size:13px;color:#a0a0a0;}
.plan-feat-ico{color:#22c55e;flex-shrink:0;}

/* CTA BOTTOM */
.land-cta-section{background:linear-gradient(135deg,rgba(229,9,20,.08) 0%,transparent 60%);border:1px solid rgba(229,9,20,.15);border-radius:16px;padding:clamp(32px,5vw,60px);text-align:center;margin:0 clamp(16px,5vw,60px) clamp(60px,8vh,100px);}
.land-cta-title{font-size:2.4rem;font-weight:900;letter-spacing:-1.5px;margin-bottom:16px;}
.land-cta-sub{font-size:16px;color:#a0a0a0;margin-bottom:36px;}

/* FOOTER */
.land-footer{border-top:1px solid #1a1a1a;padding:32px clamp(16px,5vw,60px);display:flex;justify-content:space-between;align-items:center;color:#555;font-size:13px;flex-wrap:wrap;gap:16px;}
.land-footer-links{display:flex;gap:24px;}
.land-footer-link{color:#555;text-decoration:none;transition:color .2s;}
.land-footer-link:hover{color:#a0a0a0;}

/* LOGIN PAGE */
.login-page{min-height:100vh;background:#0a0a0a;display:flex;align-items:center;justify-content:center;padding:20px;}
.login-card{background:#111;border:1px solid #1a1a1a;border-radius:14px;padding:40px;width:100%;max-width:400px;text-align:center;}
.login-logo{font-size:26px;font-weight:900;color:#e50914;font-family:'Inter',sans-serif;text-transform:uppercase;margin-bottom:8px;}
.login-logo em{color:#fff;font-style:normal;}
.login-sub{font-size:14px;color:#a0a0a0;margin-bottom:32px;}
.btn-google{width:100%;background:#fff;color:#111;border:none;cursor:pointer;padding:14px 20px;border-radius:8px;font-size:15px;font-weight:700;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;gap:10px;transition:all .2s;margin-bottom:12px;}
.btn-google:hover{background:#f0f0f0;transform:translateY(-1px);box-shadow:0 4px 20px rgba(255,255,255,.15);}
.login-divider{display:flex;align-items:center;gap:12px;margin:20px 0;color:#333;font-size:12px;}
.login-divider::before,.login-divider::after{content:'';flex:1;height:1px;background:#1a1a1a;}
.login-demo{width:100%;background:rgba(255,255,255,.04);color:#a0a0a0;border:1px solid #1a1a1a;cursor:pointer;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;font-family:'Inter',sans-serif;transition:all .2s;}
.login-demo:hover{background:rgba(255,255,255,.08);color:#fff;}
.login-terms{font-size:11px;color:#333;margin-top:20px;line-height:1.6;}

/* ONBOARDING */
.onboard-page{min-height:100vh;background:#0a0a0a;display:flex;align-items:center;justify-content:center;padding:20px;}
.onboard-card{background:#111;border:1px solid #1a1a1a;border-radius:14px;padding:40px;width:100%;max-width:480px;}
.onboard-steps-bar{display:flex;gap:6px;margin-bottom:32px;}
.onboard-step-dot{height:3px;border-radius:2px;flex:1;transition:background .3s;}
.onboard-step-ico{font-size:40px;margin-bottom:16px;display:block;}
.onboard-title{font-size:22px;font-weight:800;margin-bottom:8px;font-family:'Inter',sans-serif;letter-spacing:-.4px;}
.onboard-desc{font-size:14px;color:#a0a0a0;line-height:1.65;margin-bottom:28px;}
.onboard-demo{background:#0a0a0a;border:1px solid #1a1a1a;border-radius:8px;padding:16px;margin-bottom:28px;}
.onboard-footer{display:flex;justify-content:space-between;align-items:center;}
.btn-onboard-skip{background:none;border:none;color:#555;cursor:pointer;font-size:14px;font-family:'Inter',sans-serif;transition:color .2s;}
.btn-onboard-skip:hover{color:#a0a0a0;}
.btn-onboard-next{background:#e50914;color:#fff;border:none;cursor:pointer;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:700;font-family:'Inter',sans-serif;transition:all .2s;display:flex;align-items:center;gap:8px;}
.btn-onboard-next:hover{background:#f40612;}

/* SETTINGS */
.settings-page{background:#0a0a0a;min-height:100vh;font-family:'Inter',sans-serif;}
.settings-hdr{position:fixed;top:0;left:0;right:0;z-index:100;height:64px;padding:0 48px;display:flex;align-items:center;gap:16px;background:rgba(10,10,10,.95);backdrop-filter:blur(20px);border-bottom:1px solid #1a1a1a;}
.settings-back{background:rgba(255,255,255,.06);border:1px solid #1a1a1a;color:#fff;cursor:pointer;width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;transition:all .2s;}
.settings-back:hover{background:rgba(255,255,255,.12);}
.settings-hdr-title{font-size:17px;font-weight:700;color:#fff;font-family:'Inter',sans-serif;}
.settings-body{padding:88px 48px 60px;max-width:680px;margin:0 auto;}
.settings-section{margin-bottom:40px;}
.settings-section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#555;margin-bottom:16px;}
.settings-card{background:#111;border:1px solid #1a1a1a;border-radius:10px;overflow:hidden;}
.settings-row{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #1a1a1a;transition:background .2s;}
.settings-row:last-child{border-bottom:none;}
.settings-row:hover{background:rgba(255,255,255,.03);}
.settings-row-label{font-size:14px;font-weight:600;color:#fff;}
.settings-row-sub{font-size:12px;color:#555;margin-top:2px;}
.settings-row-action{display:flex;align-items:center;gap:8px;}
.btn-settings{background:rgba(255,255,255,.06);border:1px solid #1a1a1a;color:#a0a0a0;cursor:pointer;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;font-family:'Inter',sans-serif;transition:all .2s;}
.btn-settings:hover{background:rgba(255,255,255,.1);color:#fff;}
.btn-settings.danger{color:#f87171;border-color:rgba(248,113,113,.3);}
.btn-settings.danger:hover{background:rgba(248,113,113,.1);}
.settings-avatar{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0;}
.settings-plan-badge{font-size:11px;font-weight:800;padding:3px 10px;border-radius:10px;text-transform:uppercase;letter-spacing:.5px;}

@media(min-width:1024px){.land-hero-inner{grid-template-columns:1fr 1fr;gap:60px;}}
@media(max-width:768px){
  .land-hero-inner{grid-template-columns:1fr;}
  .land-hero-visual{display:none;}
  .feat-grid{grid-template-columns:1fr;}
  .steps{grid-template-columns:1fr;}
  .steps::before{display:none;}
  .pricing-grid{grid-template-columns:1fr;}
  .land-section,.land-cta-section,.land-footer{padding-left:24px;padding-right:24px;}
  .land-nav{padding:0 24px;}
  .land-h1{font-size:2.4rem;}
}
/* ── LANDING RESPONSIVE (inside LANDING_CSS) ───────────── */
@media (max-width: 767px) {
  .land-nav{padding:0 16px;height:56px;}
  .land-nav-links{display:none!important;}
  .land-cta-nav{padding:8px 16px;font-size:13px;}
  .land-hero{padding:72px 16px 40px;min-height:auto;}
  .land-hero-inner{grid-template-columns:1fr;gap:32px;}
  .land-hero-visual{display:none;}
  .land-h1{font-size:2rem;letter-spacing:-1px;}
  .land-sub{font-size:15px;margin-bottom:24px;}
  .land-cta-group{flex-direction:column;align-items:stretch;}
  .btn-land-p,.btn-land-o{width:100%;justify-content:center;padding:14px 20px;}
  .land-social-proof{justify-content:center;}
  .land-section{padding:52px 16px;}
  .land-section-title{font-size:1.8rem;}
  .feat-grid{grid-template-columns:1fr;gap:12px;}
  .feat-card{padding:18px;}
  .steps{grid-template-columns:1fr;gap:20px;}
  .steps::before{display:none;}
  .pricing-grid{grid-template-columns:1fr;max-width:100%;}
  .land-cta-section{margin:0 16px 60px;padding:32px 16px;border-radius:12px;}
  .land-cta-title{font-size:1.6rem;}
  .land-footer{flex-direction:column;gap:14px;text-align:center;padding:28px 16px;}
  .land-footer-links{flex-wrap:wrap;justify-content:center;gap:16px;}
  .login-page{padding:0;}
  .login-card{border-radius:0;min-height:100dvh;padding:40px 20px;border:none;display:flex;flex-direction:column;justify-content:center;}
  .onboard-page{padding:0;}
  .onboard-card{border-radius:0;min-height:100dvh;padding:32px 20px;border:none;display:flex;flex-direction:column;justify-content:center;}
  .settings-hdr{padding:0 16px;}
  .settings-body{padding:72px 16px 100px;}
  .settings-row{padding:14px 16px;flex-wrap:wrap;gap:8px;}
  .settings-row-action{width:100%;}
  .import-stats{grid-template-columns:repeat(3,1fr);}
}
@media (min-width:768px) and (max-width:1023px) {
  .land-nav{padding:0 32px;}
  .land-hero{padding:88px 32px 52px;}
  .land-hero-inner{gap:40px;}
  .land-hero-visual{display:block;}
  .land-section{padding:72px 32px;}
  .feat-grid{grid-template-columns:repeat(2,1fr);}
}
/* ── FORM INPUTS (needed for demo login, settings) ───────── */
.fi{width:100%;background:#0d0d0d;border:1px solid #1a1a1a;color:#fff!important;
  padding:12px 14px;border-radius:6px;font-size:14px;font-family:'Inter',sans-serif;
  outline:none;transition:border-color .2s;}
.fi::placeholder{color:#333;}
.fi:focus{border-color:#e50914;}
.fsel{width:100%;background:#0d0d0d;border:1px solid #1a1a1a;color:#fff;
  padding:11px 14px;border-radius:6px;font-size:14px;font-family:'Inter',sans-serif;outline:none;}
input[type="text"],input[type="email"],input[type="password"],input[type="search"],textarea{
  color:#fff!important;background:#0d0d0d;-webkit-text-fill-color:#fff!important;}
input:-webkit-autofill{-webkit-text-fill-color:#fff!important;-webkit-box-shadow:0 0 0 30px #0d0d0d inset!important;}
.btn-save{background:#e50914;color:#fff;border:none;cursor:pointer;padding:12px 24px;
  border-radius:6px;font-size:14px;font-weight:700;font-family:'Inter',sans-serif;
  display:inline-flex;align-items:center;gap:8px;transition:all .2s;}
.btn-save:hover{background:#f40612;}
.btn-save:disabled{opacity:.4;cursor:not-allowed;}
.btn-cancel{background:rgba(255,255,255,.06);border:1px solid #1a1a1a;color:#a0a0a0;
  cursor:pointer;padding:12px 20px;border-radius:6px;font-size:14px;font-weight:600;
  font-family:'Inter',sans-serif;transition:all .2s;}
.btn-cancel:hover{background:rgba(255,255,255,.1);color:#fff;}
`;

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({ onGetStarted }) {
  // React-based mobile detection — mais confiável que CSS media query
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const feats = [
    { ico:"▶", bg:"rgba(229,9,20,.15)", color:"#e50914", title:"Salve qualquer vídeo", desc:"YouTube, TikTok, Instagram, Twitter/X — cole a URL e o título é buscado automaticamente." },
    { ico:"📁", bg:"rgba(59,130,246,.15)", color:"#3b82f6", title:"Organize em categorias", desc:"Crie pastas e subpastas infinitas. Arraste para reordenar. Estrutura que faz sentido pra você." },
    { ico:"✓", bg:"rgba(34,197,94,.15)", color:"#22c55e", title:"Acompanhe o progresso", desc:"Marque como assistido com animação satisfatória. Veja o % de conclusão por categoria." },
    { ico:"🎬", bg:"rgba(245,166,35,.15)", color:"#f5a623", title:"Pré-visualize no hover", desc:"Passe o mouse sobre qualquer card YouTube para iniciar o vídeo sem sair da tela." },
    { ico:"🔍", bg:"rgba(139,92,246,.15)", color:"#8b5cf6", title:"Busca e filtros avançados", desc:"Filtre por plataforma, período, tags. Busca por título, URL e notas pessoais." },
    { ico:"🔒", bg:"rgba(20,184,166,.15)", color:"#14b8a6", title:"Sincronização na nuvem", desc:"Faça login com Google e acesse sua lista em qualquer dispositivo. Nada se perde." },
  ];

  return (
    <>
      <style>{LANDING_CSS}</style>
      <div className="land">

        {/* ── NAV ── */}
        <nav className="land-nav">
          <div className="land-logo">Watch<em>List</em></div>

          {/* Desktop: links + CTA */}
          {!isMobile && (
            <>
              <div className="land-nav-links">
                <button className="land-nav-link">Funcionalidades</button>
                <button className="land-nav-link">Preços</button>
              </div>
              <button className="land-cta-nav" onClick={onGetStarted}>Começar grátis</button>
            </>
          )}

          {/* Mobile: só CTA + hamburguer */}
          {isMobile && (
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <button className="land-cta-nav" style={{fontSize:12,padding:"8px 14px"}} onClick={onGetStarted}>
                Começar grátis
              </button>
              <button onClick={()=>setMenuOpen(m=>!m)}
                style={{background:"rgba(255,255,255,.07)",border:"1px solid #1a1a1a",color:"#fff",
                  width:36,height:36,borderRadius:8,cursor:"pointer",fontSize:18,display:"flex",
                  alignItems:"center",justifyContent:"center"}}>
                {menuOpen ? "✕" : "☰"}
              </button>
            </div>
          )}
        </nav>

        {/* Mobile dropdown menu */}
        {isMobile && menuOpen && (
          <div style={{
            position:"fixed",top:56,left:0,right:0,bottom:0,
            background:"rgba(10,10,10,.98)",zIndex:99,
            display:"flex",flexDirection:"column",alignItems:"center",
            justifyContent:"center",gap:24,fontFamily:"'Inter',sans-serif",
          }}>
            {["Funcionalidades","Preços","Blog"].map(l=>(
              <button key={l} onClick={()=>setMenuOpen(false)}
                style={{background:"none",border:"none",color:"#fff",fontSize:24,
                  fontWeight:700,cursor:"pointer",letterSpacing:"-1px"}}>
                {l}
              </button>
            ))}
            <button className="land-cta-nav" style={{marginTop:16,fontSize:16,padding:"14px 40px"}}
              onClick={()=>{setMenuOpen(false);onGetStarted();}}>
              Começar grátis
            </button>
          </div>
        )}

        {/* ── HERO ── */}
        <section className="land-hero">
          <div className="land-hero-grd"/>
          <div className="land-hero-inner">
            <div className="land-hero-text">
              <div className="land-eyebrow">✦ Sua Netflix pessoal de vídeos</div>
              <h1 className="land-h1">Nunca perca um<br/>vídeo <em>importante</em><br/>de novo.</h1>
              <p className="land-sub">Salve, organize e assista seus vídeos favoritos de qualquer plataforma. Interface cinematográfica inspirada na Netflix.</p>
              <div className="land-cta-group">
                <button className="btn-land-p" onClick={onGetStarted}>▶ Começar grátis</button>
                <button className="btn-land-o">Ver demo →</button>
              </div>
              <div className="land-social-proof">
                <div className="land-avatars">
                  {["#e50914","#3b82f6","#22c55e","#f5a623"].map((c,i)=>(
                    <div key={i} className="land-avatar" style={{background:c,marginLeft:i===0?0:-8}}>{["J","A","M","R"][i]}</div>
                  ))}
                </div>
                <span>+2.400 pessoas organizando seus vídeos</span>
              </div>
            </div>
            {/* Visual só no desktop */}
            {!isMobile && (
              <div className="land-hero-visual">
                <div className="land-screen">
                  <div className="land-screen-bar">
                    <div className="land-dot" style={{background:"#e50914"}}/>
                    <div className="land-dot" style={{background:"#f5a623"}}/>
                    <div className="land-dot" style={{background:"#22c55e"}}/>
                  </div>
                  <div className="land-screen-body">
                    <div className="land-mock-hero" style={{height:110,marginBottom:14,position:"relative",overflow:"hidden"}}>
                      <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,#1a0000 0%,#7a0008 50%,#c62828 100%)",opacity:.7}}/>
                      <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.9),transparent)",padding:"12px 14px"}}>
                        <div style={{fontSize:7,color:"#e50914",fontWeight:800,textTransform:"uppercase",letterSpacing:".5px",marginBottom:3}}>⭐ EM DESTAQUE</div>
                        <div className="land-mock-title" style={{fontSize:11}}>Champions League — Melhores Momentos</div>
                        <div style={{display:"flex",gap:5,marginTop:6}}>
                          <div style={{background:"#fff",borderRadius:3,padding:"2px 8px",fontSize:7,fontWeight:800,color:"#000"}}>▶ Assistir</div>
                          <div style={{background:"rgba(255,255,255,.15)",borderRadius:3,padding:"2px 8px",fontSize:7,fontWeight:700,color:"#fff"}}>✓ Assistido</div>
                        </div>
                      </div>
                    </div>
                    {[["EDUCAÇÃO","#3b82f6",["#1a2a4a","#1a3a4a","#1a1a4a","#2a1a4a"]],["🎮 ENTRETENIMENTO","#8b5cf6",["#2a1a3a","#3a1a3a","#2a2a2a","#1a2a2a"]]].map(([label,color,bgs])=>(
                      <div key={label} className="land-mock-row">
                        <div className="land-mock-row-label" style={{color,fontSize:8}}>{label}</div>
                        <div className="land-mock-cards">
                          {bgs.map((bg,i)=>(
                            <div key={i} className="land-mock-card" style={{background:`linear-gradient(135deg,${bg},${color}22)`}}/>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="land-badge" style={{top:-16,right:-16,animation:"popIn .4s .2s both"}}>
                  <div className="land-badge-ico" style={{background:"rgba(34,197,94,.15)"}}>✓</div>
                  <div><div style={{fontSize:11,fontWeight:700,color:"#22c55e"}}>Marcado!</div><div style={{fontSize:10,color:"#555"}}>React Avançado</div></div>
                </div>
                <div className="land-badge" style={{bottom:-16,left:-16,animation:"popIn .4s .4s both"}}>
                  <div className="land-badge-ico" style={{background:"rgba(229,9,20,.15)"}}>▶</div>
                  <div><div style={{fontSize:11,fontWeight:700,color:"#e50914"}}>Pré-visualizando</div><div style={{fontSize:10,color:"#555"}}>Passe o mouse</div></div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── FEATURES ── */}
        <div className="land-section">
          <div className="land-section-label">Funcionalidades</div>
          <h2 className="land-section-title">Tudo que você precisa<br/>para organizar seu conteúdo</h2>
          <p className="land-section-sub">Construído para quem consome muito conteúdo e cansa de perder os melhores vídeos.</p>
          <div className="feat-grid">
            {feats.map(f=>(
              <div key={f.title} className="feat-card">
                <div className="feat-ico" style={{background:f.bg,color:f.color}}>{f.ico}</div>
                <div className="feat-title">{f.title}</div>
                <div className="feat-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── HOW IT WORKS ── */}
        <div className="land-section" style={{paddingTop:0}}>
          <div className="land-section-label">Como funciona</div>
          <h2 className="land-section-title">Em 3 passos simples</h2>
          <div className="steps">
            {[["1","Cole a URL","Cole qualquer link do YouTube, TikTok, Instagram ou qualquer site. Título e thumbnail são buscados automaticamente."],["2","Organize","Crie categorias, adicione tags pessoais, escreva notas. Sua lista, do seu jeito."],["3","Assista quando quiser","Pré-visualize no hover. Abra direto no site original. Marque como assistido com animação."]].map(([n,t,d])=>(
              <div key={n}>
                <div className="step-num">{n}</div>
                <div className="step-title">{t}</div>
                <div className="step-desc">{d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── PRICING ── */}
        <div className="land-section" style={{paddingTop:0,textAlign:"center"}}>
          <div className="land-section-label">Preços</div>
          <h2 className="land-section-title">Simples e transparente</h2>
          <div className="pricing-grid">
            {[{name:"Free",price:"R$0",period:"/mês",desc:"Para começar",feats:["Até 300 vídeos","Categorias ilimitadas","Pré-visualização YouTube","Export/Import JSON","Suporte por email"],featured:false,cta:"Começar agora"},{name:"Premium",price:"R$19",period:"/mês",desc:"Para quem consome muito conteúdo",feats:["Vídeos ilimitados","Tudo do Free","Sync multi-dispositivo","Extensão Chrome","Backup automático","Suporte prioritário"],featured:true,cta:"Assinar Premium"}].map(p=>(
              <div key={p.name} className={`plan-card${p.featured?" featured":""}`}>
                {p.featured && <div className="plan-badge">Mais popular</div>}
                <div className="plan-name">{p.name}</div>
                <div className="plan-price">{p.price}<span>{p.period}</span></div>
                <div className="plan-desc">{p.desc}</div>
                <div className="plan-features">
                  {p.feats.map(f=><div key={f} className="plan-feat"><span className="plan-feat-ico">✓</span>{f}</div>)}
                </div>
                <button className={`btn-land-p${p.featured?"":" btn-land-o"}`} style={{width:"100%",marginTop:20,justifyContent:"center"}} onClick={onGetStarted}>{p.cta}</button>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA BOTTOM ── */}
        <div style={{padding:"0 clamp(16px,5vw,60px) 0"}}>
          <div className="land-cta-section">
            <h2 className="land-cta-title">Pronto para organizar<br/>seus vídeos?</h2>
            <p className="land-cta-sub">Gratuito para começar. Sem cartão de crédito.</p>
            <button className="btn-land-p" style={{margin:"0 auto"}} onClick={onGetStarted}>▶ Começar grátis agora</button>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <footer className="land-footer">
          <div className="land-logo" style={{fontSize:16}}>Watch<em>List</em></div>
          <div className="land-footer-links">
            <a href="#" className="land-footer-link">Termos</a>
            <a href="#" className="land-footer-link">Privacidade</a>
            <a href="#" className="land-footer-link">Contato</a>
          </div>
          <span>© 2025 WatchList.</span>
        </footer>

      </div>
    </>
  );
}

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
// Usa Google Identity Services (accounts.google.com/gsi/client)
// SEM Firebase — autenticação direta com Google
function LoginPage({ onLogin, onBack }) {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [demoName, setDemoName] = useState("");
  const [showDemo, setShowDemo] = useState(false);
  const googleBtnRef            = useRef(null);

  // Carrega Google Identity Services ao montar
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return; // skip em modo demo (sem client ID)
    const existing = document.getElementById("gsi-script");
    if (existing) { initGSI(); return; }
    const script    = document.createElement("script");
    script.id       = "gsi-script";
    script.src      = "https://accounts.google.com/gsi/client";
    script.async    = true;
    script.onload   = initGSI;
    document.head.appendChild(script);
  }, []);

  const initGSI = () => {
    if (!window.google?.accounts?.id || !GOOGLE_CLIENT_ID) return;
    window.google.accounts.id.initialize({
      client_id:     GOOGLE_CLIENT_ID,
      callback:      handleGoogleCredential,
      auto_select:   false,
      use_fedcm_for_prompt: false,
    });
    // Renderiza botão estilizado do Google no container
    if (googleBtnRef.current) {
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "filled_black", size: "large",
        width: 320, text: "continue_with", shape: "rectangular",
      });
    }
  };

  // Chamado pelo Google Identity Services com o credential (ID token)
  const handleGoogleCredential = async (response) => {
    setLoading(true); setError("");
    try {
      // Envia o token para o backend — backend verifica com Google e retorna JWT
      const data = await apiFetch("/api/auth/google", {
        method: "POST",
        body: JSON.stringify({ google_token: response.credential })
      });
      // data = { token, user, is_new }
      onLogin({ ...data.user, jwtToken: data.token, isNew: data.is_new });
    } catch (e) {
      setError("Falha no login: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Botão manual que dispara o popup Google (fallback)
  const handleGoogleButtonClick = () => {
    if (!GOOGLE_CLIENT_ID) { setShowDemo(true); return; }
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          // One Tap bloqueado pelo browser — usa popup
          window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: "email profile openid",
            callback: async (tokenResponse) => {
              // Troca o access token pelo ID token via userinfo
              try {
                const info = await fetch(
                  `https://www.googleapis.com/oauth2/v3/userinfo`,
                  { headers: { Authorization: `Bearer ${tokenResponse.access_token}` } }
                ).then(r=>r.json());
                // Cria pseudo-credential para enviar ao backend
                handleGoogleCredential({ credential: tokenResponse.access_token, sub: info.sub });
              } catch(e) { setError("Erro ao obter dados do Google"); }
            }
          }).requestAccessToken();
        }
      });
    }
  };

  // Login demo (sem backend) — para testar o app localmente
  const handleDemoLogin = () => {
    if (!demoName.trim()) return;
    onLogin({ id:"demo-"+Date.now(), name:demoName.trim(), email:"", avatar:"", plan:"free", isNew:true, isDemo:true });
  };

  return (
    <>
      <style>{LANDING_CSS}</style>
      <div className="login-page">
        <div className="login-card" style={{position:"relative"}}>
          <button onClick={onBack} style={{position:"absolute",top:16,left:16,background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:4}}>← Voltar</button>
          <div className="login-logo" style={{marginTop:16}}>Watch<em>List</em></div>
          <p className="login-sub">Faça login com Google para sincronizar sua lista em todos os dispositivos</p>

          {error && (
            <div style={{background:"rgba(229,9,20,.1)",border:"1px solid rgba(229,9,20,.3)",borderRadius:6,padding:"10px 12px",fontSize:12,color:"#f87171",marginBottom:12,textAlign:"left"}}>
              ⚠ {error}
            </div>
          )}

          {/* Container do botão Google Identity Services */}
          {GOOGLE_CLIENT_ID ? (
            <div ref={googleBtnRef} style={{display:"flex",justifyContent:"center",marginBottom:8}}/>
          ) : (
            /* Fallback visual quando não há CLIENT_ID (modo demo/artifact) */
            <button className="btn-google" onClick={()=>setShowDemo(true)} disabled={loading}>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continuar com Google
            </button>
          )}

          <div className="login-divider">ou</div>
          {!showDemo ? (
            <button className="login-demo" onClick={()=>setShowDemo(true)}>
              Entrar sem conta (modo demo)
            </button>
          ) : (
            <div>
              <div style={{fontSize:11,color:"#555",marginBottom:8,textAlign:"center"}}>
                Modo demo — dados salvos apenas neste dispositivo
              </div>
              <div style={{display:"flex",gap:8}}>
                <input className="fi" style={{background:"#0d0d0d",color:"#fff",WebkitTextFillColor:"#fff"}} placeholder="Seu nome..." value={demoName} onChange={e=>setDemoName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleDemoLogin()} autoFocus/>
                <button className="btn-save" style={{flex:"none",padding:"10px 16px",borderRadius:6}} onClick={handleDemoLogin} disabled={!demoName.trim()}>Entrar</button>
              </div>
            </div>
          )}

          <p className="login-terms">
            Ao entrar, você concorda com os{" "}
            <a href="#" style={{color:"#555"}}>Termos de Uso</a> e{" "}
            <a href="#" style={{color:"#555"}}>Política de Privacidade</a>.
          </p>
        </div>
      </div>
    </>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function OnboardingPage({ user, onComplete }) {
  const [step, setStep] = useState(0);
  const STEPS = [
    {
      ico:"👋", title:`Bem-vindo, ${user?.name?.split(" ")[0] || "usuário"}!`,
      desc:"WatchList é sua lista pessoal de vídeos. Salve qualquer URL, organize em categorias e nunca perca um vídeo importante.",
      demo: <div className="onboard-demo" style={{display:"flex",gap:12,alignItems:"center"}}>
        <div style={{width:64,height:36,borderRadius:6,background:"linear-gradient(135deg,#3d0006,#c62828)",flexShrink:0}}/>
        <div><div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:4}}>Tutorial de React</div><div style={{fontSize:10,color:"#555"}}>youtube.com • Educação</div></div>
      </div>
    },
    {
      ico:"🔗", title:"Cole qualquer URL",
      desc:"Funciona com YouTube, TikTok, Instagram, Twitter/X e qualquer site. O título é buscado automaticamente.",
      demo: <div className="onboard-demo">
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <div style={{flex:1,height:36,background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:6,display:"flex",alignItems:"center",padding:"0 12px"}}>
            <span style={{fontSize:12,color:"#333"}}>https://youtube.com/watch?v=...</span>
          </div>
          <div style={{width:80,height:36,background:"#e50914",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff"}}>Buscar</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div style={{width:80,height:45,borderRadius:4,background:"linear-gradient(135deg,#1a0030,#8e24aa)"}}/>
          <div><div style={{fontSize:12,fontWeight:600,color:"#22c55e",marginBottom:2}}>✓ Título carregado</div><div style={{fontSize:11,color:"#555"}}>Metadados buscados automaticamente</div></div>
        </div>
      </div>
    },
    {
      ico:"📁", title:"Organize em categorias",
      desc:"Crie categorias como Educação, Entretenimento, Trabalho. Adicione subcategorias. Arraste para reordenar.",
      demo: <div className="onboard-demo">
        {[["📚 Educação","#3b82f6",3],["🎮 Games","#8b5cf6",7],["📈 Trabalho","#22c55e",2]].map(([n,c,cnt])=>(
          <div key={n} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1a1a1a"}}>
            <span style={{fontSize:13,fontWeight:600,color:"#fff"}}>{n}</span>
            <span style={{fontSize:11,color:c,fontWeight:700}}>{cnt} vídeos</span>
          </div>
        ))}
      </div>
    },
    {
      ico:"🎉", title:"Tudo pronto!",
      desc:"Sua conta está configurada. Comece adicionando seu primeiro vídeo. Use o botão + Adicionar no topo da tela.",
      demo: <div className="onboard-demo" style={{textAlign:"center",padding:"24px 16px"}}>
        <div style={{fontSize:40,marginBottom:12}}>🚀</div>
        <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:6}}>Sua WatchList está pronta</div>
        <div style={{fontSize:12,color:"#555"}}>Clique em "Ir para o app" para começar</div>
      </div>
    },
  ];

  const s = STEPS[step];
  return (
    <>
      <style>{LANDING_CSS}</style>
      <div className="onboard-page">
        <div className="onboard-card">
          <div className="onboard-steps-bar">
            {STEPS.map((_,i)=>(
              <div key={i} className="onboard-step-dot" style={{background:i<=step?"#e50914":"#1a1a1a"}}/>
            ))}
          </div>
          <span className="onboard-step-ico">{s.ico}</span>
          <div className="onboard-title">{s.title}</div>
          <p className="onboard-desc">{s.desc}</p>
          {s.demo}
          <div className="onboard-footer">
            <button className="btn-onboard-skip" onClick={onComplete}>Pular tutorial</button>
            {step < STEPS.length - 1 ? (
              <button className="btn-onboard-next" onClick={()=>setStep(s=>s+1)}>Próximo →</button>
            ) : (
              <button className="btn-onboard-next" onClick={onComplete}>Ir para o app ▶</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
function SettingsPage({ user, cats, links, onBack, onLogout, onExport, onImport }) {
  const total = links?.length || 0;
  const watched = links?.filter(l=>l.watched).length || 0;
  const pct = total>0 ? Math.round((watched/total)*100) : 0;

  return (
    <>
      <style>{LANDING_CSS}</style>
      <div className="settings-page">
        <div className="settings-hdr">
          <button className="settings-back" onClick={onBack}>←</button>
          <div className="settings-hdr-title">Configurações</div>
        </div>
        <div className="settings-body">

          {/* Profile */}
          <div className="settings-section">
            <div className="settings-section-title">Conta</div>
            <div className="settings-card">
              <div className="settings-row">
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  {user?.avatar
                    ? <img src={user.avatar} alt="" className="settings-avatar" style={{width:48,height:48,borderRadius:"50%",objectFit:"cover"}}/>
                    : <div className="settings-avatar" style={{background:"#e50914",fontSize:20}}>{(user?.name||"U")[0]}</div>
                  }
                  <div>
                    <div className="settings-row-label">{user?.name || "Usuário"}</div>
                    <div className="settings-row-sub">{user?.email || "Conta demo"}</div>
                  </div>
                </div>
                <div className="settings-row-action">
                  <span className="settings-plan-badge" style={{background:user?.plan==="premium"?"rgba(245,166,35,.15)":"rgba(255,255,255,.06)",color:user?.plan==="premium"?"#f5a623":"#a0a0a0",border:`1px solid ${user?.plan==="premium"?"rgba(245,166,35,.3)":"#1a1a1a"}`}}>
                    {user?.plan === "premium" ? "⭐ Premium" : "Free"}
                  </span>
                </div>
              </div>
              <div className="settings-row">
                <div><div className="settings-row-label">Plano atual</div><div className="settings-row-sub">Free — até 300 vídeos</div></div>
                <button className="btn-settings" style={{background:"rgba(229,9,20,.1)",borderColor:"rgba(229,9,20,.3)",color:"#e50914"}}>Fazer upgrade</button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="settings-section">
            <div className="settings-section-title">Resumo da sua lista</div>
            <div className="settings-card">
              {[
                [`${total} vídeos salvos`, `${300-total} slots restantes no Free`, total>0?"✅":"📭"],
                [`${watched} assistidos`, `${pct}% de conclusão`, "✓"],
                [`${cats?.length||0} categorias`, "organizando sua lista", "📁"],
              ].map(([label,sub,ico])=>(
                <div key={label} className="settings-row">
                  <div><div className="settings-row-label">{label}</div><div className="settings-row-sub">{sub}</div></div>
                  <span style={{fontSize:20}}>{ico}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Data */}
          <div className="settings-section">
            <div className="settings-section-title">Dados</div>
            <div className="settings-card">
              <div className="settings-row">
                <div><div className="settings-row-label">Exportar lista</div><div className="settings-row-sub">Baixar JSON com todos seus vídeos e categorias</div></div>
                <div className="settings-row-action">
                  <button className="btn-settings" onClick={onExport}>⬇ Exportar JSON</button>
                </div>
              </div>
              <div className="settings-row">
                <div><div className="settings-row-label">Importar backup</div><div className="settings-row-sub">Restaurar de um arquivo JSON exportado</div></div>
                <div className="settings-row-action">
                  <label className="btn-settings" style={{cursor:"pointer"}}>
                    ⬆ Importar JSON
                    <input type="file" accept=".json" style={{display:"none"}} onChange={onImport}/>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Integrations */}
          <div className="settings-section">
            <div className="settings-section-title">Integrações</div>
            <div className="settings-card">
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">🔌 Extensão Chrome</div>
                  <div className="settings-row-sub">Salve vídeos com 1 clique enquanto navega</div>
                </div>
                <button className="btn-settings" onClick={()=>window.open("https://chrome.google.com/webstore","_blank")}>Instalar →</button>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">📱 App Mobile</div>
                  <div className="settings-row-sub">Em breve — iOS e Android</div>
                </div>
                <span style={{fontSize:12,color:"#555",padding:"6px 12px",background:"#1a1a1a",borderRadius:6}}>Em breve</span>
              </div>
            </div>
          </div>

          {/* Danger zone */}
          <div className="settings-section">
            <div className="settings-section-title">Zona de perigo</div>
            <div className="settings-card">
              <div className="settings-row">
                <div><div className="settings-row-label">Sair da conta</div><div className="settings-row-sub">Você será redirecionado para a tela de login</div></div>
                <button className="btn-settings danger" onClick={onLogout}>Sair</button>
              </div>
              <div className="settings-row">
                <div><div className="settings-row-label" style={{color:"#f87171"}}>Deletar conta</div><div className="settings-row-sub">Remove todos os dados permanentemente</div></div>
                <button className="btn-settings danger" onClick={()=>alert("Funcionalidade disponível na versão com backend.")}>Deletar</button>
              </div>
            </div>
          </div>

          <div style={{fontSize:12,color:"#333",textAlign:"center",padding:"20px 0"}}>
            WatchList v2.0 · Feito com ♥ no Brasil
          </div>
        </div>
      </div>
    </>
  );
}

// ─── MIGRATION MODAL ─────────────────────────────────────────────────────────
function MigrationModal({ status, result }) {
  // status: "scanning" | "migrating" | "done" | "error"
  const msgs = {
    scanning:  { ico:"🔍", title:"Verificando dados locais...", sub:"Aguarde um momento", color:"#a0a0a0" },
    migrating: { ico:"⬆", title:"Migrando sua lista...",       sub:"Transferindo para a nuvem", color:"#3b82f6" },
    done:      { ico:"✅", title:"Migração concluída!",         sub:`${result?.links||0} vídeos e ${result?.categories||0} categorias transferidos`, color:"#22c55e" },
    error:     { ico:"⚠",  title:"Migração parcial",           sub:"Alguns itens já existiam ou atingiram o limite", color:"#f5a623" },
    skipped:   { ico:"✓",  title:"Nenhum dado local encontrado", sub:"Começando do zero", color:"#a0a0a0" },
  };
  const m = msgs[status] || msgs.scanning;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",backdropFilter:"blur(12px)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#111",border:"1px solid #1a1a1a",borderRadius:12,padding:"36px 40px",textAlign:"center",maxWidth:360,width:"100%",fontFamily:"'Inter',sans-serif"}}>
        <div style={{fontSize:44,marginBottom:16}}>{m.ico}</div>
        <div style={{fontSize:18,fontWeight:800,color:"#fff",marginBottom:8,letterSpacing:"-.3px"}}>{m.title}</div>
        <div style={{fontSize:13,color:"#a0a0a0",lineHeight:1.6}}>{m.sub}</div>
        {(status==="migrating"||status==="scanning") && (
          <div style={{marginTop:20,height:3,background:"#1a1a1a",borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",background:m.color,borderRadius:2,animation:"shimmer 1.4s infinite ease-in-out",backgroundSize:"200% 100%"}}/>
          </div>
        )}
        {result && status==="done" && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:20}}>
            <div style={{background:"#0a0a0a",borderRadius:8,padding:"12px",border:"1px solid #1a1a1a"}}>
              <div style={{fontSize:24,fontWeight:900,color:"#e50914",fontFamily:"'Inter',sans-serif"}}>{result.links}</div>
              <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:".8px",marginTop:2}}>Vídeos</div>
            </div>
            <div style={{background:"#0a0a0a",borderRadius:8,padding:"12px",border:"1px solid #1a1a1a"}}>
              <div style={{fontSize:24,fontWeight:900,color:"#3b82f6",fontFamily:"'Inter',sans-serif"}}>{result.categories}</div>
              <div style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:".8px",marginTop:2}}>Categorias</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CONFIRM MODAL (replaces browser confirm()) ──────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={onCancel}>
      <div style={{background:"#111",border:"1px solid #1a1a1a",borderRadius:12,padding:"28px 32px",maxWidth:400,width:"90%",textAlign:"center",boxShadow:"0 24px 64px rgba(0,0,0,.8)"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:22,marginBottom:12}}>⚠️</div>
        <div style={{fontSize:15,fontWeight:700,color:"#fff",marginBottom:8,lineHeight:1.4}}>{message}</div>
        <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:20}}>
          <button onClick={onConfirm} style={{background:"#e50914",border:"none",color:"#fff",cursor:"pointer",padding:"10px 28px",borderRadius:7,fontSize:14,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>Excluir</button>
          <button onClick={onCancel} style={{background:"rgba(255,255,255,.07)",border:"1px solid #1a1a1a",color:"#a0a0a0",cursor:"pointer",padding:"10px 24px",borderRadius:7,fontSize:14,fontFamily:"'Inter',sans-serif"}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTES PAGE — 3-pane Todoist-style
// ═══════════════════════════════════════════════════════════════════════════════

// ── Quick-add parser ────────────────────────────────────────────────────────────
function parseNoteInput(text) {
  let title = text, priority = 4, tags = [], dueDate = null;
  // Priority
  const prioMap = [/\b(p1|!!!)\b/i, /\b(p2|!!)\b/i, /\b(p3|!)\b/i, /\b(p4)\b/i];
  prioMap.forEach((re, i) => {
    if (re.test(title)) { priority = i+1; title = title.replace(re, '').trim(); }
  });
  // Tags
  const tagRe = /#([\wÀ-ÿ][\wÀ-ÿ-]*)/g;
  let m;
  while ((m = tagRe.exec(title)) !== null) tags.push(m[1].toLowerCase());
  title = title.replace(/#[\wÀ-ÿ][\wÀ-ÿ-]*/g, '').trim();
  // Dates (simple PT)
  const dateMap = {
    'hoje': 0, 'amanhã': 1, 'amanha': 1,
    'depois de amanhã': 2, 'semana que vem': 7,
    'próxima semana': 7, 'proxima semana': 7,
  };
  for (const [word, days] of Object.entries(dateMap)) {
    const re = new RegExp(`\\b${word}\\b`, 'i');
    if (re.test(title)) {
      const d = new Date(); d.setDate(d.getDate() + days);
      dueDate = d.toISOString().split('T')[0];
      title = title.replace(re, '').trim();
      break;
    }
  }
  return { title: title || 'Sem título', priority, tags, dueDate };
}

// ── Note checklist renderer ─────────────────────────────────────────────────────
function NoteContent({ content, noteId, onToggle }) {
  const lines = (content || '').split('\n');
  return (
    <div style={{lineHeight:1.7,fontSize:14}}>
      {lines.map((line, i) => {
        if (line.match(/^- \[x\] /i)) {
          return (
            <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:4}}>
              <button onClick={()=>onToggle(i)} style={{background:'#22c55e',border:'none',width:17,height:17,borderRadius:4,cursor:'pointer',flexShrink:0,marginTop:2,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <svg width="10" height="10" viewBox="0 0 12 12"><polyline points="2 6 5 9 10 3" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
              <span style={{textDecoration:'line-through',color:'#555'}}>{line.slice(6)}</span>
            </div>
          );
        }
        if (line.match(/^- \[ \] /i)) {
          return (
            <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:4}}>
              <button onClick={()=>onToggle(i)} style={{background:'none',border:'1.5px solid #333',width:17,height:17,borderRadius:4,cursor:'pointer',flexShrink:0,marginTop:2}}/>
              <span>{line.slice(6)}</span>
            </div>
          );
        }
        // Timestamp [mm:ss]
        const tsRe = /\[(\d{1,2}:\d{2})\]/g;
        if (tsRe.test(line)) {
          tsRe.lastIndex = 0;
          const parts = []; let last = 0; let match;
          while ((match = tsRe.exec(line)) !== null) {
            if (match.index > last) parts.push(<span key={last}>{line.slice(last, match.index)}</span>);
            parts.push(<span key={match.index} style={{background:'rgba(229,9,20,.15)',color:'#FF7A7E',padding:'1px 5px',borderRadius:3,fontFamily:'monospace',fontSize:12,cursor:'pointer'}}>{match[0]}</span>);
            last = match.index + match[0].length;
          }
          if (last < line.length) parts.push(<span key={last}>{line.slice(last)}</span>);
          return <div key={i} style={{marginBottom:4}}>{parts}</div>;
        }
        if (!line) return <div key={i} style={{height:8}}/>;
        return <div key={i} style={{marginBottom:4}}>{line}</div>;
      })}
    </div>
  );
}

const NOTE_PRIO_COLORS = { 1:'#e50914', 2:'#f97316', 3:'#3b82f6', 4:'#333' };
const NOTE_PRIO_LABELS = { 1:'P1', 2:'P2', 3:'P3', 4:'' };

function NotesPage({ notes, links, cats, selectedNoteId, setSelectedNoteId,
  filter, setFilter, search, setSearch, jwt, onRefresh, onClose }) {

  const [quickAdd, setQuickAdd] = useState('');
  const [parsed, setParsed] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);

  const selectedNote = notes.find(n => n.id === selectedNoteId);

  // Parse quick-add in real time
  useEffect(() => {
    if (!quickAdd.trim()) return setParsed(null);
    setParsed(parseNoteInput(quickAdd));
  }, [quickAdd]);

  // Load note into editor
  useEffect(() => {
    if (selectedNote) {
      setEditTitle(selectedNote.title);
      setEditContent(selectedNote.content || '');
    }
  }, [selectedNoteId]);

  // Filter notes
  const today = new Date().toISOString().split('T')[0];
  const filtered = notes.filter(n => {
    if (search) return n.title.toLowerCase().includes(search.toLowerCase()) || (n.content||'').toLowerCase().includes(search.toLowerCase());
    if (filter === 'today') return n.dueDate === today || n.priority === 1;
    if (filter === 'upcoming') return n.dueDate && n.dueDate > today;
    if (filter.startsWith('folder:')) return n.folderName === filter.slice(7);
    return !n.folderName; // inbox
  });

  const folders = [...new Set(notes.map(n=>n.folderName).filter(Boolean))];

  async function handleQuickAdd(e) {
    e.preventDefault();
    if (!quickAdd.trim() || !jwt) return;
    const p = parseNoteInput(quickAdd);
    try {
      await apiFetch('/api/notes', { method:'POST', body:JSON.stringify({ title:p.title, priority:p.priority, tags:p.tags, dueDate:p.dueDate, content:'' }) }, jwt);
      setQuickAdd(''); setParsed(null); onRefresh();
    } catch(e) { console.error(e); }
  }

  async function handleSaveNote() {
    if (!selectedNote || !jwt) return;
    setSaving(true);
    try {
      await apiFetch(`/api/notes/${selectedNote.id}`, { method:'PATCH', body:JSON.stringify({ title:editTitle, content:editContent }) }, jwt);
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleDeleteNote(id) {
    if (!jwt) return;
    await apiFetch(`/api/notes/${id}`, { method:'DELETE' }, jwt);
    if (selectedNoteId === id) setSelectedNoteId(null);
    onRefresh();
  }

  async function toggleCheckbox(noteToEdit, lineIndex) {
    const lines = (noteToEdit.content||'').split('\n');
    const line = lines[lineIndex];
    if (line.match(/^- \[x\] /i)) lines[lineIndex] = '- [ ] ' + line.slice(6);
    else if (line.match(/^- \[ \] /i)) lines[lineIndex] = '- [x] ' + line.slice(6);
    const newContent = lines.join('\n');
    await apiFetch(`/api/notes/${noteToEdit.id}`, { method:'PATCH', body:JSON.stringify({ content:newContent }) }, jwt);
    if (selectedNoteId === noteToEdit.id) setEditContent(newContent);
    onRefresh();
  }

  function countChecklist(content) {
    const lines = (content||'').split('\n');
    const total = lines.filter(l => l.match(/^- \[(x| )\] /i)).length;
    const done = lines.filter(l => l.match(/^- \[x\] /i)).length;
    return total > 0 ? { total, done } : null;
  }

  function insertTodo() {
    const el = editorRef.current;
    if (!el) return;
    const pos = el.selectionStart;
    const before = editContent.slice(0, pos);
    const after = editContent.slice(pos);
    const newVal = before + '\n- [ ] ' + after;
    setEditContent(newVal);
    setTimeout(() => { el.selectionStart = el.selectionEnd = pos + 7; el.focus(); }, 0);
  }

  return (
    <div style={{display:'flex',height:'calc(100vh - 64px)',overflow:'hidden',background:'#0a0a0a'}}>

      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <div style={{width:220,flexShrink:0,borderRight:'1px solid #1a1a1a',display:'flex',flexDirection:'column',padding:'16px 0',overflowY:'auto'}}>
        <button onClick={()=>{setSelectedNoteId(null);}} style={{margin:'0 12px 16px',background:'#e50914',border:'none',color:'#fff',cursor:'pointer',padding:'9px 0',borderRadius:8,fontSize:13,fontWeight:800,fontFamily:"'Inter',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
          <Plus size={14}/> Nova nota
        </button>

        {[['inbox','📥','Caixa de entrada'],['today','⭐','Hoje'],['upcoming','📅','Próximas']].map(([f,ico,label])=>(
          <button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?'rgba(229,9,20,.1)':'none',border:'none',color:filter===f?'#e50914':'#888',cursor:'pointer',padding:'8px 16px',textAlign:'left',fontSize:13,fontWeight:filter===f?700:400,fontFamily:"'Inter',sans-serif",display:'flex',alignItems:'center',gap:8,width:'100%',borderLeft:filter===f?'2px solid #e50914':'2px solid transparent'}}>
            <span>{ico}</span>{label}
            <span style={{marginLeft:'auto',fontSize:11,color:'#444'}}>{
              f==='inbox'?notes.filter(n=>!n.folderName).length:
              f==='today'?notes.filter(n=>n.dueDate===today||n.priority===1).length:
              notes.filter(n=>n.dueDate&&n.dueDate>today).length
            }</span>
          </button>
        ))}

        {folders.length > 0 && (
          <>
            <div style={{padding:'12px 16px 4px',fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.7px',color:'#333'}}>PASTAS</div>
            {folders.map(f=>(
              <button key={f} onClick={()=>setFilter(`folder:${f}`)} style={{background:filter===`folder:${f}`?'rgba(229,9,20,.1)':'none',border:'none',color:filter===`folder:${f}`?'#e50914':'#888',cursor:'pointer',padding:'8px 16px',textAlign:'left',fontSize:13,fontFamily:"'Inter',sans-serif",display:'flex',alignItems:'center',gap:8,width:'100%',borderLeft:filter===`folder:${f}`?'2px solid #e50914':'2px solid transparent'}}>
                📁 {f}
                <span style={{marginLeft:'auto',fontSize:11,color:'#444'}}>{notes.filter(n=>n.folderName===f).length}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* ── NOTES LIST ──────────────────────────────────────────────────── */}
      <div style={{width:300,flexShrink:0,borderRight:'1px solid #1a1a1a',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Search */}
        <div style={{padding:'12px',borderBottom:'1px solid #1a1a1a',flexShrink:0}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar notas..." style={{width:'100%',background:'#141414',border:'1px solid #1a1a1a',color:'#fff',padding:'8px 12px',borderRadius:7,fontSize:12,fontFamily:"'Inter',sans-serif",outline:'none'}}/>
        </div>
        {/* Quick-add */}
        <form onSubmit={handleQuickAdd} style={{padding:'10px 12px',borderBottom:'1px solid #1a1a1a',flexShrink:0}}>
          <div style={{display:'flex',gap:6}}>
            <input value={quickAdd} onChange={e=>setQuickAdd(e.target.value)} placeholder="+ Adicionar nota..." style={{flex:1,background:'#0a0a0a',border:'1px dashed #1a1a1a',color:'#fff',padding:'8px 10px',borderRadius:7,fontSize:12,fontFamily:"'Inter',sans-serif",outline:'none'}}/>
            {quickAdd && <button type="submit" style={{background:'#e50914',border:'none',color:'#fff',cursor:'pointer',padding:'8px 12px',borderRadius:7,fontSize:11,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>+</button>}
          </div>
          {parsed && quickAdd && (
            <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:6}}>
              {parsed.dueDate && <span style={{background:'rgba(59,130,246,.15)',color:'#64b5f6',padding:'2px 7px',borderRadius:10,fontSize:10}}>📅 {parsed.dueDate}</span>}
              {parsed.priority < 4 && <span style={{background:`rgba(${parsed.priority===1?'229,9,20':parsed.priority===2?'249,115,22':'59,130,246'},.15)`,color:NOTE_PRIO_COLORS[parsed.priority],padding:'2px 7px',borderRadius:10,fontSize:10}}>🚩 P{parsed.priority}</span>}
              {parsed.tags.map(t=><span key={t} style={{background:'rgba(139,92,246,.15)',color:'#a78bfa',padding:'2px 7px',borderRadius:10,fontSize:10}}>#{t}</span>)}
            </div>
          )}
          <div style={{fontSize:9,color:'#2a2a2a',marginTop:4}}>Linguagem natural: data, prioridade p1–p4, tags #tag</div>
        </form>
        {/* List */}
        <div style={{flex:1,overflowY:'auto'}}>
          {filtered.length === 0 ? (
            <div style={{textAlign:'center',padding:'40px 16px',color:'#333'}}>
              <div style={{fontSize:28,marginBottom:8,opacity:.2}}>📝</div>
              <div style={{fontSize:13,fontWeight:700,color:'#555'}}>Nenhuma nota</div>
            </div>
          ) : filtered.map(note => {
            const cl = countChecklist(note.content);
            const linked = note.linkedItemId ? links.find(l=>l.id===note.linkedItemId) : null;
            const isSelected = selectedNoteId === note.id;
            return (
              <div key={note.id} onClick={()=>setSelectedNoteId(note.id)}
                style={{padding:'10px 14px',borderBottom:'1px solid #111',cursor:'pointer',background:isSelected?'rgba(229,9,20,.06)':'transparent',borderLeft:isSelected?'2px solid #e50914':'2px solid transparent',transition:'all .12s'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                  {note.priority < 4 && <span style={{color:NOTE_PRIO_COLORS[note.priority],fontSize:10,fontWeight:700}}>🚩</span>}
                  <span style={{fontSize:13,fontWeight:600,color:note.isCompleted?'#444':'#fff',textDecoration:note.isCompleted?'line-through':'none',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{note.title}</span>
                  <button onClick={e=>{e.stopPropagation();handleDeleteNote(note.id);}} style={{background:'none',border:'none',cursor:'pointer',color:'#222',fontSize:11,padding:'2px 4px',borderRadius:3,flexShrink:0}} onMouseEnter={e=>e.target.style.color='#f87171'} onMouseLeave={e=>e.target.style.color='#222'}>✕</button>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  {cl && <span style={{fontSize:10,color:'#555'}}>☑ {cl.done}/{cl.total}</span>}
                  {linked && <span style={{fontSize:10,color:'#3b82f6'}}>🎬 vinculada</span>}
                  {(note.tags||[]).map(t=><span key={t} style={{fontSize:10,color:'#6b21a8',background:'rgba(139,92,246,.1)',padding:'1px 5px',borderRadius:8}}>#{t}</span>)}
                  {note.dueDate && <span style={{fontSize:10,color:note.dueDate<today?'#f87171':note.dueDate===today?'#22c55e':'#555',marginLeft:'auto'}}>{note.dueDate}</span>}
                </div>
                {note.content && !cl && (
                  <div style={{fontSize:11,color:'#444',marginTop:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{note.content.slice(0,60)}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── EDITOR ──────────────────────────────────────────────────────── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {selectedNote ? (
          <>
            {/* Editor toolbar */}
            <div style={{padding:'10px 20px',borderBottom:'1px solid #1a1a1a',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
              <div style={{display:'flex',gap:5}}>
                {[1,2,3,4].map(p=>(
                  <button key={p} onClick={async()=>{await apiFetch(`/api/notes/${selectedNote.id}`,{method:'PATCH',body:JSON.stringify({priority:p})},jwt);onRefresh();}} style={{background:selectedNote.priority===p?NOTE_PRIO_COLORS[p]:'none',border:`1px solid ${NOTE_PRIO_COLORS[p]}`,color:selectedNote.priority===p?'#fff':NOTE_PRIO_COLORS[p],cursor:'pointer',padding:'3px 9px',borderRadius:5,fontSize:11,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>P{p}</button>
                ))}
              </div>
              <button onClick={insertTodo} style={{background:'none',border:'1px solid #1a1a1a',color:'#888',cursor:'pointer',padding:'3px 10px',borderRadius:5,fontSize:11,fontFamily:"'Inter',sans-serif"}}>☑ Todo</button>
              <button onClick={async()=>{await apiFetch(`/api/notes/${selectedNote.id}`,{method:'PATCH',body:JSON.stringify({isCompleted:!selectedNote.isCompleted})},jwt);onRefresh();}} style={{background:selectedNote.isCompleted?'rgba(34,197,94,.15)':'none',border:'1px solid #1a1a1a',color:selectedNote.isCompleted?'#22c55e':'#888',cursor:'pointer',padding:'3px 10px',borderRadius:5,fontSize:11,fontFamily:"'Inter',sans-serif"}}>
                {selectedNote.isCompleted ? '✓ Concluída' : 'Concluir'}
              </button>
              <div style={{marginLeft:'auto',display:'flex',gap:8}}>
                {saving && <span style={{fontSize:11,color:'#555'}}>Salvando...</span>}
                <button onClick={handleSaveNote} style={{background:'#e50914',border:'none',color:'#fff',cursor:'pointer',padding:'5px 14px',borderRadius:6,fontSize:12,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>Salvar</button>
              </div>
            </div>

            {/* Linked video block */}
            {selectedNote.linkedItemId && (() => {
              const item = links.find(l=>l.id===selectedNote.linkedItemId);
              return item ? (
                <div style={{margin:'12px 20px 0',background:'#141414',border:'1px solid #1a1a1a',borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
                  <div style={{fontSize:10,color:'#e50914',fontWeight:800,letterSpacing:.5}}>🎬 VÍDEO VINCULADO</div>
                  {item.thumbnail && <img src={item.thumbnail} style={{width:48,height:32,borderRadius:4,objectFit:'cover'}} alt=""/>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.title}</div>
                  </div>
                  <button onClick={()=>window.open(item.url,'_blank')} style={{background:'#e50914',border:'none',color:'#fff',cursor:'pointer',padding:'5px 12px',borderRadius:6,fontSize:11,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>Abrir</button>
                  <button onClick={async()=>{await apiFetch(`/api/notes/${selectedNote.id}`,{method:'PATCH',body:JSON.stringify({linkedItemId:null})},jwt);onRefresh();}} style={{background:'none',border:'1px solid #1a1a1a',color:'#555',cursor:'pointer',padding:'5px 10px',borderRadius:6,fontSize:11,fontFamily:"'Inter',sans-serif"}}>Desvincular</button>
                </div>
              ) : null;
            })()}

            {/* Title */}
            <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} onBlur={handleSaveNote}
              style={{margin:'16px 20px 0',background:'none',border:'none',color:'#fff',fontSize:22,fontWeight:900,fontFamily:"'Inter',sans-serif",outline:'none',letterSpacing:'-.5px'}}
              placeholder="Título da nota..."/>

            {/* Tags */}
            {(selectedNote.tags||[]).length > 0 && (
              <div style={{padding:'6px 20px',display:'flex',gap:6,flexWrap:'wrap'}}>
                {(selectedNote.tags||[]).map(t=><span key={t} style={{background:'rgba(139,92,246,.12)',color:'#a78bfa',padding:'2px 8px',borderRadius:10,fontSize:11}}>#{t}</span>)}
              </div>
            )}

            {/* Editor */}
            <textarea ref={editorRef} value={editContent} onChange={e=>setEditContent(e.target.value)} onBlur={handleSaveNote}
              style={{flex:1,margin:'12px 20px 20px',background:'#0a0a0a',border:'1px solid #111',color:'#ccc',fontSize:14,lineHeight:1.7,fontFamily:"ui-monospace,'JetBrains Mono',monospace",padding:'14px',borderRadius:8,resize:'none',outline:'none'}}
              placeholder={'Digite suas notas aqui...\n\n- [ ] Item de checklist\n- [x] Item concluído\n[12:34] Timestamp clicável\n\nUse - [ ] para criar checklists'}/>

            <div style={{padding:'8px 20px',fontSize:10,color:'#2a2a2a',borderTop:'1px solid #111',flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
              <span>Clique em ☑ Todo para inserir checkbox · <kbd style={{background:'#111',padding:'1px 5px',borderRadius:3}}>Ctrl+S</kbd> salva</span>
            </div>
          </>
        ) : (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:12,color:'#333'}}>
            <div style={{fontSize:52,opacity:.1}}>📝</div>
            <div style={{fontSize:15,fontWeight:700,color:'#555'}}>Selecione ou crie uma nota</div>
            <div style={{fontSize:12,color:'#333'}}>Use o quick-add ou clique em uma nota na lista</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ORGANIZAR MODAL ────────────────────────────────────────────────────────────
const TAG_COLORS_CYCLE = ["#FF6B6B","#FFB74D","#64B5F6","#81C784","#BA68C8","#F06292","#FF8A65","#90A4AE"];

function OrganizarModal({ cats, customTags, onClose, onDeleteCat, onCreateCat, onCreateTag, onDeleteTag }) {
  const [newCatName, setNewCatName] = useState("");
  const [newCatParent, setNewCatParent] = useState("");
  const [showCreateCat, setShowCreateCat] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS_CYCLE[customTags.length % TAG_COLORS_CYCLE.length]);
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [creatingCat, setCreatingCat] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null); // {id, name, hasSubs}
  const [dupTagMsg, setDupTagMsg] = useState("");
  const [confirmState, setConfirmState] = useState(null); // {message, onConfirm}
  const askConfirm = (message, onConfirm) => setConfirmState({message, onConfirm});

  // Show EVERY category — no filtering, no tree logic
  const existingIds = new Set(cats.map(c => c.id));
  const flatCats = cats.map(c => ({
    ...c,
    _depth: 0,
    _orphan: !!(c.parentId && !existingIds.has(c.parentId))
  }));

  async function handleCreateCat() {
    if (!newCatName.trim()) return;
    setCreatingCat(true);
    await onCreateCat(newCatName.trim(), newCatParent||null);
    setNewCatName(""); setNewCatParent(""); setShowCreateCat(false); setCreatingCat(false);
  }

  function handleCreateTag() {
    if (!newTagName.trim()) return;
    if (customTags.find(t => t.label.toLowerCase() === newTagName.trim().toLowerCase())) {
      setDupTagMsg("Já existe uma tag com esse nome."); return;
    }
    setDupTagMsg("");
    onCreateTag({ id:"t-"+Date.now(), label:newTagName.trim(), color:newTagColor, icon:"◈", count:0 });
    setNewTagName(""); setShowCreateTag(false);
    setNewTagColor(TAG_COLORS_CYCLE[(customTags.length+1) % TAG_COLORS_CYCLE.length]);
  }

  return (
    <>
    {confirmState && <ConfirmModal message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={()=>setConfirmState(null)}/>}
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{width:"min(1100px,96vw)",maxHeight:"92vh",overflowY:"auto",padding:28}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <h2 style={{fontSize:20,fontWeight:900,letterSpacing:"-.5px",marginBottom:4}}>Organizar</h2>
            <p style={{fontSize:12,color:"#555"}}>
              Categorias dizem <em style={{color:"#e50914",fontStyle:"normal",fontWeight:700}}>onde</em> mora. Tags dizem <em style={{color:"#3b82f6",fontStyle:"normal",fontWeight:700}}>como</em> é.
            </p>
          </div>
          <button className="modal-x" onClick={onClose}><X size={18}/></button>
        </div>

        {/* Dual pane */}
        <div style={{display:"flex",gap:16,minHeight:520}}>

          {/* ── CATEGORIES ─────────────────────────────────────────────── */}
          <div style={{flex:1,background:"#111",border:"1px solid #1a1a1a",borderRadius:10,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #1a1a1a",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <span style={{fontSize:13,fontWeight:800,display:"flex",alignItems:"center",gap:7}}>
                <span style={{color:"#e50914"}}>□</span> Categorias
                <span style={{color:"#555",fontWeight:400,fontSize:12}}>{cats.length}</span>
              </span>
              <button onClick={()=>setShowCreateCat(s=>!s)}
                style={{background:"#e50914",border:"none",color:"#fff",cursor:"pointer",padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:800,fontFamily:"'Inter',sans-serif"}}>
                {showCreateCat?"✕ Cancelar":"+ Nova"}
              </button>
            </div>

            {/* Inline create form */}
            {showCreateCat && (
              <div style={{padding:"12px 14px",borderBottom:"1px solid #1a1a1a",background:"#0d0d0d",flexShrink:0}}>
                <div style={{fontSize:9,fontWeight:800,textTransform:"uppercase",letterSpacing:".7px",color:"#e50914",marginBottom:8}}>NOVA CATEGORIA</div>
                <select value={newCatParent} onChange={e=>setNewCatParent(e.target.value)}
                  style={{width:"100%",background:"#111",border:"1px solid #1a1a1a",color:"#fff",padding:"8px 10px",borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:"none",marginBottom:8}}>
                  <option value="">Nenhuma (pasta raiz)</option>
                  {cats.filter(c=>!c.parentId||!existingIds.has(c.parentId)).map(c=>(
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div style={{display:"flex",gap:8}}>
                  <input value={newCatName} onChange={e=>setNewCatName(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&handleCreateCat()}
                    placeholder="Nome da categoria..."
                    autoFocus
                    style={{flex:1,background:"#111",border:"1px solid #1a1a1a",color:"#fff",padding:"9px 12px",borderRadius:7,fontSize:13,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
                  <button onClick={handleCreateCat} disabled={creatingCat||!newCatName.trim()}
                    style={{background:"#e50914",border:"none",color:"#fff",cursor:"pointer",padding:"9px 16px",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"'Inter',sans-serif",opacity:(creatingCat||!newCatName.trim())?0.4:1}}>
                    {creatingCat?"...":"Criar"}
                  </button>
                </div>
              </div>
            )}

            {/* Category list */}
            <div style={{flex:1,overflowY:"auto",padding:8}}>
              {flatCats.length===0?(
                <div style={{textAlign:"center",padding:"32px 16px",color:"#555"}}>
                  <div style={{fontSize:28,marginBottom:8,opacity:.2}}>□</div>
                  <div style={{fontSize:13,fontWeight:700,color:"#888",marginBottom:4}}>Nenhuma categoria</div>
                  <div style={{fontSize:11}}>Clique em "+ Nova" para criar.</div>
                </div>
              ):flatCats.map(cat=>{
                const indent = cat._depth * 18;
                const hasSubs = cats.some(c => c.parentId === cat.id);
                return (
                  <div key={cat.id} style={{marginBottom:3,marginLeft:indent}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:7,
                      background: cat._orphan ? "rgba(245,166,35,.06)" : "#0a0a0a",
                      border: cat._orphan ? "1px solid rgba(245,166,35,.2)" : "1px solid #1a1a1a"}}>
                      <span style={{fontSize:13}}>📁</span>
                      <span style={{flex:1,fontSize:13,fontWeight:600,color: cat._orphan ? "#f5a623" : "#fff"}}>{cat.name}</span>
                      {cat._orphan && <span style={{fontSize:9,color:"#f5a623",padding:"1px 6px",border:"1px solid rgba(245,166,35,.3)",borderRadius:4}}>órfã</span>}
                      <button
                        onClick={()=>askConfirm(`Excluir "${cat.name}"${hasSubs?" e suas subcategorias":""}?`, ()=>{ setConfirmState(null); onDeleteCat(cat.id); })}
                        style={{background:"none",border:"none",cursor:"pointer",color:"#333",fontSize:12,padding:"4px 8px",borderRadius:4,transition:"all .15s"}}
                        onMouseEnter={e=>e.currentTarget.style.color="#f87171"}
                        onMouseLeave={e=>e.currentTarget.style.color="#333"}>🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── TAGS ───────────────────────────────────────────────────── */}
          <div style={{flex:1,background:"#111",border:"1px solid #1a1a1a",borderRadius:10,overflow:"hidden",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid #1a1a1a",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
              <span style={{fontSize:13,fontWeight:800,display:"flex",alignItems:"center",gap:7}}>
                <span style={{color:"#e50914"}}>#</span> Tags
                <span style={{color:"#555",fontWeight:400,fontSize:12}}>{customTags.length}</span>
              </span>
              <button onClick={()=>setShowCreateTag(s=>!s)}
                style={{background:"#e50914",border:"none",color:"#fff",cursor:"pointer",padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:800,fontFamily:"'Inter',sans-serif"}}>
                {showCreateTag?"✕ Cancelar":"+ Nova"}
              </button>
            </div>

            {/* Inline tag create form */}
            {showCreateTag && (
              <div style={{padding:"12px 14px",borderBottom:"1px solid #1a1a1a",background:"#0d0d0d",flexShrink:0}}>
                <div style={{fontSize:9,fontWeight:800,textTransform:"uppercase",letterSpacing:".7px",color:"#e50914",marginBottom:8}}>NOVA TAG</div>
                {/* Color picker */}
                <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                  {TAG_COLORS_CYCLE.map(c=>(
                    <button key={c} onClick={()=>setNewTagColor(c)}
                      style={{width:24,height:24,borderRadius:"50%",background:c,border:`2px solid ${c===newTagColor?"#fff":"transparent"}`,cursor:"pointer",transition:"all .15s"}}/>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <input value={newTagName} onChange={e=>setNewTagName(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&handleCreateTag()}
                    placeholder="Nome da tag..."
                    autoFocus
                    style={{flex:1,background:"#111",border:`1px solid ${newTagColor}44`,color:"#fff",padding:"9px 12px",borderRadius:7,fontSize:13,fontFamily:"'Inter',sans-serif",outline:"none"}}/>
                  <button onClick={handleCreateTag} disabled={!newTagName.trim()}
                    style={{background:newTagColor,border:"none",color:"#fff",cursor:"pointer",padding:"9px 16px",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"'Inter',sans-serif",opacity:!newTagName.trim()?0.4:1}}>
                    Criar
                  </button>
                </div>
                {newTagName && (
                  <div style={{marginTop:8,display:"inline-flex",alignItems:"center",gap:6,padding:"4px 12px",borderRadius:20,border:`1.5px solid ${newTagColor}`,color:newTagColor,fontSize:11,fontWeight:700}}>
                    ◈ {newTagName}
                  </div>
                )}
              </div>
            )}

            {/* Tags list */}
            <div style={{flex:1,overflowY:"auto",padding:"10px 12px",display:"grid",gridTemplateColumns:"1fr",gap:6,alignContent:"start"}}>
              {customTags.length===0?(
                <div style={{gridColumn:"1/-1",textAlign:"center",padding:"32px 16px",color:"#555"}}>
                  <div style={{fontSize:28,marginBottom:8,opacity:.3}}>#</div>
                  <div style={{fontSize:13,fontWeight:700,color:"#888",marginBottom:4}}>Nenhuma tag ainda</div>
                  <div style={{fontSize:11,lineHeight:1.5}}>Tags classificam como o item é.<br/>Ex: Favorito, Urgente, Ver depois.</div>
                </div>
              ):customTags.map(tag=>(
                <div key={tag.id||tag.label}
                  style={{background:"#0f0f0f",borderRadius:8,padding:"12px 14px",display:"flex",alignItems:"center",gap:12,borderTop:"1px solid #1a1a1a",borderRight:"1px solid #1a1a1a",borderBottom:"1px solid #1a1a1a",borderLeft:`3px solid ${tag.color}`}}>
                  <span style={{color:tag.color,fontSize:18,flexShrink:0}}>{tag.icon||"◈"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:"#fff",whiteSpace:"normal",lineHeight:1.4,wordBreak:"break-word"}}>{tag.label}</div>
                    <div style={{fontSize:11,color:"#555",marginTop:2}}>{tag.count||0} itens</div>
                  </div>
                  <button onClick={()=>askConfirm(`Excluir tag "${tag.label}"?`, ()=>{ setConfirmState(null); onDeleteTag(tag.id||tag.label); })}
                    style={{background:"none",border:"none",cursor:"pointer",color:"#333",fontSize:12,padding:"2px 6px",borderRadius:3,transition:"color .15s"}}
                    onMouseEnter={e=>e.target.style.color="#f87171"} onMouseLeave={e=>e.target.style.color="#333"}>✕</button>
                </div>
              ))}
            </div>

            <div style={{padding:"8px 12px",borderTop:"1px solid #1a1a1a",fontSize:10,color:"#2a2a2a",display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:"#22c55e",display:"inline-block"}}/>
              {customTags.length} tag{customTags.length!==1?"s":""}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}


// ─── NOTES PAGE ─────────────────────────────────────────────────────────────────

// Simple NLP parser for quick-add

function renderNoteContent(content, onToggleCheck) {
  if (!content) return null;
  const lines = content.split('\n');
  let checkIdx = 0;
  return lines.map((line, i) => {
    const checkMatch = line.match(/^(\s*)-\s*\[([ x])\]\s*(.*)$/);
    if (checkMatch) {
      const checked = checkMatch[2] === 'x';
      const text = checkMatch[3];
      const idx = checkIdx++;
      return (
        <div key={i} className={`note-check-item${checked?' checked':''}`}
          onClick={()=>onToggleCheck && onToggleCheck(i)}>
          <span className="note-checkbox">{checked?'✓':''}</span>
          <span className="note-check-text">{text}</span>
        </div>
      );
    }
    if (line.startsWith('# ')) return <h2 key={i} className="note-h1">{line.slice(2)}</h2>;
    if (line.startsWith('## ')) return <h3 key={i} className="note-h2">{line.slice(3)}</h3>;
    if (line.startsWith('> ')) return <blockquote key={i} className="note-quote">{line.slice(2)}</blockquote>;
    if (line === '---' || line === '---') return <hr key={i} className="note-divider"/>;
    return line ? <p key={i} className="note-para">{line}</p> : <br key={i}/>;
  });
}

function countChecks(content) {
  const all = (content||'').match(/^.*-\s*\[[ x]\].*$/gm)||[];
  const done = (content||'').match(/^.*-\s*\[x\].*$/gm)||[];
  return { total: all.length, done: done.length };
}

const PRIORITY_COLORS = { 1:'#e50914', 2:'#ff8a00', 3:'#3b82f6', 4:'transparent' };
const PRIORITY_LABELS = { 1:'P1', 2:'P2', 3:'P3', 4:'' };


// ─── APP ROUTER (root component) ─────────────────────────────────────────────
export default function App() {
  const [page, setPage]               = useState(null);
  const [user, setUser]               = useState(null);
  const [migrationStatus, setMigStatus] = useState(null);
  const [migrationResult, setMigResult] = useState(null);
  const [appStats, setAppStats]         = useState({ cats:[], links:[] }); // shared stats
  const exportRef = useRef(null);
  const importRef = useRef(null);

  // On mount: check stored session
  useEffect(()=>{
    (async()=>{
      try {
        const r = await wlStorage.get("wl-auth-user");
        if (r?.value) {
          const u = JSON.parse(r.value);
          setUser(u);
          await loadStats(u?.id);
          setPage("app");
          // Re-sync extension token on page reload (with delay for service worker)
          setTimeout(() => syncWithExtension(u), 500);
          setTimeout(() => syncWithExtension(u), 3000);
        } else {
          setPage("landing");
        }
      } catch { setPage("landing"); }
    })();
  },[]);

  // ── Auto-migration on first login ──────────────────────────────────────────
  // Reads data from window.storage (saved when using the demo mode)
  // and sends to the backend via /api/migrate
  const runMigration = async (userData) => {
    if (userData.isDemo) return; // demo users don't migrate to backend
    if (!API_URL)        return; // no backend configured

    setMigStatus("scanning");

    try {
      // Scan all possible storage keys used by the app
      const userKey    = userData.id || "demo";
      const demoKeys   = ["demo", "demo-guest", "guest"];
      const keysToTry  = [userKey, ...demoKeys];

      let bestCats  = [];
      let bestLinks = [];

      // Try all possible user key variants to find existing data
      for (const key of keysToTry) {
        try {
          const rc = await wlStorage.get(`wl2-cats-${key}`);
          const rl = await wlStorage.get(`wl2-links-${key}`);
          if (rc?.value && rl?.value) {
            const cats  = JSON.parse(rc.value);
            const links = JSON.parse(rl.value);
            if (links.length > bestLinks.length) {
              bestCats = cats; bestLinks = links;
            }
          }
        } catch {}
      }

      if (bestLinks.length === 0 && bestCats.length === 0) {
        setMigStatus("skipped");
        setTimeout(()=>setMigStatus(null), 2000);
        return;
      }

      setMigStatus("migrating");

      const result = await apiFetch("/api/migrate", {
        method: "POST",
        body: JSON.stringify({ categories: bestCats, links: bestLinks })
      }, userData.jwtToken);

      setMigResult({
        links:      result.imported?.links      || 0,
        categories: result.imported?.categories || 0,
        skipped:    result.imported?.skipped    || 0,
      });
      setMigStatus(result.ok ? "done" : "error");
      setTimeout(()=>{ setMigStatus(null); setMigResult(null); }, 3500);

    } catch (err) {
      console.warn("Migration failed:", err.message);
      setMigStatus(null); // silent fail — data stays in storage
    }
  };

  // ── Load shared stats (for Settings page) ─────────────────────────────────
  const loadStats = async (uid) => {
    const userKey = uid || "demo";
    try {
      const rc = await wlStorage.get(`wl2-cats-${userKey}`);
      const rl = await wlStorage.get(`wl2-links-${userKey}`);
      const cats  = rc?.value ? JSON.parse(rc.value)  : [];
      const links = rl?.value ? JSON.parse(rl.value) : [];
      setAppStats({ cats, links });
    } catch {}
  };

  // ── Login handler ──────────────────────────────────────────────────────────
  // Send token to Chrome extension after login — with retry logic
  const syncWithExtension = (userData, attempt = 0) => {
    if (typeof chrome === "undefined" || !chrome?.runtime?.sendMessage) return;
    const token = userData.jwtToken || "";
    const user  = { name: userData.name, email: userData.email, avatar: userData.avatar, isDemo: userData.isDemo || false };
    try {
      chrome.runtime.sendMessage(
        "agpmepkbkjakjkabcmbkmklgmggbfghm",
        { type: "WL_LOGIN", token, user },
        (response) => {
          const err = chrome.runtime?.lastError;
          if (err && attempt < 4) {
            // Service worker might be asleep — retry with backoff
            setTimeout(() => syncWithExtension(userData, attempt + 1), 800 * (attempt + 1));
          }
        }
      );
    } catch(e) {
      if (attempt < 4) setTimeout(() => syncWithExtension(userData, attempt + 1), 800 * (attempt + 1));
    }
  };

  const handleLogin = async (userData) => {
    setUser(userData);
    try { await wlStorage.set("wl-auth-user", JSON.stringify(userData)); } catch{}
    // Sync token with Chrome extension
    syncWithExtension(userData);

    if (userData.isNew && !userData.isDemo) {
      // First login with real account → migrate local data before onboarding
      await runMigration(userData);
      setPage("onboarding");
    } else if (userData.isNew) {
      setPage("onboarding");
    } else {
      setPage("app");
    }
  };

  const handleLogout = async () => {
    try { await wlStorage.delete("wl-auth-user"); } catch{}
    // Tell extension to clear token
    try {
      if (typeof chrome !== "undefined" && chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage("agpmepkbkjakjkabcmbkmklgmggbfghm", { type: "WL_LOGOUT" });
      }
    } catch{}
    setUser(null);
    setPage("landing");
  };

  const handleOnboardingComplete = () => setPage("app");

  // ── Render ─────────────────────────────────────────────────────────────────
  // Loading screen
  if (page === null) return (
    <div style={{background:"#0a0a0a",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:28,fontWeight:900,color:"#e50914",fontFamily:"'Inter',sans-serif",textTransform:"uppercase",letterSpacing:-1,marginBottom:16}}>
          Watch<span style={{color:"#fff"}}>List</span>
        </div>
        <div className="skel" style={{width:200,height:3,margin:"0 auto"}}/>
      </div>
    </div>
  );

  return (
    <>
      {/* Migration overlay — aparece automaticamente durante migração */}
      {migrationStatus && (
        <MigrationModal status={migrationStatus} result={migrationResult}/>
      )}

      {page === "landing"    && <LandingPage onGetStarted={()=>setPage("login")}/>}
      {page === "login"      && <LoginPage onLogin={handleLogin} onBack={()=>setPage("landing")}/>}
      {page === "onboarding" && <OnboardingPage user={user} onComplete={handleOnboardingComplete}/>}
      {page === "settings"   && (
        <SettingsPage
          user={user} cats={appStats.cats} links={appStats.links}
          onBack={()=>setPage("app")}
          onLogout={handleLogout}
          onExport={()=>exportRef.current?.()}
          onImport={(e)=>importRef.current?.(e)}
        />
      )}
      {page === "app" && (
        <MainApp
          user={user}
          onSettings={async ()=>{ await loadStats(user?.id); setPage("settings"); }}
          onLogout={handleLogout}
          exportRef={exportRef}
          importRef={importRef}
          onStatsChange={setAppStats}
        />
      )}
    </>
  );
}
