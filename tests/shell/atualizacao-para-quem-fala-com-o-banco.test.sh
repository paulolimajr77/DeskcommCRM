#!/usr/bin/env bash
# Prova de que a atualização sabe QUEM parar antes de mexer no banco — com
# `docker` substituído por um dublê. Nada aqui toca a máquina de quem roda:
# nenhum contêiner sobe, nenhum contêiner para.
#
#   bash tests/shell/atualizacao-para-quem-fala-com-o-banco.test.sh
#
# ## Por que este arquivo existe
#
# O `baseline.sql` aplica cada regra de isolamento como APAGAR e depois CRIAR —
# é o único jeito portável, porque o Postgres não tem `create or replace
# policy`. Com tráfego vivo isso vira disputa de trava, e quando o CRIAR trava o
# APAGAR já valeu: a regra some, o banco passa a negar a leitura em silêncio, e
# a tela fica VAZIA sem um erro sequer.
#
# Medido numa instalação real, no mesmo dia e com o mesmo arquivo:
#   tudo de pé ................................ 113 travamentos
#   CRM parado ................................  60 travamentos
#   CRM + rest + realtime + studio parados ....   0 travamentos
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
falhas=0
ok()  { printf '  \342\234\223 %s\n' "$1"; }
nao() { printf '  \342\234\227 %s\n     esperava: %s\n     veio:     %s\n' "$1" "$2" "$3"; falhas=$((falhas + 1)); }

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

# Dublê de `docker`: devolve a lista de contêineres que a instalação REAL tem
# (medida em 2026-09-12), incluindo os de OUTROS sistemas na mesma VPS — é
# justamente contra eles que a lista precisa ser explícita.
cat > "$tmp/bin/docker" <<'DUBLE'
#!/usr/bin/env bash
if [ "$1" = "ps" ]; then
  cat <<'LISTA'
deskcomm-app-1
deskcomm-worker-1
deskcomm-scheduler-1
realtime-dev.supabase-realtime
supabase-auth
supabase-db
supabase-rest
supabase-studio
imobplus-server-app-1
wordpress_app_pljr
LISTA
  exit 0
fi
exit 0
DUBLE
chmod +x "$tmp/bin/docker"
export PATH="$tmp/bin:$PATH"

# O `_common.sh` abre com `set -euo pipefail`; sem desarmar o `-e` depois de
# carregá-lo, o primeiro `grep` sem casamento derrubaria a suíte inteira em
# silêncio — e um arquivo de teste que morre cedo passa por "verde".
# shellcheck disable=SC1090
. "$RAIZ/hostgator-setup-kit/_common.sh"
set +e

echo "caso 0 — GUARDA DE VACUIDADE: a função existe"
# Sem este caso, os de baixo passam por acidente enquanto a função não existe:
# "a saída vazia não contém imobplus" é verdade, e "hospedado devolve vazio"
# também — um arquivo inteiro verde medindo o nada. Medido: rodando este teste
# antes da implementação, 3 dos 4 casos ficavam verdes.
if declare -F supabase_local_containers >/dev/null 2>&1; then
  ok "supabase_local_containers está declarada"
else
  nao "supabase_local_containers existe" "declarada em _common.sh" "ausente — os casos abaixo medem o nada"
fi

echo "caso 1 — acha as três peças do Supabase local"
saida="$(supabase_local_containers | sort | tr '\n' ' ')"
esperado="realtime-dev.supabase-realtime supabase-rest supabase-studio "
[ "$saida" = "$esperado" ] && ok "achou as três, e só elas" \
  || nao "as três peças" "$esperado" "$saida"

echo "caso 2 — NÃO leva sistema de terceiro junto"
case "$saida" in
  *imobplus*|*wordpress*) nao "não toca em outro sistema" "sem imobplus/wordpress" "$saida" ;;
  *) ok "imobplus e wordpress ficam de fora" ;;
esac

echo "caso 3 — NÃO leva o banco nem o auth"
# Parar o banco seria absurdo (é nele que o DDL roda) e derrubar o auth
# deslogaria quem está na tela sem necessidade nenhuma.
case "$saida" in
  *supabase-db*|*supabase-auth*) nao "poupa o banco e o auth" "sem supabase-db/auth" "$saida" ;;
  *) ok "supabase-db e supabase-auth ficam de pé" ;;
esac

echo "caso 4 — CONTROLE: Supabase hospedado devolve vazio"
# Sem este controle, uma função que devolvesse a lista inteira passaria nos três
# casos acima por acidente. E ele mede a decisão que torna o conserto portável:
# onde o Supabase é hospedado não há o que parar, e quem protege é a conferência.
cat > "$tmp/bin/docker" <<'DUBLE'
#!/usr/bin/env bash
if [ "$1" = "ps" ]; then printf 'deskcomm-app-1\ndeskcomm-worker-1\n'; exit 0; fi
exit 0
DUBLE
chmod +x "$tmp/bin/docker"
vazio="$(supabase_local_containers | tr -d '[:space:]')"
[ -z "$vazio" ] && ok "hospedado: nada a parar" || nao "hospedado devolve vazio" "(vazio)" "$vazio"

if [ "$falhas" -eq 0 ]; then
  echo "TUDO VERDE"
  exit 0
else
  echo "$falhas caso(s) vermelho(s)"
  exit 1
fi
