// app/api/v1/messages/[id]/media/bucket-do-caminho.ts
/**
 * Qual bucket assinar para um `media_storage_path`. Quase toda mídia de canal
 * segue `storagePathFor` (`lib/messaging/media/types.ts`):
 * `<org>/<conversationId>/<mensagem>.ext` — 3 segmentos, bucket
 * `whatsapp-media`. O PDF de proposta (`lib/propostas/storage.ts`) é a única
 * exceção: `<org>/<propostaId>.pdf` — 2 segmentos, bucket `propostas`, porque
 * ele não nasce dentro de nenhuma conversa (uma proposta pode ser reenviada
 * por conversas diferentes ao longo da vida dela).
 */
export function bucketDoCaminhoDeMedia(path: string): "whatsapp-media" | "propostas" {
  return path.split("/").length === 2 ? "propostas" : "whatsapp-media";
}
