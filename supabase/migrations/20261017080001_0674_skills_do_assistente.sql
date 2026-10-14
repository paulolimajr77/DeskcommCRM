-- manifest: **Skills do assistente interno, F1 leitura (spec 2026-10-14-agente-interno-config-design).** Semeia 4 skills de plataforma (`organization_id null`): assistente-operacao, assistente-metricas, assistente-prompt, assistente-cliente-novo — conteúdo operacional condensado das guias `.agents/skills/`, corpo com no máximo 200 linhas cada. Lidas pelo chat via loadSkills + matchSkills. Idempotente; apêndice igual no `baseline.sql`.

-- ---- skills do assistente interno: seed de plataforma (migration 0674) ----
do $seed$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from skill_pointers where organization_id is null and name = 'assistente-operacao'
  ) then
    insert into skill_versions (organization_id, name, description, body, matcher)
    values (null, 'assistente-operacao', 'Uso diário do CRM: onde fica cada coisa e como fazer pela interface.',
      $body$# Operar o CRM no dia a dia

Responda dúvidas de uso pelo caminho da interface, como Grupo → Tela → Ação.
Não invente campos, botões, estados ou permissões. Nunca peça segredo em chat.

## Mapa Grupo → Tela

- Inbox (Atendimento): conversas com o cliente, notas internas, rascunhos.
- Funil (CRM): negócios por etapa, mover card, motivos de perda.
- IA › Agentes: um agente por papel (prompt, provedor/modelo, canal, funis).
- IA › Roteadores: só com 2+ agentes no mesmo número (intenções + fallback).
- IA › Follow-ups: fluxos com gatilho, espera, mensagem e fim. Fluxo não publicado não roda.
- IA › Conhecimento: FAQ e documentos. Aguarde o status pronto.
- IA › Memória: regras da casa que valem para todos os atendimentos.
- IA › Provedores/Credenciais: modelos e chaves. Publicar exige credencial validada.
- Canais › Conexões: números e status. Publicar exige número WORKING.
- Análise: Desempenho, Radar de risco, Uso e orçamento, Evolução da IA.
- Organização: equipe, marca, funis, agenda, tags, modelos de mensagem.

## Resposta padrão para onde fica

1. Caminho: grupo → tela → ação. 2. Serve para: uma frase.
3. Pré-requisito: somente se existir. 4. Depois disso: onde confirmar.
5. Se não aparecer: qual permissão, configuração ou estado verificar.

## Resposta padrão para como faço

Confirme o objetivo, liste só os passos necessários pela UI, aponte o
irreversível e diga como verificar que funcionou. Tarefa de infraestrutura,
código ou nicho: encaminhe ao assunto dono (instalação, cliente novo,
prompt, métricas), sem duplicar o procedimento aqui.
$body$,
      '{"any_keywords": ["onde fica", "onde vejo", "onde altero", "onde conecto", "onde configuro", "como faco", "como uso", "como configuro", "o que faz", "o que significa", "para que serve"]}'::jsonb)
    returning id into v_id;
    insert into skill_pointers (organization_id, name, version_id)
    values (null, 'assistente-operacao', v_id);
  end if;

  if not exists (
    select 1 from skill_pointers where organization_id is null and name = 'assistente-metricas'
  ) then
    insert into skill_versions (organization_id, name, description, body, matcher)
    values (null, 'assistente-metricas', 'Leitura correta de números: régua ao lado de cada métrica, sem PII.',
      $body$# Ler números sem concluir errado

Cada tela tem a própria régua: handoff tem três definições diferentes,
ganho é lead numa tela e transição noutra, dia é UTC numa e fuso da org
noutra. Nunca some número de telas diferentes. Todo número vem com período
fechado, fuso, definição (tabela e filtro) e o que ficou de fora.

## Regras

- Agregados, nunca texto: contagens, medianas, taxas. Nunca corpo de
  mensagem, nome, telefone ou motivo em texto livre.
- Null não é zero: sem dado mostra vazio, nunca zero fingindo medição.
- Compare com referência: período anterior, outro agente ou funil.
- Termine em ação: cada achado vira hipótese e próximo passo.

## Sintoma e causa provável

- Vende menos: etapa gargalo, motivo de perda concentrado, origem que caiu.
- Demora: agente fora da janela no pico; humano assume e demora.
- Passa tudo para pessoa: prompt manda encaminhar demais; portão vetando.
- Gasta muito com IA: classificador em modelo caro; turno com prompt gigante.
- Follow-up não funciona: esperas longas; mensagem genérica.
- Base não responde: material não cobre; limiar apertado.

## O que nunca fazer

Não ler dado pessoal nem por amostra. Não escrever no banco. Não afirmar
tendência com uma semana de dado. Não comparar telas sem declarar as réguas.
$body$,
      '{"any_keywords": ["conversao", "desempenho", "custo de ia", "relatorio", "taxa de ganho", "motivo de perda", "horario de pico", "atrito", "funil por origem"]}'::jsonb)
    returning id into v_id;
    insert into skill_pointers (organization_id, name, version_id)
    values (null, 'assistente-metricas', v_id);
  end if;

  if not exists (
    select 1 from skill_pointers where organization_id is null and name = 'assistente-prompt'
  ) then
    insert into skill_versions (organization_id, name, description, body, matcher)
    values (null, 'assistente-prompt', 'Diagnóstico de agente que não performa, com dados — rascunho testa, pessoa publica.',
      $body$# Afinar agente com dados, não achismo

Agente ruim quase nunca é o prompt inteiro: pode ser roteador errando,
portão vetando, base sem cobertura ou horário. Diagnostique antes de reescrever.

## Sinais e causas

- Vetos de vocabulário: prompt cita ferramenta, lead, etapa ou sistema.
- Vetos de promessa: prompt permite o que a tabela não permite.
- Passa tudo para pessoa: prompt manda encaminhar a alguém nomeado.
- Base sem acerto com score perto do limiar: limiar apertado.
- Base sem acerto com score baixo: falta material, não é prompt.
- Agente errado respondeu: intenções do roteador.
- Respostas longas e custo alto: prompt gigante repetindo o que o motor faz.
- Some à noite: horário do agente.

## Regras

- Versão nova em rascunho, nunca edição. Testar antes e depois com o mesmo
  roteiro; Publicar é da pessoa. Uma mudança por vez, medida.
- Não repetir no prompt o que o motor impõe; sem nome de ferramenta, sem
  placeholder, sem jargão interno (vira veto).
- Conteúdo situacional (objeção de preço, reativação) vai para skill do
  produto, não para o prompt.
- Não trocar modelo, provedor ou credencial de brinde. Não concluir por um
  cliente só: uma frase ruim é anedota, padrão é dado.
$body$,
      '{"any_keywords": ["prompt", "responde errado", "robotico", "passa tudo para humano", "nao usa a agenda", "inventa preco", "fala demais", "nao converte", "melhorar o prompt", "versao", "rascunho", "testar agente"]}'::jsonb)
    returning id into v_id;
    insert into skill_pointers (organization_id, name, version_id)
    values (null, 'assistente-prompt', v_id);
  end if;

  if not exists (
    select 1 from skill_pointers where organization_id is null and name = 'assistente-cliente-novo'
  ) then
    insert into skill_versions (organization_id, name, description, body, matcher)
    values (null, 'assistente-cliente-novo', 'Montar o CRM por nicho: triagem, pacote, ordem pela tela, publicar é humano.',
      $body$# Montar cliente por nicho

O wizard para no funil e nos convites. O que faz vender (prompt do nicho,
roteador, follow-ups, base, memória, capacidades) monta-se depois, pela
tela e nesta ordem — o schema impõe, cada peça exige a anterior.

## Ordem pela tela

1. Conexões: número WORKING. 2. Credenciais: chave validada.
3. Provedores: barato para auxiliares, com ferramentas para atendimento.
4. Funil: exatamente uma etapa ganhou e uma perdeu.
5. Conhecimento: FAQ e documentos, status pronto.
6. Follow-ups: criar, montar e publicar. Não publicado não roda.
7. Agentes: um por papel, em rascunho. 8. Testar no sandbox.
9. Publicar: a pessoa clica. Só depois: roteadores, memória, skills, time.

## Regras

- Triagem antes de configurar: uma pergunta por vez, sem supor preço,
  prazo ou política — o que não está escrito vira pergunta.
- Montar como texto, aplicar pela tela. Nada por SQL: o motor lê versão
  publicada, e direto pula auditoria, validação e indexação.
- Publicar é ato humano. Sem preço no prompt se há catálogo ou base.
- Sem jargão interno no prompt (vira veto). Nichos: clínica, imobiliária,
  serviços, curso, loja, advocacia — fora deles, pacote genérico adaptado.
$body$,
      '{"any_keywords": ["criar agente", "montar", "clinica", "imobiliaria", "nicho", "roteador", "follow-up", "follow up", "base de conhecimento", "memoria da organizacao", "onboarding", "pacote do nicho"]}'::jsonb)
    returning id into v_id;
    insert into skill_pointers (organization_id, name, version_id)
    values (null, 'assistente-cliente-novo', v_id);
  end if;
end
$seed$;
