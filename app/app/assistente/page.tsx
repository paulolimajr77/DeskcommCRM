import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { AssistenteClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function AssistentePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.agent) {
    redirect("/403");
  }
  const idioma = user.idioma;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Assistente", idioma)}</h1>
        <p className="text-sm text-text-muted">
          {traduzir(
            "Pergunte sobre a operação e os guias. Na F1 ele responde resumos e trechos — a conversa com IA chega na F2.",
            idioma,
          )}
        </p>
      </header>
      <AssistenteClient />
    </div>
  );
}
