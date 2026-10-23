# Publicar na Vercel

O sistema roda na Vercel como função serverless (`api/index.js`) mais os arquivos estáticos de `public/`. O banco é um Postgres externo (Neon, pela loja da própria Vercel). Tudo fica no banco, inclusive os documentos enviados.

## Antes de tudo: o código precisa estar na branch `main`

Na tela de importação, a Vercel só lista a pasta `obras` (Root Directory) se ela existir na `main`. Por isso o pull request precisa ser mesclado primeiro.

## Passo a passo

1. **Importar o projeto.** Em vercel.com: *Add New → Project* → escolha o repositório `lumi-backend` (a Vercel pede acesso ao GitHub na primeira vez).
2. **Configurar o projeto**, na tela de importação:
   - **Root Directory:** `obras`
   - **Framework Preset:** Other
   - **Build Command:** deixe vazio
   - **Output Directory:** `public`
3. **Criar o banco.** Antes de publicar, ou logo depois, em *Storage → Create Database*, escolha **Neon (Postgres)** e conecte ao projeto. Isso cria sozinho a variável `DATABASE_URL`. Marque todos os ambientes (Production, Preview, Development).
4. **Definir o código de instalação.** Em *Settings → Environment Variables*, crie `SETUP_TOKEN` com um valor longo e secreto (por exemplo, o resultado de `openssl rand -hex 16`). Sem isso, a primeira pessoa que abrir o endereço vira administradora.
5. **Publicar** (*Deploy*). As tabelas são criadas no primeiro acesso.
6. **Primeiro acesso.** Abra o endereço, preencha nome, e-mail, senha e o código de instalação. Esse usuário é o administrador. Depois pode apagar `SETUP_TOKEN`, porque o cadastro inicial só funciona enquanto não existe usuário.
7. **Região (opcional).** Em *Settings → Functions*, escolha a região mais próxima do banco para as telas responderem mais rápido.

## Se algo der errado

| Sintoma | O que fazer |
|---|---|
| A pasta `obras` não aparece em *Root Directory* | O pull request ainda não foi mesclado na `main` |
| Tela de erro "Banco de dados indisponível" ou `/healthz` com erro | A variável `DATABASE_URL` não existe neste ambiente. Em *Storage*, conecte o Neon ao projeto marcando Production, Preview e Development, e faça *Redeploy* |
| A página abre mas fica em branco | *Output Directory* deve ser `public` |
| "Código de instalação incorreto" | Digite exatamente o valor da variável `SETUP_TOKEN` (sem espaços) |
| Login volta para a tela de entrada | Abra sempre pelo endereço `https://...vercel.app` (o cookie exige HTTPS) |
| Envio de arquivo falha | O limite é 4 MB por arquivo |

Para ver o erro: *Deployments →* a publicação *→ Logs*. Para conferir que o servidor e o banco respondem, abra `SEU-ENDERECO/healthz`: deve mostrar `{"ok":true}`.

## Qual branch publica

A Vercel publica em produção a branch principal (`main`). O código novo está na branch `claude/festive-pasteur-tex6gn`, no pull request. Duas opções:

- **Ver antes de aprovar:** a Vercel gera um endereço de *preview* para cada branch. Funciona sem mexer em nada, desde que `DATABASE_URL` esteja marcada também para Preview.
- **Colocar em produção:** faça o merge do pull request na `main`.

## Limites a conhecer

- **Arquivos de até 4 MB** por envio (limite da Vercel é 4,5 MB). Para PDFs maiores é preciso outro tipo de armazenamento.
- **Plano:** pelos termos da Vercel, o plano gratuito (Hobby) é para uso não comercial. Para uma empresa, confira o plano Pro.
- **Banco:** os limites do plano gratuito do Neon (espaço e horas de uso) valem para este sistema também.
- A primeira chamada depois de um tempo parado pode demorar um ou dois segundos a mais.

## Variáveis

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | conexão Postgres (a loja da Vercel cria; `POSTGRES_URL` também é aceita) |
| `SETUP_TOKEN` | código exigido no cadastro do primeiro administrador |
| `TZ_OBRA` | fuso para "hoje" (padrão `America/Sao_Paulo`) |

## Backup

Como tudo (dados e documentos) está no Postgres, o backup é o do banco. Confira a política de retenção do plano escolhido no Neon.
