"use client";
import Link from "next/link";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { destinosDaInterface } from "@/lib/navigation/interface";

import { useT } from "@/hooks/i18n/useT";
import { Robot } from "@/lib/ui/icons";

/**
 * Atalho do assistente interno no header (spec 2026-10-14, F1); clique leva
 * a /app/assistente. Mesmo molde do AlertsBell: some quando a porta não está
 * nos destinos da interface.
 */
export function AssistenteLink() {
  const { user, activeOrg } = useAuth();
  if (
    !destinosDaInterface(
      activeOrg?.interface_settings,
      user.is_platform_admin && !user.support,
      activeOrg?.role ?? null,
    ).some((d) => d.href === "/app/assistente")
  )
    return null;
  return <VisibleAssistenteLink />;
}

function VisibleAssistenteLink() {
  const t = useT();

  return (
    <Link
      href="/app/assistente"
      aria-label={t("Assistente")}
      data-testid="assistente-link"
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-9 lg:w-9"
    >
      <Robot size={18} aria-hidden />
    </Link>
  );
}
