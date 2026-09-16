---
impacto: capacidade_nova
secao: corrigido
titulo: O assistente passa a anotar no negócio certo sem precisar adivinhar o número
---

Medido em produção em 15 de setembro. O cliente respondeu "sim, já tenho os textos", e o assistente entendeu que aquilo era um campo do funil. Chamou a ferramenta certa, com a chave certa — e um número de negócio **que ele inventou**, porque nunca recebe esse número: numa conversa, o sistema conhece a PESSOA e deriva o negócio dela. A trava de escopo recusou a invenção (certo), e a resposta do cliente se perdeu.

A ferramenta exigia esse número, e o sistema já o descartava para usar o da própria conversa. Agora ele é opcional **dentro de uma conversa**: o alvo vem do contato da conversa, e o assistente não precisa adivinhar nada. **Fora** de uma conversa — integração, automação, chamada pela API —, a escrita sem alvo nenhum passa a ser recusada; antes ela seguia sem nenhuma verificação de escopo.

Duas consequências visíveis: quando o contato da conversa tem um único negócio aberto, a anotação vai para ele; quando tem mais de um (ou nenhum), o assistente é avisado e segue a conversa sem gravar.
