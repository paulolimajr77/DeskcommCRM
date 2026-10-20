/**
 * Uma chave de IA CIFRADA de verdade para as specs que semeiam
 * `ai_provider_credentials`.
 *
 * Por que existe: o resolvedor do seam de modelo (`edge/llm/credentials.ts`)
 * prefere a credencial da organização à chave da instalação e a DECIFRA com
 * `decryptKey`. Uma credencial semeada com bytes de enfeite (`\x00` nos três
 * campos) não é "ignorada": `setAuthTag` recusa um tag de 1 byte com
 * `TypeError [ERR_CRYPTO_INVALID_AUTH_TAG]`, o turno do assistente cai no piso
 * (`assistente.chat.modelo_nao_respondeu`, `erro: "TypeError"`) e o cartão
 * nunca aparece — foi o vermelho do e2e `assistente-rascunho-de-agente`.
 *
 * Mesmo formato de `lib/crypto/aes_gcm.ts` (AES-256-GCM, IV de 12 bytes, tag
 * de 16), sem importar `lib/env`: o processo do Playwright recebe o
 * `.env.e2e` no ambiente, mas não precisa de todas as variáveis do app.
 * `tests/unit/chave-de-ia-de-teste.test.ts` prova a paridade com `decryptKey`.
 */
import { createCipheriv, randomBytes } from "node:crypto";

export interface ChaveCifradaParaBytea {
  api_key_encrypted: string;
  api_key_iv: string;
  api_key_tag: string;
  api_key_last4: string;
}

/** Prefixo de `bytea` em hexadecimal, como o PostgREST aceita: barra invertida + x. */
const BYTEA = String.fromCharCode(92) + "x";

export function cifrarChaveDeTeste(
  chaveEmClaro: string,
  chaveAesEmBase64: string | undefined = process.env.AI_CRED_AES_KEY,
): ChaveCifradaParaBytea {
  const chave = Buffer.from(chaveAesEmBase64 ?? "", "base64");
  if (chave.length !== 32) {
    throw new Error(
      `AI_CRED_AES_KEY ausente ou inválida no ambiente do teste (lido: ${chave.length} bytes, esperado 32)`,
    );
  }
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chave, iv);
  const cifrado = Buffer.concat([cifra.update(chaveEmClaro, "utf8"), cifra.final()]);
  return {
    api_key_encrypted: BYTEA + cifrado.toString("hex"),
    api_key_iv: BYTEA + iv.toString("hex"),
    api_key_tag: BYTEA + cifra.getAuthTag().toString("hex"),
    api_key_last4: chaveEmClaro.slice(-4),
  };
}
