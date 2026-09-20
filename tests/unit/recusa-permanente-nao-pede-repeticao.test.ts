import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `40001` promete "tente de novo" — e quem acredita e o PostgREST.
 *
 * ## O que foi MEDIDO, com o PostgREST v14.17 (a MESMA versao da VPS)
 *
 * Duas funcoes descartaveis, identicas, so mudando o SQLSTATE da recusa. Cada
 * uma chamada UMA vez por HTTP. O contador e uma `sequence`, de proposito:
 * `nextval` nao volta atras no rollback, entao conta execucao de verdade e nao
 * transacao confirmada.
 *
 *   recusa com errcode 22023 → HTTP 400 em 12 ms ....... rodou      1 vez
 *   recusa com errcode 40001 → nunca respondeu ......... rodou 51.556 vezes
 *
 * `40001` e `serialization_failure`: ele DIZ a quem chama que foi um tropeco
 * passageiro. O PostgREST acredita e repete sem teto, ~1.700 vezes por segundo.
 * Numa recusa PERMANENTE a promessa e falsa, e quem paga e o banco — medido na
 * instalacao real: 280% de CPU por clique, e o pedido nunca volta.
 *
 * ## Por que existe uma lista de excecoes, e por que ela so ENCOLHE
 *
 * O baseline tinha 83 sitios em `40001` quando isto foi escrito, em 22 recusas
 * diferentes. Consertar os 83 de uma vez, de madrugada e sem poder provar cada
 * caminho pela tela, trocaria um defeito conhecido por um risco desconhecido.
 * Entao este invariante congela o conjunto: nenhuma recusa NOVA nasce em
 * `40001`, e cada uma que for consertada sai da lista.
 *
 * ⚠️ Se este teste ficar vermelho porque voce ACRESCENTOU uma recusa, o conserto
 * NAO e por a sua na lista. E escolher o SQLSTATE certo:
 *
 *   • a recusa passa a dar certo se insistir?  → e passageira; ainda assim NAO
 *     use 40001 (repetir a toda velocidade e ruim ate quando a promessa e
 *     verdadeira). Use `55P03`, como `meet_ocupado`.
 *   • a recusa nunca passa a dar certo?        → `22023`.
 */

// O conjunto MEDIDO em 2026-09-13, depois da 0246. Só pode encolher.
const HERDADAS = new Map<string, number>([
  ["service_stale", 13],
  ["google_stale", 11],
  ["google_conflict_requires_choice", 7],
  // 7 → 8 no merge da 1.41.0, e NÃO é recusa nova: a 0343 do upstream
  // (`0343_agenda_dos_colegas`) REDEFINIU `fn_appointment_change_core` com o
  // mesmo `appointment_stale ... 40001` — o corpo antigo continua no baseline
  // como história (append-only) e a sonda conta texto, não runtime. Em runtime
  // continua valendo 7 (o `create or replace` sobrescreve). Mesmo padrão do
  // `service_contact_changed` no merge da 1.40.0, documentado abaixo.
  ["appointment_stale", 8],
  ["meet_stale", 7],
  ["meet_conversation_stale", 5],
  // 4 → 5 no merge da 1.40.0, e NÃO é recusa nova: a 0267 do upstream
  // (`0267_espera_da_fila_nao_recomeca`) REDEFINIU `fn_mark_conversation_message`
  // com o mesmo `service_contact_changed ... 40001` — o corpo antigo continua
  // no baseline como história (append-only) e a sonda conta texto, não runtime.
  // Em runtime continua valendo 4 (o `create or replace` sobrescreve). Se um
  // SEXTO sítio aparecer, é defeito novo de verdade.
  ["service_contact_changed", 5],
  ["google_selection_stale", 4],
  // 4 → 5 no merge da 1.41.0, mesmo caso do `appointment_stale` acima: a 0343
  // do upstream redefiniu `fn_appointment_change_core` com o mesmo
  // `google_outcome_protected ... 40001`. História em texto, não recusa nova.
  ["google_outcome_protected", 5],
  ["followup_stale", 4],
  ["service_origin_cycle", 2],
  ["service_event_origin_unsupported", 2],
  ["reply_agent_stale", 2],
  ["google_write_unavailable", 2],
  ["appointment_flow_changed", 2],
  ["reply_stale", 1],
  ["meet_delivery_not_accepted", 1],
  ["meet_booking_stale", 1],
  ["followup_job_stale", 1],
  ["demanda_stale", 1],
  ["contact_redaction_busy", 1],
  ["appointment_notice_busy", 1],
]);

