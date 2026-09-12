import { describe, expect, it } from "vitest";

import { listConversationsQuerySchema } from "@/lib/schemas";

/**
 * O campo de busca do Inbox ia ao banco com UM caractere.
 *
 * Medido numa instalação real: `?search=a` devolvia a lista inteira. Lista
 * inteira sob busca não é resposta — é ruído que PARECE resposta, que é o modo
 * de falha mais caro numa tela de atendimento: o atendente conclui que achou.
 *
 * O handler já aplica exatamente este raciocínio ao telefone, com a justificativa
 * escrita lá ("12 casaria metade da base… pior que não achar, porque PARECE que
 * funcionou"). Faltava aplicá-lo ao texto.
 *
 * O piso mora no SCHEMA, e não no componente, porque a rota é pública e o
 * componente não é a única porta: o schema é o contrato que toda entrada
 * atravessa.
 */
describe("a busca não vai ao banco com 1 caractere", () => {
  it("CONTROLE: termo de 2 caracteres é aceito", () => {
    const r = listConversationsQuerySchema.safeParse({ search: "an" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.search).toBe("an");
  });

  it("termo de 1 caractere é RECUSADO", () => {
    expect(listConversationsQuerySchema.safeParse({ search: "a" }).success).toBe(false);
  });

  it("espaço em volta não conta como caractere", () => {
    expect(listConversationsQuerySchema.safeParse({ search: " a " }).success).toBe(false);
  });

  it("o termo chega ao handler já aparado", () => {
    const r = listConversationsQuerySchema.safeParse({ search: "  ana  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.search).toBe("ana");
  });
});
