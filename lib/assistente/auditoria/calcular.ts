/**
 * O CÁLCULO PURO DA AUDITORIA (F3).
 *
 * Recebe os dados crus já lidos das rotas `/api/v1` (com a sessão da pessoa) e
 * devolve `{ itens, pendencias }`. É puro de propósito: não fetch, não banco,
 * não Next — recebe os dados e devolve o resultado. Assim o mesmo cálculo
 * serve à rota de auditoria, à ferramenta `auditar_empresa` e aos testes puros.
 *
 * Regras de dependência: se a verificação B depende de A (`depende_de`) e A não
 * está `preenchido`, B vira `preciso_confirmar` com
 * "falta <título de A> para ativar" — nunca `posso_completar` às escondidas.
 */
import {
  lerVerificacao,
  type EstadoVerificacao,
  type ItemDaAuditoria,
  type LeituraDeVerificacao,
  todasAsVerificacoes,
} from "./verificacoes";

/** O resultado puro: os itens calculados e a contagem de pendências. */
export interface ResultadoDaAuditoria {
  itens: ItemDaAuditoria[];
  /** Tudo que não é `preenchido` nem `nao_se_aplica`. */
  pendencias: number;
}

/**
 * Calcula o estado de todas as verificações a partir dos dados crus já lidos.
 * Respeita dependências: se uma verificação depende de outra que não está
 * `preenchido`, ela vira `preciso_confirmar` com "falta X para ativar".
 */
export function calcularAuditoria(
  t: (texto: string) => string,
  leitura: LeituraDeVerificacao,
): ResultadoDaAuditoria {
  const estados = new Map<string, EstadoVerificacao>();
  const itens: ItemDaAuditoria[] = [];

  // Primeira passagem: calcula as verificações cujas dependências já estão
  // todas como `preenchido`. Repete até convergir (o grafo é quase linear, então
  // duas passadas bastam, mas o loop garante qualquer grafo).
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const id of todasAsVerificacoes()) {
      if (estados.has(id)) continue;
      const deps = dependenciasDe(id);
      if (deps.some((d) => estados.get(d) !== "preenchido")) continue;
      const item = lerVerificacao(t, id, leitura, estados);
      estados.set(id, item.estado);
      itens.push(item);
      mudou = true;
    }
  }

  // Quaisquer verificação que ficou sem calcular (dependência nunca virou
  // `preenchido`) vira `preciso_confirmar` com "falta X para ativar".
  for (const id of todasAsVerificacoes()) {
    if (estados.has(id)) continue;
    const deps = dependenciasDe(id);
    const faltando = deps.filter((d) => estados.get(d) !== "preenchido");
    itens.push({
      id,
      titulo: id,
      estado: "preciso_confirmar",
      por_que: t("Não dá avaliar enquanto faltar {faltando} para ativar.").replace("{faltando}", faltando.join(" e ")),
      dados: {},
      onde_resolver: "",
      ferramenta: null,
      depende_de: deps,
    });
  }

  // Ordena conforme a ordem de exibição do catálogo.
  itens.sort((a, b) => ordemDe(a.id) - ordemDe(b.id));

  const pendencias = itens.filter(
    (i) => i.estado !== "preenchido" && i.estado !== "nao_se_aplica",
  ).length;

  return { itens, pendencias };
}

/** As dependências de cada verificação (id → ids dos quais depende). */
function dependenciasDe(id: string): string[] {
  switch (id) {
    case "roteador":
      return ["canal_whatsapp", "agente_publicado"];
    default:
      return [];
  }
}

/** A ordem de exibição do catálogo (índice na lista). */
function ordemDe(id: string): number {
  const ordem = [
    "credencial_ia",
    "canal_whatsapp",
    "funil_etapas",
    "agente_publicado",
    "roteador",
    "conhecimento",
    "followup_instalado",
    "horario_atendimento",
  ];
  return ordem.indexOf(id);
}

// ResultadoDaAuditoria, EstadoVerificacao e ItemDaAuditoria são exportados
// de verificacoes.ts; ResultadoDaAuditoria também é exportado aqui localmente.
