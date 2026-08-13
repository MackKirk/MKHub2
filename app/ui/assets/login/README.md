Login assets
============

Coloque aqui as imagens usadas na tela de login.

## Foto do painel vermelho (`panel-photo.jpg`)

Imagem em **tons de cinza** que fica por cima do vermelho, com transparência no CSS
(`opacity ~28%` + `mix-blend-luminosity`). Não precisa ser PNG transparente — um JPG cinza é o ideal.

| | |
|---|---|
| Arquivo | `app/ui/assets/login/panel-photo.jpg` |
| Tamanho | **1200 × 1800 px** (proporção 2:3, retrato) |
| Formato | JPG, qualidade 70–80, tons de cinza |
| Enquadramento | Foto vertical (obra, oficina, escritório, detalhe de obra). Sem texto, logo ou pessoas em close. |
| Safe area | O centro e o terço inferior ficam mais visíveis; cantos podem ser cortados (`background-size: cover`). |

Mínimo aceitável: **800 × 1200 px**. Evite paisagem — o painel é alto e estreito.

O CSS já aplica cinza + transparência. Se a foto vier colorida, ainda funciona, mas o resultado fica melhor se você exportar já em grayscale.

## Outros arquivos

- `logo-light.svg` — logo claro (painel vermelho)
- `background.jpg` — fundo da página (atrás do card). 16:9, ex. 1920×1080 / 2560×1440
- `icons/` — ícones auxiliares

Boas práticas:
- Prefira SVG para logos e ícones.
- Otimize JPG (qualidade 70–80).
