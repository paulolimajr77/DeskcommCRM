# A triagem — o que perguntar, em que ordem, e por que o sistema precisa disso

Uma pergunta por vez. Cada bloco existe porque um campo ou uma trava do produto exige a resposta; o
"por quê" está ao lado para você explicar quando a pessoa hesitar. Registre tudo em
`pacote-prospeccao-<cliente>.md`.

## 1. A oferta — o que se vende

| pergunta | por quê |
|---|---|
| O que você vende, em uma frase, e para que tipo de empresa? | vira o começo de "O que a IA deve oferecer e como iniciar" e escolhe o pacote de `nichos.md` |
| Qual problema da empresa abordada isso resolve? | a primeira mensagem abre pelo problema, não pelo produto — abordagem fria que abre vendendo é ignorada |
| Qual é o objetivo da primeira conversa: marcar uma reunião, mandar uma proposta, só descobrir se há interesse? | define o que o agente tenta fazer e onde ele para |
| Existe preço ou faixa que a IA pode dizer? Se não, o que ela responde quando perguntarem? | o motor proíbe inventar preço; sem resposta combinada, o agente fica sem saída na pergunta mais comum |
| Tem material pronto (apresentação, site, cases)? | vai para a base de conhecimento do agente, em vez de virar texto no prompt |

## 2. O público — quem se aborda

| pergunta | por quê |
|---|---|
| Que segmento buscar, do jeito que aparece no Google Maps? ("clínica de estética", "escritório de contabilidade") | é o campo "Público ou segmento"; termo genérico traz empresa que não é do público |
| Em que cidade ou região? | é o campo "Cidade ou região"; região pequena primeiro, para medir a resposta antes de gastar |
| Tem empresa que não pode ser abordada (clientes atuais, concorrentes, parceiros)? | a busca não tem lista de exclusão; contato que já existe na organização é preservado, mas a pessoa precisa saber quem pode aparecer |

## 3. O número

| pergunta | por quê |
|---|---|
| Qual número vai abordar? É dedicado à prospecção? | mensagem fria é o que mais queima número; no número do atendimento, o risco é o atendimento inteiro |
| Esse número é novo? Há quanto tempo manda mensagem? | número novo precisa de aquecimento; comece com poucas abordagens por dia |
| O número já tem um agente ou um roteador atendendo? | a campanha exige que o agente da prospecção atenda as respostas daquele número (Passo 3 do guia) |

## 4. A Apify e o custo

| pergunta | por quê |
|---|---|
| Já tem conta na Apify com saldo? | a busca é paga pela conta dela; sem chave, "Buscar empresas" recusa |
| Quanto quer gastar por busca (de US$ 0,50 a US$ 10) e quantas empresas (até 100)? | são os campos "Teto da busca (US$)" e "Até quantas empresas"; a quantidade real pode vir menor |
| Quer enriquecer com e-mails comerciais e redes do site? | é a caixa de enriquecimento; só dado comercial público, nunca pessoa física |

## 5. O funil

| pergunta | por quê |
|---|---|
| Quer um funil só para a prospecção? (recomendado) | separa a conversa fria das vendas do dia a dia e deixa os números limpos |
| As etapas do pacote do nicho servem? | a campanha exige duas etapas **abertas e diferentes** do mesmo funil: entrada e qualificados |
| O que acontece depois de "qualificado": quem assume, em que etapa? | a campanha para de contar ali; o resto é o funil normal da equipe |

## 6. A qualificação

| pergunta | por quê |
|---|---|
| Quando uma empresa conta como qualificada? Diga 2 ou 3 sinais concretos. | vira "Quando considerar o cliente qualificado"; o agente confirma esses sinais na conversa e só então move o negócio |
| Quem, na empresa abordada, costuma decidir a compra? | o agente pergunta pela pessoa certa em vez de vender para a recepção |

Critério vago ("tem interesse") qualifica todo mundo que responde por educação. Bons sinais são
verificáveis: "confirmou que atende mais de 30 clientes por semana", "decide ou participa da
decisão", "quer ver uma proposta ou marcar conversa".

## 7. O agente

| pergunta | por quê |
|---|---|
| Como o agente se apresenta (nome, empresa)? | a primeira mensagem precisa dizer quem fala e de onde |
| Que tom? (formal, direto, consultivo) | vai para o chat do "Configurar por conversa" |
| Quando ele passa para uma pessoa? Quem recebe? | pedido de proposta, negociação, reclamação — alguém precisa estar no Inbox para receber |
| Pode marcar reunião na agenda? | exige a agenda configurada e a capacidade de agendar ligada |

## 8. A base legal (LGPD)

A campanha exige "Referência da avaliação de legítimo interesse". Legítimo interesse é a base legal
para contatar uma empresa que não pediu contato; a avaliação é o registro do porquê isso é aceitável
naquele caso. O campo guarda uma **referência** a esse registro, não o registro inteiro.

Ajude a pessoa a escrever o registro num documento dela, com: a finalidade (oferecer X a empresas
do segmento Y), por que é necessário (dado comercial público, contato com a empresa e não com a
pessoa), o equilíbrio (uma mensagem só, saída "PARAR" em toda abordagem, sem insistência
automática) e onde o documento fica guardado. A referência no campo pode ser o nome e a data
desse documento. **Não é parecer jurídico** — recomende revisão por quem responde pela LGPD da
empresa.

## 9. O ritmo

| pergunta | por quê |
|---|---|
| Quantas abordagens em 24 horas? (de 1 a 50; o padrão é 10) | "Máximo em 24 horas"; número novo começa baixo |
| Intervalo mínimo entre elas? (de 5 a 1440 minutos; o padrão é 15) | "Intervalo mínimo (minutos)"; intervalo curto parece robô para o WhatsApp |

O limite de 50 em 24 horas vale para a organização inteira, somando campanhas.
