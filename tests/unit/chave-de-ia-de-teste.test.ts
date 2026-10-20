/**
 * O helper de e2e que cifra a chave de IA semeada fala o MESMO formato do
 * produto (`lib/crypto/aes_gcm.ts`): o que ele grava, `decryptKey` abre.
 */
import { vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_CRED_AES_KEY = "iBc1Z2gYaAH4rEHs1dHQ2dvNQ6t4OfrdE1/Y6OSvtZY=";
});

import { describe, expect, it } from "vitest";

import { byteaToBuffer, decryptKey } from "@/lib/crypto/aes_gcm";

import { cifrarChaveDeTeste } from "../e2e/helpers/chave-de-ia-de-teste";

describe("cifrarChaveDeTeste", () => {
  it("decryptKey abre o que o helper cifrou, e os campos vêm em bytea hexadecimal", () => {
    const c = cifrarChaveDeTeste("chave-de-teste-e2e");
    expect(c.api_key_encrypted.startsWith(String.fromCharCode(92) + "x")).toBe(true);
    const claro = decryptKey({
      ciphertext: byteaToBuffer(c.api_key_encrypted),
      iv: byteaToBuffer(c.api_key_iv),
      tag: byteaToBuffer(c.api_key_tag),
    });
    expect(claro).toBe("chave-de-teste-e2e");
    expect(byteaToBuffer(c.api_key_iv).length).toBe(12);
    expect(byteaToBuffer(c.api_key_tag).length).toBe(16);
    expect(c.api_key_last4).toBe("-e2e");
  });

  it("sem a chave AES no ambiente, recusa em vez de gravar lixo", () => {
    expect(() => cifrarChaveDeTeste("x", "")).toThrow(/AI_CRED_AES_KEY/);
  });
});
