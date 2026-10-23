/* ══════════════════════════════════════════════
   MEU TESOUREIRO — app.js (Android/Chaquopy)
   ══════════════════════════════════════════════ */

const state = {
    alunos: [], pagamentos: [], atividades: [], notas: [],
    quota: 300,
    editingAluno: null, editingNota: null,
    selectedPagAluno: null, selectedHistAluno: null, selectedRelAluno: null,
    dateTarget: null,
    dpSelection: { dia: 1, mes: 0, ano: 2026 },
    screenStack: ['home'],
    licenca: null,
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// PONTE PYTHON
// PONTE PYTHON ASSÍNCRONA
let py = null;
const callbacksPython = {};
let idCallbacks = 0;

function pyCall(metodo, ...args) {
    return new Promise((resolve) => {
        if (typeof AndroidBridge !== "undefined") {
            const id = "cb_" + (idCallbacks++);
            let concluido = false;
            const terminar = (valor) => {
                if (concluido) return;
                concluido = true;
                delete callbacksPython[id];
                clearTimeout(temporizador);
                resolve(valor);
            };
            const temporizador = setTimeout(() => {
                terminar({ ok: false, erro: `Tempo esgotado ao chamar ${metodo} (15 s)` });
                debugTela(`TIMEOUT: ${metodo}`);
            }, 15000);
            callbacksPython[id] = (valor) => {
                debugTela(`Resultado ${metodo}: ${JSON.stringify(valor).slice(0, 400)}`);
                terminar(valor);
            };
            try {
                debugTela(`Pedido enviado: ${metodo}`);
                AndroidBridge.call(metodo, JSON.stringify(args), id);
            } catch (e) {
                terminar({ ok: false, erro: `Falha na ponte Android: ${String(e)}` });
            }
        } else if (py) {
            py[metodo](...args).then(resolve).catch(e => resolve({ ok: false, erro: String(e) }));
        } else {
            resolve({ ok: false, erro: "API não pronta" });
        }
    });
}

// Função que o Kotlin chama quando o Python termina
window.receberRespostaPython = function(id, respostaStr) {
    debugTela(`Resposta recebida: ${id}`);
    if (callbacksPython[id]) {
        try {
            callbacksPython[id](JSON.parse(respostaStr));
        } catch (e) {
            callbacksPython[id]({ ok: false, erro: "Erro ao ler resposta: " + e });
        }
    } else {
        debugTela(`Callback desconhecido/expirado: ${id}`);
    }
};

function esperar(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }


// DEBUG — apenas na consola, sem painel visível
function debugTela(msg) {
    console.log('DBG:', msg);
}

// ARRANQUE
window.addEventListener('pywebviewready', async () => {
    py = window.pywebview.api;
    setTimeout(async () => { await arrancarApp(); }, 500);
});

document.addEventListener("DOMContentLoaded", () => {
    if (typeof AndroidBridge !== "undefined") {
        debugTela('API Python pronta (AndroidBridge)');
        setTimeout(async () => { await arrancarApp(); }, 500);
    }
});

let arranqueEmCurso = false;
let arranqueConcluido = false;
async function arrancarApp() {
    if (arranqueEmCurso || arranqueConcluido) return;
    arranqueEmCurso = true;
    debugTela('arrancarApp iniciado');
    const rCor = await pyCall('config_obter_cor');
    if (rCor && rCor.ok) {
        const c = rCor.cor;
        const rr = document.documentElement;
        rr.style.setProperty('--green', c.cor);
        rr.style.setProperty('--green-neon', c.neon);
        rr.style.setProperty('--green-dark', c.escura);
    }

    const r = await pyCall('licenca_estado');
    if (!r || !r.ok) {
        toast((r && r.erro) || 'Erro ao verificar licença', true);
        debugTela('Falha ao obter estado da licença: ' + JSON.stringify(r));
        arranqueEmCurso = false;
        return;
    }
    const estado = r.estado;
    state.licenca = estado;

    esconderSplash();
    arranqueConcluido = true;
    arranqueEmCurso = false;

    switch (estado.estado) {
        case 'primeiro_arranque':
            // Instalação nova: exigir chave. Não criar automaticamente uma licença de 180 dias.
            document.getElementById('titulo-licenca').textContent = 'Ativar licença';
            document.getElementById('texto-licenca-expirada').textContent = 'Esta instalação precisa de uma chave de ativação.';
            document.getElementById('data-expiracao-txt').textContent = 'Ainda não ativada';
            const rIdNovo = await pyCall('licenca_android_id');
            if (rIdNovo && rIdNovo.ok) document.getElementById('android-id-txt').textContent = rIdNovo.android_id;
            mostrarEcrã('screen-expirada');
            break;
        case 'precisa_senha':
            mostrarEcrã('screen-primeiro-arranque');
            break;
        case 'ativa':
            document.getElementById('nome-cliente-boas-vindas').textContent = estado.nome_cliente || '—';
            document.getElementById('dias-restantes-login').innerHTML = `Tem <b>${estado.dias_restantes} dias</b> de licença restantes.`;
            mostrarEcrã('screen-senha');
            break;
        case 'expirada':
            document.getElementById('titulo-licenca').textContent = 'Licença expirada';
            document.getElementById('texto-licenca-expirada').textContent = 'O seu período de uso terminou a';
            document.getElementById('data-expiracao-txt').textContent = estado.data_expiracao || '—';
            const rId = await pyCall('licenca_android_id');
            if (rId && rId.ok) document.getElementById('android-id-txt').textContent = rId.android_id;
            mostrarEcrã('screen-expirada');
            break;
        case 'dispositivo_errado':
            mostrarEcrã('screen-dispositivo-errado');
            break;
    }
}

function mostrarEcrã(id) {
    document.querySelectorAll('.screen-full').forEach(el => el.style.display = 'none');
    document.getElementById('app').style.display = 'none';
    if (id === 'app') {
        document.getElementById('app').style.display = 'block';
        document.body.classList.remove('splash-active');
        carregarTudoDoPython();
    } else {
        const el = document.getElementById(id);
        if (el) el.style.display = 'flex';
    }
}

function esconderSplash() {
    const s = document.getElementById('splash');
    if (!s) return;
    s.classList.add('hide');
    document.body.classList.remove('splash-active');
    setTimeout(() => { s.style.display = 'none'; }, 700);
}

// REGISTAR CLIENTE
async function registarCliente() {
    const nome = document.getElementById('inp-nome-cliente').value.trim();
    const senha1 = document.getElementById('inp-senha-nova').value.trim();
    const senha2 = document.getElementById('inp-senha-confirma').value.trim();
    if (!nome || nome.length < 3) { toast('Escreve o teu nome completo', true); return; }
    if (!senha1 || senha1.length < 4) { toast('A senha deve ter pelo menos 4 dígitos', true); return; }
    if (senha1 !== senha2) { toast('As senhas não coincidem', true); return; }
    const r = await pyCall('licenca_guardar_cliente', nome, senha1);
    if (r && r.ok) {
        toast(`Bem-vindo, ${nome}!`);
        setTimeout(() => { mostrarEcrã('app'); }, 900);
    } else { toast('Erro ao guardar dados', true); }
}

// LOGIN
async function verificarSenhaLogin() {
    const senha = document.getElementById('inp-senha-login').value.trim();
    if (!senha) { toast('Digite a sua senha', true); return; }
    const r = await pyCall('licenca_verificar_senha', senha);
    if (!r || !r.ok) { toast('Erro ao verificar', true); return; }
    if (r.master) {
        document.getElementById('inp-senha-login').value = '';
        mostrarEcrã('screen-alterar-senha');
        return;
    }
    if (r.correta) {
        toast('Bem-vindo!');
        setTimeout(() => { mostrarEcrã('app'); }, 500);
    } else {
        toast('Senha incorreta', true);
        document.getElementById('inp-senha-login').value = '';
    }
}

// MASTER PASSWORD
async function guardarNovaSenhaMaster() {
    const s1 = document.getElementById('inp-senha-master-nova').value.trim();
    const s2 = document.getElementById('inp-senha-master-confirma').value.trim();
    if (!s1 || s1.length < 4) { toast('A senha deve ter pelo menos 4 dígitos', true); return; }
    if (s1 !== s2) { toast('As senhas não coincidem', true); return; }
    const r = await pyCall('licenca_alterar_senha', s1);
    if (r && r.ok) {
        toast('Nova senha guardada!');
        document.getElementById('inp-senha-master-nova').value = '';
        document.getElementById('inp-senha-master-confirma').value = '';
        setTimeout(() => { mostrarEcrã('app'); }, 900);
    } else { toast(r.erro || 'Erro ao guardar', true); }
}

// ATIVAÇÃO / RENOVAÇÃO OFFLINE — mesma chave para instalação nova e renovação.
async function aplicarCodigoLicenca() {
    const el = document.getElementById('renovacao-resultado');
    const campoAssinatura = document.getElementById('inp-assinatura-criador');
    const campo = document.getElementById('inp-codigo-licenca');
    const assinatura = (campoAssinatura.value || '').trim().toUpperCase();
    const codigo = (campo.value || '').trim().toUpperCase();
    if (!assinatura || !codigo) {
        el.style.display = 'block';
        el.innerHTML = `<div class="renovacao-erro"><div class="icone">⚠️</div><div class="titulo">Preencha os dois campos</div><div class="detalhe">Introduza a ASSINATURA DO CRIADOR e o código de ativação.</div></div>`;
        return;
    }
    el.style.display = 'block';
    el.innerHTML = `<div class="renovacao-info"><div class="icone">⏳</div><div class="titulo">A validar assinatura e código...</div></div>`;
    const r = await pyCall('licenca_validar_renovacao', codigo, assinatura);
    if (r && r.ok) {
        el.innerHTML = `<div class="renovacao-sucesso"><div class="icone">✅</div><div class="titulo">Licença ativada!</div><div class="detalhe">Válida até: <b>${r.nova_expiracao}</b></div><div class="detalhe" style="margin-top:6px">A preparar a aplicação...</div></div>`;
        setTimeout(() => { window.location.reload(); }, 1500);
    } else {
        el.innerHTML = `<div class="renovacao-erro"><div class="icone">❌</div><div class="titulo">Código inválido</div><div class="detalhe">${r ? r.erro : 'Erro desconhecido'}</div></div>`;
    }
}

// CARREGAR DADOS
async function carregarTudoDoPython() {
    const [rCor, rAlunos, rPags, rAtiv, rNotas, rQuota] = await Promise.all([
        pyCall('config_obter_cor'), pyCall('listar_alunos'), pyCall('listar_pagamentos'), pyCall('listar_atividades'), pyCall('listar_notas'), pyCall('obter_quota')
    ]);
    if (rCor && rCor.ok) {
        const rr = document.documentElement;
        rr.style.setProperty('--green', rCor.cor.cor);
        rr.style.setProperty('--green-neon', rCor.cor.neon);
        rr.style.setProperty('--green-dark', rCor.cor.escura);
    }
    if (rAlunos && rAlunos.ok) state.alunos = rAlunos.alunos || [];
    if (rPags && rPags.ok) state.pagamentos = (rPags.pagamentos || []).map(p => ({ id: p.id, alunoId: p.alunoId, alunoNome: p.alunoNome, mes: p.mes - 1, ano: p.ano, valor: p.valor, dataRegisto: p.dataRegisto }));
    if (rAtiv && rAtiv.ok) state.atividades = (rAtiv.atividades || []).map(a => ({ id: a.id, nome: a.nome, valor: a.valor, dataCriacao: a.dataCriacao, pagantes: (a.pagantes || []).map(p => p.alunoId) }));
    if (rNotas && rNotas.ok) state.notas = rNotas.notas || [];
    if (rQuota && rQuota.ok) {
        state.quota = Number(rQuota.quota) || 300;
        const quotaInput = document.getElementById('cfg-quota');
        if (quotaInput) quotaInput.value = String(state.quota);
    }
    atualizarLicencaUI();
    renderAll();
}

// UI LICENÇA
function atualizarLicencaUI() {
    if (!state.licenca) return;
    const dias = state.licenca.dias_restantes || 0;
    const btn = document.getElementById('licenseBtn');
    const el1 = document.getElementById('licenseDays');
    const el2 = document.getElementById('popDays');
    const bar = document.getElementById('licBar');
    if (el1) el1.textContent = dias + 'd';
    if (el2) el2.textContent = dias;
    if (bar) bar.style.width = Math.max(0, Math.min(100, (dias / 180) * 100)) + '%';
    if (btn) {
        btn.classList.remove('warn', 'danger');
        if (dias <= 15) btn.classList.add('danger');
        else if (dias <= 45) btn.classList.add('warn');
    }
}

// TOAST
let toastTimer;
function toast(msg, isError = false) {
    const t = document.getElementById('toast');
    const m = document.getElementById('toast-msg');
    if (!t || !m) return;
    m.textContent = msg;
    t.classList.toggle('error', isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ONDA
function ondaSucesso(x, y) {
    const r = document.createElement('div');
    r.className = 'success-ripple';
    r.style.left = (x - 10) + 'px';
    r.style.top = (y - 10) + 'px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 1300);
}

// FORMATAR
function fmtKz(v) { return Number(v).toLocaleString('pt-PT') + ' Kz'; }
function fmtData(d) {
    if (!d) return '—';
    if (d.includes('/')) return d;
    const [a, m, dia] = d.split('-');
    return `${dia}/${m}/${a}`;
}

// CONTADOR
let valorContadorAtual = 0, animacaoAtual = null;
function animarContador(alvo) {
    const el = document.getElementById('balance-num');
    const box = document.getElementById('balance');
    if (!el || !box) return;
    if (animacaoAtual) { cancelAnimationFrame(animacaoAtual); animacaoAtual = null; }
    const inicio = valorContadorAtual, delta = alvo - inicio;
    if (delta === 0) { el.textContent = alvo.toLocaleString('pt-PT'); return; }
    const dur = 1400, t0 = performance.now();
    box.classList.add('counter-anim');
    function passo(t) {
        const p = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        valorContadorAtual = Math.round(inicio + delta * eased);
        el.textContent = valorContadorAtual.toLocaleString('pt-PT');
        if (p < 1) animacaoAtual = requestAnimationFrame(passo);
        else { valorContadorAtual = alvo; el.textContent = alvo.toLocaleString('pt-PT'); animacaoAtual = null; setTimeout(() => box.classList.remove('counter-anim'), 300); }
    }
    animacaoAtual = requestAnimationFrame(passo);
}

// POPOVER LICENÇA
function toggleLicense(e) {
    e.stopPropagation();
    const p = document.getElementById('licensePopover'), o = document.getElementById('overlay');
    if (p.classList.contains('open')) { p.classList.remove('open'); o.classList.remove('show'); }
    else { p.classList.add('open'); o.classList.add('show'); }
}
function fecharLicense() {
    document.getElementById('licensePopover').classList.remove('open');
    document.getElementById('overlay').classList.remove('show');
}

// NAVEGAÇÃO
document.querySelectorAll('[data-nav]').forEach(el => { el.addEventListener('click', () => navigate(el.dataset.nav)); });
function navigate(target) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + target);
    if (el) el.classList.add('active');
    if (state.screenStack[state.screenStack.length - 1] !== target) state.screenStack.push(target);
    const backBtn = document.getElementById('backBtn'), brand = document.getElementById('topbarTitle');
    if (target === 'home') { backBtn.style.display = 'none'; brand.innerHTML = '<span class="dot-live"></span>Meu Tesoureiro'; }
    else { backBtn.style.display = 'flex'; brand.textContent = { alunos: 'Membros', pagamentos: 'Pagamentos', atividades: 'Atividades', historico: 'Histórico', relatorios: 'Relatórios', notas: 'Notas', config: 'Configurações' }[target] || 'Meu Tesoureiro'; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderAll();
}
function goBack() {
    state.screenStack.pop();
    const prev = state.screenStack[state.screenStack.length - 1] || 'home';
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + prev);
    if (el) el.classList.add('active');
    const backBtn = document.getElementById('backBtn'), brand = document.getElementById('topbarTitle');
    if (prev === 'home') { backBtn.style.display = 'none'; brand.innerHTML = '<span class="dot-live"></span>Meu Tesoureiro'; }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderAll();
}

// RENDER GERAL
function renderAll() {
    renderStats(); renderAlunos(); renderAtividades(); renderNotas(); renderHistoricoTodos();
    if (state.selectedHistAluno) renderHistPessoa();
    previewMeses(); populateAnos(); atualizarResumoDeve();
}

// MEMBROS
function renderAlunos() {
    const input = document.getElementById('search-aluno');
    if (!input) return;
    const q = input.value.toLowerCase();
    const lista = state.alunos.filter(a => a.nome.toLowerCase().includes(q));
    const el = document.getElementById('lista-alunos');
    const countEl = document.getElementById('alunosCount');
    if (countEl) countEl.textContent = state.alunos.length;
    if (!lista.length) { el.innerHTML = `<div class="empty"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><div>${q ? 'Nenhum membro encontrado' : 'Sem membros registados'}</div></div>`; return; }
    el.innerHTML = lista.map(a => `<div class="aluno-card"><div class="aluno-info"><span class="id-tag">ID ${String(a.id).padStart(3, '0')}</span><h4>${a.nome}</h4><p>Entrada: ${fmtData(a.dataEntrada)}</p></div><div class="aluno-actions"><button onclick="editarAluno(${a.id})" title="Editar"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="danger" onclick="eliminarAluno(${a.id})" title="Eliminar"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></div>`).join('');
}
document.getElementById('search-aluno')?.addEventListener('input', renderAlunos);
function openModalAluno() {
    state.editingAluno = null;
    document.getElementById('modal-aluno-title').textContent = 'Novo Membro';
    document.getElementById('aluno-nome').value = '';
    const dataEl = document.getElementById('aluno-data');
    dataEl.querySelector('.if-text').textContent = 'Selecionar data';
    dataEl.dataset.value = '';
    document.getElementById('modal-aluno').classList.add('open');
}
function closeModalAluno() { document.getElementById('modal-aluno').classList.remove('open'); }
function editarAluno(id) {
    const a = state.alunos.find(x => x.id === id);
    if (!a) return;
    state.editingAluno = id;
    document.getElementById('modal-aluno-title').textContent = 'Editar Membro';
    document.getElementById('aluno-nome').value = a.nome;
    const dataEl = document.getElementById('aluno-data');
    dataEl.querySelector('.if-text').textContent = fmtData(a.dataEntrada);
    dataEl.dataset.value = a.dataEntrada;
    document.getElementById('modal-aluno').classList.add('open');
}
async function guardarAluno() {
    const nome = document.getElementById('aluno-nome').value.trim();
    const dataEl = document.getElementById('aluno-data');
    const dataEntrada = dataEl.dataset.value;
    if (!nome || !dataEntrada) { toast('Preenche nome e data', true); return; }
    let dataFormatada = dataEntrada;
    if (dataEntrada.includes('-')) { const [a, m, d] = dataEntrada.split('-'); dataFormatada = `${d}/${m}/${a}`; }
    const r = await pyCall('guardar_aluno', state.editingAluno, nome, dataFormatada);
    if (r && r.ok) { toast(state.editingAluno ? 'Membro atualizado' : 'Membro adicionado'); closeModalAluno(); await esperar(500); await carregarTudoDoPython(); }
    else { toast((r && r.erro) || 'Erro ao guardar membro', true); debugTela('Falha guardar_aluno: ' + JSON.stringify(r)); }
}
async function eliminarAluno(id) {
    if (!confirm('Eliminar este membro? Os pagamentos associados também serão removidos.')) return;
    const r = await pyCall('eliminar_aluno', id);
    if (r && r.ok) { toast('Membro eliminado'); await carregarTudoDoPython(); } else { toast((r && r.erro) || 'Erro ao eliminar membro', true); }
}

// DATE PICKER
function openDatePicker(target) {
    state.dateTarget = target;
    const el = document.getElementById(target), cur = el.dataset.value;
    if (cur) { const [a, m, d] = cur.split('-'); state.dpSelection = { dia: +d, mes: +m - 1, ano: +a }; }
    else { const hoje = new Date(); state.dpSelection = { dia: hoje.getDate(), mes: hoje.getMonth(), ano: hoje.getFullYear() }; }
    buildDatePicker(); document.getElementById('modal-date').classList.add('open');
}
function closeDatePicker() { document.getElementById('modal-date').classList.remove('open'); }
function buildDatePicker() {
    const { dia, mes, ano } = state.dpSelection;
    document.getElementById('dp-days').innerHTML = Array.from({ length: 30 }, (_, i) => i + 1).map(d => `<div class="${d === dia ? 'selected' : ''}" onclick="selDate('dia',${d})">${d}</div>`).join('');
    document.getElementById('dp-months').innerHTML = MESES.map((m, i) => `<div class="${i === mes ? 'selected' : ''}" onclick="selDate('mes',${i})">${m}</div>`).join('');
    document.getElementById('dp-years').innerHTML = Array.from({ length: 27 }, (_, i) => i + 2024).map(y => `<div class="${y === ano ? 'selected' : ''}" onclick="selDate('ano',${y})">${y}</div>`).join('');
}
function selDate(field, value) { state.dpSelection[field] = value; buildDatePicker(); }
function confirmDatePicker() {
    const { dia, mes, ano } = state.dpSelection;
    const str = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const el = document.getElementById(state.dateTarget);
    el.dataset.value = str;
    const textSpan = el.querySelector('.if-text');
    if (textSpan) textSpan.textContent = fmtData(str); else el.textContent = fmtData(str);
    closeDatePicker();
}

// PAGAMENTOS
function previewMeses() {
    const v = Number(document.getElementById('pag-valor')?.value || 0);
    const meses = Math.floor(v / state.quota);
    const el = document.getElementById('preview-meses'), hint = document.getElementById('quota-atual-hint');
    if (el) el.textContent = meses + ' mês' + (meses !== 1 ? 'es' : '');
    if (hint) hint.textContent = fmtKz(state.quota);
}
document.getElementById('pag-valor')?.addEventListener('input', previewMeses);
document.getElementById('search-pag-aluno')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase(), el = document.getElementById('sugestoes-pagamento');
    if (!q) { el.innerHTML = ''; return; }
    const found = state.alunos.filter(a => a.nome.toLowerCase().includes(q)).slice(0, 5);
    el.innerHTML = found.map(a => `<div class="mini-item ${state.selectedPagAluno?.id === a.id ? 'selected' : ''}" onclick="selectPagAluno(${a.id})">${a.nome}</div>`).join('');
});
function selectPagAluno(id) {
    state.selectedPagAluno = state.alunos.find(a => a.id === id);
    document.getElementById('search-pag-aluno').value = state.selectedPagAluno.nome;
    document.getElementById('sugestoes-pagamento').innerHTML = '';
}
async function registarPagamento(e) {
    const aluno = state.selectedPagAluno;
    const data = document.getElementById('pag-data').dataset.value;
    const valor = Number(document.getElementById('pag-valor').value);
    if (!aluno) { toast('Seleciona um membro', true); return; }
    if (!data) { toast('Seleciona a data', true); return; }
    if (!valor || valor <= 0) { toast('Valor inválido', true); return; }
    let dataFormatada = data;
    if (data.includes('-')) { const [a, m, d] = data.split('-'); dataFormatada = `${d}/${m}/${a}`; }
    let rippleX = null, rippleY = null;
    if (e && e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); rippleX = rect.left + rect.width / 2; rippleY = rect.top + rect.height / 2; }
    const r = await pyCall('registar_pagamento', aluno.id, valor, dataFormatada);
    if (r && r.ok) {
        if (rippleX !== null) ondaSucesso(rippleX, rippleY);
        toast(`+${r.meses} mês${r.meses !== 1 ? 'es' : ''} para ${aluno.nome}`);
        state.selectedPagAluno = null;
        document.getElementById('search-pag-aluno').value = '';
        document.getElementById('pag-valor').value = '';
        const dEl = document.getElementById('pag-data');
        dEl.querySelector('.if-text').textContent = 'Selecionar data';
        dEl.dataset.value = '';
        previewMeses();
        await esperar(800);
        await carregarTudoDoPython();
    } else {
        toast(r?.erro || 'Erro ao registar', true);
    }
}

