"use server";

import { notificationPrefsSchema, type NotificationPrefsInput } from "@/lib/schemas/settings";

export type UpdateNotificationPrefsResult =
  | { ok: true }
  | { ok: false; error: string; details?: unknown };

/**
 * STUB — a tabela `notification_prefs` não existe. Medido em 2026-09-16: esta
 * ação devolve `feature_not_yet_available` para QUALQUER entrada, e a tela
 * `Configurações › Notificações` é UI sem servidor desde a Wave 5 do EPIC-10.
 *
 * O caminho que FUNCIONA é o outro: `lib/notifications/prefs.ts`, com
 * `NOTIFY_UI_CATEGORIES` em `localStorage` — por navegador, in-app e push.
 *
 * ⚠️ DÍVIDA DECLARADA, fora do escopo deste plano: a preferência não atravessa
 * navegador nem dispositivo, e o canal de e-mail segue `disabled` no código.
 * O que NÃO podia continuar é a categoria não existir — aí nem quem quer ser
 * avisado consegue pedir.
 */
export async function updateNotificationPrefs(
  input: NotificationPrefsInput,
): Promise<UpdateNotificationPrefsResult> {
  const parsed = notificationPrefsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.flatten() };
  }
  return { ok: false, error: "feature_not_yet_available" };
}
