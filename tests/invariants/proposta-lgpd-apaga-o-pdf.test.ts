import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./psql-transporte";

/**
 * A ANONIMIZAÇÃO APAGA O PDF DA PROPOSTA, NO BUCKET DELE (migration 0478).
 *
 * Achado da triagem do PR #1832: a 0477 redigia os campos de `crm_proposals`,
 * mas o arquivo `propostas/<org>/<id>.pdf` — que imprime o nome, o briefing e o
 * resumo — ficava. E o caminho dele, gravado em `messages.media_storage_path`
 * para o clique no anexo funcionar, ia para a fila de apagamento com o bucket
 * `whatsapp-media`, onde o arquivo não existe.
 *
 * O vizinho (outro contato da mesma organização, com proposta e PDF) é o
 * controle: a cascata não pode alcançá-lo.
 */

const ORG = "04780000-0000-4000-8000-00000000000a";
const SESSAO = "04780000-0000-4000-8000-0000000000c5";
const ALVO = "04780000-1111-4000-8000-000000000001";
const VIZINHO = "04780000-1111-4000-8000-000000000002";
const CONVERSA: Record<string, string> = {
  [ALVO]: "04780000-2222-4000-8000-000000000001",
  [VIZINHO]: "04780000-2222-4000-8000-000000000002",
};
const MENSAGEM: Record<string, string> = {
  [ALVO]: "04780000-3333-4000-8000-000000000001",
  [VIZINHO]: "04780000-3333-4000-8000-000000000002",
};
const PROPOSTA: Record<string, string> = {
  [ALVO]: "04780000-4444-4000-8000-000000000001",
  [VIZINHO]: "04780000-4444-4000-8000-000000000002",
};
const pdf = (c: string) => `${ORG}/${PROPOSTA[c]}.pdf`;
const FOTO_DO_ALVO = `${ORG}/${CONVERSA[ALVO]}/foto.jpg`;

function naFila(bucket: string, caminho: string): string {
  return sql(`
    select count(*) from public.storage_redaction_queue
     where organization_id = '${ORG}' and bucket = '${bucket}' and object_path = '${caminho}';
  `);
}

function pdfPath(c: string): string {
  return sql(`select coalesce(pdf_path, '<null>') from public.crm_proposals where id = '${PROPOSTA[c]}';`);
}

beforeAll(() => {
  const porContato = [ALVO, VIZINHO]
    .map(
      (c, i) => `
    insert into public.contacts (id, organization_id, name, display_name)
      values ('${c}', '${ORG}', 'Pessoa ${i}', 'Pessoa ${i}');
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status)
      values ('${CONVERSA[c]}', '${ORG}', '${c}', '${SESSAO}', 'open');
    insert into public.messages
      (id, organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, sent_via, body, media_storage_path)
    values
      ('${MENSAGEM[c]}', '${ORG}', '${CONVERSA[c]}', '${SESSAO}', '${c}', 'document', 'outbound', 'sent', 'crm', null, '${pdf(c)}');
    insert into public.crm_proposals
      (id, organization_id, contact_id, conversation_id, titulo, status, numero, ano, pdf_path, message_id, destinatario_nome)
    values
      ('${PROPOSTA[c]}', '${ORG}', '${c}', '${CONVERSA[c]}', 'Proposta ${i}', 'enviada', ${i + 1}, 2026, '${pdf(c)}', '${MENSAGEM[c]}', 'Pessoa ${i}');`,
    )
    .join("\n");
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'proposta-lgpd-0478', 'Proposta LGPD', 'Proposta LGPD');
    insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
      values ('${SESSAO}', '${ORG}', 'proposta-lgpd-0478', '\\x00'::bytea);
    ${porContato}
    -- Mídia comum da conversa do alvo: continua indo para whatsapp-media.
    insert into public.messages
      (organization_id, conversation_id, channel_session_id, contact_id, type, direction, status, sent_via, body, media_storage_path)
    values
      ('${ORG}', '${CONVERSA[ALVO]}', '${SESSAO}', '${ALVO}', 'image', 'inbound', 'received', 'crm', 'foto', '${FOTO_DO_ALVO}');
  `);
  sql(`select public.fn_lgpd_cascade_redact_contact('${ORG}', '${ALVO}', null);`);
});

describe("anonimizar o contato apaga o PDF da proposta dele", () => {
  it("o PDF do alvo entra na fila, no bucket propostas", () => {
    expect(naFila("propostas", pdf(ALVO))).toBe("1");
  });

  it("e NÃO no bucket whatsapp-media, onde o arquivo não existe", () => {
    expect(naFila("whatsapp-media", pdf(ALVO))).toBe("0");
  });

  it("a proposta perde o ponteiro para o arquivo, e o resto do documento fica", () => {
    expect(pdfPath(ALVO)).toBe("<null>");
    expect(
      sql(`select status || '|' || numero || '|' || destinatario_nome from public.crm_proposals where id = '${PROPOSTA[ALVO]}';`),
    ).toBe(`enviada|1|Cliente Anonimizado #${ALVO.slice(0, 8)}`);
  });

  it("controle: a mídia comum da conversa segue indo para whatsapp-media", () => {
    expect(naFila("whatsapp-media", FOTO_DO_ALVO)).toBe("1");
  });

  it("controle: o vizinho não é alcançado", () => {
    expect(naFila("propostas", pdf(VIZINHO))).toBe("0");
    expect(pdfPath(VIZINHO)).toBe(pdf(VIZINHO));
  });
});
