import React, { useState, useEffect, useMemo } from "react";
import { RefreshCw, ChevronDown, Check, X, Minus, Filter, TrendingDown, Info, ExternalLink } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// =============================================================================
// Retro Handheld Value Tracker — frontend
// Reads the Firecrawl-backed API (VITE_API_URL or localhost:8787).
//   GET /api/devices      -> ranked devices + 2 buy links + latest avg price
//   GET /api/history/:id  -> daily averaged price series (sum of 2 sources / 2)
// Falls back to a small baked snapshot if the API is unreachable.
// Requires: lucide-react, recharts.
// =============================================================================

// Default to same-origin (relative /api): works when the backend serves this
// build in production, and via the Vite dev proxy in development. Override with
// VITE_API_URL only if the API runs on a different host.
const API = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL) || "";
const SYSTEMS = ["NES","SNES","Genesis","GB/GBC","GBA","PS1","NDS","N64","Dreamcast","PSP","Saturn","GameCube","PS2","Wii","3DS","Switch"];
const TIER_COLOR = { Budget: "#22c55e", Mid: "#eab308", High: "#a855f7" };
const fmt = (n, d = 1) => Number(n).toFixed(d);

// minimal baked fallback (full data lives in the backend)
const FALLBACK = { systems: SYSTEMS, updated: null, devices: [] };

