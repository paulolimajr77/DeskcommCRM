"use client";

import { useT } from "@/hooks/i18n/useT";
import {
  diffLegivel,
  type DiffLegivel,
} from "@/lib/assistente/propostas/diff-legivel";
import type { Tradutor } from "@/lib/assistente/propostas/tradutor";
import { formatadorDeData } from "@/lib/cobranca/fuso";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";

const UM_DIA_EM_MS = 86_400_000;

/** Uma proposta da fila, tal como `GET /api/v1/ai/assistente/propostas` devolve. */
export interface PropostaNaTela {
  id: string;
  kind: string;
  operacao: string | null;
  risk: string;
  status: string;
  resumo: string;
  motivo: string;
  antes: unknown;
  payload: unknown;
  requested_by: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  applied_by: string | null;
  applied_at: string | null;
  apply_result: unknown;
  expires_at: string;
  created_at: string;
  vencida: boolean;
}

/** Rótulo do TIPO em português (o `kind` é vocabulário do banco, não da tela). */
function rotuloDoTipo(t: Tradutor, kind: string): string {
  switch (kind) {
    case "roteador":
      return t("Roteador");
    case "conhecimento":
      return t("Conhecimento");
    case "memoria":
      return t("Memória");
    case "modelo_auxiliares":
      return t("Modelo dos auxiliares");
    case "funil":
      return t("Funil");
    default:
      return kind;
  }
}

/** Rótulo da OPERAÇÃO em português. */
function rotuloDaOperacao(t: Tradutor, operacao: string | null): string {
  switch (operacao) {
    case "criar":
      return t("criar");
    case "alterar":
      return t("alterar");
    case "membros":
      return t("intenções");
    case "arquivar":
      return t("arquivar");
    case "definir_ponto":
      return t("definir ponto");
    case "definir_padrao":
      return t("definir padrão");
    case "criar_funil":
      return t("criar funil");
    case "criar_etapa":
      return t("criar etapa");
    case "alterar_etapa":
      return t("alterar etapa");
    default:
      return operacao ?? "";
  }
}

/** O prazo em frase: "vence em N dias" / "venceu" / o estado já decidido. */
function fraseDoPrazo(t: Tradutor, p: PropostaNaTela): string {
  if (p.status === "aplicada") return t("Aplicada");
  if (p.status === "rejeitada") return t("Rejeitada");
  if (p.status === "expirada") return t("Expirou sem decisão.");
  if (p.vencida) return p.status === "pendente" ? t("Venceu sem decisão.") : t("Venceu sem aplicação.");
  const restante = new Date(p.expires_at).getTime() - Date.now();
  const dias = Math.max(1, Math.ceil(restante / UM_DIA_EM_MS));
  return `${t("Vence em")} ${dias} ${dias === 1 ? t("dia") : t("dias")}`;
}

/**
 * O CARTÃO DE UMA PROPOSTA DENTRO DA CONVERSA (decisão do dono, 18/10/2026).
 *
 * Antes disto, a proposta vivia numa ABA separada do painel; a pessoa pedia na
 * conversa, a resposta caía numa aba e a decisão em outra. Agora o cartão chega
 * como MENSAGEM — quando o modelo propõe (`propor_*`), quando o administrador
 * abre o painel com pendências, quando ele digita `/pendentes` — e a decisão
 * mora nele: **Aplicar** (aprova e aplica em sequência) ou **Não** (rejeita).
 *
 * O cartão é APRESENTAÇÃO: o conteúdo inteiro (o `antes`, o `payload`, o resumo
 * e o prazo) vem da fila oficial, e quem chama as rotas é o chat — assim o mesmo
 * cartão serve para os três caminhos, e nenhuma ação sai daqui sem passar pelo
 * RBAC e pelo `requireSupportWrite` das rotas de sempre.
 *
 * "Aplicar" aparece para o que aguarda decisão (`pendente`) e para o que ficou
 * aprovado sem aplicar (`aprovada`, quando a segunda etapa falhou): nos dois, a
 * sequência é a mesma. "Não" só aparece no que ainda aguarda decisão — rejeitar
 * o que já foi aplicado não existe na rota.
 */
