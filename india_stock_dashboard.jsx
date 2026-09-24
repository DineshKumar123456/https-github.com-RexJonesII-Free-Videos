import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const STOCKS = [
  { sym: "RELIANCE", name: "Reliance Industries", sector: "Energy" },
  { sym: "TCS", name: "Tata Consultancy", sector: "IT" },
  { sym: "INFY", name: "Infosys", sector: "IT" },
  { sym: "HDFCBANK", name: "HDFC Bank", sector: "Banking" },
  { sym: "ICICIBANK", name: "ICICI Bank", sector: "Banking" },
  { sym: "SBIN", name: "State Bank of India", sector: "Banking" },
  { sym: "WIPRO", name: "Wipro", sector: "IT" },
  { sym: "LT", name: "Larsen & Toubro", sector: "Infra" },
  { sym: "BAJFINANCE", name: "Bajaj Finance", sector: "NBFC" },
  { sym: "HINDUNILVR", name: "HUL", sector: "FMCG" },
];

const INDICES = [
  { sym: "NSEI", label: "NIFTY 50" },
  { sym: "BSESN", label: "SENSEX" },
  { sym: "NSEBANK", label: "BANK NIFTY" },
];

const fmtPrice = (n) =>
  n != null ? "₹" + parseFloat(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

const fmtPct = (n) => {
  if (n == null) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
};

const fmtVol = (n) => {
  if (!n) return "—";
  if (n >= 1e7) return (n / 1e7).toFixed(2) + " Cr";
  if (n >= 1e5) return (n / 1e5).toFixed(2) + " L";
  return n.toLocaleString("en-IN");
};

const fmtMktCap = (n) => {
  if (!n) return "—";
  if (n >= 1e12) return "₹" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return "₹" + (n / 1e9).toFixed(2) + "B";
  return "₹" + (n / 1e7).toFixed(0) + "Cr";
};

const UP = "#00e676";
const DN = "#ff1744";
const ACCENT = "#00b4d8";
const BG = "#080c14";
const CARD = "#0d1420";
const BORDER = "#1a2234";

async function fetchWithProxy(url, useProxy) {
  const target = useProxy ? "https://corsproxy.io/?" + encodeURIComponent(url) : url;
  const r = await fetch(target);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0d1420", border: "1px solid #1a2234", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
      <div style={{ color: "#64748b", marginBottom: 2 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || ACCENT, fontFamily: "monospace" }}>
          {p.name === "price" ? fmtPrice(p.value) : fmtVol(p.value)}
        </div>
      ))}
    </div>
  );
};