// HISTÓRICO
document.querySelectorAll('[data-htab]').forEach(t => {
    t.addEventListener('click', () => {
        document.querySelectorAll('[data-htab]').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const isPessoa = t.dataset.htab === 'pessoa';
        document.getElementById('hist-pessoa').style.display = isPessoa ? 'block' : 'none';
        document.getElementById('hist-todos').style.display = isPessoa ? 'none' : 'block';
        renderHistoricoTodos();
    });
});
document.getElementById('search-hist')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase(), el = document.getElementById('sugestoes-hist');
    if (!q) { el.innerHTML = ''; return; }
    const found = state.alunos.filter(a => a.nome.toLowerCase().includes(q)).slice(0, 5);
    el.innerHTML = found.map(a => `<div class="mini-item" onclick="selectHistAluno(${a.id})">${a.nome}</div>`).join('');
});
function selectHistAluno(id) {
    state.selectedHistAluno = state.alunos.find(a => a.id === id);
    document.getElementById('search-hist').value = state.selectedHistAluno.nome;
    document.getElementById('sugestoes-hist').innerHTML = '';
    renderHistPessoa();
}
function renderHistPessoa() {
    const el = document.getElementById('hist-detalhe');
    if (!el) return;
    if (!state.selectedHistAluno) { el.innerHTML = ''; return; }
    const aluno = state.selectedHistAluno;
    const pags = state.pagamentos.filter(p => p.alunoId === aluno.id).sort((a, b) => (a.ano * 12 + a.mes) - (b.ano * 12 + b.mes));
    const total = pags.reduce((s, p) => s + p.valor, 0);
    if (!pags.length) { el.innerHTML = '<div class="empty">Sem pagamentos registados.</div>'; return; }
    el.innerHTML = `<div class="form-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span style="font-size:.75rem;color:var(--muted);font-weight:700">TOTAL PAGO</span><b style="color:var(--green-neon);font-family:'JetBrains Mono',monospace;font-size:1rem">${fmtKz(total)}</b></div><div class="table-wrap"><table><thead><tr><th>Mês</th><th>Ano</th><th>Valor</th><th>Registo</th></tr></thead><tbody>${pags.map(p => `<tr><td>${MESES[p.mes]}</td><td>${p.ano}</td><td class="pago">${fmtKz(p.valor)}</td><td>${fmtData(p.dataRegisto)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function renderHistoricoTodos() {
    const el = document.getElementById('hist-todos');
    if (!el) return;
    const pags = [...state.pagamentos].sort((a, b) => (b.ano * 12 + b.mes) - (a.ano * 12 + a.mes));
    if (!pags.length) { el.innerHTML = '<div class="empty">Sem pagamentos registados.</div>'; return; }
    el.innerHTML = `<div class="form-card"><div class="table-wrap"><table><thead><tr><th>Membro</th><th>Mês</th><th>Ano</th><th>Valor</th></tr></thead><tbody>${pags.map(p => `<tr><td>${p.alunoNome}</td><td>${MESES_CURTO[p.mes]}</td><td>${p.ano}</td><td class="pago">${fmtKz(p.valor)}</td></tr>`).join('')}</tbody></table></div></div>`;
}

// RELATÓRIOS
document.querySelectorAll('[data-rtab]').forEach(t => {
    t.addEventListener('click', () => {
        document.querySelectorAll('[data-rtab]').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const isInd = t.dataset.rtab === 'individual';
        document.getElementById('rel-individual-fields').style.display = isInd ? 'block' : 'none';
        document.getElementById('rel-preview').innerHTML = '';
    });
});
document.getElementById('search-rel')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase(), el = document.getElementById('sugestoes-rel');
    if (!q) { el.innerHTML = ''; return; }
    const found = state.alunos.filter(a => a.nome.toLowerCase().includes(q)).slice(0, 5);
    el.innerHTML = found.map(a => `<div class="mini-item" onclick="selectRelAluno(${a.id})">${a.nome}</div>`).join('');
});
function selectRelAluno(id) {
    state.selectedRelAluno = state.alunos.find(a => a.id === id);
    document.getElementById('search-rel').value = state.selectedRelAluno.nome;
    document.getElementById('sugestoes-rel').innerHTML = '';
}
function gerarRelatorio() {
    const ano = Number(document.getElementById('rel-ano').value);
    const isGeral = document.querySelector('[data-rtab].active').dataset.rtab === 'geral';
    const el = document.getElementById('rel-preview');
    if (isGeral) {
        const pags = state.pagamentos.filter(p => p.ano === ano);
        el.innerHTML = `<div class="form-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="font-size:1rem;font-weight:900">Relatório Geral — ${ano}</h3><span style="font-size:.7rem;color:var(--muted);font-weight:700">${pags.length} registos</span></div><div class="table-wrap"><table><thead><tr><th>Membro</th><th>Mês</th><th>Valor</th></tr></thead><tbody>${pags.length ? pags.map(p => `<tr><td>${p.alunoNome}</td><td>${MESES_CURTO[p.mes]}</td><td class="pago">${fmtKz(p.valor)}</td></tr>`).join('') : '<tr><td colspan="3" class="empty">Sem pagamentos neste ano.</td></tr>'}</tbody></table></div></div>`;
        return;
    }
    if (!state.selectedRelAluno) { toast('Seleciona um membro', true); return; }
    const aluno = state.selectedRelAluno;
    const partes = aluno.dataEntrada.includes('/') ? aluno.dataEntrada.split('/') : aluno.dataEntrada.split('-');
    const anoEntrada = parseInt(partes[2]), mesEntrada = parseInt(partes[1]) - 1;
    const hojeAno = new Date().getFullYear(), hojeMes = new Date().getMonth();
    const pags = state.pagamentos.filter(p => p.alunoId === aluno.id && p.ano === ano);
    const pagosMap = {}; pags.forEach(p => pagosMap[p.mes] = p.valor);
    const linhas = MESES.map((nome, idx) => {
        if (ano < anoEntrada || (ano === anoEntrada && idx < mesEntrada)) return `<tr><td>${nome}</td><td class="vazio">—</td></tr>`;
        if (pagosMap[idx] !== undefined) return `<tr><td>${nome}</td><td class="pago">${fmtKz(pagosMap[idx])}</td></tr>`;
        if (ano === hojeAno && idx > hojeMes) return `<tr><td>${nome}</td><td class="vazio">—</td></tr>`;
        if (ano > hojeAno) return `<tr><td>${nome}</td><td class="vazio">—</td></tr>`;
        return `<tr><td>${nome}</td><td class="pendente">PENDENTE</td></tr>`;
    }).join('');
    el.innerHTML = `<div class="form-card"><h3 style="font-size:1rem;font-weight:900;margin-bottom:12px">${aluno.nome} — ${ano}</h3><div class="table-wrap"><table><thead><tr><th>Mês</th><th>Estado</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`;
}
// Abre as opções nativas do Android para cada PDF exportado.
function mostrarOpcoesPDF(r) {
    if (r && r.ok && r.caminho && typeof AndroidBridge !== "undefined" && typeof AndroidBridge.mostrarOpcoesPDF === "function") {
        AndroidBridge.mostrarOpcoesPDF(String(r.caminho), String(r.nome || "Relatorio.pdf"));
    } else if (r && r.ok) {
        toast(`PDF gerado: ${r.nome}. Não foi possível abrir as opções de partilha.`, true);
    }
}

