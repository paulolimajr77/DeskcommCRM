-- manifest: **Skill de plataforma assistente-sistema-vivo (T5).** Semeia a skill `assistente-sistema-vivo` (`organization_id null`): o gate operacional do Sistema Vivo — toda peça tem entrada e saída, o laço de retorno fecha quando ela erra, nada é ilha. Antes de propor mudança, conferir quem consome e quem alimenta. Corpo com no máximo 200 linhas, em português simples. Idempotente; apêndice igual no `baseline.sql`.

-- ---- skill assistente-sistema-vivo (migration 9007) ----
do $seed$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from skill_pointers where organization_id is null and name = 'assistente-sistema-vivo'
  ) then
    insert into skill_versions (organization_id, name, description, body, matcher)
    values (null, 'assistente-sistema-vivo', 'Gate de arquitetura: nada é ilha, todo laço se fecha, o laço de retorno fecha quando o sistema erra.',
      $corpo_sv$# Sistema Vivo — gate de arquitetura

Toda peça do sistema é um polvo: recebe e distribui. Ninguém morre por falta de resposta, de resolução, ou porque ninguém viu.

## Os 7 invariantes (responda ANTES de declarar pronto)

1. **Nada é ilha**: ≥1 aresta de entrada e ≥1 de saída.
2. **Continuidade nas duas direções**: IA→humano entrega contexto pronto; humano→IA deixa input estruturado.
3. **Log universal e visível**: emite atividade E aparece na tela.
4. **Nenhuma demanda sem próximo passo**: follow-up é o anti-morte.
5. **Informação com propósito**: todo dado responde "e daí?".
6. **Configuração tem superfície**: ver + mudar + falha visível.
7. **Todo laço se fecha**: decisão automática tem retorno que altera decisão futura.

## A regra do tempo

- **Observar** em realtime é direito do humano: painel, inbox, fila, falha, conversa ao vivo.
- **Agir** em realtime costuma ser errado: quanto mais irreversível o efeito, maior o intervalo entre decidir e consumar. Enviar mensagem a uma pessoa é irreversível.

## Antes de propor mudança

Conferir quem consome e quem alimenta. Toda peça nova entra com ≥2 arestas (entrada e saída).

## No DeskcommCRM

- Registro: `event_log`, `audit()` de `lib/audit/` → `api_audit_log`, `crm_lead_activities`.
- Tela: Timeline no inbox, Radar de Risco (`/app/radar`), painéis em `app/app/`.
- Porta: `lib/navigation/registry.ts` ou allowlist com justificativa escrita em `tests/unit/navegacao-completude.test.ts`.
- Anti-morte: Motor de follow-up (`lib/followup/`, `lib/agent-engine/cron/`) + Radar de Risco.
- Continuidade IA↔humano: `buildHandoffSummary()` em `lib/agent-engine/agent/human-handoff.ts`.
- Mapa: `docs/architecture/*.json`.
$corpo_sv$,
      '{"any_keywords": ["sistema vivo", "invariante", "nada e ilha", "laço de retorno", "anti-morte", "continuidade", "configuração", "mapa", "porte", "registro", "tela", "gate de arquitetura"]}'::jsonb)
    returning id into v_id;
    insert into skill_pointers (organization_id, name, version_id)
    values (null, 'assistente-sistema-vivo', v_id);
  end if;
end
$seed$;
