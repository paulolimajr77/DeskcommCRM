/**
 * Teste do cache TTL de anúncios: TTL, descarte do mais antigo e o relógio
 * injetável. Falha nunca é guardada — quem decide é o adaptador, testado lá.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  cacheDeCampanhas,
  cacheDeContas,
  limparCacheDeAnuncios,
  sobreporRelogioDoCache,
} from "./cache-ttl";

afterEach(() => {
  limparCacheDeAnuncios();
  sobreporRelogioDoCache(null);
});

describe("cache de anúncios — TTL e descarte", () => {
  it("valor dentro do TTL sai; depois do TTL some (relógio injetado)", () => {
    let agora = 1_000_000;
    sobreporRelogioDoCache(() => agora);
    cacheDeCampanhas.guardar("org|c|2026-10-05|2026-10-11", { ok: true });
    expect(cacheDeCampanhas.pegar("org|c|2026-10-05|2026-10-11")?.valor).toEqual({ ok: true });
    agora += 4 * 60 * 1000; // 4 min: ainda dentro dos 5 de campanha
    expect(cacheDeCampanhas.pegar("org|c|2026-10-05|2026-10-11")?.valor).toEqual({ ok: true });
    agora += 2 * 60 * 1000; // 6 min: vencido
    expect(cacheDeCampanhas.pegar("org|c|2026-10-05|2026-10-11")).toBeUndefined();
  });

  it("contas vivem 30 min e campanhas 5 min (TTLs distintos)", () => {
    let agora = 1_000_000;
    sobreporRelogioDoCache(() => agora);
    cacheDeContas.guardar("org|contas", ["a"]);
    cacheDeCampanhas.guardar("org|c", ["b"]);
    agora += 6 * 60 * 1000;
    expect(cacheDeContas.pegar("org|contas")?.valor).toEqual(["a"]);
    expect(cacheDeCampanhas.pegar("org|c")).toBeUndefined();
  });

  it("passou de 200 entradas: a mais antiga é descartada", () => {
    for (let i = 0; i < 201; i += 1) cacheDeCampanhas.guardar(`chave-${i}`, i);
    expect(cacheDeCampanhas.pegar("chave-0")).toBeUndefined();
    expect(cacheDeCampanhas.pegar("chave-200")?.valor).toBe(200);
  });

  it("limparCacheDeAnuncios esvazia os dois", () => {
    cacheDeContas.guardar("a", 1);
    cacheDeCampanhas.guardar("b", 2);
    limparCacheDeAnuncios();
    expect(cacheDeContas.pegar("a")).toBeUndefined();
    expect(cacheDeCampanhas.pegar("b")).toBeUndefined();
  });
});
