'use strict';

const express = require('express');
const cors = require('cors');
const { pool, initDatabase } = require('./db');

const PORT = Number(process.env.PORT || 3000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();

app.disable('x-powered-by');

// CORS obrigatório: a página servida na VM1 precisa chamar esta API na VM2.
const corsOptions = {
  origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map((item) => item.trim()),
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Responde explicitamente ao preflight OPTIONS em qualquer rota.
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '64kb' }));

/**
 * Valida e normaliza o corpo do cadastro.
 * Retorna { ok: true, value } ou { ok: false, errors: [...] }.
 */
function parseLivro(body) {
  const errors = [];
  const data = body && typeof body === 'object' ? body : {};

  const titulo = typeof data.titulo === 'string' ? data.titulo.trim() : '';
  const autor = typeof data.autor === 'string' ? data.autor.trim() : '';
  const preco = data.preco === '' || data.preco === null || data.preco === undefined
    ? NaN
    : Number(data.preco);
  const quantidade = data.quantidade_estoque === '' || data.quantidade_estoque === null || data.quantidade_estoque === undefined
    ? NaN
    : Number(data.quantidade_estoque);

  if (!titulo) errors.push('O campo "titulo" é obrigatório.');
  else if (titulo.length > 255) errors.push('O campo "titulo" deve ter no máximo 255 caracteres.');

  if (!autor) errors.push('O campo "autor" é obrigatório.');
  else if (autor.length > 255) errors.push('O campo "autor" deve ter no máximo 255 caracteres.');

  if (!Number.isFinite(preco)) errors.push('O campo "preco" deve ser um número decimal.');
  else if (preco < 0) errors.push('O campo "preco" não pode ser negativo.');
  else if (preco > 99999999.99) errors.push('O campo "preco" excede o limite permitido.');

  if (!Number.isInteger(quantidade)) errors.push('O campo "quantidade_estoque" deve ser um número inteiro.');
  else if (quantidade < 0) errors.push('O campo "quantidade_estoque" não pode ser negativo.');

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      titulo,
      autor,
      preco: Number(preco.toFixed(2)),
      quantidade_estoque: quantidade,
    },
  };
}

function mapLivro(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    autor: row.autor,
    preco: Number(row.preco),
    quantidade_estoque: Number(row.quantidade_estoque),
    criado_em: row.criado_em,
  };
}

// Healthcheck simples, usado pelo Docker e pelo Ansible.
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'ok' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

// POST /livro - recebe os quatro campos e cadastra no MySQL.
app.post('/livro', async (req, res) => {
  const parsed = parseLivro(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.errors });
  }

  const { titulo, autor, preco, quantidade_estoque } = parsed.value;

  try {
    const [result] = await pool.execute(
      'INSERT INTO livros (titulo, autor, preco, quantidade_estoque) VALUES (?, ?, ?, ?)',
      [titulo, autor, preco, quantidade_estoque],
    );

    const [rows] = await pool.execute('SELECT * FROM livros WHERE id = ?', [result.insertId]);
    return res.status(201).json(mapLivro(rows[0]));
  } catch (error) {
    console.error('[api] erro ao cadastrar livro:', error.message);
    return res.status(500).json({ erro: 'Erro interno ao cadastrar o livro.' });
  }
});

// GET /livros - retorna todos os livros cadastrados em JSON.
app.get('/livros', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM livros ORDER BY id DESC');
    return res.json(rows.map(mapLivro));
  } catch (error) {
    console.error('[api] erro ao listar livros:', error.message);
    return res.status(500).json({ erro: 'Erro interno ao listar os livros.' });
  }
});

app.use((req, res) => {
  res.status(404).json({ erro: `Rota ${req.method} ${req.path} não encontrada.` });
});

async function start() {
  await initDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[api] ouvindo em http://0.0.0.0:${PORT}`);
  });
}

start().catch((error) => {
  console.error('[api] falha ao iniciar:', error.message);
  process.exit(1);
});
