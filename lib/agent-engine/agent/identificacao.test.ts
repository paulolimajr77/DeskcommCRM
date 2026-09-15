import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { deveIdentificar, IDENTIFICACAO_SYSTEM_BLOCK } from './identificacao';

/**
 * O bloco que manda o agente descobrir COM QUEM ele está falando.
 *
 * O defeito medido: numa instalação real, 2 de 3 contatos estavam sem nome no
 * cadastro. Nenhum bloco de sistema falava de identificação, e a única ferramenta
 * que registra esse dado tem `description` que começa em "Registra uma informação
 * que o cliente forneceu" — ordem de anotar o que caiu no colo, nunca de perguntar.
 *
 * Este arquivo vigia as duas coisas que quebram esse bloco em silêncio: ele deixar
 * de ser constante (e passar a invalidar o prefixo cacheado a cada contato) e ele
 * deixar de depender da ferramenta estar ligada (e passar a mandar o agente prometer
 * o que não tem como cumprir).
 */
describe('IDENTIFICACAO_SYSTEM_BLOCK — o texto', () => {
  it('é constante: nenhuma interpolação sobrou no texto', () => {
    // Por quê: o `system` inteiro vai para o prefixo cacheado do provedor
    // (`edge/llm/stable-prefix.ts`), cuja regra dura é "NADA volátil entra aqui".
    // Um `${lead.nome}` perdido aqui derrubaria o cache de TODA conversa da org.
    expect(IDENTIFICACAO_SYSTEM_BLOCK).not.toContain('${');
  });

  it('nomeia a ferramenta e o campo que decidem o comportamento', () => {
    expect(IDENTIFICACAO_SYSTEM_BLOCK).toContain('crm_propose_contact_field');
    expect(IDENTIFICACAO_SYSTEM_BLOCK).toContain('nome_confirmado');
  });

  it('a trava do nome: pergunta UMA VEZ e não insiste', () => {
    expect(IDENTIFICACAO_SYSTEM_BLOCK).toMatch(/uma vez/i);
    expect(IDENTIFICACAO_SYSTEM_BLOCK).toMatch(/n[ãa]o pergunte de novo/i);
  });

  it('a trava do e-mail: só quando há o que enviar', () => {
    expect(IDENTIFICACAO_SYSTEM_BLOCK).toMatch(/e-?mail/i);
    expect(IDENTIFICACAO_SYSTEM_BLOCK).toMatch(/proposta|or[çc]amento|documento/i);
  });

  it('a trava do telefone: não perguntar, a conversa já chega por um número', () => {
    expect(IDENTIFICACAO_SYSTEM_BLOCK).toMatch(/telefone/i);
    expect(IDENTIFICACAO_SYSTEM_BLOCK).toMatch(/telefone[\s\S]{0,200}N[ÃA]O pergunte/i);
  });

  it('nunca diz ao cliente que o cadastro foi atualizado — a proposta é decidida por um humano', () => {
    expect(IDENTIFICACAO_SYSTEM_BLOCK).toMatch(/proposta/i);
    expect(IDENTIFICACAO_SYSTEM_BLOCK).toMatch(/cadastro foi atualizado/i);
  });
});

describe('deveIdentificar — a condição é a FERRAMENTA, nunca o contato', () => {
  it('sem ferramenta nenhuma: o bloco não entra', () => {
    expect(deveIdentificar([])).toBe(false);
  });

  it('com outras ferramentas, mas sem esta: o bloco não entra', () => {
    // Mandar perguntar o nome sem a ferramenta ligada faz o agente coletar um dado
    // que não tem para onde ir — o mesmo defeito que o comentário do
    // AGENDA_SYSTEM_BLOCK descreve.
    expect(deveIdentificar(['crm_get_contact', 'crm_book_appointment', 'send_message'])).toBe(
      false,
    );
  });

  it('com a ferramenta ligada: o bloco entra', () => {
    expect(deveIdentificar(['crm_propose_contact_field'])).toBe(true);
    expect(deveIdentificar(['crm_get_contact', 'crm_propose_contact_field'])).toBe(true);
  });
});

/**
 * FIAÇÃO — mesmo padrão de `tests/unit/gate-agenda-stall.test.ts`: prova que a decisão
 * chega à montagem REAL do prompt, não só que a função pura decide certo isolada.
 *
 * ⚠️ As linhas de comentário são removidas ANTES de procurar. Sem isso, comentar a
 * linha que empilha o bloco deixaria este teste verde — o texto continuaria no arquivo.
 */
const FONTE_INBOUND = (() => {
  const bruto = readFileSync(
    path.join(process.cwd(), 'lib/agent-engine/agent/inbound-turn.ts'),
    'utf8',
  );
  return bruto
    .split('\n')
    .filter((linha) => {
      const t = linha.trimStart();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
})();

describe('fiação — inbound-turn empilha o bloco sob a decisão compartilhada', () => {
  it('importa o bloco e a função de identificacao.ts', () => {
    expect(FONTE_INBOUND).toMatch(/IDENTIFICACAO_SYSTEM_BLOCK/);
    expect(FONTE_INBOUND).toMatch(/deveIdentificar/);
    expect(FONTE_INBOUND).toMatch(/from ["']\.\/identificacao["']/);
  });

  it('o push acontece na montagem dos blocos residentes, guardado por deveIdentificar', () => {
    const i = FONTE_INBOUND.indexOf('const blocosResidentes = [');
    const j = FONTE_INBOUND.indexOf('const system = blocosResidentes.join(', i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    const montagem = FONTE_INBOUND.slice(i, j);
    expect(montagem).toMatch(/deveIdentificar\(agentConfig\.toolIds\)/);
    expect(montagem).toMatch(/blocosResidentes\.push\(IDENTIFICACAO_SYSTEM_BLOCK\)/);
  });

  it('a regra não é copiada inline na montagem — quem decide é a função pura', () => {
    // Uma cópia da condição em `inbound-turn.ts` deixaria este arquivo vigiando
    // uma regra que não é a que roda em produção.
    const i = FONTE_INBOUND.indexOf('const blocosResidentes = [');
    const j = FONTE_INBOUND.indexOf('const system = blocosResidentes.join(', i);
    const montagem = FONTE_INBOUND.slice(i, j);
    expect(montagem).not.toMatch(/includes\('crm_propose_contact_field'\)/);
  });
});
