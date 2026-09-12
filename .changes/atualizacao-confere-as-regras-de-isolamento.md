---
impacto: capacidade_nova
secao: corrigido
titulo: A atualização confere as regras de acesso do banco antes de dizer que deu certo
---

Medido numa instalação real, e custou uma tarde: depois de atualizar, **o funil apareceu vazio** — sem erro, sem aviso, sem nada na tela. Os dados estavam todos lá. O que tinha sumido era a regra que autoriza o sistema a **ler** aquela tabela.

Por que isso passa despercebido: sem a regra de leitura, o banco nega em silêncio. A tela mostra uma lista vazia, que é indistinguível de "não há nada aqui". E a atualização havia reportado **"concluída com sucesso"**.

O que acontecia por baixo: para cada regra, a atualização **apaga e recria**. Ela roda sem parar em erro, de propósito, para que uma instalação bagunçada consiga se consertar sozinha. Só que, se o "recriar" falha, o "apagar" já valeu — e ninguém fica sabendo.

Agora a atualização faz três coisas novas:

- **guarda o que o banco respondeu** (`.deskcomm-banco.log`) — antes essa informação era jogada fora, e era justamente a única que importava;
- **confere todas as regras** contra o que o sistema declara e, se faltar alguma, **aplica o banco mais uma vez** (a falha medida foi passageira: reaplicado depois, o mesmo arquivo passou sem um erro);
- se ainda faltar, **para e avisa em vermelho**, dizendo o efeito em português — *"as telas aparecem vazias"* —, listando o que falta e apontando o log e o caminho de restauração.

Junto com esse defeito havia outro que ninguém tinha notado: a regra das **notificações do navegador** também tinha sumido, e elas simplesmente não funcionavam.

Nada muda para quem opera: sem passo manual, sem mexer em configuração.