export function CartaoDeProposta({
  id,
  proposta,
  nomeDe,
  ocupado,
  erro,
  aoAplicar,
  aoNao,
}: {
  /** O `id` que veio na ação do chat; o conteúdo é buscado na fila por ele. */
  id: string;
  /** `null` enquanto a fila não chegou (o cartão aparece, o conteúdo carrega). */
  proposta: PropostaNaTela | null;
  /** `user_id` → nome; sem a lista de equipe, o rótulo genérico. */
  nomeDe: (userId: string) => string;
  ocupado: boolean;
  /** O erro da última ação neste cartão, já em português. */
  erro: string | null;
  aoAplicar: (id: string) => void;
  aoNao: (id: string) => void;
}) {
  const t = useT();
  const idioma = useIdioma();

  if (proposta === null) {
    return (
      <div
        data-testid={`proposta-${id}`}
        data-status="carregando"
        className="max-w-full rounded-md border px-3 py-2 text-sm text-text-muted"
      >
        {t("Carregando a mudança…")}
      </div>
    );
  }

  const p = proposta;
  const diff: DiffLegivel = diffLegivel(t as Tradutor, {
    kind: p.kind,
    operacao: p.operacao,
    antes: p.antes,
    payload: p.payload,
  });
  const podeDecidir = p.status === "pendente" && !p.vencida;
  const podeAplicar = (p.status === "pendente" || p.status === "aprovada") && !p.vencida;

  return (
    <div
      data-testid={`proposta-${p.id}`}
      data-status={p.status}
      className="flex max-w-full flex-col gap-2 rounded-md border p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-text-muted">
          {rotuloDoTipo(t, p.kind)} · {rotuloDaOperacao(t, p.operacao)}
        </p>
        <span
          data-testid="proposta-risco"
          className={
            p.risk === "atencao"
              ? "shrink-0 rounded-full border border-amber-600/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
              : "shrink-0 rounded-full border border-emerald-600/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400"
          }
        >
          {p.risk === "atencao" ? t("Atenção") : t("Seguro")}
        </span>
      </div>
      <p className="text-sm font-medium">{p.resumo}</p>

      {diff.linhas.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-md bg-muted/60 p-2">
          {diff.linhas.map((linha, i) => (
            <div key={`${linha.rotulo}-${i}`} className="text-xs">
              <span className="font-medium">{linha.rotulo}: </span>
              {linha.de !== null && linha.de !== "" && linha.de !== linha.para ? (
                <>
                  <span className="text-text-muted line-through">{linha.de}</span>
                  {" → "}
                </>
              ) : null}
              <span>{linha.para ?? "—"}</span>
            </div>
          ))}
        </div>
      ) : null}

      {diff.avisos.map((aviso, i) => (
        <p
          key={`${p.id}-aviso-${i}`}
          role="note"
          className="rounded-md border border-dashed px-3 py-2 text-xs text-text-muted"
        >
          {aviso}
        </p>
      ))}

      <p data-testid={`proposta-quem-${p.id}`} className="text-xs text-text-muted">
        {t("Pedido por")} {nomeDe(p.requested_by)} ·{" "}
        {formatadorDeData(idioma, null, { year: "numeric", month: "2-digit", day: "2-digit" }).format(
          new Date(p.created_at),
        )}
      </p>
      <p data-testid="proposta-prazo" className="text-xs font-medium">
        {fraseDoPrazo(t, p)}
      </p>

      {p.status === "rejeitada" && p.decision_reason !== null && p.decision_reason !== "" ? (
        <p className="rounded-md bg-muted/60 p-2 text-xs">
          <span className="font-medium">{t("Motivo da rejeição")}: </span>
          {p.decision_reason}
        </p>
      ) : null}

      {erro !== null ? (
        <p
          role="alert"
          data-testid={`proposta-erro-${p.id}`}
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs"
        >
          {erro}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {podeAplicar ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => aoAplicar(p.id)}
            data-testid={`proposta-aplicar-${p.id}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {t("Aplicar")}
          </button>
        ) : null}
        {podeDecidir ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => aoNao(p.id)}
            data-testid={`proposta-nao-${p.id}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {t("Não")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
