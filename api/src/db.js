'use strict';

const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'livraria',
  password: process.env.DB_PASSWORD || 'livraria123',
  database: process.env.DB_NAME || 'livraria',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const pool = mysql.createPool(config);

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS livros (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    titulo VARCHAR(255) NOT NULL,
    autor VARCHAR(255) NOT NULL,
    preco DECIMAL(10, 2) NOT NULL,
    quantidade_estoque INT UNSIGNED NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

/**
 * Aguarda o MySQL ficar disponível e garante que a tabela exista.
 * Evita que a API suba antes do banco quando ambos iniciam juntos.
 */
async function initDatabase({ attempts = 30, delayMs = 3000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const connection = await pool.getConnection();
      try {
        await connection.query(SCHEMA);
      } finally {
        connection.release();
      }
      console.log('[db] conexão estabelecida e schema pronto');
      return;
    } catch (error) {
      console.warn(`[db] tentativa ${attempt}/${attempts} falhou: ${error.code || error.message}`);
      if (attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { pool, initDatabase };