const baseline = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");

function recusasEm40001(sql: string): Map<string, number> {
  const achadas = new Map<string, number>();
  for (const m of sql.matchAll(/raise exception '([a-z_]+)' using errcode='40001'/g)) {
    achadas.set(m[1]!, (achadas.get(m[1]!) ?? 0) + 1);
  }
  return achadas;
}

describe("recusa permanente não se anuncia como 'tente de novo'", () => {
  const achadas = recusasEm40001(baseline);

  it("CONTROLE POSITIVO: a sonda enxerga alguma coisa", () => {
    // Sem isto, uma regex que parasse de casar — aspas trocadas, `errcode`
    // escrito de outro jeito — devolveria zero e o teste passaria medindo o
    // nada, exatamente enquanto o defeito voltava.
    expect(achadas.size, "a varredura não achou nenhum 40001: sonda cega").toBeGreaterThan(0);
  });

  it("⛔ nenhuma recusa NOVA nasce em 40001", () => {
    const novas = [...achadas.keys()].filter((nome) => !HERDADAS.has(nome));
    expect(
      novas,
      `Recusa nova em 40001: ${novas.join(", ")}.\n` +
        "40001 diz a quem chama 'tente de novo' — e o PostgREST repete sem teto.\n" +
        "MEDIDO: uma chamada HTTP virou 51.556 execuções e nunca respondeu.\n" +
        "Escolha 22023 (permanente) ou 55P03 (passageira). NÃO ponha na lista.",
    ).toEqual([]);
  });

  it("⛔ a lista herdada só ENCOLHE", () => {
    const cresceu: string[] = [];
    for (const [nome, teto] of HERDADAS) {
      const agora = achadas.get(nome) ?? 0;
      if (agora > teto) cresceu.push(`${nome}: ${teto} → ${agora}`);
    }
    expect(
      cresceu,
      `Sítio novo em 40001 numa recusa já conhecida: ${cresceu.join("; ")}.\n` +
        "Redefinir a função é a hora de corrigir o SQLSTATE, não de repetir o defeito.",
    ).toEqual([]);
  });

  it("⛔ a fn_meet_action QUE VALE não tem nenhum 40001", () => {
    // A conta total não serve aqui, e descobrir isso custou uma rodada vermelha:
    // o baseline guarda TODAS as versões da função, uma por apêndice (0241,
    // 0243, 0244, 0245, 0246). Acrescentar a versão corrigida não diminui o
    // total — só a ÚLTIMA definição é a que o Postgres fica tendo. É ela que
    // este caso lê, e é ela que o clique na tela executa.
    const ultima = baseline.lastIndexOf("create or replace function public.fn_meet_action");
    expect(ultima, "não achei fn_meet_action no baseline: sonda cega").toBeGreaterThan(0);
    // O fim da definição nem sempre é o `revoke`: os apêndices novos do
    // upstream (0365/0366, merge da 1.41.0) redefinem sem repetir o `revoke`
    // — e está certo, porque privilégio sobrevive a `create or replace`. A
    // sonda aceita o que vier primeiro: o `revoke`, a próxima definição, ou o
    // fechamento `$$;` do corpo.
    const candidatos = [
      baseline.indexOf("revoke all on function public.fn_meet_action", ultima),
      baseline.indexOf("create or replace function public.", ultima + 1),
      baseline.indexOf("\n$$;", ultima),
    ].filter((i) => i > ultima);
    const fim = candidatos.length > 0 ? Math.min(...candidatos) : -1;
    expect(fim, "não achei o fim da definição: sonda cega").toBeGreaterThan(ultima);
    const corpo = baseline.slice(ultima, fim);
    const restantes = [...corpo.matchAll(/raise exception '([a-z_]+)' using errcode='40001'/g)].map(
      (m) => m[1]!,
    );
    expect(
      restantes,
      `A versão VÁLIDA de fn_meet_action ainda recusa em 40001: ${restantes.join(", ")}. ` +
        "É esta que o botão Enviar link ao cliente executa, e foi ela que levou o banco " +
        "a 280% de CPU com o pedido nunca voltando.",
    ).toEqual([]);
  });
});
