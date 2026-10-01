import { notFound } from "next/navigation";
import { ParticipantApp } from "@/components/participant/ParticipantApp";

/** Link diretto con codice precompilato (anche dal QR code). */
export default async function JoinPage({ params }: { params: Promise<{ codice: string }> }) {
  const { codice } = await params;
  if (!/^\d{6}$/.test(codice)) notFound();
  return <ParticipantApp code={codice} />;
}
