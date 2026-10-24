# Design

Partida curta, por volta de 30 minutos. O último com vida vence. Fechar o jogo abandona a partida.

## Controle

WASD move relativo à câmera (W sobe na tela). Botão direito ou a borda da tela arrasta o olhar. As habilidades disparam sozinhas quando o cooldown acaba e existe alvo. Não há botão de skill.

Comportamentos: `single`, `chain` (N alvos, dano cai pelo `falloff`), `aoe`, `projectile`, `cone`.

## Rodada

1. PvE. Cada jogador vai para o próprio quadrado. A onda é a mesma, os bichos são cópias. Quem limpa espera no quadrado. A onda só fecha quando o último vivo termina, ou estoura `pveSeconds`. Limpar paga ouro.
2. Salão no centro do mapa. Sem dano, sem mob, sem PvP. Aqui sobe de nível vira escolha de carta (`cardPickSeconds`, padrão 22s). Loja e aposta do duelo cabem no mesmo respiro. Andar continua liberado. `Seguir` ou o fim de `hubSeconds` manda o próximo passo.
3. Morrer na onda custa uma vida e respawna no mesmo quadrado. Sem vidas, vira espectador.
4. A partir da rodada `duelStartRound`, o salão avisa o duelo. Quem não luta aposta. Depois do timer, só os pareados teleportam. O perdedor perde uma vida. Empate devolve a aposta. Depois do duelo já vai a próxima onda.
5. Nível durante a onda só guarda a escolha (`unspentPicks`). A carta abre no salão. Se o tempo acaba, uma carta sai sozinha.

Boss entra nas rodadas múltiplas de `everyRounds` do `bosses.json`. O de intervalo maior ganha a rodada quando os dois coincidem.

## Economia

Valores em `economy.json`. Ouro vem de abate, onda limpa, duelo e bye de quem sobra sem par. Upgrade custa `base * growth^(nível atual - 1)`. Preço de carta vem da raridade.

Sinergias em `synergies.json`: ao juntar N cartas com a mesma tag, o bônus entra uma vez.

## Balanceamento

`/api/matches` lista partidas com contagem de eventos. A tabela `events` guarda carta oferecida e escolhida, dano por habilidade ao fim da fase, morte, duelo, aposta, compra e vitória. O `data_version` é o `version` do `match.json`.
