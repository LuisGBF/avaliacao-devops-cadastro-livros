# Cadastro de Livros — Avaliação Prática de DevOps (Prova B)

Sistema distribuído em duas VMs, com infraestrutura automatizada (OpenTofu +
cloud-init + Ansible) e serviços em containers Docker.

| VM | Papel | Componentes |
|----|-------|-------------|
| **VM1** | Aplicação web | nginx + HTML/CSS/JS (container Docker) |
| **VM2** | API e banco | Node.js/Express + MySQL 8 (Docker Compose) |

O formulário e a listagem da VM1 consomem a API REST da VM2 via HTTP, com CORS
habilitado para `GET`, `POST` e `OPTIONS`. Os dados são persistidos no MySQL.

---

## 👥 Integrantes do grupo

> **Atenção:** preencher com o nome completo de todos os integrantes. Sem os
> nomes, o trabalho não é avaliado (regra eliminatória).

| Nome completo | RA |
|---------------|----|
| Luis Gabriel Brito Felicio | 23000698 |
| Gabriel Meneghetti Zanardo | 23000471 |
| Virgilio Pedro Batista Junior | 23000383 |

**Link do repositório no GitHub:** https://github.com/LuisGBF/avaliacao-devops-cadastro-livros

---

## Estrutura do repositório

```
.
├── ansible/
│   ├── ansible.cfg
│   ├── inventory
│   ├── playbook.yml
│   └── templates/
│       ├── api.env.j2
│       └── config.js.j2
├── iac/
│   ├── cloud_init.yaml
│   └── main.tf
├── app/
│   ├── Dockerfile
│   ├── index.html
│   ├── app.js
│   ├── config.js
│   ├── nginx.conf
│   └── styles.css
├── api/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── package.json
│   └── src/
│       ├── db.js
│       └── server.js
├── docker-compose.yml     # execução local das duas VMs em uma máquina
└── README.md
```

---

## 1. Execução rápida (local, sem VMs)

Pré-requisitos: Docker + Docker Compose.

```bash
docker compose up -d --build
```

| Serviço | Endereço |
|---------|----------|
| Aplicação web | http://localhost:8088 |
| API REST | http://localhost:3000 |
| MySQL | 127.0.0.1:3307 (banco `livraria`) |

Para acompanhar os logs e encerrar:

```bash
docker compose logs -f
docker compose down          # mantém os dados
docker compose down -v       # remove também o volume do MySQL
```

---

## 2. Provisionamento das VMs (OpenTofu)

Pré-requisitos: OpenTofu (ou Terraform), libvirt/KVM e uma chave SSH.

```bash
cd iac
tofu init
tofu apply -var="ssh_public_key=$(cat ~/.ssh/id_ed25519.pub)"
tofu output
```

O `main.tf` cria duas VMs Ubuntu 24.04 na rede `default` do libvirt:

- `vm1-web` → `192.168.122.10` (2 vCPU, 2 GB RAM)
- `vm2-api` → `192.168.122.11` (2 vCPU, 3 GB RAM)

O `cloud_init.yaml` cria o usuário `devops` com a chave SSH, instala Docker e
o plugin do Docker Compose e habilita o serviço `docker`.

> Se os IPs forem diferentes dos padrões, atualize `ansible/inventory`
> (`ansible_host` e `api_public_host`).

---

## 3. Implantação com Ansible

```bash
cd ansible
ansible all -m ping
ansible-playbook playbook.yml
# se a chave privada não estiver no ssh-agent:
# ansible-playbook playbook.yml --private-key ~/.ssh/sua_chave
```

O playbook:

1. **VM1:** copia a aplicação web, gera o `config.js` com o IP da VM2, constrói
   a imagem e sobe o container nginx na porta 80.
2. **VM2:** copia a API, gera o `.env`, executa `docker compose up -d --build`
   e aguarda o `/health` responder.

Acesse o IP retornado por `tofu output web_url` (neste ambiente:
**http://192.168.122.53**). A API fica em `tofu output api_url`
(neste ambiente: **http://192.168.122.180:3000**).

---

## 4. API REST

Base: `http://<IP_DA_VM2>:3000`

### `POST /livro`

```bash
curl -X POST http://192.168.122.11:3000/livro \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Dom Casmurro",
    "autor": "Machado de Assis",
    "preco": 39.90,
    "quantidade_estoque": 10
  }'
```

Resposta `201 Created`:

```json
{
  "id": 1,
  "titulo": "Dom Casmurro",
  "autor": "Machado de Assis",
  "preco": 39.9,
  "quantidade_estoque": 10,
  "criado_em": "2026-11-18T20:30:00.000Z"
}
```

### `GET /livros`

```bash
curl http://192.168.122.11:3000/livros
```

Resposta `200 OK`: array JSON com todos os livros cadastrados.

### Outras rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Verifica API + conexão com o MySQL |
| `OPTIONS` | `/livro`, `/livros` | Preflight CORS |

### CORS

A API responde com `Access-Control-Allow-Origin` (padrão `*`, configurável pela
variável `CORS_ORIGIN`), permitindo `GET`, `POST` e `OPTIONS`. O preflight é
tratado explicitamente.

---

## 5. Banco de dados

A tabela é criada automaticamente pela API na inicialização:

```sql
CREATE TABLE livros (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  titulo VARCHAR(255) NOT NULL,
  autor VARCHAR(255) NOT NULL,
  preco DECIMAL(10, 2) NOT NULL,
  quantidade_estoque INT UNSIGNED NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
```

Variáveis de ambiente da API (valores padrão):

| Variável | Padrão |
|----------|--------|
| `PORT` | `3000` |
| `DB_HOST` | `db` |
| `DB_NAME` | `livraria` |
| `DB_USER` | `livraria` |
| `DB_PASSWORD` | `livraria123` |
| `CORS_ORIGIN` | `*` |

---

## 6. Validação rápida

```bash
# Aplicação web
curl -I http://localhost:8088

# API
curl http://localhost:3000/health
curl http://localhost:3000/livros
curl -X POST http://localhost:3000/livro \
  -H "Content-Type: application/json" \
  -d '{"titulo":"O Cortiço","autor":"Aluísio Azevedo","preco":29.9,"quantidade_estoque":5}'
```

No navegador, abra http://localhost:8088, cadastre um livro e clique em
**Listar todos os livros**.

---

## 7. Checklist da prova

- [x] `iac/main.tf` provisiona duas VMs distintas (VM1 e VM2)
- [x] `iac/cloud_init.yaml` prepara as máquinas com Docker
- [x] `ansible/inventory` identifica as VMs
- [x] `ansible/playbook.yml` automatiza configuração e implantação
- [x] VM1: servidor web + HTML em container Docker
- [x] VM2: API Node.js + MySQL em containers Docker
- [x] Cadastro na VM1 persiste no MySQL da VM2
- [x] `POST /livro` e `GET /livros` em JSON
- [x] CORS com `GET`, `POST` e `OPTIONS`
- [x] README com instruções, endereço e integrantes
