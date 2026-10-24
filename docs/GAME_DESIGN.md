# Design

Partida curta, por volta de 30 minutos. O último com vida vence. Fechar o jogo abandona a partida.

## Controle

WASD move relativo à câmera (W sobe na tela). Botão direito ou a borda da tela arrasta o olhar. As habilidades disparam sozinhas quando o cooldown acaba e existe alvo. Na escolha de carta, as teclas `1`–`6` pegam a oferta. No salão, `Espaço` confirma Seguir.

Comportamentos: `single`, `chain` (N alvos, dano cai pelo `falloff`), `aoe`, `projectile`, `cone`.

## Rodada

1. PvE. Cada jogador vai para o próprio quadrado. A onda é a mesma, os bichos são cópias. A partida não tem rodada final: a última onda do JSON se repete mais densa e os bichos ganham vida/dano. Quem limpa espera. A onda só fecha quando o último vivo termina, ou estoura o timer.
2. Salão no centro do mapa. Sem dano, sem mob, sem PvP. Aqui sobe de nível vira escolha de carta (`cardPickSeconds`). Andar continua liberado. `Seguir` ou o fim de `hubSeconds` manda o próximo passo.
3. Morrer na onda custa uma vida e respawna no mesmo quadrado. Sem vidas, vira espectador.
4. A partir da rodada `duelStartRound`, o salão escolhe **um** par. Um banner no topo anuncia o par por `duelAnnounceSeconds` (10s), depois o vencedor, morte e desistência. Só os dois teleportam. O perdedor perde uma vida. Depois do duelo já vai a próxima onda.
5. Nível durante a onda só guarda a escolha (`unspentPicks`). A carta abre no salão. Se o tempo acaba, uma carta sai sozinha.

Um herói cabe até `maxAbilities` skills (padrão 6). Skill nova vem de carta `grantAbility`. Se a barra estiver cheia, a nova troca a mais fraca. Upgrade vem de carta `upgradeAbility`. Mob pode dropar item (`dropChance`) e isso vira mais uma escolha no salão.

Boss entra nas rodadas múltiplas de `everyRounds` do `bosses.json`. O de intervalo maior ganha a rodada quando os dois coincidem.

## Sorte

Não tem ouro. `economy.json` tem `luckBias` por raridade. A stat `luck` multiplica o peso das cartas mais raras na oferta. Limpar a onda dá um pouco de sorte. Cartas `Amuleto` e `Destino` aumentam mais.

Sinergias em `synergies.json`: ao juntar N cartas com a mesma tag, o bônus entra uma vez.

## Balanceamento

`/api/matches` lista partidas com contagem de eventos. A tabela `events` guarda carta oferecida e escolhida, dano por habilidade ao fim da fase, morte, duelo e vitória. O `data_version` é o `version` do `match.json`.
