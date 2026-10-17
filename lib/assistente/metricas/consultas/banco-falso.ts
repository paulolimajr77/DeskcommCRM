/**
 * Banco FALSO encadeável para os testes das métricas que leem o banco direto
 * (fechamentos, propostas, origens). Copiado e estendido do `fakeSupabase` de
 * `app/api/v1/metrics/lost/route.test.ts`: dataset por tabela, filtros
 * aplicados no próprio falso, e TODA resposta cortada em `MAX_ROWS = 1000`
 * (como o `max_rows` do PostgREST — o corte é do SERVIDOR, não do `.limit()`).
 *
 * `count` só vem quando a consulta pede `{ count: "exact" }`; com
 * `head: true` o falso devolve `data: null` e o `count` EXATO, sem corte —
 * é o caminho das contagens de fechamento.
 *
 * Cada consulta fica REGISTRADA (tabela, filtros, ordens, faixas) para os
 * testes conferirem o que foi pedido ao banco. Embeds (ex.: linha de
 * `crm_proposals` com `crm_proposal_items: [...]` aninhado) vêm prontos no
 * dataset — o falso ignora a lista de colunas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_ROWS = 1000;

export type LinhaDeTeste = Record<string, unknown>;

export interface ConsultaRegistrada {
  tabela: string;
  filtros: Array<[string, unknown]>;
  ordens: string[];
  faixas: Array<[number, number]>;
  contou: boolean;
}

export interface BancoFalso {
  consultas: ConsultaRegistrada[];
  client: SupabaseClient;
}

type RespostaFalsa =
  | { data: null; count: null; error: { message: string } }
  | { data: readonly LinhaDeTeste[] | null; count: number | null; error: null };

export function criarBancoFalso(
  dados: Record<string, readonly LinhaDeTeste[]>,
  erroEm?: string,
): BancoFalso {
  const consultas: ConsultaRegistrada[] = [];

  const client = {
    from(tabela: string) {
      const registro: ConsultaRegistrada = {
        tabela,
        filtros: [],
        ordens: [],
        faixas: [],
        contou: false,
      };
      consultas.push(registro);

      const filtros: Array<(linha: LinhaDeTeste) => boolean> = [];
      let pediuCount = false;
      let cabeca = false;

      const executar = (faixa: [number, number] | null): RespostaFalsa => {
        if (erroEm === tabela) {
          return { data: null, count: null, error: { message: "leitura recusada pelo banco" } };
        }
        const base = (dados[tabela] ?? []).filter((linha) => filtros.every((f) => f(linha)));
        if (cabeca) {
          // Contagem exata sem linhas (head: true) — SEM o corte de 1000.
          return { data: null, count: pediuCount ? base.length : null, error: null };
        }
        const fatia = faixa ? base.slice(faixa[0], faixa[1] + 1) : base;
        return {
          data: fatia.slice(0, MAX_ROWS),
          count: pediuCount ? base.length : null,
          error: null,
        };
      };

      const builder = {
        select(_colunas: string, opcoes?: { count?: "exact"; head?: boolean }) {
          pediuCount = opcoes?.count === "exact";
          cabeca = opcoes?.head === true;
          registro.contou = pediuCount;
          return builder;
        },
        eq(coluna: string, valor: unknown) {
          registro.filtros.push([coluna, valor]);
          filtros.push((linha) => !(coluna in linha) || linha[coluna] === valor);
          return builder;
        },
        neq(coluna: string, valor: unknown) {
          registro.filtros.push([`${coluna} !=`, valor]);
          filtros.push((linha) => !(coluna in linha) || linha[coluna] !== valor);
          return builder;
        },
        in(coluna: string, valores: readonly unknown[]) {
          registro.filtros.push([`${coluna} in`, [...valores]]);
          filtros.push((linha) => !(coluna in linha) || valores.includes(linha[coluna]));
          return builder;
        },
        gte(coluna: string, valor: unknown) {
          registro.filtros.push([`${coluna} >=`, valor]);
          filtros.push(
            (linha) =>
              linha[coluna] !== null && linha[coluna] !== undefined && String(linha[coluna]) >= String(valor),
          );
          return builder;
        },
        lt(coluna: string, valor: unknown) {
          registro.filtros.push([`${coluna} <`, valor]);
          filtros.push(
            (linha) =>
              linha[coluna] !== null && linha[coluna] !== undefined && String(linha[coluna]) < String(valor),
          );
          return builder;
        },
        order(coluna: string) {
          registro.ordens.push(coluna);
          return builder;
        },
        range(inicio: number, fim: number) {
          registro.faixas.push([inicio, fim]);
          return Promise.resolve(executar([inicio, fim]));
        },
        limit(n: number) {
          const resposta = executar(null);
          const linhas = resposta.error === null && resposta.data ? resposta.data : [];
          return Promise.resolve({ ...resposta, data: linhas.slice(0, Math.min(n, MAX_ROWS)) });
        },
        maybeSingle() {
          const resposta = executar(null);
          const linha = resposta.error === null && resposta.data ? (resposta.data[0] ?? null) : null;
          return Promise.resolve({ data: linha, error: resposta.error === null ? null : resposta.error });
        },
        then(
          ok?: (valor: RespostaFalsa) => unknown,
          erro?: (motivo: unknown) => unknown,
        ): Promise<unknown> {
          return Promise.resolve(executar(null)).then(ok, erro);
        },
      };
      return builder;
    },
  };

  return { consultas, client: client as unknown as SupabaseClient };
}
