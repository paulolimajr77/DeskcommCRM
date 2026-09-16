import { describe, expect, it } from 'vitest';

import type { Queryable } from '../../queue/queue';
import { negocioDaConversa } from './negocio-da-conversa';

/**
 * O NEGÓCIO DESTA CONVERSA — a resposta, com o filtro de organização de pé.
 *
 * Este arquivo mede o módulo contra o contrato que o resto do sistema já tem:
 * a query filtra `organization_id` (multi-tenant é regra dura — cada
 * organização é um cliente pagante DIFERENTE), e o desfecho vem de
 * `resolveActiveLeadForContact`, não de uma reimplementação local.
 *
 * ⚠️ E POR ISSO A PROVA DO FILTRO TEM DE SER A INSTRUÇÃO, NÃO O RESULTADO.
 *
 * O dublê do banco abaixo FILTRA — porque é o que o banco faz. E é justamente
 * por ele filtrar que o resultado de uma chamada NÃO prova nada sobre o filtro
 * da query: se alguém apagar o `where organization_id = $1` do SQL, o dublê
 * continua removendo a linha de fora e o caso passaria verde de qualquer jeito.
 * Teste que passa pelo motivo errado é pior que teste ausente — ocupa o lugar
 * da prova. Por isso o caso 4 mede o SQL e os parâmetros ENVIADOS (o dublê já
 * os guarda), e não o que voltou.
 */

const TENANT = 'org-1';
const OUTRA_ORG = 'org-2';
const CONTATO = 'c0a7aaaa-0000-4000-8000-000000000001';
const NEGOCIO_A = '1eadaaaa-0000-4000-8000-000000000001';
const NEGOCIO_B = '1eadaaaa-0000-4000-8000-000000000002';

interface Row {
  id: string;
  organization_id: string;
  pipeline_id: string;
  status: string;
  last_activity_at: string | null;
  created_at: string;
}

function negocio(
  id: string,
  opts: { org?: string; at?: string | null } = {},
): Row {
  return {
    id,
    organization_id: opts.org ?? TENANT,
    pipeline_id: 'pipe-1',
    status: 'open',
    last_activity_at: opts.at === undefined ? '2026-09-15T00:00:00Z' : opts.at,
    created_at: '2026-09-01T00:00:00Z',
  };
}

/**
 * Dublê FIEL: filtra por organização, porque é o que o banco faz.
 *
 * Ele guarda o SQL e os parâmetros de cada chamada — é essa lista que o caso 4
 * lê para provar a INSTRUÇÃO. O filtro do dublê existe para os outros casos
 * rodarem contra um mundo onde o banco se comporta; ele NÃO é a prova do filtro
 * da query, e confundir os dois é o defeito que este arquivo já cometeu uma
 * vez.
 */
function duble(rows: Row[]) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      const daOrg = rows.filter((r) => r.organization_id === params[0]);
      return { rows: daOrg };
    },
  } as unknown as Queryable;
  return { db, queries };
}

/**
 * Dublê CRU: devolve tudo o que recebeu, sem filtro nenhum.
 *
 * Existe para provar a REDE DE SEGURANÇA — que uma lista misturada, se algum dia
 * chegar ao resolver, EXPLODE em vez de virar roteamento silencioso para a
 * organização errada. É o outro lado do caso 4: lá se prova que a query
 * filtra; aqui se prova que, se um dia ela parar de filtrar, o defeito é
 * BARULHENTO, não silencioso.
 */
function dubleCru(rows: Row[]) {
  const db = {
    query: async () => ({ rows }),
  } as unknown as Queryable;
  return db;
}

