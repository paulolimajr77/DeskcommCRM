/**
 * O contexto tem que dizer se o nome do contato foi CONFIRMADO pela empresa.
 *
 * Numa instalação real, 2 de 3 contatos estavam com `contacts.name` vazio: todo
 * mundo que entra pelo WhatsApp chega só com `display_name`, que é o texto que a
 * própria pessoa escreveu no aparelho ("Josué sites", "Ana Maria Matias", o
 * próprio número) e não serve para proposta, documento nem nota fiscal. Como o
 * payload funde as duas colunas (`display_name ?? name`), o modelo SEMPRE lia um
 * nome e concluía que já sabia quem era o cliente — então nunca perguntava.
 * Nenhuma instrução de prompt conserta isso: mandar "pergunte o nome de quem não
 * tem" a um modelo que lê `name: "Josué sites"` não produz pergunta nenhuma.
 *
 * Os casos abaixo vigiam as DUAS metades do contrato ao mesmo tempo: o `name`
 * antigo continua exatamente como era (ele circula por follow-up, case-reply e
 * escalação — ver o comentário de ~linha 270 do módulo), e o booleano novo diz a
 * verdade que faltava.
 */
import { expect, it, vi } from 'vitest';

import { getLeadContext } from './get-lead-context';
import type { CrmEdgeConfig } from './mcp-client';
import type { Queryable } from '../../queue/queue';

const knobs = { historyLimit: 20, maxTokens: 1000 };
const cfg = {} as CrmEdgeConfig;

const ORG = '11111111-1111-4111-8111-111111111111';
const CONTATO = '22222222-2222-4222-8222-222222222222';

/**
 * Pool falso no mesmo padrão de `drain.test.ts`: despacha por trecho do SQL. Só a
 * linha de `contacts` importa aqui — histórico e decisão vazios mantêm o payload
 * mínimo, que é o que estes casos medem.
 */
function poolFalso(contato: { name: string | null; display_name: string | null }): Queryable {
  const query = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes('from contacts')) {
      return {
        rows: [
          {
            name: contato.name,
            display_name: contato.display_name,
            email: null,
            phone_number: '5562999990000',
            tags: null,
            is_blocked: false,
            source: 'whatsapp',
            consent: null,
            is_anonymized: false,
          },
        ],
      };
    }
    return { rows: [] };
  });
  return { query } as unknown as Queryable;
}

async function contextoDe(contato: { name: string | null; display_name: string | null }) {
  const r = await getLeadContext(
    poolFalso(contato),
    cfg,
    { tenantId: ORG, leadId: CONTATO, conversationId: null, fuso: 'America/Sao_Paulo' },
    knobs,
  );
  if (!r.ok) throw new Error(`esperava ok:true, veio ${r.error.code}`);
  return r.context;
}

it('só apelido do aparelho: o nome antigo não muda e nome_confirmado é false', async () => {
  const ctx = await contextoDe({ name: null, display_name: 'Josué sites' });
  // O campo antigo é intocado de propósito — trocá-lo custa uma wave inteira.
  expect(ctx.contact.name).toBe('Josué sites');
  expect(ctx.contact.nome_confirmado).toBe(false);
});

it('nome preenchido pela empresa: nome_confirmado é true', async () => {
  const ctx = await contextoDe({ name: 'Paulo Lima', display_name: 'Paulão' });
  expect(ctx.contact.nome_confirmado).toBe(true);
});

it('nome só com espaços não é nome: nome_confirmado é false', async () => {
  const ctx = await contextoDe({ name: '   ', display_name: 'Paulão' });
  expect(ctx.contact.nome_confirmado).toBe(false);
});
