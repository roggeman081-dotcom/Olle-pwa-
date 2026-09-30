"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { interpretCapture, PersonRef, ProjectRef } from "@/lib/jarvis/interpret";

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

function localDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [text, setText] = useState("");
  const [items, setItems] = useState<CaptureItem[]>([]);
  const [radar, setRadar] = useState<BriefingItem[]>([]);
  const [ongoing, setOngoing] = useState<OngoingItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [relations, setRelations] = useState<RelationMemory[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setRadar([]);
      setOngoing([]);
      setProjects([]);
      setRelations([]);
      return;
    }
    loadDashboard();
  }, [userId]);

  async function loadDashboard() {
    const today = localDateString();

    const [capturesResult, radarResult, ongoingResult, projectsResult, relationsResult] = await Promise.all([
      supabase
        .from("capture_inbox")
        .select("id, raw_text, status, detected_type, person_hint, created_at")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("briefing_items")
        .select("id, title, content, category, priority, briefing_date, is_done")
        .eq("briefing_date", today)
        .eq("is_done", false)
        .order("priority", { ascending: true })
        .limit(8),
      supabase
        .from("ongoing")
        .select("id, title, status, follow_up_at, due_at")
        .in("status", ["open", "waiting"])
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase
        .from("projects")
        .select("id, title, status, next_step, due_at, updated_at")
        .in("status", ["active", "waiting"])
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase
        .from("memories")
        .select("id, title, content, created_at, people!memories_person_id_fkey(name, relation)")
        .not("person_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    const firstError = capturesResult.error || radarResult.error || ongoingResult.error || projectsResult.error || relationsResult.error;
    if (firstError) {
      setMessage(firstError.message);
      return;
    }

    setItems((capturesResult.data ?? []) as CaptureItem[]);
    setRadar((radarResult.data ?? []) as BriefingItem[]);
    setOngoing((ongoingResult.data ?? []) as OngoingItem[]);
    setProjects((projectsResult.data ?? []) as ProjectItem[]);

    const relationRows = (relationsResult.data ?? []) as RelationMemory[];
    setRelations(
      relationRows
        .filter((row) => {
          const rel = (relationPerson(row)?.relation ?? "").toLocaleLowerCase("sv-SE");
          return /(fru|man|partner|son|dotter|barn|familj|vän|kompis|mamma|pappa|bror|syster)/.test(rel);
        })
        .slice(0, 6)
    );
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) setMessage(error.message);
  }

  async function signUp() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) setMessage(error.message);
    else setMessage("Kontot är skapat. Kontrollera mejlen om Supabase kräver bekräftelse.");
  }

  async function saveCapture() {
    const clean = text.trim();
    if (!clean || !userId) return;

    setLoading(true);
    setMessage("");

    const [peopleResult, projectsResult] = await Promise.all([
      supabase.from("people").select("id, name, relation"),
      supabase.from("projects").select("id, title, status, project_type").in("status", ["active", "waiting"]),
    ]);

    if (peopleResult.error || projectsResult.error) {
      setLoading(false);
      setMessage((peopleResult.error || projectsResult.error)?.message ?? "Kunde inte läsa O.L.L.E.-minnet.");
      return;
    }

    const people = (peopleResult.data ?? []) as PersonRef[];
    const knownProjects = (projectsResult.data ?? []) as ProjectRef[];
    let interpretation = interpretCapture(clean, people, knownProjects);
    let learnedPerson: PersonRef | undefined;
    let learnedProject: ProjectRef | undefined;

    if (!interpretation.person && interpretation.discoveredPerson) {
      const { data: createdPerson, error: personCreateError } = await supabase
        .from("people")
        .insert({
          owner_id: userId,
          name: interpretation.discoveredPerson.name,
          relation: interpretation.discoveredPerson.relation,
          notes: "Skapad automatiskt av O.L.L.E. från en tydlig relationsfras.",
        })
        .select("id, name, relation")
        .single();

      if (personCreateError) {
        setLoading(false);
        setMessage("O.L.L.E. förstod personen men kunde inte spara den: " + personCreateError.message);
        return;
      }

      learnedPerson = createdPerson as PersonRef;
      interpretation = {
        ...interpretation,
        person: learnedPerson,
        personHint: learnedPerson.name,
      };
    }

    if (!interpretation.project && interpretation.discoveredProject) {
      const { data: createdProject, error: projectCreateError } = await supabase
        .from("projects")
        .insert({
          owner_id: userId,
          title: interpretation.discoveredProject.title,
          project_type: interpretation.discoveredProject.projectType,
          status: "active",
          priority: interpretation.priority,
          description: clean,
          next_step: interpretation.kind === "ongoing" ? interpretation.title : null,
        })
        .select("id, title, status, project_type")
        .single();

      if (projectCreateError) {
        setLoading(false);
        setMessage("O.L.L.E. förstod projektet men kunde inte spara det: " + projectCreateError.message);
        return;
      }

      learnedProject = createdProject as ProjectRef;
      interpretation = {
        ...interpretation,
        project: learnedProject,
        projectHint: learnedProject.title,
      };
    }

    const { data: capture, error: captureError } = await supabase
      .from("capture_inbox")
      .insert({
        owner_id: userId,
        raw_text: clean,
        person_hint: interpretation.personHint ?? null,
        project_hint: interpretation.projectHint ?? null,
        detected_type: interpretation.kind,
        status: "new",
        processed: false,
      })
      .select("id")
      .single();

    if (captureError) {
      setLoading(false);
      setMessage(captureError.message);
      return;
    }

    let routeError: { message: string } | null = null;

    if (interpretation.kind === "ongoing") {
      const { data: ongoingRow, error } = await supabase
        .from("ongoing")
        .insert({
          owner_id: userId,
          person_id: interpretation.person?.id ?? null,
          project_id: interpretation.project?.id ?? null,
          title: interpretation.title,
          description: clean,
          next_step: interpretation.title,
          status: "open",
          priority: interpretation.priority,
          follow_up_at: interpretation.followUpAt ?? null,
          due_at: interpretation.dueAt ?? null,
        })
        .select("id")
        .single();

      routeError = error;

      if (!error && interpretation.briefingDate) {
        const { error: briefingError } = await supabase.from("briefing_items").insert({
          owner_id: userId,
          person_id: interpretation.person?.id ?? null,
          project_id: interpretation.project?.id ?? null,
          ongoing_id: ongoingRow?.id ?? null,
          title: interpretation.title,
          content: clean,
          briefing_date: interpretation.briefingDate,
          category: interpretation.category,
          priority: interpretation.priority,
          is_done: false,
        });
        routeError = briefingError;
      }
    } else {
      const { error } = await supabase.from("memories").insert({
        owner_id: userId,
        person_id: interpretation.person?.id ?? null,
        project_id: interpretation.project?.id ?? null,
        title: interpretation.title,
        content: clean,
        memory_type: interpretation.category,
        source: "kollen_capture",
        remind_at: interpretation.followUpAt ?? null,
        is_active: true,
      });
      routeError = error;
    }

    if (routeError) {
      await supabase
        .from("capture_inbox")
        .update({ status: "error", processed: false })
        .eq("id", capture.id);

      setLoading(false);
      setMessage("O.L.L.E. sparade texten men O.L.L.E. kunde inte sortera den: " + routeError.message);
      await loadDashboard();
      return;
    }

    await supabase
      .from("capture_inbox")
      .update({ status: "processed", processed: true })
      .eq("id", capture.id);

    setText("");
    setLoading(false);

    const personText = interpretation.person ? ` · ${interpretation.person.name}` : "";
    const projectText = interpretation.project ? ` · projekt ${interpretation.project.title}` : "";
    const learnedBits = [
      learnedPerson ? `lärde mig vem ${learnedPerson.name} är` : "",
      learnedProject ? `lärde mig projektet ${learnedProject.title}` : "",
    ].filter(Boolean);
    const learnedText = learnedBits.length ? ` · ${learnedBits.join(" · ")}` : "";

    setMessage(
      interpretation.kind === "ongoing"
        ? `O.L.L.E.: lagt som pågående${personText}${projectText}${interpretation.briefingDate ? " · till radarn" : ""}${learnedText}.`
        : `O.L.L.E.: sparat som minne${personText}${projectText}${learnedText}.`
    );

    await loadDashboard();
  }

  async function markRadarDone(id: string) {
    await supabase.from("briefing_items").update({ is_done: true }).eq("id", id);
    await loadDashboard();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMessage("");
  }

  if (!userId) {
    return (
      <main className="shell">
        <div className="container">
          <header className="header">
            <div className="brand">O.L.L.E.</div>
            <div className="status"><span className="dot" />Redo</div>
          </header>

          <section className="card">
            <form className="stack" onSubmit={signIn}>
              <div>
                <h1 style={{ marginTop: 0 }}>Logga in</h1>
                <p className="message">Din privata O.L.L.E.-data ligger bakom ditt konto.</p>
              </div>

              <div className="stack">
                <label htmlFor="email">E-post</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <div className="stack">
                <label htmlFor="password">Lösenord</label>
                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>

              <div className="actions">
                <button className="primary" type="submit" disabled={loading}>Logga in</button>
                <button className="secondary" type="button" onClick={signUp} disabled={loading}>Skapa konto</button>
              </div>

              {message && <div className="message">{message}</div>}
            </form>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="shell hub-shell">
      <div className="hub-app">
        <header className="hub-header">
          <div>
            <div className="hub-logo">ROGGE <span>HUB</span></div>
            <div className="hub-tagline">DITT LIV — EN PLAN</div>
          </div>
          <button className="hub-logout" onClick={signOut}>Logga ut</button>
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
