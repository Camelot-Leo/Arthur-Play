import { createFilter, type ModerationFilter, type ModerationTerm } from "@arthur/shared";
import { SEED_TERMS } from "@arthur/shared/server";

/**
 * Filtro di moderazione del servizio realtime.
 * Le liste sono lette da PostgreSQL (modificabili dall'admin) e ricaricate periodicamente.
 * Se il database non è raggiungibile all'avvio si usano le liste iniziali, così il filtro
 * resta sempre attivo.
 */
export class ModerationStore {
  private filter: ModerationFilter;

  constructor(
    private readonly load: (() => Promise<ModerationTerm[]>) | null,
    initial: ModerationTerm[] = SEED_TERMS,
  ) {
    this.filter = createFilter(initial);
  }

  set(terms: ModerationTerm[]) {
    this.filter = createFilter(terms);
  }

  async refresh(): Promise<void> {
    if (!this.load) return;
    const terms = await this.load();
    this.set(terms);
  }

  isFiltered = (text: string): boolean => this.filter(text);
}
