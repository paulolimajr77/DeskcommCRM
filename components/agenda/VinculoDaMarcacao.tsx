"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { EscolhaDoCliente } from "@/components/agenda/EscolhaDoCliente";
import { useT } from "@/hooks/i18n/useT";
import { NewContactDialog } from "@/components/contacts/NewContactDialog";
type Vinculos = {
  contacts: Array<{ id: string; name: string; email?: string | null }>;
  conversations: Array<{ id: string; created_at: string; status: string }>;
};
export function VinculoDaMarcacao({
  contactId,
  conversationId,
  onChange,
  onEmailDoCliente,
}: {
  contactId: string;
  conversationId: string;
  /** O terceiro argumento e o e-mail do contato escolhido, quando ele tem um. */
  onChange: (contact: string, conversation: string, email?: string | null) => void;
  /**
   * Avisa o e-mail do cliente ATUAL, inclusive quando ele nao foi escolhido
   * aqui — `/app/agenda?contato=<id>` preenche o cliente direto no estado de
   * quem chama, e esse caminho nunca passa pela lista.
   */
  onEmailDoCliente?: (email: string | null) => void;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [criando, setCriando] = useState(false);
  const query = useQuery({
    queryKey: ["agenda", "vinculos", contactId, search],
    queryFn: async () =>
      (
        await apiClient.get<{ data: Vinculos }>(
          `/api/v1/agenda/vinculos?${new URLSearchParams(contactId ? { contact_id: contactId } : { q: search })}`,
        )
      ).data,
  });
  // ⛔ O CLIENTE PODE CHEGAR DE FORA, E AI NAO HA CLIQUE PARA CARREGAR O E-MAIL.
  //
  // Reproduzido pela tela em 2026-09-13: `/app/agenda?contato=<id>` — o caminho
  // de quem esta na conversa do cliente e clica para agendar — abre o painel com
  // o cliente JA preenchido. O e-mail viajava junto do clique na lista, entao
  // nesse caminho ele nunca chegava, e o campo do convidado ficava vazio mesmo
  // com o contato tendo e-mail cadastrado.
  //
  // Quem tem o dado e este componente: a consulta por `contact_id` devolve o
  // contato com o e-mail. Entao e ele quem avisa.
  const emailDoAtual = query.data?.contacts.find((c) => c.id === contactId)?.email ?? null;
  useEffect(() => {
    // Sem cliente NAO avisa: mandar `null` em compromisso pessoal apagaria um
    // e-mail que a pessoa tivesse acabado de digitar.
    if (contactId && onEmailDoCliente) onEmailDoCliente(emailDoAtual);
  }, [contactId, emailDoAtual, onEmailDoCliente]);

  // Quem marca horário costuma estar com a pessoa na frente, e ela nem sempre
  // já é contato. Sem esta saída o fluxo PARA aqui: teria que abandonar a
  // marcação, ir até Contatos, criar, voltar e recomeçar. O termo já digitado
  // vira o nome, e o contato volta selecionado.
  //
  // ⚠️ MERGE: a `main` pendurava isto no campo "Buscar cliente", que aqui não
  // existe mais — os dois campos viraram um só (`EscolhaDoCliente`, 2026-09-12,
  // porque o seletor herdava o cliente da abertura anterior). A saída dela
  // continua valendo e passa a pender do campo único. `!contactId` mantém o
  // botão fora do ar quando já há cliente escolhido, que é quando o
  // `EscolhaDoCliente` troca o campo pela ficha de quem foi escolhido.
  const buscou = search.trim().length > 0 && !contactId;
  const nadaEncontrado = buscou && !query.isLoading && (query.data?.contacts.length ?? 0) === 0;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {/* Um campo só. Eram dois — "Buscar cliente" e "Quem será atendido" —, e
          quem opera relatou pela tela que o segundo parecia que ia abrir algo ao
          digitar e o primeiro parecia não fazer nada. */}
      <EscolhaDoCliente
        contatos={query.data?.contacts ?? []}
        valor={contactId}
        busca={search}
        onBusca={(q) => {
          setSearch(q);
          // Digitar solta a escolha anterior. Sem isto a lista filtraria por um
          // nome enquanto o contato preso continuaria sendo outro — e o
          // compromisso sairia no nome de quem ninguém escolheu.
          onChange("", "", null);
        }}
        onEscolhe={(id) =>
          onChange(id, "", query.data?.contacts.find((c) => c.id === id)?.email ?? null)
        }
      />
      {nadaEncontrado ? (
        <button
          type="button"
          // Alvo de toque generoso: quem marca faz isso no celular, com o
          // cliente esperando na frente.
          className="min-h-11 w-full rounded-md border border-dashed px-3 text-left text-sm"
          onClick={() => setCriando(true)}
        >
          {t("Criar")} “{search.trim()}”
        </button>
      ) : null}
      {contactId ? (
        <label className="block">
          {t("Conversa vinculada (opcional)")}
          <select
            className="mt-1 w-full rounded-md border bg-surface p-2"
            value={conversationId}
            onChange={(e) => onChange(contactId, e.target.value)}
          >
            <option value="">{t("Sem conversa vinculada")}</option>
            {query.data?.conversations.map((c, i) => (
              <option key={c.id} value={c.id}>
                {t("Conversa")} {i + 1} · {new Date(c.created_at).toLocaleDateString()}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {query.isError ? (
        <p role="alert">{t("Não foi possível carregar os vínculos. Tente novamente.")}</p>
      ) : null}
      {/* `key` pelo termo: `nomeInicial` é defaultValue do formulário e só vale
          na montagem. Sem remontar, quem fecha e digita outro nome reabriria com
          o anterior. */}
      <NewContactDialog
        key={search.trim()}
        open={criando}
        onOpenChange={setCriando}
        nomeInicial={search.trim()}
        onCriado={(contato) => {
          // Volta JÁ SELECIONADO. A busca passa a ser o nome do contato para a
          // lista conter quem acabou de nascer — senão o `select` ficaria com um
          // valor que ele não sabe desenhar.
          setSearch(contato.name ?? search);
          onChange(contato.id, "");
        }}
      />
    </div>
  );
}