const Sparkline = ({ data, positive }) => {
  if (!data || data.length < 2) return <div style={{ height: 28 }} />;
  return (
    <ResponsiveContainer width="100%" height={28}>
      <LineChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <Line type="monotone" dataKey="v" dot={false} strokeWidth={1.2} stroke={positive ? UP : DN} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default function App() {
  const [quotes, setQuotes] = useState({});
  const [selected, setSelected] = useState("RELIANCE");
  const [chartData, setChartData] = useState([]);
  const [countdown, setCountdown] = useState(15);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [useProxy, setUseProxy] = useState(false);
  const [proxyWarning, setProxyWarning] = useState(false);
  const [istTime, setIstTime] = useState("");
  const [loading, setLoading] = useState(true);
  const [sparklines, setSparklines] = useState({});
  const countRef = useRef(15);
  const timerRef = useRef(null);

  const fetchQuotes = useCallback(async (proxy = false) => {
    const syms = [...STOCKS.map((s) => s.sym + ".NS"), "^NSEI", "^BSESN", "^NSEBANK"].join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap,trailingPE,regularMarketVolume,shortName`;
    try {
      const data = await fetchWithProxy(url, proxy);
      const results = data?.quoteResponse?.result || [];
      const map = {};
      results.forEach((q) => {
        const key = q.symbol.replace(".NS", "").replace("^", "");
        map[key] = q;
      });
      setQuotes(map);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (e) {
      if (!proxy) {
        setUseProxy(true);
        setProxyWarning(true);
        await fetchQuotes(true);
      }
    }
  }, []);

  const fetchIntraday = useCallback(async (sym, proxy = false) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}.NS?interval=5m&range=1d`;
    try {
      const data = await fetchWithProxy(url, proxy);
      const chart = data?.chart?.result?.[0];
      if (!chart) return;
      const ts = chart.timestamp || [];
      const closes = chart.indicators?.quote?.[0]?.close || [];
      const vols = chart.indicators?.quote?.[0]?.volume || [];
      const formatted = ts.map((t, i) => ({
        time: new Date(t * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        price: closes[i] ? parseFloat(closes[i].toFixed(2)) : null,
        volume: vols[i] || 0,
      })).filter((d) => d.price != null);
      setChartData(formatted);
      const slines = {};
      STOCKS.forEach((s) => {
        if (s.sym === sym) slines[sym] = formatted.map((d) => ({ v: d.price }));
      });
      setSparklines((prev) => ({ ...prev, ...slines }));
    } catch (e) {
      if (!proxy) fetchIntraday(sym, true);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchQuotes(useProxy);
    await fetchIntraday(selected, useProxy);
  }, [fetchQuotes, fetchIntraday, selected, useProxy]);

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    fetchIntraday(selected, useProxy);
  }, [selected]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      countRef.current -= 1;
      setCountdown(countRef.current);
      if (countRef.current <= 0) {
        countRef.current = 15;
        setCountdown(15);
        refresh();
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => {
      const now = new Date();
      setIstTime(now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const selQ = quotes[selected];
  const selStock = STOCKS.find((s) => s.sym === selected);
  const isUp = selQ ? selQ.regularMarketChangePercent >= 0 : true;
  const basePrice = chartData.length ? chartData[0].price : null;

  const sorted = [...STOCKS].map((s) => ({ ...s, pct: quotes[s.sym]?.regularMarketChangePercent ?? 0 })).sort((a, b) => b.pct - a.pct);
  const gainers = sorted.slice(0, 5);
  const losers = [...sorted].reverse().slice(0, 5);

  return (
    <div style={{ background: BG, color: "#e2e8f0", fontFamily: "'DM Mono', 'Fira Code', monospace", minHeight: "100vh", display: "flex", flexDirection: "column", fontSize: 13 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Top bar */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 8px ${ACCENT}`, animation: "pulse 2s infinite" }} />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, color: ACCENT, letterSpacing: "0.04em" }}>MARKETPULSE INDIA</span>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {INDICES.map((idx) => {
            const q = quotes[idx.sym];
            const pct = q?.regularMarketChangePercent;
            const c = pct != null ? (pct >= 0 ? UP : DN) : "#64748b";
            return (
              <div key={idx.sym} style={{ background: "#111827", borderRadius: 6, padding: "4px 12px", border: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.06em" }}>{idx.label}</div>
                <div style={{ color: c, fontWeight: 500 }}>
                  {q ? q.regularMarketPrice?.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"}
                  <span style={{ fontSize: 11, marginLeft: 6 }}>{fmtPct(pct)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "#64748b" }}>
          <span>{istTime} IST</span>
          <span style={{ color: countdown <= 5 ? "#facc15" : "#64748b" }}>↻ {countdown}s</span>
          {proxyWarning && <span style={{ color: "#facc15", fontSize: 10 }}>⚠ Proxy</span>}
        </div>
      </div>

      {/* Main layout */}
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 190px", flex: 1, overflow: "hidden", minHeight: 560 }}>

        {/* Watchlist */}
        <div style={{ background: CARD, borderRight: `1px solid ${BORDER}`, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 12px 6px", fontSize: 10, color: "#475569", letterSpacing: "0.08em", borderBottom: `1px solid ${BORDER}` }}>WATCHLIST · NSE</div>
          {STOCKS.map((s) => {
            const q = quotes[s.sym];
            const pct = q?.regularMarketChangePercent;
            const c = pct != null ? (pct >= 0 ? UP : DN) : "#64748b";
            const isSelected = selected === s.sym;
            const spk = sparklines[s.sym];
            return (
              <div
                key={s.sym}
                onClick={() => setSelected(s.sym)}
                style={{
                  padding: "8px 12px",
                  borderBottom: `1px solid ${BORDER}`,
                  cursor: "pointer",
                  background: isSelected ? "#111827" : "transparent",
                  borderLeft: isSelected ? `2px solid ${ACCENT}` : "2px solid transparent",
                  transition: "background 0.15s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 500, color: isSelected ? ACCENT : "#cbd5e1", fontSize: 12 }}>{s.sym}</div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>{s.name}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: c, fontSize: 12, fontWeight: 500 }}>{q ? fmtPrice(q.regularMarketPrice) : loading ? "…" : "—"}</div>
                    <div style={{ color: c, fontSize: 10 }}>{fmtPct(pct)}</div>
                  </div>
                </div>
                {spk && <Sparkline data={spk} positive={pct >= 0} />}
              </div>
            );
          })}
        </div>

        {/* Center */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: BG }}>
          {/* Chart area */}
          <div style={{ flex: 1, padding: "14px 16px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: "#e2e8f0" }}>{selected}</span>
              <span style={{ fontSize: 22, fontWeight: 500, color: isUp ? UP : DN }}>
                {selQ ? fmtPrice(selQ.regularMarketPrice) : "—"}
              </span>
              <span style={{ fontSize: 13, color: isUp ? UP : DN }}>{fmtPct(selQ?.regularMarketChangePercent)}</span>
              <span style={{ fontSize: 11, color: "#475569" }}>{selStock?.name}</span>
              <span style={{ fontSize: 10, background: "#1a2234", color: "#64748b", borderRadius: 4, padding: "2px 6px" }}>{selStock?.sector}</span>
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="70%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} orientation="right" tickFormatter={(v) => "₹" + v.toLocaleString("en-IN")} width={72} />
                  {basePrice && <ReferenceLine y={basePrice} stroke="#1a2234" strokeDasharray="4 4" />}
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="price" name="price" dot={false} strokeWidth={1.5} stroke={isUp ? UP : DN} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 2, marginBottom: 2 }}>VOLUME</div>
              <ResponsiveContainer width="100%" height="25%">
                <BarChart data={chartData} margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
                  <XAxis hide />
                  <YAxis tick={{ fill: "#475569", fontSize: 9 }} axisLine={false} tickLine={false} orientation="right" tickFormatter={(v) => (v / 1e5).toFixed(0) + "L"} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="volume" name="volume" fill={isUp ? UP + "66" : DN + "66"} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Movers */}
          <div style={{ background: CARD, borderTop: `1px solid ${BORDER}`, padding: "10px 16px", flexShrink: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: UP, marginBottom: 6, letterSpacing: "0.06em" }}>▲ TOP GAINERS</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {gainers.map((s) => (
                    <div key={s.sym} onClick={() => setSelected(s.sym)} style={{ background: "#0a1f0f", border: "1px solid #1a3d20", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontSize: 11 }}>
                      <span style={{ color: "#86efac" }}>{s.sym}</span>
                      <span style={{ color: UP, marginLeft: 6 }}>{fmtPct(s.pct)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: DN, marginBottom: 6, letterSpacing: "0.06em" }}>▼ TOP LOSERS</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {losers.map((s) => (
                    <div key={s.sym} onClick={() => setSelected(s.sym)} style={{ background: "#1f0a0a", border: "1px solid #3d1a1a", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontSize: 11 }}>
                      <span style={{ color: "#fca5a5" }}>{s.sym}</span>
                      <span style={{ color: DN, marginLeft: 6 }}>{fmtPct(s.pct)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: "#080c14", borderTop: `1px solid ${BORDER}`, padding: "4px 16px", fontSize: 10, color: "#374151", display: "flex", justifyContent: "space-between" }}>
            <span>Data via Yahoo Finance · NSE</span>
            <span>{lastUpdated ? "Updated " + lastUpdated.toLocaleTimeString("en-IN") : "Fetching..."}</span>
          </div>
        </div>

        {/* Right stats */}
        <div style={{ background: CARD, borderLeft: `1px solid ${BORDER}`, overflowY: "auto", padding: "0 0 12px" }}>
          <div style={{ padding: "8px 12px 6px", fontSize: 10, color: "#475569", letterSpacing: "0.08em", borderBottom: `1px solid ${BORDER}` }}>STOCK DETAILS</div>
          {selQ ? (
            <div>
              {[
                ["Open", fmtPrice(selQ.regularMarketOpen)],
                ["High", fmtPrice(selQ.regularMarketDayHigh)],
                ["Low", fmtPrice(selQ.regularMarketDayLow)],
                ["LTP", fmtPrice(selQ.regularMarketPrice)],
                ["Change", fmtPct(selQ.regularMarketChangePercent), selQ.regularMarketChangePercent >= 0 ? UP : DN],
                ["52W High", fmtPrice(selQ.fiftyTwoWeekHigh)],
                ["52W Low", fmtPrice(selQ.fiftyTwoWeekLow)],
                ["Volume", fmtVol(selQ.regularMarketVolume)],
                ["Mkt Cap", fmtMktCap(selQ.marketCap)],
                ["P/E", selQ.trailingPE ? selQ.trailingPE.toFixed(1) : "—"],
              ].map(([label, val, color]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 12px", borderBottom: `1px solid ${BORDER}`, fontSize: 12 }}>
                  <span style={{ color: "#475569" }}>{label}</span>
                  <span style={{ color: color || "#e2e8f0", fontWeight: 500 }}>{val}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 12 }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{ height: 14, background: "#1a2234", borderRadius: 3, marginBottom: 10, width: i % 2 === 0 ? "80%" : "60%", opacity: 0.6 }} />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0d1420; }
        ::-webkit-scrollbar-thumb { background: #1a2234; border-radius: 2px; }
      `}</style>
    </div>
  );
}