export default function App() {
  const [data, setData] = useState(FALLBACK);
  const [histCache, setHistCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [sort, setSort] = useState("value");
  const [maxPrice, setMaxPrice] = useState(450);
  const [mustPlay, setMustPlay] = useState([]);
  const [tierF, setTierF] = useState("All");
  const [trackedOnly, setTrackedOnly] = useState(false);
  const [open, setOpen] = useState(null);
  const [showInfo, setShowInfo] = useState(false);

  async function loadDevices() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${API}/api/devices`);
      if (!r.ok) throw new Error("api");
      setData(await r.json());
    } catch {
      setErr(`Can't reach the tracker API${API ? ` at ${API}` : ""}. Start the backend (npm start) or set VITE_API_URL.`);
    } finally { setLoading(false); }
  }

  async function refreshNow() {
    setLoading(true);
    try { await fetch(`${API}/api/refresh`, { method: "POST" }); await loadDevices(); setHistCache({}); }
    catch { setErr("Refresh failed — is the backend running?"); }
    finally { setLoading(false); }
  }

  async function loadHistory(id) {
    if (histCache[id]) return;
    try {
      const r = await fetch(`${API}/api/history/${id}`);
      if (!r.ok) throw new Error("history");
      const j = await r.json();
      setHistCache(c => ({ ...c, [id]: Array.isArray(j.history) ? j.history : [] }));
    } catch { setHistCache(c => ({ ...c, [id]: [] })); }
  }

  useEffect(() => { loadDevices(); }, []); // re-pulls on every page open

  const rows = useMemo(() => {
    let r = [...data.devices];
    r = r.filter(x => x.price <= maxPrice);
    if (tierF !== "All") r = r.filter(x => x.tier === tierF);
    if (trackedOnly) r = r.filter(x => x.tracked);
    if (mustPlay.length) r = r.filter(x => mustPlay.every(s => x.emu[s] === 2));
    r.sort((a, b) =>
      sort === "value" ? b.value - a.value :
      sort === "price" ? a.price - b.price :
      sort === "score" ? b.composite - a.composite :
      a.name.localeCompare(b.name));
    return r;
  }, [data, sort, maxPrice, mustPlay, tierF, trackedOnly]);

  const toggleSys = (s) => setMustPlay(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const toggleOpen = (id) => { const n = open === id ? null : id; setOpen(n); if (n) loadHistory(n); };
  const cellColor = (v) => v === 2 ? "#16a34a" : v === 1 ? "#ca8a04" : "#dc2626";
  const cellBg = (v) => v === 2 ? "#dcfce7" : v === 1 ? "#fef9c3" : "#fee2e2";

  return (
    <div style={{ minHeight: "100vh", background: "#0f1115", color: "#e7e9ee", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 16px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>Retro Handheld Value Tracker</h1>
            <p style={{ margin: "4px 0 0", color: "#8b909c", fontSize: 13 }}>
              {data.devices.length} handhelds · averaged across tracked retailers daily · performance-per-dollar
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <button onClick={refreshNow} disabled={loading}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: loading ? "#1f2530" : "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontWeight: 600, fontSize: 13, cursor: loading ? "default" : "pointer" }}>
              <RefreshCw size={15} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              {loading ? "Scraping…" : "Refresh now"}
            </button>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
              {data.updated ? `Prices as of ${data.updated}` : "—"}
            </div>
          </div>
        </div>

        {err && <div style={{ marginTop: 12, background: "#3a2a12", border: "1px solid #6b4f1a", color: "#fbbf24", padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>{err}</div>}

        <div style={{ marginTop: 16, background: "#161a22", border: "1px solid #232a36", borderRadius: 14, padding: 14 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#9aa0ac" }}>Sort
              <select value={sort} onChange={e => setSort(e.target.value)} style={selStyle}>
                <option value="value">Best value ($/perf)</option>
                <option value="price">Cheapest first</option>
                <option value="score">Raw performance</option>
                <option value="name">Name</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "#9aa0ac" }}>Tier
              <select value={tierF} onChange={e => setTierF(e.target.value)} style={selStyle}>
                <option>All</option><option>Budget</option><option>Mid</option><option>High</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "#9aa0ac", display: "flex", flexDirection: "column", gap: 4 }}>
              Max price ${maxPrice}
              <input type="range" min="40" max="450" value={maxPrice} onChange={e => setMaxPrice(+e.target.value)} style={{ width: 150 }} />
            </label>
            <label style={{ fontSize: 12, color: "#9aa0ac", display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
              <input type="checkbox" checked={trackedOnly} onChange={e => setTrackedOnly(e.target.checked)} /> My tracked 7
            </label>
            <button onClick={() => setShowInfo(s => !s)} style={{ marginLeft: "auto", marginTop: 8, background: "none", border: "1px solid #2c3340", color: "#9aa0ac", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}>
              <Info size={13} /> How scoring works
            </button>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#9aa0ac", marginRight: 4, display: "inline-flex", alignItems: "center", gap: 4 }}><Filter size={12} /> Must fully play:</span>
            {SYSTEMS.map(s => (
              <button key={s} onClick={() => toggleSys(s)}
                style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, cursor: "pointer", border: "1px solid", borderColor: mustPlay.includes(s) ? "#16a34a" : "#2c3340", background: mustPlay.includes(s) ? "#14331f" : "transparent", color: mustPlay.includes(s) ? "#4ade80" : "#9aa0ac" }}>{s}</button>
            ))}
          </div>
          {showInfo && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#9aa0ac", lineHeight: 1.6, borderTop: "1px solid #232a36", paddingTop: 10 }}>
              Price = the average of the tracked retail sources (brand store, MechDIY, LitNXT, GoGameGeek, Amazon via Keepa), scraped once a day, with Amazon auto-vetted for a legitimate listing from a reputable seller. Each of the 16 systems is a "test": full speed = 2, playable = 1, chokes = 0. <b style={{color:"#cbd0da"}}>Emulation score</b> = total ÷ 32 × 100, averaged with the normalized HandheldRank index where available to form the <b style={{color:"#cbd0da"}}>Composite</b>. <b style={{color:"#cbd0da"}}>Value</b> = composite ÷ price × 10. Expand any device for its daily price chart and both buy links.
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 11, color: "#9aa0ac", flexWrap: "wrap" }}>
          <Lg c="#16a34a" t="Full speed" /><Lg c="#ca8a04" t="Playable (tweaks)" /><Lg c="#dc2626" t="Chokes / unplayable" />
        </div>

        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((d, i) => {
            const isOpen = open === d.id;
            const deal = (d.msrp - d.price) / d.msrp;
            const hist = histCache[d.id] || [];
            return (
              <div key={d.id} style={{ background: "#161a22", border: "1px solid #232a36", borderRadius: 14, overflow: "hidden" }}>
                <div onClick={() => toggleOpen(d.id)} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto", gap: 12, padding: "12px 14px", cursor: "pointer", alignItems: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: i < 3 ? "#fbbf24" : "#4b5160", textAlign: "center" }}>{i + 1}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{d.name}</span>
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: TIER_COLOR[d.tier] + "22", color: TIER_COLOR[d.tier], fontWeight: 600 }}>{d.tier}</span>
                      {d.tracked && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "#1e3a5f", color: "#7dd3fc", fontWeight: 600 }}>tracked</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#8b909c", marginTop: 3 }}>
                      {d.chip} · {d.ram} · {d.screen}{d.aspect ? ` · ${d.aspect}` : ""}
                    </div>
                    <div style={{ display: "flex", gap: 2, marginTop: 7, flexWrap: "wrap" }}>
                      {SYSTEMS.map(s => (
                        <div key={s} title={`${s}: ${d.emu[s] === 2 ? "full" : d.emu[s] === 1 ? "playable" : "chokes"}`}
                          style={{ width: 16, height: 16, borderRadius: 3, background: cellColor(d.emu[s]) }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#4ade80", lineHeight: 1 }}>{fmt(d.value, 2)}</div>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>value</div>
                    <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700 }}>${fmt(d.price, 0)}</div>
                    {deal > 0.04 && <div style={{ fontSize: 10, color: "#f87171", display: "inline-flex", alignItems: "center", gap: 2, justifyContent: "flex-end" }}><TrendingDown size={10} />{Math.round(deal * 100)}% off</div>}
                    <ChevronDown size={15} style={{ color: "#4b5160", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s", marginTop: 2 }} />
                  </div>
                </div>
                {isOpen && (
                  <div style={{ borderTop: "1px solid #232a36", padding: "14px 16px", background: "#12151c" }}>
                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12 }}>
                      <Stat label="Composite" v={fmt(d.composite) + " / 100"} />
                      <Stat label="Emulation score" v={fmt(d.emu100) + " / 100"} />
                      <Stat label="HandheldRank" v={d.hr != null ? d.hr : "—"} />
                      <Stat label="Screen" v={[d.screenSize, d.resolution, d.aspect].filter(Boolean).join(" · ") || "—"} />
                      <Stat label="Form / OS" v={`${d.form} · ${d.os}`} />
                      <Stat label="MSRP" v={"$" + d.msrp} />
                    </div>

                    {/* Buy links — composite of 2 sources */}
                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(d.sources || []).map((s, k) => (
                        <a key={k} href={s.buyUrl} target="_blank" rel="noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", background: "#1b2230", border: "1px solid #2c3340", borderRadius: 10, padding: "8px 12px", color: "#cbd0da", fontSize: 13, fontWeight: 600 }}>
                          <span>{s.store}</span>
                          <span style={{ color: s.price ? "#4ade80" : "#6b7280" }}>{s.price ? `$${s.price}` : "view"}</span>
                          <ExternalLink size={13} style={{ color: "#6b7280" }} />
                        </a>
                      ))}
                      <span style={{ alignSelf: "center", fontSize: 12, color: "#6b7280" }}>→ averaged to <b style={{ color: "#cbd0da" }}>${d.price}</b></span>
                    </div>

                    {/* Price-over-time chart of the daily average */}
                    <div style={{ marginTop: 14, height: 200 }}>
                      {hist.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={hist} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                            <CartesianGrid stroke="#232a36" vertical={false} />
                            <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={t => t.slice(5)} minTickGap={24} />
                            <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} domain={["auto", "auto"]} width={44} tickFormatter={v => "$" + v} />
                            <Tooltip contentStyle={{ background: "#0f1115", border: "1px solid #2c3340", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#9aa0ac" }} formatter={(v, n) => ["$" + v, n === "avg" ? "Avg" : n]} />
                            {(d.sources || []).map((s, k) => (
                              <Line key={k} type="monotone" dataKey={(row) => row.sources?.[k]?.price} name={s.store} stroke="#3b4654" strokeWidth={1} dot={false} strokeDasharray="3 3" connectNulls />
                            ))}
                            <Line type="monotone" dataKey="avg" name="avg" stroke="#4ade80" strokeWidth={2.5} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ color: "#6b7280", fontSize: 12, padding: 20, textAlign: "center" }}>
                          {histCache[d.id] ? "Not enough history yet — the chart fills in one point per day." : "Loading price history…"}
                        </div>
                      )}
                    </div>

                    {/* System matrix */}
                    <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(90px,1fr))", gap: 6 }}>
                      {SYSTEMS.map(s => (
                        <div key={s} style={{ background: cellBg(d.emu[s]), color: cellColor(d.emu[s]), borderRadius: 8, padding: "6px 8px", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          {s}{d.emu[s] === 2 ? <Check size={13} /> : d.emu[s] === 1 ? <Minus size={13} /> : <X size={13} />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!rows.length && <div style={{ textAlign: "center", color: "#6b7280", padding: 40, fontSize: 14 }}>{loading ? "Loading…" : "No devices match these filters."}</div>}
        </div>

        <p style={{ marginTop: 24, fontSize: 11, color: "#5b616d", lineHeight: 1.6 }}>
          Prices are a daily average of the tracked retailers (Firecrawl) with Amazon via the Keepa API (auto-vetted listing). Emulation ceilings are cross-source consensus (Retro Game Corps, Retro Handhelds, DROIX, GBAtemp, r/SBCGaming); chip benchmarks from nanoreview (AnTuTu). Verify before buying.
        </p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} select option{background:#161a22}`}</style>
    </div>
  );
}

const selStyle = { display: "block", marginTop: 4, background: "#0f1115", color: "#e7e9ee", border: "1px solid #2c3340", borderRadius: 8, padding: "6px 8px", fontSize: 13 };
const Lg = ({ c, t }) => <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />{t}</span>;
const Stat = ({ label, v }) => <div><div style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div><div style={{ color: "#cbd0da", fontWeight: 600, marginTop: 2 }}>{v}</div></div>;
