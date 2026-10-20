"use client";

import type { ConfigLoopPayload } from "@/lib/ai/evolution/aggregate";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";

/**
 * O laço de retorno do assistente de configuração: o que ele propôs e o que a
 * pessoa fez com cada proposta. Responde "as sugestões estão acertando?" — o
 * sinal que fecha o laço (invariante 7 do sistema vivo).
 *
 * Os três estados que não são "tem dado" existem de propósito: zero NÃO pode
 * significar "ninguém propôs nada" quando na verdade quem olha não tem permissão
 * para ler, ou a leitura falhou.
 */
function num(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function EvolutionConfigLoop({ loop }: { loop: ConfigLoopPayload }) {
  const t = useT();
  // Cada rótulo é um literal em t(): chave montada em runtime escapa do guarda do espanhol.
  const rotuloDoTipo = (kind: string): string => {
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
  };

  if (loop.estado === "restrito") {
    return (
      <Card className="p-4 text-sm text-text-muted" data-testid="config-loop-restrito">
        {t(
          "Só quem administra a organização vê as propostas do assistente, porque elas podem trazer texto da sua operação.",
        )}
      </Card>
    );
  }
  if (loop.estado === "indisponivel") {
    return (
      <Card className="p-4 text-sm text-text-muted" data-testid="config-loop-indisponivel">
        {t("Não conseguimos ler as propostas do assistente agora. Recarregue a página em alguns instantes.")}
      </Card>
    );
  }
  if (loop.total === 0) {
    return (
      <Card className="p-4 text-sm text-text-muted" data-testid="config-loop-vazio">
        {t(
          "O assistente não fez nenhuma proposta neste período. Quando ele sugerir uma mudança, ela aparece aqui com o que você decidiu.",
        )}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="config-loop">
      <Card className="flex flex-col p-4">
        <p className="text-xs text-text-muted">{t("Propostas aprovadas, entre as que você decidiu")}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight" data-testid="config-loop-taxa">
          {loop.taxa_aprovacao === null ? "—" : `${Math.round(loop.taxa_aprovacao * 100)}%`}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-text-muted">
          {loop.taxa_aprovacao === null
            ? t("Ainda não há proposta decidida neste período, então não dá para dizer se as sugestões estão acertando.")
            : t(
                "Das propostas que você aprovou ou recusou, quantas foram aprovadas. As que ainda esperam decisão não entram na conta.",
              )}
        </p>
      </Card>
      <Card className="overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th className="pb-2 pr-3 font-medium">{t("Tipo")}</th>
              <th className="pb-2 pr-3 text-right font-medium">{t("Sugeridas")}</th>
              <th className="pb-2 pr-3 text-right font-medium">{t("Aprovadas")}</th>
              <th className="pb-2 pr-3 text-right font-medium">{t("Aplicadas")}</th>
              <th className="pb-2 pr-3 text-right font-medium">{t("Recusadas")}</th>
              <th className="pb-2 pr-3 text-right font-medium">{t("Sem decisão")}</th>
              <th className="pb-2 text-right font-medium">{t("Aprovadas e não aplicadas")}</th>
            </tr>
          </thead>
          <tbody>
            {loop.por_kind.map((k) => (
              <tr key={k.kind} className="border-t border-border" data-testid={`config-loop-${k.kind}`}>
                <td className="py-2 pr-3">{rotuloDoTipo(k.kind)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{num(k.propostas)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{num(k.aprovadas)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{num(k.aplicadas)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{num(k.rejeitadas)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{num(k.sem_decisao)}</td>
                <td className="py-2 text-right tabular-nums">{num(k.aprovadas_sem_aplicar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs leading-relaxed text-text-muted">
          {t(
            "Cada linha conta as propostas feitas neste período. Aprovar não muda nada sozinho: a mudança só vale quando é aplicada.",
          )}
        </p>
      </Card>
    </div>
  );
}
