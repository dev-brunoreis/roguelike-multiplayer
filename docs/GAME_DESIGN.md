# Design

Partida curta, por volta de 30 minutos. O último com vida vence. Fechar o jogo abandona a partida.

## Controle

WASD move relativo à câmera (W sobe na tela). A câmera segue o herói ou quem está em observação e o mouse não a desloca: o cursor marca um ponto no chão. O herói olha para esse ponto. As habilidades disparam sozinhas quando o cooldown acaba. `single`, `projectile` e o primeiro salto do `chain` acertam quem está na linha até o ponto, cortada no alcance (`aimSlack` alarga a linha). `aoe` estoura nesse ponto só se tem bicho no raio; vazio, não gasta o cooldown. `cone` sai no leque à frente da mira e não gasta cooldown se o leque está vazio. Sem mira ainda, volta o targeting do JSON (`nearest`, `lowestHp`, `random`, `densest`). Na escolha de carta, as teclas `1`–`6` pegam a oferta. No salão, `Espaço` confirma Seguir. `Esc` abre o menu: continuar, pedir pausa, volume da música, volume dos efeitos, desistir ou sair. A partida só para quando todo humano vivo pediu pausa.

Comportamentos: `single`, `chain` (N alvos, dano cai pelo `falloff`), `aoe`, `projectile`, `cone`.

## Rodada

1. PvE. Cada jogador vai para o próprio quadrado. A onda é a mesma, os bichos são cópias. A partida não tem rodada final: a última onda do JSON se repete mais densa e os bichos ganham vida/dano. Quem limpa espera. A onda só fecha quando o último vivo termina, ou estoura o timer.
2. Salão no centro do mapa. Sem dano, sem mob, sem PvP. Aqui sobe de nível vira escolha de carta (`cardPickSeconds`). Andar continua liberado. `Seguir` ou o fim de `hubSeconds` manda o próximo passo.
3. Morrer na onda custa uma vida e respawna no mesmo quadrado. Sem vidas, vira espectador.
4. A partir da rodada `duelStartRound`, o salão escolhe **um** par. Um banner no topo anuncia o par por `duelAnnounceSeconds` (10s), depois o vencedor, morte e desistência. Só os dois teleportam. O perdedor perde uma vida. Depois do duelo já vai a próxima onda.
5. Nível durante a onda só guarda a escolha (`unspentPicks`). A carta abre no salão e a oferta usa o `weight` de cada carta. Se o tempo acaba, uma carta sai sozinha.

Um herói cabe até `maxAbilities` skills (padrão 6). Skill nova vem de carta `grantAbility`. Se a barra estiver cheia, a nova troca a mais fraca. Upgrade vem de carta `upgradeAbility`. Matar bicho dá experiência e não abre carta extra.

No lobby e na partida, Enter abre o chat. A mensagem sai com o nome da conta, para todo mundo na sala. Esc solta o campo antes de abrir o menu. Enquanto escreve, o herói fica parado. Na partida, o chat reconhece comando e responde no lugar da fala. `/godmode` liga ou desliga a invulnerabilidade de quem escreveu (`ligar` e `desligar` fixam o estado), mesmo morto ou eliminado, e o estado continua; a lista marca quem está assim. `/skipduelo` (ou `pular duelo`) cancela o duelo anunciado ou o que já começou: ninguém perde vida por isso, e a onda seguinte segue. `/duelos` liga ou desliga o agendamento; desligado, um par já marcado some e a partida segue só de onda. `/onda 12` (1 a 99) troca a rodada e começa essa onda na hora. `/bots` liga ou desliga a invulnerabilidade de todo bot, morto também, para a partida não acabar enquanto se testa onda. O estado fica na partida. `/reviver` levanta quem escreveu na hora; `/reviver Nome` levanta esse jogador. Se ainda tinha vida, a espera acaba sem gastar outra. Se estava eliminado, volta com 1 vida. Se a partida já tinha acabado, o salão reabre. Na sala de espera esses comandos só avisam que valem na partida.

Boss entra nas rodadas múltiplas de `everyRounds` do `bosses.json`. O de intervalo maior ganha a rodada quando os dois coincidem.

## Masmorra

Modo cooperativo, escolhido na sala de espera. A semente gera um andar de salas quadradas ligadas por portais. A entrada não tem bicho. Salas de luta armam o encontro ao entrar; elite e chefe idem. Descanso fica vazio. Com bicho vivo a sala tranca a saída, e a entrada continua aberta. O chefe fica na sala mais funda. Matar o chefe vence. O herói que cai no chão espera um aliado perto por `reviveSeconds`. Sem aliado a barra desce. O grupo perde quando todo mundo está caído. Carta de nível abre na hora, andando. O bicho guarda o ponto em que nasceu: perto, persegue; passou da coleira, volta e cura.

Sinergias em `synergies.json`: ao juntar N cartas com a mesma tag, o bônus entra uma vez.

## Balanceamento

`/api/matches` lista partidas com contagem de eventos. A tabela `events` guarda carta oferecida e escolhida, dano por habilidade ao fim da fase, morte, duelo e vitória. O `data_version` é o `version` do `match.json`.
