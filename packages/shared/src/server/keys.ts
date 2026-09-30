/**
 * Chiavi Redis. Tutte le chiavi di una sessione hanno il prefisso `ap:s:{sid}:`
 * (hash tag: finiscono nello stesso slot anche con Redis Cluster) e scadono insieme
 * alla sessione (EXPIREAT). Alla chiusura vengono cancellate tutte.
 */
export const K = {
  code: (code: string) => `ap:code:${code}`,
  prefix: (sid: string) => `ap:s:{${sid}}:`,
  meta: (sid: string) => `ap:s:{${sid}}:meta`,
  activity: (sid: string) => `ap:s:{${sid}}:activity`,
  /** hash(token) → JSON {n: nickname} */
  participants: (sid: string) => `ap:s:{${sid}}:p`,
  /** nickname normalizzati in uso */
  nicks: (sid: string) => `ap:s:{${sid}}:nicks`,
  /** istanza realtime → partecipanti connessi */
  online: (sid: string) => `ap:s:{${sid}}:online`,
  /** id delle slide con risposte bloccate */
  locked: (sid: string) => `ap:s:{${sid}}:locked`,
  /** aggregati della slide */
  agg: (sid: string, slide: string) => `ap:s:{${sid}}:r:${slide}:agg`,
  /** hash(token) → numero di invii (blocco dei doppi invii) */
  sub: (sid: string, slide: string) => `ap:s:{${sid}}:r:${slide}:sub`,
  /** id → JSON {t, h} — testo senza alcun legame con token o nickname */
  txt: (sid: string, slide: string) => `ap:s:{${sid}}:r:${slide}:txt`,
  /** voci nascoste della word cloud */
  hidden: (sid: string, slide: string) => `ap:s:{${sid}}:r:${slide}:hidden`,
  /** sessioni attive del facilitatore */
  userSessions: (userId: string) => `ap:u:${userId}:sessions`,
  salt: () => "ap:salt",
  rate: (bucket: string, action: string, window: number) => `ap:rl:${bucket}:${action}:${window}`,
} as const;
