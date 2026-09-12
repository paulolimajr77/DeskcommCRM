---
impacto: capacidade_nova
secao: corrigido
titulo: A atualização confere as regras de acesso do banco antes de dizer que deu certo
---

Medido numa instalação real, e custou uma tarde: depois de atualizar, **o funil apareceu vazio** — sem erro, sem aviso, sem nada na tela. Os dados estavam todos lá. O que tinha sumido era a regra que autoriza o sistema a **ler** aquela tabela.

Por que isso passa despercebido: sem a regra de leitura, o banco nega em silêncio. A tela mostra uma lista vazia, que é indistinguível de "não há nada aqui". E a atualização havia reportado **"concluída com sucesso"**.

O que acontecia por baixo: para cada regra, a atualização **apaga e recria**. Ela roda sem parar em erro, de propósito, para que uma instalação bagunçada consiga se consertar sozinha. Só que, se o "recriar" falha, o "apagar" já valeu — e ninguém fica sabendo. E o que faz o "recriar" falhar é **disputa com quem está usando o sistema naquele instante**: medido na mesma instalação, no mesmo dia e com o mesmo arquivo, foram **113** travamentos com tudo no ar e **zero** com o sistema pausado.

Agora a atualização faz quatro coisas novas:

- **pausa o sistema** enquanto mexe no banco — cerca de **16 segundos** a mais numa atualização que leva cinco minutos em média, e cuja variação normal entre duas rodadas já é de treze minutos;
- **guarda o que o banco respondeu** (`.deskcomm-banco.log`) — antes essa informação era jogada fora, e era justamente a única que importava;
- **confere todas as regras** com o sistema ainda pausado e, se faltar alguma, **recria exatamente as que faltam**, tirando o comando do próprio arquivo do banco;
- se ainda faltar, **para, avisa em vermelho e NÃO devolve o sistema ao ar**, dizendo o efeito em português — *"as telas aparecem vazias"* —, listando o que falta e apontando o log e o caminho de restauração.

O último ponto é uma escolha, e vale explicar: um sistema fora do ar é um problema visível, que alguém resolve. Um sistema no ar sem regra de acesso mostra tela vazia para todo mundo e ninguém descobre por quê.

Por que **recriar** em vez de simplesmente aplicar o banco de novo: medido, aplicar de novo **não resolve de forma confiável**. Na segunda passada uma regra voltou e outra sumiu; na terceira, o conjunto mudou outra vez. Cada passada é a mesma corrida que causou o problema.

Junto com esse defeito havia outro que ninguém tinha notado: a regra das **notificações do navegador** também tinha sumido, e elas simplesmente não funcionavam.

Nada muda para quem opera: sem passo manual, sem mexer em configuração.
