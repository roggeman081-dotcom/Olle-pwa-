export type PersonRef = { id: string; name: string; relation?: string | null };
export type ProjectRef = { id: string; title: string; status?: string | null; project_type?: string | null };

export type DiscoveredPerson = {
  name: string;
  relation: string;
};

export type DiscoveredProject = {
  title: string;
  projectType: "local";
};

export type JarvisInterpretation = {
  kind: "ongoing" | "memory";
  title: string;
  person?: PersonRef;
  discoveredPerson?: DiscoveredPerson;
  personHint?: string;
  project?: ProjectRef;
  discoveredProject?: DiscoveredProject;
  projectHint?: string;
  priority: 1 | 2 | 3;
  dueAt?: string;
  followUpAt?: string;
  briefingDate?: string;
  category: "family" | "friend" | "work" | "project" | "general";
};

const ACTION_WORDS = [
  "ring", "ringa", "boka", "köp", "köpa", "beställ", "beställa", "fixa",
  "ordna", "följ upp", "påminn", "prata med", "kontakta", "skicka", "gör", "göra",
  "bygg", "bygga", "byt", "byta", "måla", "renovera", "montera", "installera"
];

const MEMORY_WORDS = [
  "gillar", "tycker om", "vill ha", "önskar", "nämnde", "sa att", "kom ihåg",
  "favorit", "drömmer om", "behöver"
];

const RELATION_PATTERNS: Array<{ relation: string; pattern: RegExp }> = [
  { relation: "fru", pattern: /\bmin fru\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö'-]+)/ },
  { relation: "man", pattern: /\bmin man\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö'-]+)/ },
  { relation: "partner", pattern: /\bmin partner\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö'-]+)/ },
  { relation: "son", pattern: /\bmin son\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö'-]+)/ },
  { relation: "dotter", pattern: /\bmin dotter\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö'-]+)/ },
  { relation: "vän", pattern: /\bmin vän\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö'-]+)/ },
  { relation: "vän", pattern: /\bvännen\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö'-]+)/ },
  { relation: "kund", pattern: /\bmin kund\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö'-]+)/ },
  { relation: "kund", pattern: /\bkunden\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö'-]+)/ },
  { relation: "kollega", pattern: /\bmin kollega\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö'-]+)/ },
  { relation: "leverantör", pattern: /\bmin leverantör\s+([A-ZÅÄÖ][A-Za-zÅÄÖåäö'-]+)/ },
];

function normalize(s: string) {
  return s.toLocaleLowerCase("sv-SE");
}

function titleFromText(text: string) {
  const clean = text.trim().replace(/[.!?]+$/, "");
  return clean.length > 72 ? clean.slice(0, 69) + "…" : clean;
}

function matchPerson(text: string, people: PersonRef[]) {
  const lower = normalize(text);
  return people
    .filter((p) => p.name && lower.includes(normalize(p.name)))
    .sort((a, b) => b.name.length - a.name.length)[0];
}

function matchProject(text: string, projects: ProjectRef[]) {
  const lower = normalize(text);
  return projects
    .filter((p) => p.title && lower.includes(normalize(p.title)))
    .sort((a, b) => b.title.length - a.title.length)[0];
}

function discoverPerson(text: string): DiscoveredPerson | undefined {
  for (const entry of RELATION_PATTERNS) {
    const match = text.match(entry.pattern);
    if (match?.[1]) {
      return { name: match[1], relation: entry.relation };
    }
  }
  return undefined;
}

function discoverProject(text: string): DiscoveredProject | undefined {
  const match = text.match(/\bprojekt(?:et)?\s+([^,:.!?]+)/i);
  if (!match?.[1]) return undefined;

  const raw = match[1].trim();
  const stopWords = ACTION_WORDS.map((w) => normalize(w));
  const words = raw.split(/\s+/);
  const kept: string[] = [];

  for (const word of words) {
    if (stopWords.includes(normalize(word))) break;
    kept.push(word);
    if (kept.length >= 4) break;
  }

  const title = kept.join(" ").trim();
  if (!title) return undefined;

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    projectType: "local",
  };
}

function dateAt(hour: number, addDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function detectDate(text: string) {
  const lower = normalize(text);
  if (lower.includes("imorgon")) {
    const d = dateAt(9, 1);
    return { dueAt: d.toISOString(), followUpAt: d.toISOString(), briefingDate: isoDate(d) };
  }
  if (lower.includes("idag") || lower.includes("ikväll")) {
    const d = lower.includes("ikväll") ? dateAt(19, 0) : dateAt(15, 0);
    return { dueAt: d.toISOString(), followUpAt: d.toISOString(), briefingDate: isoDate(d) };
  }
  return {};
}

function categoryForRelation(relation?: string | null, hasProject = false) {
  if (hasProject) return "project" as const;
  const rel = normalize(relation ?? "");
  if (/(fru|man|partner|son|dotter|barn|familj|mamma|pappa|bror|syster)/.test(rel)) return "family" as const;
  if (/(vän|kompis)/.test(rel)) return "friend" as const;
  if (/(kund|kollega|leverantör|jobb|kontakt)/.test(rel)) return "work" as const;
  return "general" as const;
}

export function interpretCapture(text: string, people: PersonRef[], projects: ProjectRef[] = []): JarvisInterpretation {
  const lower = normalize(text);
  const person = matchPerson(text, people);
  const discoveredPerson = person ? undefined : discoverPerson(text);
  const project = matchProject(text, projects);
  const discoveredProject = project ? undefined : discoverProject(text);
  const hasAction = ACTION_WORDS.some((w) => lower.includes(w));
  const hasMemory = MEMORY_WORDS.some((w) => lower.includes(w));
  const dates = detectDate(text);

  const kind: "ongoing" | "memory" =
    hasAction && !hasMemory ? "ongoing" :
    hasMemory && !hasAction ? "memory" :
    hasAction ? "ongoing" : "memory";

  const relation = person?.relation ?? discoveredPerson?.relation;
  const hasProject = Boolean(project || discoveredProject);

  return {
    kind,
    title: titleFromText(text),
    person,
    discoveredPerson,
    personHint: person?.name ?? discoveredPerson?.name,
    project,
    discoveredProject,
    projectHint: project?.title ?? discoveredProject?.title,
    priority: 2,
    category: categoryForRelation(relation, hasProject),
    ...dates,
  };
}
