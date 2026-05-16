# paisagem

Poster interativo em HTML, CSS e JavaScript puro, feito com Canvas 2D.

A paisagem de Belo Horizonte aparece em bitmap/dither 1-bit, sobreposta com excertos de poemas de Ana Martins Marques. Ao pressionar ou tocar a imagem, uma explosao branca em forma de carimbo revela a frase em verde. Um toque longo no centro troca a paisagem: a imagem de fundo dissolve em blocos secos enquanto o carimbo permanece, depois corta para a proxima cena.

## Rodar localmente

```bash
python3 -m http.server 8060 --bind 127.0.0.1
```

Abra:

```text
http://127.0.0.1:8060/
```

## Controles

- Clique ou toque: cria uma explosao.
- Pressionar e segurar: carrega o tamanho da explosao.
- Pressionar e segurar no centro ate o maximo: troca a cena.
- `C`: captura o estado do canvas de aproximadamente 0,2s antes.
- `R`: reseta explosoes e transicao.
- `D`: alterna debug.

No mobile, a captura tenta abrir o compartilhamento nativo para salvar a imagem. No desktop, baixa um PNG.

## Arquivos esperados

- `cidade_dither_1.png` a `cidade_dither_12.png`
- `cidade_frase_1.png` a `cidade_frase_12.png`
- `cidade_explosion_1.png` a `cidade_explosion_7.png`

Nao ha frameworks, build step ou dependencias externas.
