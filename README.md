# Relatórios de votação — relatorio.agenciafvx.com

Você sobe o CSV de votação de um candidato e o app monta o relatório no mesmo modelo do PDF
(capa, resumo, municípios, zonas, bairros, locais, seções e leitura estratégica). Depois é só mandar
o link secreto para o cliente.

- Node.js puro: **sem dependências** e sem `npm install`.
- Os relatórios ficam em arquivos na pasta `data/`. Faça backup dela.
- O link fica assim: `https://relatorio.agenciafvx.com/r/alan-mansur-40222-k3f9x2qa`. O final aleatório impede que alguém adivinhe o endereço.
- O cliente vê a versão web, com um explorador da base completa (filtro, ordenação e paginação), e pode **Baixar PDF** (impressão A4 no layout do modelo) e **Baixar CSV**.
- No painel você copia o link, ativa ou desativa o acesso, vê quantas vezes o cliente abriu, edita textos e substitui o CSV.

## Modelo de prospecção (/exemplo)

`https://relatorio.agenciafvx.com/exemplo` mostra o relatório do **Candidato Exemplo** (dados fictícios,
mesmos números do PDF demonstrativo). A página tem a faixa "modelo demonstrativo" e o botão
**Quero o meu relatório**, que abre o endereço definido em `CONTACT_URL` no `.env` (use seu WhatsApp:
`https://wa.me/55DDDNUMERO?text=Quero%20o%20relat%C3%B3rio%20de%20vota%C3%A7%C3%A3o`).
A página inicial (`/`) também leva ao exemplo. No painel, o contador de acessos mostra quantas vezes o modelo foi aberto.

Para criar ou recriar o modelo: `node scripts/criar-exemplo.js`. Isso gera a base em
`exemplo/exemplo_candidato_99123.csv` e publica em `/exemplo`. Qualquer relatório pode virar o modelo
público marcando "Modelo de prospecção" no formulário.

## Uso

1. Acesse `https://relatorio.agenciafvx.com/admin` e entre com a senha do `.env`.
2. Clique em **Novo relatório** e preencha os dados do candidato. Os campos do cenário estadual (aptos, comparecimento e válidos) são opcionais e habilitam o "% dos válidos no estado".
3. Envie o CSV. Arquivos em UTF-8 ou Latin-1, separados por `;`, `,` ou tab, são aceitos.
4. Deixe os textos em branco para o sistema gerar automaticamente ("Em uma frase", resumo e leitura estratégica). Depois é só revisar e ajustar. Para gerar de novo, apague o campo e salve.
5. Copie o link e mande para o cliente.

### Formato do CSV

**Opção A — base com todos os níveis** (como `alan_mansur_40222_votacao_RJ_2026.csv`):

```
nivel;municipio;zona;bairro;local;secao;votos;pct_validos;colocacao
MUNICIPIO;Macaé;;;;;21417;16,43%;2
ZONA;Macaé;254;;;;11520;18,46%;2
BAIRRO;Macaé;;Barra de Macaé;;;2930;24,37%;1
LOCAL;Macaé;254;Barra de Macaé;COLÉGIO MUNICIPAL WOLFANGO FERREIRA;;914;27,40%;1
SECAO;Macaé;109;Sana;UBS DA CABECEIRA DO SANA (SERRA 2);250;102;41,46%;1
```

**Opção B — só seções**, sem a coluna `nivel` e com `validos` (votos válidos da seção). Nesse caso o app
soma município, zona, bairro e local sozinho. Sem a colocação, os rankings não aparecem.

Nomes de colunas aceitos (maiúsculas e acentos não importam): `municipio`/`nm_municipio`, `zona`/`nr_zona`,
`bairro`/`nm_bairro`, `local`/`nm_local_votacao`, `secao`/`nr_secao`, `votos`/`qt_votos`,
`validos`/`qt_votos_validos`, `pct_validos`/`percentual`, `colocacao`/`posicao`. A coluna opcional `regiao`
define as regiões; no RJ, as regiões de governo já vêm prontas.

Na tela de edição, a seção **Conferência dos dados** mostra se as somas de zonas, bairros, locais e seções
batem com o total dos municípios.

## Deploy na VPS (Ubuntu/Debian)

```bash
# 1. Node 18+ (se ainda não tiver)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx

# 2. Copie a pasta para o servidor (do seu PC):
#    scp -r relatorio-eleicoes usuario@IP:/tmp/   e depois:
sudo mv /tmp/relatorio-eleicoes /opt/relatorio-eleicoes
cd /opt/relatorio-eleicoes
sudo cp .env.example .env
sudo nano .env        # defina ADMIN_PASSWORD e SESSION_SECRET
sudo mkdir -p data && sudo node scripts/criar-exemplo.js && sudo chown -R www-data:www-data data

# 3. Serviço (sobe sozinho e reinicia se cair)
sudo cp deploy/relatorio.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now relatorio
sudo systemctl status relatorio

# 4. Nginx + HTTPS
sudo cp deploy/nginx.conf /etc/nginx/sites-available/relatorio.agenciafvx.com
sudo ln -s /etc/nginx/sites-available/relatorio.agenciafvx.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d relatorio.agenciafvx.com
```

**DNS:** no painel do domínio `agenciafvx.com`, crie um registro **A** `relatorio` apontando para o IP da VPS
(antes do passo do certbot).

**Atualizar o código:** copie os arquivos novos por cima (sem apagar `data/` e `.env`) e rode `sudo systemctl restart relatorio`.

**Backup:** `tar czf backup-relatorios.tgz /opt/relatorio-eleicoes/data`

## Rodar no seu PC (teste)

```bash
cp .env.example .env   # defina ADMIN_PASSWORD
node server.js         # abre em http://127.0.0.1:3000/admin
```
