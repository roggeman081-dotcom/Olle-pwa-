"use client";

import { useEffect, useState } from "react";

type CaptureItem = {
  id: string;
  raw_text: string;
  status: string;
  detected_type?: string | null;
  person_hint?: string | null;
  created_at: string;
};

type BriefingItem = {
  id: string;
  title: string;
  content?: string | null;
  category: string;
  priority: number;
  briefing_date: string;
  is_done: boolean;
};

type OngoingItem = {
  id: string;
  title: string;
  status: string;
  follow_up_at?: string | null;
  due_at?: string | null;
};

type ProjectItem = {
  id: string;
  title: string;
  status: string;
  next_step?: string | null;
  due_at?: string | null;
  updated_at: string;
};

type RelationPerson = { name: string; relation?: string | null };

type RelationMemory = {
  id: string;
  title?: string | null;
  content: string;
  created_at: string;
  people?: RelationPerson | RelationPerson[] | null;
};

function relationPerson(item: RelationMemory): RelationPerson | null {
  if (Array.isArray(item.people)) return item.people[0] ?? null;
  return item.people ?? null;
}

const OLLE_API = "https://hpekajbndztytppominl.supabase.co/functions/v1/olle-mobile";
const DEVICE_KEY = "olle_device_token_v1";

export default function Home() {
  const [activated, setActivated] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [radar, setRadar] = useState<BriefingItem[]>([]);
  const [ongoing, setOngoing] = useState<OngoingItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [relations, setRelations] = useState<RelationMemory[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void initializeDevice();
  }, []);

  async function callOlle(action: string, payload: Record<string, unknown> = {}, tokenOverride?: string) {
    const token = tokenOverride ?? window.localStorage.getItem(DEVICE_KEY) ?? "";
    const response = await fetch(OLLE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "X-Olle-Device": token } : {}) },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "O.L.L.E. svarade med ett fel.");
    return data;
  }

  async function initializeDevice() {
    setMessage("");
    let deviceToken = window.localStorage.getItem(DEVICE_KEY);
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const claimToken = params.get("activate");

    if (!deviceToken && claimToken) {
      try {
        const data = await callOlle("claim", { claimToken, label: "Rogges iPhone" }, "");
        deviceToken = String(data.deviceToken);
        window.localStorage.setItem(DEVICE_KEY, deviceToken);
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch (error) {
        setActivated(false);
        setMessage(error instanceof Error ? error.message : "Aktiveringen misslyckades.");
        return;
      }
    }

    if (!deviceToken) {
      setActivated(false);
      setMessage("Den här enheten är inte aktiverad ännu.");
      return;
    }

    setActivated(true);
    await loadDashboard(deviceToken);
  }

  async function loadDashboard(tokenOverride?: string) {
    try {
      const data = await callOlle("dashboard", {}, tokenOverride);
      setItems((data.items ?? []) as CaptureItem[]);
      setRadar((data.radar ?? []) as BriefingItem[]);
      setOngoing((data.ongoing ?? []) as OngoingItem[]);
      setProjects((data.projects ?? []) as ProjectItem[]);
      const relationRows = (data.relations ?? []) as RelationMemory[];
      setRelations(relationRows.filter((row) => {
        const rel = (relationPerson(row)?.relation ?? "").toLocaleLowerCase("sv-SE");
        return /(fru|man|partner|son|dotter|barn|familj|vän|kompis|mamma|pappa|bror|syster)/.test(rel);
      }).slice(0, 6));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunde inte ladda O.L.L.E.");
    }
  }

  async function saveCapture() {
    const clean = text.trim();
    if (!clean) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await callOlle("capture", { text: clean });
      setText("");
      setMessage(data.message ?? "O.L.L.E.: sparat.");
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "O.L.L.E. kunde inte spara.");
    } finally {
      setLoading(false);
    }
  }

  async function markRadarDone(id: string) {
    try {
      await callOlle("radarDone", { id });
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunde inte markera som klar.");
    }
  }


  if (activated === null) {
    return <main className="shell"><div className="container"><header className="header"><div className="brand">O.L.L.E.</div><div className="status"><span className="dot" />Startar</div></header><section className="card"><p className="message">Startar O.L.L.E.…</p></section></div></main>;
  }

  if (!activated) {
    return <main className="shell"><div className="container"><header className="header"><div className="brand">O.L.L.E.</div><div className="status"><span className="dot" />Skyddad</div></header><section className="card"><h1 style={{ marginTop: 0 }}>Aktivera den här iPhonen</h1><p className="message">{message || "Öppna din privata O.L.L.E.-aktiveringslänk på den här iPhonen."}</p></section></div></main>;
  }

  return (
    <main className="shell hub-shell">
      <div className="hub-app">
        <header className="hub-header">
          <div>
            <div className="hub-logo">ROGGE <span>HUB</span></div>
            <div className="hub-tagline">DITT LIV — EN PLAN</div>
          </div>
        </header>

        <section className="hub-hero">
          <div className="hub-hero-top">
            <div>
              <h1>Hej Roger!</h1>
              <p>Här är din dag. Jag håller koll på det som är viktigt.</p>
            </div>
            <div className="hub-clock">
              <span>{new Date().toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}</span>
              <strong>{new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</strong>
            </div>
          </div>

          <button className="olle-call" type="button" onClick={() => document.getElementById("brainDump")?.focus()}>
            <span className="olle-mic">●</span>
            <span className="olle-call-copy">
              <strong>Prata med O.L.L.E.</strong>
              <small>Säg vad du tänker — jag förstår, sorterar och följer upp.</small>
            </span>
            <span className="olle-arrow">→</span>
          </button>
        </section>

        <section className="hub-grid hub-grid-main">
          <article className="hub-card hub-card-today">
            <div className="hub-card-title">
              <div>
                <span className="hub-icon blue">▣</span>
                <h2>Idag</h2>
              </div>
              <span className="hub-count">{radar.length}</span>
            </div>
            <div className="hub-card-body">
              {radar.length === 0 ? (
                <p className="hub-empty">Inget akut på radarn.</p>
              ) : (
                radar.slice(0,4).map((item) => (
                  <div className="hub-row" key={item.id}>
                    <button className="hub-check blue-ring" aria-label="Markera klar" onClick={() => markRadarDone(item.id)} />
                    <div>
                      <strong>{item.title}</strong>
                      {item.content && item.content !== item.title && <span>{item.content}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="hub-card hub-card-follow">
            <div className="hub-card-title">
              <div>
                <span className="hub-icon amber">✓</span>
                <h2>Följ upp</h2>
              </div>
              <span className="hub-count">{ongoing.length}</span>
            </div>
            <div className="hub-card-body">
              {ongoing.length === 0 ? (
                <p className="hub-empty">Inget som väntar på dig.</p>
              ) : (
                ongoing.slice(0,4).map((item) => (
                  <div className="hub-row" key={item.id}>
                    <span className="hub-check amber-ring" />
                    <div>
                      <strong>{item.title}</strong>
                      {(item.follow_up_at || item.due_at) && (
                        <span>
                          {item.follow_up_at
                            ? `Följ upp ${new Date(item.follow_up_at).toLocaleDateString("sv-SE")}`
                            : `Senast ${new Date(item.due_at as string).toLocaleDateString("sv-SE")}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="hub-card hub-card-family">
            <div className="hub-card-title">
              <div>
                <span className="hub-icon green">◉</span>
                <h2>Familj</h2>
              </div>
              <span className="hub-count">{relations.length}</span>
            </div>
            <div className="hub-card-body">
              {relations.length === 0 ? (
                <p className="hub-empty">O.L.L.E. bygger relationsminnet medan du använder Hubben.</p>
              ) : (
                relations.slice(0,4).map((item) => (
                  <div className="hub-person" key={item.id}>
                    <div className="hub-avatar">{relationPerson(item)?.name?.slice(0,1) ?? "?"}</div>
                    <div>
                      <strong>{relationPerson(item)?.name ?? "Person"}</strong>
                      <span>{item.content}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="hub-grid hub-grid-secondary">
          <article className="hub-card brain-card">
            <div className="hub-card-title">
              <div>
                <span className="hub-icon violet">◌</span>
                <h2>Hjärndump</h2>
              </div>
              <span className="hub-mini">O.L.L.E. sorterar</span>
            </div>
            <textarea
              id="brainDump"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Säg eller skriv vad som helst..."
            />
            <button className="hub-send" onClick={saveCapture} disabled={loading || !text.trim()}>
              {loading ? "O.L.L.E. jobbar…" : "Skicka till O.L.L.E."}
              <span>→</span>
            </button>
            {message && <div className="message success">{message}</div>}
          </article>

          <article className="hub-card hub-card-projects">
            <div className="hub-card-title">
              <div>
                <span className="hub-icon violet">⌂</span>
                <h2>Hem & projekt</h2>
              </div>
              <span className="hub-count">{projects.length}</span>
            </div>
            <div className="hub-card-body">
              {projects.length === 0 ? (
                <p className="hub-empty">Inga små projekt ännu.</p>
              ) : (
                projects.slice(0,5).map((project) => (
                  <div className="hub-row" key={project.id}>
                    <span className="hub-check violet-ring" />
                    <div>
                      <strong>{project.title}</strong>
                      {project.next_step && <span>{project.next_step}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="hub-card hub-latest">
          <div className="hub-card-title">
            <div>
              <span className="hub-icon blue">•••</span>
              <h2>Senaste</h2>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="hub-empty">Inget fångat ännu.</p>
          ) : (
            <div className="hub-latest-list">
              {items.slice(0,5).map((item) => (
                <div className="hub-latest-item" key={item.id}>
                  <strong>{item.raw_text}</strong>
                  <span>{new Date(item.created_at).toLocaleString("sv-SE")}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <nav className="hub-bottom-nav" aria-label="Snabbnavigation">
          <button><span>⌂</span><small>Start</small></button>
          <button><span>▣</span><small>Idag</small></button>
          <button className="hub-nav-olle" onClick={() => document.getElementById("brainDump")?.focus()}>
            <span>●</span><small>O.L.L.E.</small>
          </button>
          <button><span>◉</span><small>Familj</small></button>
          <button><span>•••</span><small>Mer</small></button>
        </nav>
      </div>
    </main>
  );
}
