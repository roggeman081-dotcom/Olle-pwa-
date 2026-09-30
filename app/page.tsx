"use client";

import { useEffect, useRef, useState } from "react";

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

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
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
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0.08);
  const [assistantReply, setAssistantReply] = useState("");
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceContextRef = useRef<AudioContext | null>(null);
  const voiceFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceTranscriptRef = useRef("");
  const voiceActiveRef = useRef(false);

  useEffect(() => {
    void initializeDevice();
    return () => stopVoice();
  }, []);

  function stopVoice() {
    if (voiceFrameRef.current) cancelAnimationFrame(voiceFrameRef.current);
    voiceFrameRef.current = null;
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    void voiceContextRef.current?.close();
    voiceContextRef.current = null;
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    setVoiceActive(false);
    setVoiceLevel(0.08);
  }

  async function toggleVoice() {
    if (voiceActiveRef.current) {
      const finalText = voiceTranscriptRef.current.trim();
      stopVoice();
      if (finalText) await saveCaptureText(finalText);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("Ljudanalys stöds inte i den här webbläsaren.");

      const SpeechCtor =
        (window as typeof window & { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
        (window as typeof window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

      if (!SpeechCtor) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Tal-till-text stöds inte i den här webbläsaren ännu.");
      }

      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const recognition = new SpeechCtor();
      recognition.lang = "sv-SE";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognitionRef.current = recognition;
      voiceTranscriptRef.current = "";

      recognition.onresult = (event) => {
        let finalChunk = "";
        let interimChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const chunk = result[0]?.transcript ?? "";
          if (result.isFinal) finalChunk += chunk + " ";
          else interimChunk += chunk + " ";
        }
        if (finalChunk) voiceTranscriptRef.current += finalChunk;
        setText((voiceTranscriptRef.current + interimChunk).trim());
      };

      recognition.onerror = (event) => {
        if (event.error && event.error !== "no-speech" && event.error !== "aborted") {
          setMessage("Röstigenkänningen fick ett fel: " + event.error);
        }
      };

      recognition.onend = () => {
        if (voiceActiveRef.current && recognitionRef.current === recognition) {
          try { recognition.start(); } catch {}
        }
      };

      voiceStreamRef.current = stream;
      voiceContextRef.current = context;
      setVoiceActive(true);
      setMessage("");
      recognition.start();

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (const value of data) sum += value;
        const normalized = Math.min(1, Math.max(0.06, sum / data.length / 95));
        setVoiceLevel(normalized);
        voiceFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mikrofonen kunde inte startas.");
      stopVoice();
    }
  }

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

  function speakReply(reply: string) {
    if (!reply || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(reply);
      utterance.lang = "sv-SE";
      utterance.rate = 1.02;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }

  async function saveCaptureText(clean: string) {
    if (!clean.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const data = await callOlle("capture", { text: clean.trim() });
      setText("");
      voiceTranscriptRef.current = "";
      setMessage(data.message ?? "O.L.L.E.: sparat och sorterat.");
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "O.L.L.E. kunde inte spara.");
    } finally {
      setLoading(false);
    }
  }

  async function saveCapture() {
    await saveCaptureText(text);
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
            <div className="hub-logo">O.L.L.E. <span>ROGGE HUB</span></div>
            <div className="hub-tagline">PERSONAL INTELLIGENCE</div>
          </div>
        </header>

        <section className="hub-hero mindmap-hero" id="start">
          <div className="hub-hero-top">
            <div>
              <h1>Hej Rogge.</h1>
              <p>Prata med O.L.L.E. i mitten. Resten sorteras runt dig.</p>
            </div>
            <div className="hub-clock">
              <span>{new Date().toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}</span>
              <strong>{new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</strong>
            </div>
          </div>

          <div className="mindmap-stage" aria-label="O.L.L.E. mindmap">
            <svg className="mindmap-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d="M50 54 C38 50 26 42 12 36" />
              <path d="M50 54 C45 38 38 22 28 11" />
              <path d="M50 54 C55 38 62 22 72 11" />
              <path d="M50 54 C62 50 74 42 88 36" />
              <path d="M50 54 C42 68 34 80 22 88" />
              <path d="M50 54 C58 68 66 80 78 88" />
            </svg>

            <button className="mindmap-node node-today" type="button" onClick={() => document.getElementById("today")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              <span>Idag</span><strong>{radar.length}</strong>
            </button>
            <button className="mindmap-node node-follow" type="button" onClick={() => document.getElementById("follow")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              <span>Följ upp</span><strong>{ongoing.length}</strong>
            </button>
            <button className="mindmap-node node-family" type="button" onClick={() => document.getElementById("family")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              <span>Familj</span><strong>{relations.length}</strong>
            </button>
            <button className="mindmap-node node-projects" type="button" onClick={() => document.getElementById("projects")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              <span>Hem & projekt</span><strong>{projects.length}</strong>
            </button>
            <button className="mindmap-node node-latest" type="button" onClick={() => document.getElementById("more")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              <span>Senaste</span><strong>{items.length}</strong>
            </button>
            <button className="mindmap-node node-dots" type="button" onClick={() => document.getElementById("olle")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
              <span>Dots</span><strong>•••</strong>
            </button>

            <button className={`mindmap-olle ${voiceActive ? "is-listening" : ""}`} type="button" onClick={toggleVoice}>
              <span className="olle-voice-orb" aria-hidden="true">
                <span className="voice-ring voice-ring-one" />
                <span className="voice-ring voice-ring-two" />
                <span className="voice-bars">
                  {[0.72, 1, 0.82, 1.16, 0.9].map((factor, index) => (
                    <i key={index} style={{ height: `${Math.max(6, voiceLevel * 38 * factor)}px` }} />
                  ))}
                </span>
              </span>
              <span className="mindmap-olle-copy">
                <strong>{voiceActive ? "Jag lyssnar…" : "Prata med O.L.L.E."}</strong>
                <small>{voiceActive ? "Tryck igen när du är klar." : "Jag fångar, förstår och sorterar."}</small>
              </span>
            </button>

            <div className={`mindmap-live-text ${voiceActive ? "is-live" : ""}`}>
              {voiceActive ? (text || "Jag lyssnar…") : (assistantReply || "Tryck på O.L.L.E. och börja prata")}
            </div>
          </div>
        </section>

        <section className="hub-grid hub-grid-main">
          <article className="hub-card hub-card-today" id="today">
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

          <article className="hub-card hub-card-follow" id="follow">
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

          <article className="hub-card hub-card-family" id="family">
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
          <article className="hub-card brain-card" id="olle">
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

          <article className="hub-card hub-card-projects" id="projects">
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

        <section className="hub-card hub-latest" id="more">
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
          <button type="button" onClick={() => document.getElementById("start")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            <span>⌂</span><small>Start</small>
          </button>
          <button type="button" onClick={() => document.getElementById("today")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <span>▣</span><small>Idag</small>
          </button>
          <button className="hub-nav-olle" type="button" onClick={() => {
            document.getElementById("olle")?.scrollIntoView({ behavior: "smooth", block: "center" });
            window.setTimeout(() => document.getElementById("brainDump")?.focus(), 420);
          }}>
            <span>●</span><small>O.L.L.E.</small>
          </button>
          <button type="button" onClick={() => document.getElementById("family")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <span>◉</span><small>Familj</small>
          </button>
          <button type="button" onClick={() => document.getElementById("more")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <span>•••</span><small>Mer</small>
          </button>
        </nav>
      </div>
    </main>
  );
}
