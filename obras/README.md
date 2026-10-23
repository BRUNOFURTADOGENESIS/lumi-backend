# Gestão de Obras

Sistema de gestão de obras e financeiro para o engenheiro: orçamento, medição física, cronograma, contas a pagar, fluxo de caixa, documentos e relatório previsto × gasto.

## Rodar

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
| `DATA_DIR` | pasta dos documentos enviados (padrão `./data`). Em hospedagem, aponte para um disco persistente |
| `COOKIE_SECURE=1` | marca o cookie de sessão como Secure (use sempre com HTTPS) |
| `TRUST_PROXY=1` | use atrás de proxy/balanceador (Render, Fly, Nginx) para o HTTPS e o IP serem reconhecidos |

## Testes

```bash
export TEST_DATABASE_URL=postgres://usuario:senha@localhost:5432/obras_test   # APAGA o schema public desse banco
npm test
```

## Pendências conhecidas

- Documentos ficam em disco local (`DATA_DIR`), fora do banco: incluir no backup.
- Sem recuperação de senha por e-mail; um administrador redefine apagando e recriando o usuário.
- Leitura automática de PDF e integração com WhatsApp ainda não existem.
