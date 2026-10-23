# Design

Partida curta, por volta de 30 minutos, com rodadas de até 60 segundos. O último com vida vence. Fechar o jogo abandona a partida.

## Controle

WASD move relativo à câmera (W sobe na tela). Botão direito ou a borda da tela arrasta o olhar. As habilidades disparam sozinhas quando o cooldown acaba e existe alvo. Não há botão de skill.

Comportamentos: `single`, `chain` (N alvos, dano cai pelo `falloff`), `aoe`, `projectile`, `cone`.

## Rodada

1. PvE. Cada jogador tem uma arena. A onda é a mesma, os bichos são cópias. Limpar a onda paga ouro. Estourar o tempo só segue em frente.
2. Subir de nível abre `cardsPerLevelUp` cartas (padrão 5) por alguns segundos. O herói continua andando e lutando. Se o tempo acaba, uma carta sai sozinha.
3. Morrer custa uma vida e respawna na mesma onda. Sem vidas, vira espectador.
4. A partir da rodada `duelStartRound`, quem está vivo é pareado. Os outros apostam ouro. O perdedor do duelo perde uma vida. Empate devolve a aposta.
5. Loja: comprar carta, subir nível de habilidade, trocar a vitrine, ou seguir. O ouro não volta no próximo login.

Boss entra nas rodadas múltiplas de `everyRounds` do `bosses.json`. O de intervalo maior ganha a rodada quando os dois coincidem.

## Economia

Valores em `economy.json`. Ouro vem de abate, onda limpa, duelo e bye de quem sobra sem par. Upgrade custa `base * growth^(nível atual - 1)`. Preço de carta vem da raridade.

Sinergias em `synergies.json`: ao juntar N cartas com a mesma tag, o bônus entra uma vez.

## Balanceamento

`/api/matches` lista partidas com contagem de eventos. A tabela `events` guarda carta oferecida e escolhida, dano por habilidade ao fim da fase, morte, duelo, aposta, compra e vitória. O `data_version` é o `version` do `match.json`.
