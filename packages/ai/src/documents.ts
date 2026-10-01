/**
 * Estrazione del testo da PDF e DOCX, interamente in memoria: il file non viene mai
 * scritto su disco né salvato nel database. Il buffer viene scartato a fine richiesta.
 */
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_CHARS } from "./config";

export class DocumentError extends Error {
  constructor(public readonly code: "unsupported" | "too_large" | "too_long" | "empty" | "unreadable") {
    super(code);
    this.name = "DocumentError";
  }
}

export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function extractDocumentText(data: Uint8Array, mime: string): Promise<string> {
  if (data.byteLength > MAX_DOCUMENT_BYTES) throw new DocumentError("too_large");
  let text: string;
  try {
    if (mime === PDF_MIME) {
      const pdf = await getDocumentProxy(new Uint8Array(data));
      const res = await extractText(pdf, { mergePages: true });
      text = Array.isArray(res.text) ? res.text.join("\n") : res.text;
    } else if (mime === DOCX_MIME) {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(data) })).value;
    } else {
      throw new DocumentError("unsupported");
    }
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    throw new DocumentError("unreadable");
  }
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new DocumentError("empty");
  // Nessun troncamento silenzioso: un documento troppo lungo viene rifiutato con un messaggio.
  if (text.length > MAX_DOCUMENT_CHARS) throw new DocumentError("too_long");
  return text;
}