async function exportarPDF() {
    const isGeral = document.querySelector('[data-rtab].active').dataset.rtab === 'geral';
    const ano = Number(document.getElementById('rel-ano').value);
    toast('A gerar PDF...');
    let r;
    if (isGeral) r = await pyCall('pdf_geral', ano);
    else { if (!state.selectedRelAluno) { toast('Seleciona um membro primeiro', true); return; } r = await pyCall('pdf_individual', state.selectedRelAluno.id, ano); }
    if (r && r.ok) { toast('PDF gerado com sucesso'); mostrarOpcoesPDF(r); }
    else { toast(r && r.erro ? r.erro : 'Erro ao gerar PDF', true); }
}
function populateAnos() {
    const sel = document.getElementById('rel-ano');
    if (!sel || sel.options.length) return;
    const atual = new Date().getFullYear();
    let html = '';
    for (let y = 2024; y <= 2050; y++) html += `<option value="${y}" ${y === atual ? 'selected' : ''}>${y}</option>`;
    sel.innerHTML = html;
}

// ATIVIDADES
async function criarAtividade() {
    const nome = document.getElementById('ativ-nome').value.trim();
    const valor = Number(document.getElementById('ativ-valor').value);
    if (!nome || !valor) { toast('Preenche nome e valor', true); return; }
    const r = await pyCall('criar_atividade', nome, valor);
    if (r && r.ok) {
        toast('Atividade criada');
        document.getElementById('ativ-nome').value = ''; document.getElementById('ativ-valor').value = '';
        await esperar(500); await carregarTudoDoPython();
    } else {
        toast((r && r.erro) || 'Erro ao criar atividade', true);
        debugTela('Falha criar_atividade: ' + JSON.stringify(r));
    }
}
function renderAtividades() {
    const el = document.getElementById('lista-atividades');
    if (!el) return;
    if (!state.atividades.length) { el.innerHTML = `<div class="empty"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg><div>Sem atividades criadas.</div></div>`; return; }
    el.innerHTML = state.atividades.map(a => {
        const pagantesIds = a.pagantes || [];
        const naoPagantes = state.alunos.filter(al => !pagantesIds.includes(al.id));
        return `<div class="atividade-card"><div class="ativ-header"><h4>${a.nome}</h4><span class="ativ-valor">${fmtKz(a.valor)}</span></div><div class="ativ-meta">Criada em ${fmtData(a.dataCriacao)}</div><div class="ativ-stats"><button class="ativ-stat-btn pago" onclick="abrirListaAtividade(${a.id},'pago')"><div class="stat-icon"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><div class="stat-info"><span class="stat-num">${pagantesIds.length}</span><span class="stat-lbl">Pagaram</span></div></button><button class="ativ-stat-btn pendente" onclick="abrirListaAtividade(${a.id},'pendente')"><div class="stat-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg></div><div class="stat-info"><span class="stat-num">${naoPagantes.length}</span><span class="stat-lbl">Pendentes</span></div></button></div><div class="ativ-actions"><button class="ativ-action-btn" onclick="abrirPagantesAtividade(${a.id})"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Adicionar</button><button class="ativ-action-btn" onclick="gerarPDFAtividade(${a.id})"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>PDF</button><button class="ativ-action-btn danger" onclick="eliminarAtividade(${a.id})"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>Apagar</button></div></div>`;
    }).join('');
}
function abrirListaAtividade(id, tipo) {
    const a = state.atividades.find(x => x.id === id);
    if (!a) return;
    const pagantesIds = a.pagantes || [];
    const isPago = tipo === 'pago';
    const lista = isPago ? state.alunos.filter(al => pagantesIds.includes(al.id)) : state.alunos.filter(al => !pagantesIds.includes(al.id));
    const titulo = isPago ? 'Pagaram' : 'Não pagaram';
    const total = lista.length * a.valor;
    let modal = document.getElementById('modal-atividade-lista');
    if (!modal) { modal = document.createElement('div'); modal.id = 'modal-atividade-lista'; modal.className = 'modal'; modal.onclick = (e) => { if (e.target === modal) fecharModalLista(); }; document.body.appendChild(modal); }
    modal.innerHTML = `<div class="modal-content"><div class="modal-handle"></div><h3>${a.nome}</h3><p style="font-size:.75rem;color:var(--muted);font-weight:600;margin-bottom:16px">${fmtKz(a.valor)} por pessoa · ${titulo}</p><div class="modal-header-stat ${isPago ? 'pago' : 'nao-pago'}"><div class="info"><span class="lbl">${titulo}</span><span class="num">${lista.length}</span></div><div style="text-align:right"><div class="lbl" style="margin-bottom:3px">${isPago ? 'Recebido' : 'Em falta'}</div><div class="total">${fmtKz(total)}</div></div></div><div class="modal-list">${lista.length ? lista.map(al => { const iniciais = al.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); return `<div class="modal-list-item ${isPago ? 'pago' : 'nao-pago'}"><div class="avatar">${iniciais}</div><div class="info"><div class="nome">${al.nome}</div><div class="sub">${isPago ? 'Pagamento confirmado' : 'Entrada ' + fmtData(al.dataEntrada)}</div></div><div class="badge">${isPago ? '✓ Pago' : 'Pendente'}</div></div>`; }).join('') : `<div class="empty" style="margin:0">${isPago ? 'Ninguém pagou ainda.' : 'Todos já pagaram! 🎉'}</div>`}</div><div class="modal-actions"><button class="btn-ghost" onclick="fecharModalLista()">Fechar</button><button class="btn-primary" onclick="fecharModalLista();gerarPDFAtividade(${a.id})">📄 PDF</button></div></div>`;
    modal.classList.add('open');
}
function fecharModalLista() { const m = document.getElementById('modal-atividade-lista'); if (m) m.classList.remove('open'); }
function abrirPagantesAtividade(id) {
    const a = state.atividades.find(x => x.id === id);
    const pagantesIds = a.pagantes || [];
    const elegiveis = state.alunos.filter(al => !pagantesIds.includes(al.id));
    if (!elegiveis.length) { toast('Todos já pagaram!', true); return; }
    let modal = document.getElementById('modal-atividade-add');
    if (!modal) { modal = document.createElement('div'); modal.id = 'modal-atividade-add'; modal.className = 'modal'; modal.onclick = (e) => { if (e.target === modal) fecharModalAdd(); }; document.body.appendChild(modal); }
    modal.innerHTML = `<div class="modal-content"><div class="modal-handle"></div><h3>Adicionar pagante</h3><p style="font-size:.75rem;color:var(--muted);font-weight:600;margin-bottom:16px">${a.nome} · ${fmtKz(a.valor)}</p><div class="search-box" style="margin-bottom:12px"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" id="add-search" placeholder="Pesquisar membro..." oninput="filtrarAddPagante(${a.id})"></div><div class="modal-list" id="add-lista">${elegiveis.map(al => { const iniciais = al.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); return `<div class="modal-list-item" onclick="confirmarPagante(${a.id}, ${al.id}, event)"><div class="avatar" style="background:rgba(88,204,2,.12);color:var(--green-neon);border:1px solid rgba(88,204,2,.3)">${iniciais}</div><div class="info"><div class="nome">${al.nome}</div><div class="sub">Entrada ${fmtData(al.dataEntrada)}</div></div><div class="badge" style="background:rgba(88,204,2,.15);color:var(--green-neon);border:1px solid rgba(88,204,2,.3)">+ Add</div></div>`; }).join('')}</div><div class="modal-actions"><button class="btn-ghost" onclick="fecharModalAdd()">Fechar</button></div></div>`;
    modal.classList.add('open');
}
function filtrarAddPagante(id) {
    const q = document.getElementById('add-search').value.toLowerCase();
    const a = state.atividades.find(x => x.id === id);
    const pagantesIds = a.pagantes || [];
    const elegiveis = state.alunos.filter(al => !pagantesIds.includes(al.id) && al.nome.toLowerCase().includes(q));
    const el = document.getElementById('add-lista');
    if (!elegiveis.length) { el.innerHTML = '<div class="empty" style="margin:0">Nenhum membro encontrado.</div>'; return; }
    el.innerHTML = elegiveis.map(al => { const iniciais = al.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); return `<div class="modal-list-item" onclick="confirmarPagante(${id}, ${al.id}, event)"><div class="avatar" style="background:rgba(88,204,2,.12);color:var(--green-neon);border:1px solid rgba(88,204,2,.3)">${iniciais}</div><div class="info"><div class="nome">${al.nome}</div><div class="sub">Entrada ${fmtData(al.dataEntrada)}</div></div><div class="badge" style="background:rgba(88,204,2,.15);color:var(--green-neon);border:1px solid rgba(88,204,2,.3)">+ Add</div></div>`; }).join('');
}
async function confirmarPagante(ativId, alunoId, e) {
    let rippleX = null, rippleY = null;
    if (e && e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); rippleX = rect.left + rect.width / 2; rippleY = rect.top + rect.height / 2; }
    const r = await pyCall('registar_pagante_atividade', ativId, alunoId);
    if (r && r.ok) {
        const aluno = state.alunos.find(al => al.id === alunoId);
        toast(`${aluno.nome} registado`);
        if (rippleX !== null) ondaSucesso(rippleX, rippleY);
        await carregarTudoDoPython(); fecharModalAdd();
    } else { toast((r && r.erro) || 'Erro ao registar pagante', true); debugTela('Falha registar_pagante_atividade: ' + JSON.stringify(r)); }
}
function fecharModalAdd() { const m = document.getElementById('modal-atividade-add'); if (m) m.classList.remove('open'); }
async function eliminarAtividade(id) {
    if (!confirm('Eliminar esta atividade?')) return;
    const r = await pyCall('eliminar_atividade', id);
    if (r && r.ok) { toast('Atividade eliminada'); await carregarTudoDoPython(); } else { toast((r && r.erro) || 'Erro ao eliminar atividade', true); }
}
async function gerarPDFAtividade(id) {
    toast('A gerar PDF...');
    const r = await pyCall('pdf_atividade', id);
    if (r && r.ok) { toast('PDF gerado com sucesso'); mostrarOpcoesPDF(r); } else { toast(r && r.erro ? r.erro : 'Erro ao gerar PDF', true); }
}

