// app/api/v1/messages/[id]/media/bucket-do-caminho.test.ts
import { describe, expect, it } from "vitest";

import { bucketDoCaminhoDeMedia } from "./bucket-do-caminho";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const PROPOSTA = "33333333-3333-4333-8333-333333333333";

describe("bucketDoCaminhoDeMedia", () => {
  it("caminho de mensagem normal (org/conversa/arquivo) vai para whatsapp-media", () => {
    expect(bucketDoCaminhoDeMedia(`${ORG}/${CONV}/a1b2c3.jpg`)).toBe("whatsapp-media");
  });

  it("caminho de PDF de proposta (org/propostaId.pdf, sem pasta de conversa) vai para propostas", () => {
    expect(bucketDoCaminhoDeMedia(`${ORG}/${PROPOSTA}.pdf`)).toBe("propostas");
  });
});
