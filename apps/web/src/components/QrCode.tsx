"use client";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR code generato localmente nel browser (nessun servizio esterno). */
export function QrCode({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [value]);
  return <div role="img" aria-label={label} className={`[&>svg]:h-full [&>svg]:w-full ${className}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
