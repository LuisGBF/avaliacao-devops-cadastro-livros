'use strict';

(function () {
  const API_BASE_URL = (window.API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

  const form = document.getElementById('form-livro');
  const feedback = document.getElementById('form-feedback');
  const listaFeedback = document.getElementById('lista-feedback');
  const tabela = document.getElementById('tabela-livros');
  const totalLivros = document.getElementById('total-livros');
  const apiStatus = document.getElementById('api-status');
  const btnAtualizar = document.getElementById('btn-atualizar');
  const btnCadastrar = document.getElementById('btn-cadastrar');

  const views = {
    cadastro: document.getElementById('view-cadastro'),
    listagem: document.getElementById('view-listagem'),
  };
  const tabs = document.querySelectorAll('.tab');

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  function showView(name) {
    Object.entries(views).forEach(([key, element]) => {
      element.classList.toggle('is-hidden', key !== name);
    });
    tabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.view === name);
    });
    if (name === 'listagem') {
      carregarLivros();
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  });

  function setFeedback(element, message, type) {
    element.textContent = message || '';
    element.className = `feedback${type ? ` feedback-${type}` : ''}`;
  }

  function setApiStatus(ok) {
    apiStatus.textContent = ok ? 'API: online' : 'API: indisponível';
    apiStatus.className = `status ${ok ? 'status-ok' : 'status-error'}`;
  }

  async function request(path, options) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: 'application/json', ...(options && options.headers) },
      ...options,
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }
    if (!response.ok) {
      const detail = payload && Array.isArray(payload.detalhes) ? ` ${payload.detalhes.join(' ')}` : '';
      const message = payload && payload.erro ? payload.erro : `Erro HTTP ${response.status}.`;
      throw new Error(message + detail);
    }
    return payload;
  }

  async function verificarApi() {
    try {
      await request('/health');
      setApiStatus(true);
    } catch (_error) {
      setApiStatus(false);
    }
  }

  async function carregarLivros() {
    setFeedback(listaFeedback, 'Carregando livros…', 'info');
    try {
      const livros = await request('/livros');
      setApiStatus(true);
      renderizarLivros(Array.isArray(livros) ? livros : []);
      setFeedback(listaFeedback, '', null);
    } catch (error) {
      setApiStatus(false);
      renderizarLivros([]);
      setFeedback(listaFeedback, `Não foi possível carregar os livros. ${error.message}`, 'error');
    }
  }

  function renderizarLivros(livros) {
    tabela.replaceChildren();

    if (livros.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'empty';
      td.textContent = 'Nenhum livro cadastrado ainda.';
      tr.appendChild(td);
      tabela.appendChild(tr);
      totalLivros.textContent = '';
      return;
    }

    livros.forEach((livro) => {
      const tr = document.createElement('tr');

      const cells = [
        String(livro.id),
        livro.titulo,
        livro.autor,
        brl.format(Number(livro.preco) || 0),
        String(livro.quantidade_estoque),
      ];

      cells.forEach((value, index) => {
        const td = document.createElement('td');
        // textContent evita injeção de HTML vindo do banco.
        td.textContent = value;
        if (index === 3) td.className = 'num';
        if (index === 4) td.className = 'num';
        tr.appendChild(td);
      });

      tabela.appendChild(tr);
    });

    totalLivros.textContent = `${livros.length} livro(s) no catálogo.`;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const dados = new FormData(form);
    const payload = {
      titulo: String(dados.get('titulo') || '').trim(),
      autor: String(dados.get('autor') || '').trim(),
      preco: dados.get('preco'),
      quantidade_estoque: dados.get('quantidade_estoque'),
    };

    if (!payload.titulo || !payload.autor || payload.preco === '' || payload.quantidade_estoque === '') {
      setFeedback(feedback, 'Preencha todos os campos obrigatórios.', 'error');
      return;
    }

    btnCadastrar.disabled = true;
    setFeedback(feedback, 'Cadastrando…', 'info');

    try {
      const livro = await request('/livro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setApiStatus(true);
      form.reset();
      setFeedback(feedback, `Livro "${livro.titulo}" cadastrado com sucesso!`, 'success');
      document.getElementById('titulo').focus();
    } catch (error) {
      setApiStatus(false);
      setFeedback(feedback, `Falha ao cadastrar. ${error.message}`, 'error');
    } finally {
      btnCadastrar.disabled = false;
    }
  });

  form.addEventListener('reset', () => setFeedback(feedback, '', null));

  btnAtualizar.addEventListener('click', carregarLivros);

  verificarApi();
  showView('cadastro');
})();
