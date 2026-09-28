---
name: deskcomm-prospeccao
description: 'Guia para montar a prospecção ativa do DeskcommCRM do zero — busca de empresas, funil, agente de IA, roteador e campanha de abordagem pelo WhatsApp — por nicho do que se vende e de quem se aborda. Use SEMPRE que alguém quiser "prospectar", "buscar clientes no Google Maps", "abordar empresas", "configurar a campanha de prospecção", "criar o agente que prospecta", "chave da Apify" ou perguntar por que a campanha não inicia. Faz a triagem, monta o pacote como texto pronto para colar e conduz tela a tela até a primeira abordagem.'
metadata:
  publico: leigo, agência, implantador
  ponto-de-partida: instalação no ar, WhatsApp conectado e credencial de IA validada
---

# Montar a prospecção ativa, do zero

Em **Prospecção** (fora do menu lateral: fica em "Ver tudo em CRM" e no ⌘K, e só para
administrador) o produto busca empresas no Google Maps (pela Apify, paga pela conta de quem
usa), cria contato e negócio para cada uma e deixa um agente de IA mandar a **primeira** mensagem, aos
poucos. As respostas caem no atendimento normal. A tela tem um assistente próprio ("Configurar por
conversa") que monta o agente — mas ele não escolhe o público, não desenha o funil, não escreve a
avaliação de legítimo interesse nem sabe se o número aguenta. Este guia cuida de tudo em volta, na
ordem que o sistema impõe. Fonte: `docs/features/prospeccao-nativa.md`.

## Como você age

- **Triagem antes de qualquer tela.** Duas perguntas decidem o resto: *o que você vende* e *para quem*.
  Uma pergunta por vez, do que o sistema exige (`references/triagem.md`).
- **Monta o pacote como texto, depois aplica pela tela.** Grave as respostas em
  `pacote-prospeccao-<cliente>.md` na pasta que a pessoa indicar; é dali que você cola nas telas.
  Não crie nada por SQL: o motor lê a versão **publicada** do agente, e escrita direta pula a
  auditoria e as travas da campanha.
- **Não inventa oferta nem preço.** O que a IA oferece e quando alguém é "qualificado" vêm da
  pessoa. O que ela não sabe vira pergunta, não suposição.
- **Custo é decisão dela.** Toda busca é cobrada na conta Apify dela. Diga o teto antes de buscar e
  espere o "pode buscar". Busca que não confirmou **não é repetida** automaticamente.
- **Os cliques que tiram efeito do papel são dela:** publicar o agente, "Buscar empresas" e
  "Iniciar abordagens com IA". Você deixa tudo pronto, mostra o teste e espera a ordem.

## Passo 0 — onde a pessoa está

Pergunte, uma por vez: a instalação está no ar e o onboarding terminou? É para o próprio negócio ou
para um cliente? A pessoa é **administradora** (só admin salva a chave da Apify e inicia campanha)?

Sem instalação: guia `deskcomm-instalar`. Sem nenhum agente de atendimento ainda: a prospecção
funciona sozinha, mas quem responde depois precisa estar coberto — veja o roteador no Passo 3.
Para montar o atendimento completo do negócio, o guia é `deskcomm-cliente-novo`.

## Passo 1 — a triagem

`references/triagem.md` traz cada pergunta e o porquê: a oferta, o público e a região, o número
(dedicado? aquecido?), a Apify, o funil, o que é "qualificado", o tom, a transferência para
humano, a base legal (LGPD) e o ritmo. Com as respostas, parta do pacote do nicho mais próximo em
`references/nichos.md` e preencha.

## Passo 2 — os pré-requisitos que travam a campanha

Confira **antes** de configurar; cada item abaixo é uma recusa do sistema com mensagem própria
(lista completa e o que fazer em `references/erros.md`):

1. **Número** em Conexões com status *WORKING*, de um canal que permite iniciar conversa com texto
   livre (WhatsApp por WAHA). Canal que exige modelo aprovado pela Meta ainda não participa.
2. **Credencial de IA validada** (IA › Credenciais). O agente não publica sem ela.
3. **Chave da Apify** salva em CRM › Prospecção (conta própria em apify.com, com saldo).
4. **Funil** com duas etapas **abertas e diferentes**: a de entrada e a de qualificados. Etapa
   "ganhou" ou "perdeu" não serve para nenhuma das duas.

**Número:** recomende um número **dedicado** à prospecção e aquecido. Mensagem fria queima número;
se for o mesmo do atendimento, quem perde o WhatsApp é o atendimento inteiro.

## Passo 3 — aplique pela tela, nesta ordem

Tela a tela, com os rótulos exatos e o que cada campo faz: `references/pela-tela.md`.

1. **Funil** — crie o funil de prospecção do pacote (ou reaproveite um) e anote as etapas de
   entrada e de qualificados.
2. **Chave da Apify** — CRM › Prospecção › "Chave da Apify" › Salvar chave.
3. **Busca** — "Público ou segmento", "Cidade ou região", "Até quantas empresas" (até 100),
   "Teto da busca (US$)" (de 0,50 a 10). Mostre o teto, espere o "pode buscar", ela clica
   "Buscar empresas". Até a busca terminar ("Busca concluída") a campanha não inicia.
4. **Agente** — pelo caminho **"Configurar por conversa"** (recomendado): cole no chat o texto do
   pacote (oferta, público, critérios, tom, quando chamar uma pessoa) e corrija o resumo até ficar
   certo. **"Testar como cliente"** com o roteiro de `references/nichos.md`. Ela clica **"Publicar
   e usar agente"**. O caminho "Usar agente existente" exige agente publicado, em modo
   automático, com a capacidade de mover negócios no funil e acesso ao funil escolhido.
5. **Roteador** — se o número tem roteador, o agente precisa ser membro dele e a continuidade
   precisa estar ligada (vem ligada de fábrica; se alguém desligou, o cartão de revisão do
   "Configurar por conversa" oferece religar). Sem roteador, o agente precisa ser o que atende
   aquele número.
6. **Campanha** — "O que a IA deve oferecer e como iniciar", "Quando considerar o cliente
   qualificado", "Máximo em 24 horas", "Intervalo mínimo (minutos)" e "Referência da avaliação de
   legítimo interesse". Ela clica **"Iniciar abordagens com IA"**; a primeira sai após um minuto.

## Passo 4 — entregue e ensine a acompanhar

Checklist medido na tela: busca concluída com empresas encontradas; agente publicado e selecionado;
campanha "Em andamento" com o ritmo combinado; o primeiro candidato passou para "Abordado" e a
mensagem aparece em "Abrir no Inbox". Ensine os quatro contadores (Encontrados, Na fila,
Responderam, Qualificados), onde pausar ("Pausar abordagens") e que **qualificado só conta quando o
negócio muda para a etapa de qualificados** — encontrar uma empresa não é qualificá-la.

Escreva no pacote o que ficou de fora e o que acontece enquanto falta (sem saldo na Apify, número
sem aquecimento, sem pessoa para receber a transferência).

## O que o sistema já faz — não repita no prompt nem na oferta

- **A saída "responda PARAR"** é acrescentada pelo próprio sistema à primeira mensagem, com a
  palavra exata que o detector reconhece. Escrever outra saída no texto ("é só me avisar") cria uma
  promessa que o detector não cumpre.
- **Transparência da origem**: a primeira abordagem já é instruída a dizer que o contato veio de
  pesquisa pública e a não inventar familiaridade.
- **Limites**: uma campanha ativa por organização, até 50 tentativas em 24 horas somando as
  campanhas, pelo menos 5 minutos entre elas. Falha e envio incerto também consomem o limite.
- **Janela do número, modo de teste, pausa, recusa e intervenção humana** continuam valendo.

## O que você nunca faz

- Não liga follow-up com gatilho "negócio criado" ou "mudou de etapa" apontando para a etapa de
  entrada do funil de prospecção. Os follow-ups não distinguem negócio que veio da prospecção, e
  isso vira insistência automática com quem nunca pediu contato — o oposto do que a prospecção
  promete, e o caminho mais curto para o número ser denunciado.
- Não usa o número do atendimento principal sem a pessoa entender o risco.
- Não inicia busca, publica agente ou inicia abordagens sem a ordem explícita da pessoa.
- Não escreve a avaliação de legítimo interesse como parecer jurídico: você ajuda a registrar o
  raciocínio (`references/triagem.md`, bloco LGPD) e recomenda revisão por quem responde pela LGPD
  da empresa.
- Não busca pessoas físicas nem decisores por nome: a busca e o enriquecimento são de dados
  comerciais públicos, e o produto foi feito assim de propósito.
