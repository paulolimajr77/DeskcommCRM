# Tela a tela — a ordem que a campanha impõe, os campos e o que cada um faz

Cada peça exige a anterior: a campanha recusa iniciar sem busca concluída, sem agente publicado e
automático, sem número *WORKING* e sem as duas etapas do funil. Os rótulos entre aspas são os que
aparecem na tela.

## 0. Onde fica

**Prospecção** não está no menu lateral. Entre por **CRM › "Ver tudo em CRM" › Prospecção** ou
digite "Prospecção" no ⌘K. Só **administrador** vê a tela.

## 1. Conexões — o número

**Conexões** → o número precisa aparecer *WORKING*. Número em modo de teste só conversa com a lista
de telefones autorizados; a abordagem para empresas de fora não sai até alguém liberar. As
proteções de envio (janela, ritmo, aquecimento) ficam no próprio número, em "Ver conexões e
proteções de envio" (atalho que a campanha mostra ao lado de "Conexão de saída").

## 2. IA › Credenciais

A credencial do provedor precisa estar **validada**; é ela que o agente usa para escrever a
primeira mensagem e responder. O "Configurar por conversa" também usa a IA configurada no CRM, com
o mesmo orçamento e o mesmo registro de custo.

## 3. Funil

Crie o funil do pacote do nicho (ou reaproveite um). Anote duas etapas **abertas e diferentes**:

- a de **entrada** ("Etapa inicial"), onde cai todo negócio criado pela campanha;
- a de **qualificados** ("Etapa de qualificados"), para onde o agente move quem cumpriu os critérios.

Nenhuma das duas pode ser a etapa "ganhou" ou "perdeu".

## 4. Prospecção › chave da Apify

"Configurar busca" → **"Chave da Apify"** → **"Salvar chave"**. A chave fica cifrada no servidor;
o navegador não a vê de novo. Ela vem da conta da pessoa em apify.com (Settings › API &
Integrations). Sem saldo, a busca falha na Apify, não no CRM.

## 5. Prospecção › a busca

| campo | o que colocar | limites |
|---|---|---|
| "Público ou segmento" | o termo como se procura no Google Maps ("clínica de estética") | 2 a 120 caracteres |
| "Cidade ou região" | "Sorocaba, SP" | 2 a 160 caracteres |
| "Até quantas empresas" | comece com 20 | 1 a 100 (padrão 20) |
| "Teto da busca (US$)" | o que a pessoa topou gastar | 0,50 a 10 (padrão 1) |
| "Enriquecer com e-mails comerciais e redes encontradas no site" | ligado, se ela quer ver site e redes antes da conversa | — |

Diga o teto em voz alta e espere o "pode buscar". Ela clica **"Buscar empresas"**. O estado passa
por "Iniciando busca" até **"Busca concluída"**. Se ficar em "Busca sem confirmação", **não busque
de novo**: confira as execuções na Apify antes, senão paga duas vezes. Empresa marcada como
fechada no Google não entra na lista.

## 6. Prospecção › o agente

Dentro da campanha em "Preparar campanha", dois caminhos:

**"Configurar por conversa" (recomendado).** Um assistente pergunta o que falta e monta o
agente. Cole de uma vez o bloco do pacote: oferta, público, objetivo da conversa, critérios de
qualificação, tom, quando chamar uma pessoa. Corrija o "Resumo do agente" até ficar certo. Ele
não cria nada sozinho e não fala com contato nenhum.

- **"Testar como cliente"**: prepara um rascunho pausado e responde como o agente responderia.
  Rode o roteiro de 5 mensagens do pacote (`nichos.md`). Se a resposta mostrar "termos internos do
  sistema", ajuste a conversa antes de publicar.
- O cartão de revisão mostra a abordagem, os critérios, a conexão e o funil. Se o número tem
  roteador com a continuidade desligada, ali aparece **"Manter a continuidade do agente neste
  canal"** — só a pessoa pode ligar.
- **"Publicar e usar agente"** (clique dela): publica, liga as capacidades de atualizar negócios
  no funil escolhido e de transferir para humano, e seleciona o agente na campanha. Ele já pode
  receber conversas no número; as abordagens **ainda não** começaram.
- "Configurações avançadas do agente" abre o editor comum, para base de conhecimento, agenda e o
  resto.

**"Usar agente existente / configurar manualmente".** O agente escolhido precisa estar publicado,
em operação **automática**, com a capacidade de mover negócios no funil (a ferramenta
`crm_move_lead_stage`) e com acesso ao funil da campanha. Monte esse agente pelo guia
`deskcomm-cliente-novo` e volte.

## 7. Roteador (só se o número tiver um)

A campanha exige que o agente seja **membro** do roteador daquele número e que a continuidade
esteja ligada — senão uma resposta à abordagem pode cair em outro agente no meio da conversa. A
continuidade vem ligada de fábrica. O "Configurar por conversa" acrescenta o agente ao roteador sem
tirar os outros.

Sem roteador: o agente da campanha precisa ser o agente publicado **naquele** número. Se outro
agente já atende o número, ou se reaproveita esse agente, ou se monta um roteador — a campanha
recusa trocar o atendimento sem aviso.

## 8. Prospecção › a campanha

| campo | o que colocar | limites |
|---|---|---|
| "Agente de IA" | o agente publicado do passo 6 | — |
| "Conexão de saída" | o número *WORKING* | — |
| funil, "Etapa inicial", "Etapa de qualificados" | as do passo 3 | duas etapas abertas e diferentes |
| "O que a IA deve oferecer e como iniciar" | oferta + objetivo da primeira conversa, do pacote | 10 a 2000 caracteres |
| "Quando considerar o cliente qualificado" | os 2 ou 3 sinais concretos da triagem | 10 a 2000 caracteres |
| "Máximo em 24 horas" | número novo: 5 a 10 | 1 a 50 (padrão 10) |
| "Intervalo mínimo (minutos)" | 15 ou mais | 5 a 1440 (padrão 15) |
| "Referência da avaliação de legítimo interesse" | nome e data do documento da triagem, bloco 8 | 3 a 500 caracteres |

Ela clica **"Iniciar abordagens com IA"**. A campanha fica "Em andamento" e a primeira abordagem é
preparada após um minuto. A configuração fica gravada: uma preparação interrompida só retoma com a
**mesma** configuração.

## 9. Acompanhar

- Contadores: "Encontrados", "Na fila", "Responderam", "Qualificados".
- Estado de cada empresa: "Encontrado", "Na fila", "Preparando abordagem", "Abordado", "Não
  abordado", "Respondeu", "Qualificado". "Abrir no Inbox" leva à conversa.
- **"Pausar abordagens"** para novas abordagens (uma que já estava saindo pode concluir);
  **"Retomar fila"** continua.
- Erro de envio **pausa a campanha sozinho**. Corrija o agente, o número ou o atendimento e retome;
  quem falhou fica para revisão. Envio incerto não é reenviado.
- Quem não respondeu não recebe insistência automática. Nova rodada é uma nova busca, iniciada à mão.
