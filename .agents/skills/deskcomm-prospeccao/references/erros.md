# Deu erro — a mensagem da tela e o que fazer

As mensagens abaixo são as que o sistema mostra, copiadas do código. Procure pela frase que
apareceu.

## Ao salvar a chave ou buscar

| mensagem | causa | o que fazer |
|---|---|---|
| "Configure a chave de busca antes de extrair empresas." | não há chave da Apify salva | passo 4 de `pela-tela.md` |
| "Chave de busca inválida." | a Apify recusou a chave | copie de novo a chave na Apify e salve |
| "Saldo ou limite de uso insuficiente no provedor de busca." | a conta Apify está sem saldo ou no limite | recarregue na Apify; o CRM não cobra nada |
| "Não foi possível abrir a chave de busca. Salve a configuração novamente." | a chave gravada não abre mais | salve a chave de novo |
| "A cifra de credenciais da instalação não está disponível." | a instalação não tem a cifra de segredos ativa | é da instalação, não da campanha: guia `deskcomm-instalar` |
| "Uma operação está em andamento. Tente novamente em alguns segundos." | outra ação de prospecção da mesma organização está rodando | espere e repita |
| "Busca concluída sem resultado disponível." | a Apify terminou sem devolver lista | confira a execução na Apify; troque o termo ou a região |
| "O provedor não confirmou a operação. Consulte o histórico antes de repetir uma busca." / estado "Busca sem confirmação" | o CRM não soube se a Apify rodou | **não busque de novo**: confira as execuções na Apify antes, a busca é paga |

## Ao iniciar a campanha

| mensagem | causa | o que fazer |
|---|---|---|
| "Escolha um agente publicado e em operação automática." | agente em rascunho, pausado, arquivado ou em modo assistido | publique e deixe em "Automático" no editor do agente |
| "Publique o agente com a ferramenta de mover negócios e acesso ao funil escolhido." | falta a capacidade de mover negócios, ou o agente não tem acesso a este funil | editor do agente: ligue a capacidade, marque o funil, publique de novo |
| "Escolha uma conexão ativa que permita iniciar conversas de texto. Canais que exigem modelo aprovado ainda não participam desta campanha." | número fora de *WORKING*, ou canal que só inicia conversa com modelo aprovado | reconecte o número, ou use um número WhatsApp por WAHA |
| "Inclua o agente no roteador deste canal e ative a continuidade do agente antes de iniciar." | o número tem roteador, e o agente não é membro ou a continuidade está desligada | acrescente o agente ao roteador; a continuidade se religa no cartão de revisão do "Configurar por conversa" |
| "Publique o agente no canal escolhido para que ele também atenda às respostas." | sem roteador, e outro agente (ou nenhum) atende o número | publique este agente no número, ou monte um roteador |
| "Escolha duas etapas abertas e diferentes do mesmo funil: entrada e qualificados." | etapas iguais, de outro funil, arquivadas, ou uma delas é "ganhou"/"perdeu" | passo 3 de `pela-tela.md` |
| "Aguarde a busca terminar; uma campanha já iniciada deve ser retomada." | busca ainda rodando, ou a campanha já foi iniciada antes | espere "Busca concluída"; campanha já iniciada usa "Retomar fila" |
| "Pause a campanha atual antes de iniciar outra." | já existe uma campanha "Em andamento" | só uma ativa por organização: pause a outra |
| "A preparação já começou. Retome com a mesma configuração da campanha." | tentou iniciar de novo com campos diferentes | volte aos valores da primeira tentativa, ou crie outra campanha |

## Com a campanha andando

| mensagem | causa | o que fazer |
|---|---|---|
| "O canal ainda não permite esta abordagem: …" | a proteção do número recusou (fora da janela, modo de teste, aquecimento) | leia o motivo; ajuste em Conexões |
| "Agente pausado ou sem versão publicada." | alguém pausou o agente ou tirou a publicação | publique ou despause e "Retomar fila" |
| "A IA não produziu uma abordagem: …" | o modelo não escreveu texto para os dados daquela empresa | vale só para aquela empresa; se repetir em várias, confira a credencial e o orçamento de IA |
| "Destino da abordagem incompleto para este candidato." | aquela empresa ficou sem contato ou conversa criados | vale só para aquela empresa; as próximas seguem |
| "Contato já atendido, assumido por humano ou sem autorização para esta abordagem." | a conversa já estava fechada, assumida por alguém ou com o robô silenciado | é proteção: ninguém aborda quem já está sendo atendido |
| "Conexão de saída indisponível." | o número caiu | reconecte em Conexões e retome |
| "Campanha pausada ou dados indisponíveis." / "Abordagem cancelada ou indisponível." | a campanha foi pausada, ou a empresa saiu da fila no meio | normal depois de pausar; se não pausou, veja o histórico da empresa |

Erro de envio **pausa a campanha** (documentado em `docs/features/prospeccao-nativa.md`). Envio
incerto não é reenviado: o resultado e o link do Inbox ficam na campanha para revisão.
