# PedeAi

Cardápio virtual em PHP com painel administrativo protegido por login e dados salvos em SQLite.

## Publicação

Envie os arquivos para uma aplicação PHP simples. O arquivo de entrada é `index.php`.

## Banco de dados

O banco SQLite é criado automaticamente no primeiro acesso.

Em hospedagens com releases, o sistema usa uma pasta compartilhada fora do release atual para não perder dados a cada deploy. Se a variável `PEDEAI_DATA_DIR` existir, ela define o diretório persistente. Caso contrário, em estruturas com `releases/`, o banco fica em `shared/.data/pedeai.sqlite`.

## Criar administrador

O painel não tem tela pública de criação de usuário.

Para o primeiro acesso, abra `/install-admin.php`. Essa página só funciona enquanto não existir nenhum admin no banco; depois disso retorna 404.

Para criar ou atualizar administradores via terminal:

```bash
php tools/create_admin.php admin@exemplo.com "senha-forte" "Nome do Admin"
```

Depois acesse `/admin.html` e faça login com esse usuário.
