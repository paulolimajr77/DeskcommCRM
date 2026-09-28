# Pacotes por nicho — o ponto de partida que a triagem completa

Na prospecção o "nicho" tem dois lados: **o que se vende** e **para quem**. Os pacotes abaixo são
organizados pelo que se vende; o público entra nos campos de busca. Cada pacote traz: termos de
busca de exemplo, o funil, o texto da oferta, os critérios de qualificação, o bloco para colar no
"Configurar por conversa" e as objeções que o teste precisa cobrir. **Nada aqui é regra de negócio
da pessoa** — preço, prazo e promessa vêm da triagem. Onde está entre chaves, preencha; onde não
couber, corte.

---

## O que vale para todos

**Funil "Prospecção"** (7 etapas): Abordado (**entrada**) → Respondeu → Qualificado
(**qualificados**) → Reunião marcada → Proposta enviada → Fechou (ganhou) → Sem interesse
(perdeu). A campanha só usa as duas marcadas; o resto é da equipe.

**Roteiro de teste** — rode em "Testar como cliente", uma mensagem por vez, e confira a resposta:

1. "Oi, quem é você?" → diz nome, empresa e por que escreveu, sem fingir que já se conheciam.
2. "Onde você conseguiu meu número?" → diz que é o contato comercial público da empresa, sem rodeio.
3. "Quanto custa?" → responde o que a triagem combinou; sem combinado, diz que depende e faz uma
   pergunta para entender o caso. Nunca inventa valor.
4. Uma resposta que cumpre os critérios (monte com os sinais da triagem) → confirma o que falta e
   propõe o próximo passo (reunião, proposta).
5. "Não tenho interesse." → agradece e encerra, sem insistir e sem segunda tentativa.

"PARAR" não precisa de teste de prompt: é o sistema que bloqueia o contato, com a palavra exata do
rodapé que ele mesmo põe na primeira mensagem.

**Bloco para colar no "Configurar por conversa"** (preencha a partir do pacote):

```text
Quero um agente que aborde {público} em {região} pelo WhatsApp em nome de {empresa}.
Ele se apresenta como {nome}, de {empresa}.
O que oferecemos: {oferta em uma frase}. O problema que resolvemos: {problema}.
O objetivo da primeira conversa é {marcar uma conversa de 15 minutos | enviar uma proposta | descobrir se há interesse}.
Qualificado é quem: {sinal 1}; {sinal 2}; {sinal 3}.
Sobre preço: {o que pode dizer | "depende do caso; a equipe apresenta na reunião"}.
Tom: {direto e cordial}, mensagens curtas, uma pergunta por vez.
Passe para uma pessoa quando: pedirem proposta formal, negociarem valor, reclamarem ou pedirem para falar com alguém.
```

---

## Serviços digitais para pequenas empresas (site, tráfego pago, automação de atendimento)

- **Busca**: "clínica de estética", "academia", "imobiliária", "escritório de advocacia" — segmentos
  que dependem de cliente novo e de atendimento por WhatsApp.
- **Oferta**: "Ajudamos {segmento} a {atender mais rápido no WhatsApp | aparecer no Google | ter
  um site que traz contato}. Queremos entender como vocês recebem clientes hoje."
- **Qualificação**: atende clientes pelo WhatsApp com volume que pesa na rotina; quem respondeu
  decide ou participa da decisão; aceita uma conversa curta ou uma proposta.
- **Objeções a testar**: "já tenho site", "já tenho quem faça", "manda por e-mail".

## Contabilidade, consultoria e serviços profissionais para empresas

- **Busca**: "restaurante", "loja de roupas", "clínica médica", "transportadora".
- **Oferta**: "Atendemos {segmento} em {área: contabilidade, gestão financeira, jurídico
  empresarial}. Queremos saber como vocês cuidam disso hoje."
- **Qualificação**: tem a necessidade hoje (sem fornecedor, ou insatisfeito com o atual); porte
  compatível com o que se atende; quem respondeu é sócio ou responsável.
- **Objeções a testar**: "já tenho contador", "está caro trocar", "fale com meu sócio".

## Fornecedor ou distribuidor para o comércio

- **Busca**: o tipo de estabelecimento que compra o produto ("pizzaria", "salão de beleza",
  "pet shop").
- **Oferta**: "Fornecemos {produto} para {segmento} em {região}, com {diferencial combinado:
  entrega, prazo, mínimo de pedido}."
- **Qualificação**: compra esse tipo de produto; volume ou frequência compatível; quem respondeu
  cuida das compras.
- **Objeções a testar**: "já tenho fornecedor", "manda a tabela de preços", "qual o pedido mínimo".
  Tabela e condições vêm de material na base de conhecimento, nunca do texto da oferta.

## Software para um segmento

- **Busca**: o segmento que o software atende ("oficina mecânica", "escola de idiomas").
- **Oferta**: "Temos um sistema para {segmento} que {resultado}. Queremos saber como vocês fazem
  {processo} hoje."
- **Qualificação**: faz o processo à mão ou com ferramenta que incomoda; tem mais de {n}
  {usuários, unidades, clientes}; quem respondeu decide ou leva para quem decide.
- **Objeções a testar**: "já uso outro sistema", "não tenho tempo para trocar", "tem teste grátis?".

## Serviços técnicos locais para empresas (manutenção, limpeza, segurança, dedetização)

- **Busca**: quem tem o espaço que precisa do serviço ("condomínio", "restaurante", "clínica",
  "galpão").
- **Oferta**: "Fazemos {serviço} para {segmento} em {região}. Queremos saber como vocês resolvem
  isso hoje."
- **Qualificação**: precisa do serviço de forma recorrente ou tem problema agora; está na área
  atendida; quem respondeu é gestor, síndico ou dono.
- **Objeções a testar**: "já tenho empresa", "é só orçamento?", "atende no fim de semana?".

---

## Nicho fora da lista

Use o bloco comum, o funil comum e o roteiro comum; tire da triagem a oferta, o problema e os três
sinais de qualificação. Se a pessoa não souber dizer os sinais, a campanha ainda não está pronta
para começar: sem critério, o agente qualifica todo mundo que responde por educação.
