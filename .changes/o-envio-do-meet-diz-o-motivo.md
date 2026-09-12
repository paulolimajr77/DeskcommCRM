---
impacto: capacidade_nova
secao: corrigido
titulo: "Enviar link ao cliente" para de travar 20 segundos e passa a dizer por que recusou
---

Medido numa instalação real. O botão **Enviar link ao cliente** ficava cerca de **20 segundos** parado e terminava em *"Erro inesperado. Tente novamente."* — sem nenhuma pista, e clicar de novo não adiantava.

O banco recusava por um motivo claro: **o atendimento daquela conversa havia mudado depois que o link foi criado**, então a autorização precisava ser refeita na conversa atual. Ele sabia dizer isso desde o primeiro instante.

O que o sistema fazia com essa recusa: tratava como erro interno do servidor. E erro interno é, por convenção, "tente de novo" — então o próprio sistema repetia o pedido **três vezes**, cada uma esperando dez segundos, antes de desistir. Os 20 segundos eram isso.

Pior: ao registrar a falha no servidor, ele gravava um texto fixo no lugar do motivo real. O sistema sabia por que tinha recusado e apagava a informação ao anotá-la — foi por isso que um dia inteiro de investigação não achou nada nos registros.

Agora cada recusa tem a sua frase, dizendo o que fazer:

- *"O atendimento desta conversa mudou depois que o link foi criado. Escolha a conversa atual e autorize o envio de novo."*
- *"Só quem é responsável pelo compromisso pode enviar o link dele."*
- *"Confirme a verificação em duas etapas nesta sessão para enviar o link."*
- e mais quatro, uma para cada motivo.

E a resposta deixa de ser "tente de novo": **sem as três tentativas, a recusa aparece na hora.**

Falha de rede ou de infraestrutura continua sendo repetida automaticamente — essa merece nova tentativa, ao contrário de uma recusa de regra.
