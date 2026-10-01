import { defaultMatchMode, type MatchMode } from "./filter";

/**
 * Liste iniziali del filtro di moderazione (italiano e inglese).
 * Vengono caricate nel database con `pnpm db:seed`; poi l'admin le modifica dal pannello.
 * Sintassi: "termine" (modalità automatica) oppure "termine|word" / "termine|contains".
 * Le radici (es. "cazz", "stronz") coprono le varianti flesse in modalità `contains`.
 */
const IT = `
cazz|contains
merd|contains
stronz|contains
coglion|contains
puttan|contains
fancul|contains
vaffa
troia
troie
zoccol|contains
mignott|contains
minchi|contains
figa
fica
culo
leccaculo
culattone
sega
pompin|contains
bocchin|contains
sborr|contains
bastard|contains
cornuto
porcodio
porcamadonna
diocane
dioporco
madonnatroia
frocio
froci
ricchion|contains
terron|contains
negro
negra
mongoloide
`;

const EN = `
fuck|contains
shit
shitty
bullshit
asshole
ass
bitch
bastard
cunt
dick
dickhead
cock
pussy
whore
slut
faggot
fag
nigger
nigga
retard
wanker
twat
bollocks
motherfucker
crap
`;

export type SeedTerm = { lang: "it" | "en"; term: string; match: MatchMode };

function parse(lang: "it" | "en", block: string): SeedTerm[] {
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [term = "", mode] = line.split("|");
      const match: MatchMode = mode === "word" || mode === "contains" ? mode : defaultMatchMode(term);
      return { lang, term, match };
    });
}

export const SEED_TERMS: SeedTerm[] = [...parse("it", IT), ...parse("en", EN)];
