import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, buildExport, canEdit, canSetLibrary, canView, normalizeTags, parseImport, type ActivityContent } from "../src";

const anna = { id: "anna", role: "facilitator" as const };
const bruno = { id: "bruno", role: "facilitator" as const };
const admin = { id: "admin", role: "admin" as const };
const annaPersonal = { ownerId: "anna", library: "personal" as const };
const shared = { ownerId: "admin", library: "shared" as const };

describe("permessi della libreria", () => {
  it("un facilitatore non vede né modifica le attività personali altrui", () => {
    expect(canView(annaPersonal, bruno)).toBe(false);
    expect(canEdit(annaPersonal, bruno)).toBe(false);
    expect(canView(annaPersonal, anna)).toBe(true);
    expect(canEdit(annaPersonal, anna)).toBe(true);
  });

  it("le attività personali restano private anche per l'admin", () => {
    expect(canView(annaPersonal, admin)).toBe(false);
    expect(canEdit(annaPersonal, admin)).toBe(false);
  });

  it("la libreria condivisa è visibile a tutti ma modificabile solo dall'admin", () => {
    expect(canView(shared, bruno)).toBe(true);
    expect(canEdit(shared, bruno)).toBe(false);
    // Anche se l'attività condivisa era sua, il facilitatore non la modifica più.
    expect(canEdit({ ownerId: "bruno", library: "shared" }, bruno)).toBe(false);
    expect(canEdit(shared, admin)).toBe(true);
  });

  it("solo l'admin pubblica (le proprie attività) e ritira dalla libreria condivisa", () => {
    expect(canSetLibrary(annaPersonal, anna, "shared")).toBe(false);
    expect(canSetLibrary(shared, bruno, "personal")).toBe(false);
    expect(canSetLibrary(annaPersonal, admin, "shared")).toBe(false);
    expect(canSetLibrary({ ownerId: "admin", library: "personal" }, admin, "shared")).toBe(true);
    expect(canSetLibrary(shared, admin, "personal")).toBe(true);
    expect(canSetLibrary(shared, admin, "shared")).toBe(false);
  });
});

describe("tag", () => {
  it("minuscoli, unici, al massimo 10 da 30 caratteri", () => {
    expect(normalizeTags([" Comunicazione ", "comunicazione", "", "Lavoro  di squadra"])).toEqual(["comunicazione", "lavoro di squadra"]);
    expect(normalizeTags(Array.from({ length: 15 }, (_, i) => `t${i}`))).toHaveLength(10);
    expect(normalizeTags(["x".repeat(50)])[0]).toHaveLength(30);
  });
});

describe("esportazione e importazione JSON", () => {
  const content: ActivityContent = {
    title: "Ascolto attivo",
    settings: DEFAULT_SETTINGS,
    slides: [
      { id: "a", type: "content", title: "Benvenuti" },
      { id: "q", type: "quiz", question: "2+2?", mode: "single", options: [{ id: "o1", label: "4" }, { id: "o2", label: "5" }], correctOptionId: "o1", acceptedAnswers: [], timerSeconds: 20 },
    ],
  };

  it("andata e ritorno senza perdite; il file contiene solo contenuto e metadati", () => {
    const file = buildExport(content, { audience: "docenti", tags: ["comunicazione"] });
    expect(Object.keys(file).sort()).toEqual(["attivita", "formato", "versione"]);
    expect(Object.keys(file.attivita).sort()).toEqual(["audience", "settings", "slides", "tags", "title"]);
    const back = parseImport(JSON.parse(JSON.stringify(file)));
    expect(back?.content.slides).toEqual(content.slides);
    expect(back?.meta).toEqual({ audience: "docenti", tags: ["comunicazione"] });
  });

  it("campi estranei (es. risultati o owner) vengono ignorati", () => {
    const file = buildExport(content, { audience: "studenti", tags: [] });
    const tampered = { ...file, risultati: { x: 1 }, attivita: { ...file.attivita, ownerId: "x", library: "shared", results: [1, 2] } };
    const back = parseImport(tampered);
    expect(back).not.toBeNull();
    expect(JSON.stringify(back)).not.toMatch(/ownerId|results|risultati|shared/);
  });

  it("rifiuta formati sconosciuti, slide non valide e id duplicati", () => {
    const file = buildExport(content, { audience: "studenti", tags: [] });
    expect(parseImport({ ...file, formato: "altro" })).toBeNull();
    expect(parseImport({ ...file, versione: 2 })).toBeNull();
    expect(parseImport({ ...file, attivita: { ...file.attivita, slides: [] } })).toBeNull();
    expect(parseImport({ ...file, attivita: { ...file.attivita, slides: [content.slides[0], content.slides[0]] } })).toBeNull();
    expect(parseImport("testo")).toBeNull();
  });
});
