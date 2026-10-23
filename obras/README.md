# Gestão de Obras

Sistema de gestão de obras e financeiro para o engenheiro: orçamento, medição física, cronograma, contas a pagar, fluxo de caixa, documentos e relatório previsto × gasto.

## Importar

A tela **Importar** recebe vários arquivos de uma vez e identifica cada um antes de gravar:

| Arquivo | O que faz |
|---|---|
| Nota fiscal **XML** (NF-e) | lê fornecedor, CNPJ, valor e parcelas com exatidão; cria as contas a pagar e o fornecedor; barra a mesma nota lançada duas vezes (pela chave de acesso) |
| Nota fiscal **PDF** (DANFE com texto) | lê a chave de acesso e o que conseguir (valor, emissão, parcelas); a pessoa confere antes de gravar |
| Planilha de **orçamento** | reconhece colunas pelo nome, aceita título de etapa em linha separada, confere a soma com o "TOTAL" da planilha |
| Planilha de **gastos pagos**, **lista de materiais**, **fornecedores** | reconhece colunas; mostra prévia; ignora linhas que já existem |
| Cotação (comparativo) e outros | guardados em Documentos (o mapa comparativo ainda não existe) |

Nada é gravado sem a pessoa confirmar. PDF escaneado ou foto não é lido (não há OCR). Em **Fornecedores**, nomes parecidos aparecem como possíveis duplicados e podem ser juntados.

## Publicar

Veja [DEPLOY.md](DEPLOY.md) (Vercel + Neon).

## Rodar localmente

Requer Node 22+ e um Postgres.

```bash
cd obras
npm install
export DATABASE_URL=postgres://usuario:senha@localhost:5432/obras
npm start            # http://localhost:3100
```

As tabelas são criadas sozinhas na primeira execução. No primeiro acesso a tela pede o cadastro do **administrador**; depois ele cria os demais usuários (perfis: administrador, editor, somente leitura).

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | conexão Postgres (obrigatória) |
| `PORT` | porta (padrão 3100) |
| `SETUP_TOKEN` | se definido, o cadastro do primeiro administrador exige este código |
| `COOKIE_SECURE=1` | marca o cookie de sessão como Secure (use sempre com HTTPS) |
| `TZ_OBRA` | fuso usado para "hoje" (padrão `America/Sao_Paulo`) |
| `TRUST_PROXY=1` | use atrás de proxy/balanceador (Render, Fly, Nginx) para o HTTPS e o IP serem reconhecidos |

## Testes

```bash
export TEST_DATABASE_URL=postgres://usuario:senha@localhost:5432/obras_test   # APAGA o schema public desse banco
npm test
```

## Interface

Tela em `public/` (HTML, CSS e JS puros, sem build). Fontes Big Shoulders Display e IBM Plex estão em `public/fonts/` (licença OFL), então nada é carregado de serviços externos.

## Pendências conhecidas

- Documentos ficam no banco (até 4 MB cada).
- A biblioteca `xlsx` (npm) é antiga e tem avisos de segurança conhecidos; como o sistema lê planilhas enviadas por usuários logados, vale trocá-la antes de abrir para muitas pessoas.
- Sem recuperação de senha por e-mail; um administrador redefine apagando e recriando o usuário.
- Leitura automática de PDF e integração com WhatsApp ainda não existem.
