/** Controlled provider for the existing INTERNAL_AGENT_RUN_STUB QA switch.
 * Only substitutes the provider seam: tools, retrieval, gates and closing remain real.
 */
import { randomUUID } from 'node:crypto';
import { createFakeRegistry } from '../edge/llm/providers';
import { MARCA_DA_CONSULTA_INTERNA } from './conversa-do-caso/contexto';
import { MARCA_DO_ASSISTENTE } from './assistente/prompt';
export function previewFixtureRegistry() {
  return createFakeRegistry(async (options) => {
    const text = JSON.stringify(options.prompt);
    const toolResults = options.prompt.filter((m) => m.role === 'tool').flatMap((m) => m.content);
    const saw = (name: string) => toolResults.some((r) => 'toolName' in r && r.toolName === name);
    const content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool-call'; toolCallId: string; toolName: string; input: string }
    > = [];
    if (!options.tools?.length) {
      // A CONSULTA INTERNA DO CASO vem ANTES dos ramos de JSON.
      //
      // Os ramos abaixo devolvem JSON (memória, compactação, checkpoint) porque
      // é isso que o turno espera de uma chamada sem tools. O chat do caso
      // espera PROSA — e sem este ramo o e2e mostraria o JSON de compactação
      // dentro da bolha da IA, na tela, para quem está avaliando o produto.
      //
      // A marca é IMPORTADA do módulo do prompt, nunca um literal duplicado:
      // literal duplicado é a divergência que este repositório já pagou várias
      // vezes — o prompt muda de um lado e o dublê segue casando o texto velho.
      const value = text.includes(MARCA_DA_CONSULTA_INTERNA)
        ? 'Pelo que está registrado, o cliente pediu um desconto acima da política. ' +
          'A IA travou porque a política permite até 10%.'
        : text.includes('Turno interno de memória')
        ? {
            notes: [
              { headline: 'Preferência do cenário', body: 'Atendimento com confirmação humana.' },
            ],
          }
        : text.includes('Compacte a conversa')
          ? {
              commitments: [],
              objections: [],
              personal_data: [],
              stage: null,
              rolling_summary: 'Cenário resumido para revisão.',
            }
          : {
              commitments: [],
              objections: [],
              next_action: null,
              rolling_summary: 'Resposta proposta para revisão humana.',
              declaracao: { promessas: [] },
            };
      // Prosa sai como prosa; os ramos de JSON continuam serializados. Um
      // `JSON.stringify` cego poria a resposta do chat entre aspas na tela.
      content.push({ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) });
    } else {
      // O CHAT DO ASSISTENTE vem ANTES da escolha search_knowledge/send_message:
      // sem este ramo, o e2e do assistente emitiria `send_message`, que não
      // existe naquele turno — e o teste provaria um caminho que o produto não
      // tem. A marca é IMPORTADA do módulo do prompt, nunca um literal
      // duplicado (ver o comentário do ramo sem tools acima).
      // Ramo do PAR (T9): a pergunta sobre a fila desce até `consultar_metrica`
      // de verdade — o número que o chat mostra é o mesmo do GET direto, porque
      // a métrica lê a mesma rota por dentro. O dublê só finge o raciocínio do
      // modelo (qual ferramenta chamar); dado, papel e RLS continuam reais.
      // NUNCA lança: extração defensiva com fallback para o texto fixo.
      const extrairTextoUltimaMensagemDoUsuario = (prompt: unknown): string => {
        try {
          if (!Array.isArray(prompt)) return "";
          for (let i = prompt.length - 1; i >= 0; i--) {
            const msg = prompt[i] as { role?: unknown; content?: unknown } | null | undefined;
            if (msg == null || typeof msg !== "object") continue;
            if (msg.role !== "user") continue;
            const conteudo = msg.content;
            if (typeof conteudo === "string") return conteudo;
            if (Array.isArray(conteudo)) {
              return conteudo
                .map((parte) => {
                  if (typeof parte === "string") return parte;
                  if (
                    parte != null &&
                    typeof parte === "object" &&
                    typeof (parte as { text?: unknown }).text === "string"
                  )
                    return (parte as { text: string }).text;
                  return "";
                })
                .join(" ");
            }
            if (
              conteudo != null &&
              typeof conteudo === "object" &&
              typeof (conteudo as { text?: unknown }).text === "string"
            )
              return (conteudo as { text: string }).text;
            if (conteudo == null) return "";
            return String(conteudo);
          }
          return "";
        } catch {
          return "";
        }
      };
      const extrairFila = (resultados: unknown[]): number | null => {
        for (const item of resultados) {
          try {
            const achado = JSON.stringify(item).match(/"fila"\s*:\s*(\d+)/);
            if (achado) return Number(achado[1]);
          } catch {
            continue;
          }
        }
        return null;
      };
      // Ramo do PAR (T17): o pedido "monta o agente da minha clínica" desce
      // até `montar_pacote_do_nicho` de verdade — o dublê só finge o raciocínio
      // do modelo (qual ferramenta chamar, com dados do nicho com prompt
      // pronto); criar o rascunho, ler de volta e anotar o cartão é a
      // ferramenta real, com a sessão do administrador. NUNCA lança.
      const extrairNomeDoAgente = (resultados: unknown[]): string | null => {
        for (const item of resultados) {
          try {
            const achado = JSON.stringify(item).match(/"nome"\s*:\s*"([^"]+)"/);
            if (achado) return achado[1] ?? null;
          } catch {
            continue;
          }
        }
        return null;
      };
      if (text.includes(MARCA_DO_ASSISTENTE)) {
        const temConsulta = options.tools?.some((t) => t.type === 'function' && t.name === 'consultar_metrica');
        const consultou = saw('consultar_metrica');
        const textoDaUltimaMensagemDoUsuario = extrairTextoUltimaMensagemDoUsuario(options.prompt);
        const temPacote = options.tools?.some(
          (t) => t.type === 'function' && t.name === 'montar_pacote_do_nicho',
        );
        const montou = saw('montar_pacote_do_nicho') || saw('criar_rascunho_de_agente');
        if (/cl[ií]nica|monta o agente/i.test(textoDaUltimaMensagemDoUsuario) && temPacote === true && !montou) {
          content.push({
            type: 'tool-call',
            toolCallId: randomUUID(),
            toolName: 'montar_pacote_do_nicho',
            input: JSON.stringify({
              nicho: 'clinica',
              negocio: 'Clínica E2E',
              descricao: 'atendimento da clínica de teste',
              nome_do_agente: `Agente Clinica E2E ${randomUUID().slice(0, 8)}`,
              followups: ['clinica-consulta-retomada'],
            }),
          });
        } else if (montou) {
          const nome = extrairNomeDoAgente(toolResults);
          content.push({
            type: 'text',
            text:
              nome === null
                ? 'Não consegui criar o rascunho agora — confira o motivo e tente de novo.'
                : `Criei o rascunho do ${nome}. Confira o cartão abaixo — nada foi publicado.`,
          });
        } else if (/fila/i.test(textoDaUltimaMensagemDoUsuario) && temConsulta === true && !consultou) {
          content.push({
            type: 'tool-call',
            toolCallId: randomUUID(),
            toolName: 'consultar_metrica',
            input: JSON.stringify({ metrica: 'conversas_por_visao', parametros: {} }),
          });
        } else if (consultou) {
          const fila = extrairFila(toolResults);
          content.push({
            type: 'text',
            text: fila === null ? 'Resposta de teste do assistente.' : `Há ${fila} conversas na fila do inbox.`,
          });
        } else if (
          options.tools?.some((t) => t.type === 'function' && t.name === 'listar_metricas') &&
          !saw('listar_metricas')
        ) {
          content.push({
            type: 'tool-call',
            toolCallId: randomUUID(),
            toolName: 'listar_metricas',
            input: '{}',
          });
        } else {
          content.push({ type: 'text', text: 'Resposta de teste do assistente.' });
        }
      } else {
        const has = (name: string) =>
          options.tools?.some((t) => t.type === 'function' && t.name === name);
        const name =
          has('search_knowledge') && !saw('search_knowledge')
            ? 'search_knowledge'
            : !saw('send_message')
              ? 'send_message'
              : null;
        if (name)
          content.push({
            type: 'tool-call',
            toolCallId: randomUUID(),
            toolName: name,
            input: JSON.stringify(
              name === 'search_knowledge'
                ? { query: 'informações de atendimento' }
                : {
                    body: 'Olá! Posso ajudar com as informações do atendimento. O que você gostaria de saber?',
                  },
            ),
          });
        else content.push({ type: 'text', text: 'Sugestão registrada.' });
      }
    }
    return {
      content,
      finishReason: {
        unified: content[0]?.type === 'tool-call' ? 'tool-calls' : 'stop',
        raw: undefined,
      },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    };
  });
}
