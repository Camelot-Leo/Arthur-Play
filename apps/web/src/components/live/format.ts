/** "123456" → "123 456", più leggibile da fondo aula. */
export const formatCode = (code: string) => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);
export const hostOf = (url: string) => url.replace(/^https?:\/\//, "");