// PDF QUEM DEVE
async function gerarPDFQuemDeve() {
    toast('A gerar PDF...');
    const r = await pyCall('pdf_quem_deve');
    if (r && r.ok) { toast('PDF gerado com sucesso'); mostrarOpcoesPDF(r); } else { toast(r && r.erro ? r.erro : 'Erro ao gerar PDF', true); }
}

// NOTAS
async function guardarNota() {
    const texto = document.getElementById('nota-texto').value.trim();
    if (!texto) { toast('Escreve algo primeiro', true); return; }
    const r = await pyCall('guardar_nota', texto, state.editingNota);
    if (r && r.ok) {
        toast(state.editingNota ? 'Nota atualizada' : 'Nota guardada');
        state.editingNota = null; document.getElementById('nota-texto').value = '';
        await esperar(500); await carregarTudoDoPython();
    } else {
        toast((r && r.erro) || 'Erro ao guardar nota', true);
        debugTela('Falha guardar_nota: ' + JSON.stringify(r));
    }
}
function editarNota(id) {
    const n = state.notas.find(x => x.id === id);
    if (!n) return;
    document.getElementById('nota-texto').value = n.texto;
    state.editingNota = id;
    document.getElementById('nota-texto').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function eliminarNota(id) {
    if (!confirm('Eliminar esta nota?')) return;
    const r = await pyCall('eliminar_nota', id);
    if (r && r.ok) { toast('Nota eliminada'); await carregarTudoDoPython(); } else { toast((r && r.erro) || 'Erro ao eliminar nota', true); }
}
function renderNotas() {
    const el = document.getElementById('lista-notas');
    if (!el) return;
    if (!state.notas.length) { el.innerHTML = '<div class="empty">Sem notas guardadas.</div>'; return; }
    el.innerHTML = state.notas.map(n => `<div class="nota-card"><div class="nota-meta">📌 ${fmtData(n.data)}</div>${n.texto}<div class="nota-actions"><button onclick="editarNota(${n.id})">✏️ Editar</button><button class="danger" onclick="eliminarNota(${n.id})">🗑️ Apagar</button></div></div>`).join('');
}

// CONFIGURAÇÕES
async function guardarQuota() {
    const v = Number(document.getElementById('cfg-quota').value);
    if (!v || v <= 0) { toast('Valor inválido', true); return; }
    const r = await pyCall('guardar_quota', v);
    if (r && r.ok) {
        state.quota = v;
        toast('Quota atualizada');
        await carregarTudoDoPython();
        document.getElementById('cfg-quota').value = String(state.quota);
    } else {
        toast((r && r.erro) || 'Erro ao guardar quota', true);
        debugTela('Falha guardar_quota: ' + JSON.stringify(r));
    }
}
async function criarBackup() {
    const r = await pyCall('criar_backup');
    if (r && r.ok) { toast(`Backup criado: ${r.nome}`); } else { toast('Erro ao criar backup', true); }
}
async function setAccent(cor, neon, escura) {
    const r = document.documentElement;
    r.style.setProperty('--green', cor); r.style.setProperty('--green-neon', neon); r.style.setProperty('--green-dark', escura);
    const res = await pyCall('config_guardar_cor', cor, neon, escura);
    if (res && res.ok) { toast('Cor guardada'); } else { toast((res && res.erro) || 'Erro ao guardar cor', true); debugTela('Falha config_guardar_cor: ' + JSON.stringify(res)); }
}

// STATS (HOME)
function renderStats() {
    const totalAlunos = state.alunos.length;
    const totalRecebido = state.pagamentos.reduce((s, p) => s + p.valor, 0);
    const hojeAno = new Date().getFullYear(), hojeMes = new Date().getMonth();
    let pendentes = 0;
    state.alunos.forEach(a => {
        const entrada = a.dataEntrada;
        let anoE, mesE;
        if (entrada.includes('/')) { const p = entrada.split('/'); anoE = +p[2]; mesE = +p[1] - 1; }
        else { const p = entrada.split('-'); anoE = +p[0]; mesE = +p[1] - 1; }
        const inicioKey = anoE * 12 + mesE + 1, fimKey = hojeAno * 12 + hojeMes;
        const mesesDevidos = Math.max(0, fimKey - inicioKey + 1);
        const mesesPagos = state.pagamentos.filter(p => p.alunoId === a.id).length;
        if (mesesPagos < mesesDevidos) pendentes++;
    });
    const agora = new Date();
    const periodo = `${MESES[agora.getMonth()]} ${agora.getFullYear()}`;
    const el1 = document.getElementById('stat-alunos'), el2 = document.getElementById('stat-pendentes'), el3 = document.getElementById('stat-quota'), el4 = document.getElementById('metaPeriodo');
    if (el1) el1.textContent = totalAlunos;
    if (el2) el2.textContent = pendentes;
    if (el3) el3.textContent = fmtKz(state.quota);
    if (el4) el4.textContent = '· ' + periodo;
    animarContador(totalRecebido);
}

// QUEM DEVE
function calcularQuemDeve() {
    const hojeAno = new Date().getFullYear(), hojeMes = new Date().getMonth();
    const devedores = [];
    state.alunos.forEach(a => {
        const entrada = a.dataEntrada;
        let anoE, mesE;
        if (entrada.includes('/')) { const p = entrada.split('/'); anoE = +p[2]; mesE = +p[1] - 1; }
        else { const p = entrada.split('-'); anoE = +p[0]; mesE = +p[1] - 1; }
        const inicioKey = anoE * 12 + mesE + 1, fimKey = hojeAno * 12 + hojeMes;
        const mesesDevidos = Math.max(0, fimKey - inicioKey + 1);
        const mesesPagos = state.pagamentos.filter(p => p.alunoId === a.id).length;
        const mesesEmFalta = mesesDevidos - mesesPagos;
        if (mesesEmFalta > 0) devedores.push({ aluno: a, mesesEmFalta, valorDevido: mesesEmFalta * state.quota, mesesDevidos, mesesPagos });
    });
    devedores.sort((a, b) => b.valorDevido - a.valorDevido);
    return devedores;
}
function abrirQuemDeve() {
    const devedores = calcularQuemDeve();
    let modal = document.getElementById('modal-quem-deve');
    if (!modal) { modal = document.createElement('div'); modal.id = 'modal-quem-deve'; modal.className = 'modal'; modal.onclick = (e) => { if (e.target === modal) fecharQuemDeve(); }; document.body.appendChild(modal); }
    const totalGeral = devedores.reduce((s, d) => s + d.valorDevido, 0);
    const totalMeses = devedores.reduce((s, d) => s + d.mesesEmFalta, 0);
    modal.innerHTML = `<div class="modal-content"><div class="modal-handle"></div><h3>Quem está a dever</h3><p style="font-size:.75rem;color:var(--muted);font-weight:600;margin-bottom:16px">Cálculo até ${MESES[new Date().getMonth()]} ${new Date().getFullYear()} · Quota ${fmtKz(state.quota)}</p><div class="deve-total"><div><div class="lbl">Total em dívida</div><div class="val">${fmtKz(totalGeral)}</div></div><div style="text-align:right"><div class="count">${devedores.length}</div><div class="count-lbl">membro${devedores.length !== 1 ? 's' : ''} · ${totalMeses} mês${totalMeses !== 1 ? 'es' : ''}</div></div></div>${devedores.length ? `<div class="deve-list">${devedores.map(d => { const iniciais = d.aluno.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); return `<div class="deve-item"><div class="avatar">${iniciais}</div><div class="info"><div class="nome">${d.aluno.nome}</div><div class="detalhe">${d.mesesEmFalta} de ${d.mesesDevidos} ${d.mesesEmFalta === 1 ? 'mês em falta' : 'meses em falta'} · ${d.mesesPagos} pago${d.mesesPagos !== 1 ? 's' : ''}</div></div><div class="valor-deve">${fmtKz(d.valorDevido)}<small>${d.mesesEmFalta} × ${fmtKz(state.quota)}</small></div></div>`; }).join('')}</div>` : `<div class="empty" style="margin:0"><svg viewBox="0 0 24 24" style="stroke:var(--green-neon)"><polyline points="20 6 9 17 4 12"/></svg><div>Ninguém está a dever! 🎉</div></div>`}<div class="deve-actions"><button class="btn-ghost" style="margin:0" onclick="fecharQuemDeve()">Fechar</button>${devedores.length ? `<button class="btn-primary" onclick="gerarPDFQuemDeve()">📄 PDF</button>` : ''}</div></div>`;
    modal.classList.add('open');
}
function fecharQuemDeve() { const modal = document.getElementById('modal-quem-deve'); if (modal) modal.classList.remove('open'); }
function atualizarResumoDeve() {
    const el = document.getElementById('deveResumo');
    if (!el) return;
    const devedores = calcularQuemDeve(), total = devedores.reduce((s, d) => s + d.valorDevido, 0);
    if (!devedores.length) el.textContent = 'Ninguém está a dever';
    else el.textContent = `${devedores.length} membro${devedores.length !== 1 ? 's' : ''} · ${fmtKz(total)}`;
}