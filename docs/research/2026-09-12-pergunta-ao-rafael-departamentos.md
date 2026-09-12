# Rascunho de issue para o Rafael — departamentos de atendimento

> **Isto é um rascunho para o Paulo enviar**, não um documento nosso de projeto. Abrir issue no
> repositório dele sai para fora e leva o nome dele.
>
> ⛔ **Nada de captura do concorrente, nome de cliente, URL da nossa instalação ou número de versão
> nossa no corpo.** O texto abaixo já está limpo — cita só o código dele.
>
> **Por que uma issue e não uma spec:** departamentos é a mais cara das seis lacunas e a única em que
> ele tem um "não" plausível — *"use os roteadores que já existem"* é resposta razoável. Construir
> antes de perguntar joga fora o trabalho mais pesado do lote. E é a pior de todas para viver num
> fork: um segundo sistema de roteamento obrigaria merge contra as mudanças de roteamento dele, para
> sempre.
>
> Medido em `origin/main` @ `e142504d`. Nenhuma issue sobre isto existe no repositório (busca por
> "departamento", "setor", "department", todos os estados).

---

## Título

```
Departamentos de atendimento: entidade nova, ou a política de roteamento generalizada?
```

## Corpo

```markdown
Antes de propor código, uma pergunta de desenho — porque as duas respostas são defensáveis e a
escolha é sua.

## O que falta

Hoje a transferência de uma conversa só oferece **pessoa** (`components/inbox/ReassignDialog.tsx`).
Numa operação com poucos atendentes isso basta. Com trinta, transferir passa a depender de saber o
nome da pessoa certa e de ela estar disponível — e não há para onde mandar "o time de Suporte".

## O que já existe, e é quase isso

`channel_routing_policies` guarda uma política **por conexão** (`unique(organization_id,
channel_session_id)`), e `channel_routing_responsibles` guarda o conjunto de pessoas responsáveis por
ela. Isso já é "quem responde por este número".

Faltam duas coisas para virar departamento: o grupo **não tem nome próprio**, e está amarrado
um-para-um a uma conexão.

## Por que número e departamento não podem ser a mesma coisa

Uma conversa de WhatsApp vive entre o cliente e **um número específico**. Toda resposta sai daquele
número — não existe "mover a conversa para outro número"; o que existiria é uma mensagem nova, de um
número desconhecido, em outra janela.

Então, se departamento **for** a conexão, "transferir para o Suporte" vira "trocar o número", e isso
não é transferência.

A saída que o schema já sugere: **a conexão é a porta, o departamento é quem está dentro.** As
conversas já guardam as duas coisas separadas —

- `conversations.channel_session_id` — por onde o cliente entrou. Imutável, quem escolheu foi ele
- `conversations.assigned_to_user_id` — quem atende agora. É o que a transferência muda

— e o departamento entraria ao lado do segundo: um grupo que segura a conversa e que a transferência
pode trocar, sem a conexão mudar nunca. A conexão passaria a ter um departamento **padrão**, só para
a chegada.

## A pergunta

**Departamento vira entidade nova (`attendance_departments` + `conversations.department_id`), ou é a
`channel_routing_policies` que ganha nome e deixa de ser um-para-um com a conexão?**

O risco que me faz perguntar antes de abrir PR é criar um segundo sistema de roteamento concorrendo
com `lib/routing/` e `ai_routers`. Se o caminho for o segundo, departamento deveria ser **destino de
roteamento** no que já existe, não um mecanismo paralelo.

## Uma borda que vale decidir junto

Se Vendas e Suporte forem conexões diferentes e o cliente escrever para Vendas, quem responder pelo
Suporte responde **do número de Vendas**. Para o cliente é a mesma conversa, com outra pessoa — que
costuma ser o desejado. Mas quem esperar que ele termine falando com o número do Suporte vai achar
que é defeito. Não há contorno técnico: seria pedir ao cliente que escrevesse para outro número.

Posso levar a implementação depois que você disser a forma.
```

---

## Depois que ele responder

- **Se for entidade nova:** spec própria — tabelas, RLS `tenant_isolation_*`, entrada na lista
  `TABLES` de `tests/invariants/rls-isolation.test.ts` (RLS ligada tem gate genérico; **policy certa
  não tem**), a aba Departamento na transferência, o seletor no Inbox, e o departamento padrão por
  conexão.
- **Se for a política generalizada:** spec menor — nome na política, soltar o `unique` com a conexão,
  e `conversations.department_id` apontando para ela. Migração de dados para as políticas que já
  existem.
- **Se ele recusar os dois:** volta para a fila como decisão dele, e o assunto morre aqui — sem
  código escrito, que é o ponto de perguntar antes.