describe('negocioDaConversa', () => {
  it('um negócio aberto devolve o id', async () => {
    const { db } = duble([negocio(NEGOCIO_A)]);
    const r = await negocioDaConversa(db, { tenantId: TENANT, contactId: CONTATO });
    expect(r).toEqual({ tipo: 'um', leadId: NEGOCIO_A });
  });

  it('nenhum negócio aberto NÃO é erro — é informação', async () => {
    // "Nenhum" e "erro" têm de ser distinguíveis: o primeiro é o paciente novo,
    // o segundo é falha de leitura. O chamador escolhe entre seguir a conversa
    // e re-tentar — colapsar os dois faria o sistema culpar a rede por uma
    // pessoa que ainda não tem negócio aberto.
    const { db } = duble([]);
    const r = await negocioDaConversa(db, { tenantId: TENANT, contactId: CONTATO });
    expect(r).toEqual({ tipo: 'nenhum' });
  });

  it('dois negócios abertos empatados devolve a contagem', async () => {
    // Empate é o caso ambíguo — o resolver não escolhe o primeiro: mover o card
    // errado do cliente errado é o único bug desta família visível para o
    // cliente final. O "quantos" existe porque a mensagem do modelo muda com
    // ele ("dois negócios" soa diferente de "cinco").
    const { db } = duble([
      negocio(NEGOCIO_A, { at: '2026-09-15T00:00:00Z' }),
      negocio(NEGOCIO_B, { at: '2026-09-15T00:00:00Z' }),
    ]);
    const r = await negocioDaConversa(db, { tenantId: TENANT, contactId: CONTATO });
    expect(r.tipo).toBe('varios');
    if (r.tipo !== 'varios') return;
    expect(r.quantos).toBe(2);
  });

  it('a query filtra por organização — provado pela INSTRUÇÃO enviada', async () => {
    // ⛔ ESTE CASO EXISTE PORQUE A REGRA MULTI-TENANT NÃO É ABSTRATA: neste
    // produto cada organização é um cliente pagante DIFERENTE, e vazar dado de
    // uma para outra é o FIM do produto — não um bug grave, o fim. O teste não
    // pode se apoiar no resultado da chamada: o dublê filtra (fielmente), então
    // o resultado é o mesmo com ou sem o `where` da query. A prova tem de ser a
    // INSTRUÇÃO que o módulo manda ao banco — o SQL e os parâmetros ficam
    // capturados, e é sobre eles que a asserção recai.
    //
    // ⚠️ E NÃO BASTA PROVAR `organization_id`. A outra metade — `contact_id` e
    // o `$2` que o acompanha — é o que impede a query de devolver o negócio de
    // outra PESSOA dentro da mesma organização, que seria um vazamento
    // silencioso do tipo mais caro: o dado parece certo, é de outro cliente, e
    // ninguém tem motivo para desconfiar.
    const { db, queries } = duble([
      negocio(NEGOCIO_A, { org: TENANT }),
      negocio(NEGOCIO_B, { org: OUTRA_ORG }),
    ]);
    await negocioDaConversa(db, { tenantId: TENANT, contactId: CONTATO });

    expect(queries).toHaveLength(1);
    const { sql, params } = queries[0]!;
    expect(sql, 'a query perdeu o filtro de organização').toMatch(
      /organization_id\s*=\s*\$1/,
    );
    expect(sql, 'a query perdeu o filtro de contato').toMatch(
      /contact_id\s*=\s*\$2/,
    );
    expect(params[0]).toBe(TENANT);
    expect(params[1]).toBe(CONTATO);
  });

  it('a rede de segurança: lista MISTURADA faz o resolver LANÇAR', async () => {
    // O outro lado do caso anterior. Lá se prova que a query filtra; aqui se
    // prova que, se um dia ela deixar de filtrar, o defeito é BARULHENTO em vez
    // de silencioso. `resolveActiveLeadForContact` tem um `assertMesmaOrg` que
    // estoura quando a lista mistura organizações — porque rotear a escrita de
    // um tenant para o negócio de outro pareceria decisão correta, e vazamento
    // que passa despercebido é o modo de falha mais caro deste repositório.
    //
    // O dublê CRU devolve tudo o que recebeu, sem filtro, simulando exatamente
    // o mundo em que o `where` sumiu. Sem este caso, apagar o filtro da query
    // deixaria a tabela de testes verde com o vazamento de pé: o dublê fiel
    // continuaria escondendo a linha de fora, e nada faria barulho até alguém
    // perceber no banco de produção.
    const db = dubleCru([
      negocio(NEGOCIO_A, { org: TENANT }),
      negocio(NEGOCIO_B, { org: OUTRA_ORG }),
    ]);
    await expect(
      negocioDaConversa(db, { tenantId: TENANT, contactId: CONTATO }),
    ).rejects.toThrow(/organizações diferentes/);
  });
});
