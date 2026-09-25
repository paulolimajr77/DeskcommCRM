import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";

import { ProposalEditorClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editor de Proposta" };

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const { id } = await params;

  const podeEditar =
    roleAtLeast(activeOrg.role, "agent") &&
    (!user.support ||
      (user.support.status === "active" && user.support.access_mode === "full"));

  return <ProposalEditorClient id={id} podeEditar={podeEditar} />;
}
