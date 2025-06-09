// Variáveis globais
let allEmails = [];
let filteredEmails = [];
let statusChart = null;

// Elementos DOM
const emailDetailModal = document.getElementById('email-detail-modal');
const closeModalBtn = document.getElementById('close-modal');
const emailDetailContent = document.getElementById('email-detail-content');
const statusChartCanvas = document.getElementById('status-chart');
const summarySuccess = document.getElementById('summary-success');
const summaryWarning = document.getElementById('summary-warning');
const summaryError = document.getElementById('summary-error');
const summaryTotal = document.getElementById('summary-total'); // Novo: card de total
const backupSummaryDateInput = document.getElementById('backup-summary-date');
let backupSummarySelectedDate = null;

// Modal de detalhes do backup_job
let backupJobDetailModal = document.getElementById('backup-job-detail-modal');
let backupJobDetailContent = document.getElementById('backup-job-detail-content');
let closeBackupJobModalBtn = null;

if (!backupJobDetailModal) {
    backupJobDetailModal = document.createElement('div');
    backupJobDetailModal.id = 'backup-job-detail-modal';
    backupJobDetailModal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 hidden';
    backupJobDetailModal.innerHTML = `
        <div class="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6 relative">
            <button id="close-backup-job-modal" class="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl">&times;</button>
            <div id="backup-job-detail-content"></div>
        </div>
    `;
    document.body.appendChild(backupJobDetailModal);
    backupJobDetailContent = document.getElementById('backup-job-detail-content');
}
function attachCloseBackupJobModalBtn() {
    closeBackupJobModalBtn = document.getElementById('close-backup-job-modal');
    if (closeBackupJobModalBtn) {
        closeBackupJobModalBtn.onclick = () => {
            backupJobDetailModal.classList.add('hidden');
        };
    }
}
attachCloseBackupJobModalBtn();

// ==================== Funções Utilitárias ====================
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR').slice(0, 5);
}
function formatSimpleDate(dateString) {
    // Corrige possível diferença de fuso horário ao criar o objeto Date
    // Usa apenas a parte yyyy-mm-dd para evitar conversão para UTC
    if (!dateString) return '-';
    // Extrai apenas a data (sem hora)
    const onlyDate = dateString.split('T')[0].split(' ')[0];
    const [year, month, day] = onlyDate.split('-');
    if (year && month && day) {
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
    // fallback para Date normal se não for formato esperado
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}
function getStatusBadge(isProcessed, email) {
    let isWarning = false;
    if (email && (email.status === 'Warning' || email.status === 'warning')) {
        isWarning = true;
    }
    if (email && Array.isArray(email.backup_jobs)) {
        isWarning = email.backup_jobs.some(job =>
            ((job.job_name || job.host || '').toLowerCase().includes('retry'))
        ) || isWarning;
    }
    if (isWarning) {
        return '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Aviso</span>';
    }
    if (isProcessed) {
        return '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Suceso</span>';
    } else {
        return '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Pendente</span>';
    }
}

// ==================== Funções de Fetch ====================
async function fetchEmails() {
    try {
        const response = await fetch('/api/emails/');
        if (!response.ok) throw new Error('Erro ao carregar e-mails');
        allEmails = await response.json();
        // Carrega dados de backup_data (hosts) e config_backups para cada email
        await Promise.all(allEmails.map(async (email) => {
            try {
                // Dados de hosts tradicionais
                const resp = await fetch(`/api/email-data/by-email/${email.id}`);
                email.backup_data = resp.ok ? await resp.json() : [];
            } catch {
                email.backup_data = [];
            }
            try {
                // Dados de config_backups
                const respConfig = await fetch(`/api/config-backups/by-email/${email.id}`);
                email.config_backups = respConfig.ok ? await respConfig.json() : [];
            } catch {
                email.config_backups = [];
            }
        }));
        filteredEmails = [...allEmails];
        updateBackupSummary();
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao carregar dados. Tente novamente.');
    }
}
async function fetchEmailDetails(emailId) {
    try {
        const response = await fetch(`/api/email-data/by-email/${emailId}`);
        if (!response.ok) throw new Error('Erro ao carregar detalhes');
        return await response.json();
    } catch (error) {
        console.error('Erro:', error);
        return [];
    }
}

// ==================== Funções de Filtro e Resumo ====================

// Adiciona o botão de menu de filtros e o menu suspenso
function renderBackupSummaryFilter() {
    const tableContainer = document.getElementById('backup-summary-table');
    let filterMenuBtn = document.getElementById('backup-summary-filter-btn');
    let filterMenu = document.getElementById('backup-summary-filter-menu');

    // Cria o botão do menu se não existir
    if (!filterMenuBtn) {
        filterMenuBtn = document.createElement('button');
        filterMenuBtn.id = 'backup-summary-filter-btn';
        filterMenuBtn.className = 'absolute top-2 right-12 z-20 bg-white rounded-full p-2 shadow hover:bg-gray-100 transition';
        filterMenuBtn.innerHTML = '<i class="fas fa-filter text-gray-600 text-lg"></i>';
        // Adiciona o botão ao container pai da tabela
        const parent = tableContainer.parentNode;
        parent.style.position = 'relative';
        parent.insertBefore(filterMenuBtn, tableContainer);

        // Botão de informação ao lado do filtro
        let infoBtn = document.getElementById('backup-summary-info-btn');
        if (!infoBtn) {
            infoBtn = document.createElement('button');
            infoBtn.id = 'backup-summary-info-btn';
            infoBtn.className = 'absolute top-2 right-2 z-20 bg-white rounded-full p-2 shadow hover:bg-blue-100 transition';
            infoBtn.title = 'Informações sobre o backup';
            infoBtn.innerHTML = '<i class="fa-solid fa-circle-info text-blue-600 text-lg"></i>';
            parent.insertBefore(infoBtn, tableContainer);

            // Evento para abrir o modal de informações
            infoBtn.onclick = function(e) {
                e.stopPropagation();
                const modal = document.getElementById('info-modal');
                if (modal) {
                    // Preenche o conteúdo do modal com as informações fornecidas
                    const content = document.getElementById('info-modal-content');
                    if (content) {
                        content.innerHTML = `
                            <div class="flex flex-col items-center justify-center p-0">
                                <div class="w-full bg-green-50 border-l-4 border-green-400 rounded-lg p-4 mb-4 shadow-sm">
                                    <h4 class="font-semibold text-green-800 mb-1 flex items-center gap-1">
                                        <i class="fa-solid fa-bullseye text-green-500"></i> Qual é o objetivo deste projeto?
                                    </h4>
                                    <p class="text-gray-700 text-sm mb-2">
                                        Este projeto tem como missão monitorar automaticamente os backups do Veeam 📊, trazendo mais eficiência e visibilidade para o processo. Como? Através de um sistema inteligente que:
                                    </p>
                                    <ul class="text-gray-700 text-sm list-disc pl-5 mb-2">
                                        <li><b>📧 Lê e-mails automáticos do Veeam</b> – Captura alertas e logs de sucesso/falha diretamente da sua caixa de entrada.</li>
                                        <li><b>💾 Armazena os dados em um banco de dados</b> – Organiza as informações para análise histórica e rápida consulta.</li>
                                        <li><b>📊 Gera um dashboard intuitivo</b> – Exibe status, tendências e métricas, facilitando a tomada de decisão 🚀.</li>
                                    </ul>
                                    <div class="mt-2">
                                        <span class="font-semibold text-green-700">🎯 Benefícios:</span>
                                        <ul class="text-gray-700 text-sm list-disc pl-5 mt-1">
                                            <li>✔️ Redução de falhas não detectadas</li>
                                            <li>✔️ Relatórios centralizados e acessíveis</li>
                                            <li>✔️ Histórico de backups para auditoria</li>
                                        </ul>
                                    </div>
                                </div>
                                <div class="w-full bg-blue-50 border-l-4 border-blue-400 rounded-lg p-4 mb-4 shadow-sm">
                                    <h4 class="font-semibold text-blue-800 mb-1 flex items-center gap-1"><i class="fa-solid fa-rotate-right text-blue-500"></i> O que é o Retry?</h4>
                                    <p class="text-gray-700 text-sm">
                                        O <b>Retry</b> ♻️ é um recurso inteligente do Veeam Backup & Replication que realiza uma nova tentativa automática 🚀 quando um backup falha.<br>
                                        Em vez de exigir intervenção manual, o Veeam detecta a falha e reprocessa o job 🔄, aumentando as chances de sucesso.<br>
                                        <span class="text-blue-700">Ideal para resolver problemas temporários</span> (como instabilidade de rede ou recursos insuficientes no storage).
                                    </p>
                                </div>
                                <div class="w-full bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4 shadow-sm">
                                    <h4 class="font-semibold text-yellow-800 mb-1 flex items-center gap-1"><i class="fa-solid fa-database text-yellow-500"></i> O que é o (Full)?</h4>
                                    <p class="text-gray-700 text-sm">
                                        O <b>(Full)</b> 📂 é um ponto de backup completo que armazena todas as máquinas virtuais (VMs) de um job, sem dependências de backups anteriores.<br>
                                        Diferente de incrementais/diferenciais, ele contém <b>todos os dados 💾 necessários para uma restauração independente</b>.<br>
                                        É a <span class="text-yellow-700 font-semibold">"base segura"</span> 🛡️ da cadeia de backups, garantindo recuperação consistente em cenários críticos.<br>
                                        <span class="block mt-2 text-xs text-yellow-700 italic">(Dica: "Full" consome mais espaço, mas é essencial para estratégias GFS!)</span>
                                    </p>
                                </div>
                            </div>
                        `;
                    }
                    modal.classList.remove('hidden');
                    // Adiciona o evento do botão de fechar toda vez que abrir
                    const closeBtn = document.getElementById('close-info-modal');
                    if (closeBtn) {
                        closeBtn.onclick = function() {
                            modal.classList.add('hidden');
                        };
                    }
                }
            };
        }
    }

    // Cria o menu de filtros se não existir
    if (!filterMenu) {
        filterMenu = document.createElement('div');
        filterMenu.id = 'backup-summary-filter-menu';
        filterMenu.className = 'hidden absolute top-12 right-2 bg-white border border-gray-200 rounded-xl shadow-2xl p-0 w-96 z-30 transition-all duration-200';
        filterMenu.innerHTML = `
            <div class="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-100 rounded-t-xl bg-gradient-to-r from-blue-50 to-white">
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-filter text-blue-600 text-lg"></i>
                    <span class="font-semibold text-gray-800 text-base">Filtros Avançados</span>
                </div>
                <button id="close-backup-summary-filter" class="text-gray-400 hover:text-red-500 text-xl font-bold focus:outline-none transition">
                    &times;
                </button>
            </div>
            <div class="flex flex-col gap-3 px-4 py-4">
                <div class="flex flex-col">
                    <label for="backup-summary-status" class="text-[11px] text-gray-600 mb-1 font-medium">Status</label>
                    <select id="backup-summary-status" class="border border-gray-300 rounded-lg px-3 py-2 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all h-9">
                        <option value="">Todos</option>
                        <option value="success">Sucesso</option>
                        <option value="warning">Aviso</option>
                        <option value="error">Falha</option>
                    </select>
                </div>
                <div class="flex flex-col">
                    <label for="backup-summary-search" class="text-[11px] text-gray-600 mb-1 font-medium">Nome do dispositivo</label>
                    <input type="text" id="backup-summary-search" placeholder="Filtrar por nome" class="border border-gray-300 rounded-lg px-3 py-2 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all h-9" />
                </div>
                <div class="flex flex-row gap-3">
                    <div class="flex flex-col flex-1">
                        <label for="backup-summary-date-start" class="text-[11px] text-gray-600 mb-1 font-medium">Data inicial</label>
                        <input type="date" id="backup-summary-date-start" class="border border-gray-300 rounded-lg px-3 py-2 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all h-9" />
                    </div>
                    <div class="flex flex-col flex-1">
                        <label for="backup-summary-date-end" class="text-[11px] text-gray-600 mb-1 font-medium">Data final</label>
                        <input type="date" id="backup-summary-date-end" class="border border-gray-300 rounded-lg px-3 py-2 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all h-9" />
                    </div>
                </div>
                <div class="flex flex-col gap-2 mt-2">
                    <button id="backup-summary-clear" type="button" class="rounded-lg px-3 py-2 bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition-all text-sm h-9 w-full flex items-center justify-center gap-2">
                        <i class="fa-solid fa-broom"></i> Limpar
                    </button>
                    <span id="pdf-btn-placeholder" class="w-full"></span>
                </div>
            </div>
        `;
        tableContainer.parentNode.appendChild(filterMenu);

        // Botão de fechar do modal de filtro
        filterMenu.querySelector('#close-backup-summary-filter').onclick = (e) => {
            filterMenu.classList.add('hidden');
            e.stopPropagation();
        };
    }

    // Eventos para abrir/fechar o menu
    filterMenuBtn.onclick = (e) => {
        e.stopPropagation();
        filterMenu.classList.toggle('hidden');
    };
    // Fecha o menu ao clicar fora
    document.addEventListener('click', function closeMenu(e) {
        if (!filterMenu.classList.contains('hidden') && !filterMenu.contains(e.target) && e.target !== filterMenuBtn) {
            filterMenu.classList.add('hidden');
        }
    });

    // Só adiciona listeners se ainda não existem
    if (!filterMenu.dataset.listeners) {
        document.getElementById('backup-summary-search').addEventListener('input', onBackupSummaryFilterChange);
        document.getElementById('backup-summary-status').addEventListener('change', onBackupSummaryFilterChange);
        document.getElementById('backup-summary-date-start').addEventListener('change', onBackupSummaryFilterChange);
        document.getElementById('backup-summary-date-end').addEventListener('change', onBackupSummaryFilterChange);
        document.getElementById('backup-summary-clear').addEventListener('click', clearBackupSummaryFilters);
        filterMenu.dataset.listeners = '1';
    }

    // Adiciona o botão PDF no placeholder se ainda não existir
    const pdfPlaceholder = filterMenu.querySelector('#pdf-btn-placeholder');
    if (pdfPlaceholder && !pdfPlaceholder.querySelector('#export-backup-summary-pdf')) {
        const pdfBtn = document.createElement('button');
        pdfBtn.id = 'export-backup-summary-pdf';
        pdfBtn.type = 'button';
        pdfBtn.className = 'rounded-lg px-3 py-2 bg-red-600 text-white font-semibold shadow hover:bg-red-700 transition-all text-sm h-9 w-full flex items-center justify-center gap-2';
        pdfBtn.innerHTML = '<i class="fas fa-file-pdf"></i> PDF';
        pdfPlaceholder.appendChild(pdfBtn);
    }
}

// Função para limpar filtros
function clearBackupSummaryFilters() {
    document.getElementById('backup-summary-status').value = '';
    document.getElementById('backup-summary-search').value = '';
    document.getElementById('backup-summary-date-start').value = '';
    document.getElementById('backup-summary-date-end').value = '';
    onBackupSummaryFilterChange();
}

// Função de filtro dos jobs
function filterBackupJobs(jobs, searchText, statusFilter, dateStart, dateEnd) {
    let filtered = jobs;
    if (statusFilter) {
        filtered = filtered.filter(item => {
            if (statusFilter === 'success') return item.summary_success > 0;
            if (statusFilter === 'warning') return item.summary_warning > 0;
            if (statusFilter === 'error') return item.summary_error > 0;
            return true;
        });
    }
    if (searchText) {
        const lower = searchText.toLowerCase();
        filtered = filtered.filter(item => {
            return [
                item.job_name,
                item.host,
                item.status,
                item.created_by,
                item.created_at,
                item.start_time,
                item.end_time,
                item.total_size,
                item.duration
            ].some(val => (val || '').toString().toLowerCase().includes(lower));
        });
    }
    // Filtro por intervalo de datas
    if (dateStart || dateEnd) {
        filtered = filtered.filter(item => {
            let email = null;
            if (item.email_id && Array.isArray(filteredEmails)) {
                email = filteredEmails.find(e => e.id === item.email_id);
            }
            let emailDate = email && email.date ? email.date : null;
            if (!emailDate) return false;
            // Normaliza para yyyy-mm-dd
            const d = new Date(emailDate);
            const dStr = d.toISOString().slice(0, 10);
            if (dateStart && dStr < dateStart) return false;
            if (dateEnd && dStr > dateEnd) return false;
            return true;
        });
    }
    return filtered;
}

let lastBackupSummaryJobs = []; // Para manter referência dos jobs atuais

function getFilteredEmailsBySummaryDate() {
    // Agora retorna todos os emails, pois não há mais filtro de data
    return allEmails;
}
function updateBackupSummary() {
    const emailsForSummary = getFilteredEmailsBySummaryDate();
    let success = 0, warning = 0, error = 0;
    // Inclui jobs tradicionais e config_backups na tabela
    const allJobs = emailsForSummary.flatMap(email => {
        const jobs = email.backup_jobs || [];
        // Adapta config_backups para o mesmo formato visual da tabela
        const configJobs = (email.config_backups || []).map(cfg => ({
            // Campos compatíveis com backup_jobs
            job_name: `Configuração: ${cfg.server}`,
            host: cfg.server,
            status: cfg.status,
            created_by: '-',
            created_at: cfg.backup_date || '-',
            processed_vms: cfg.catalogs_processed,
            processed_vms_total: cfg.catalogs_processed,
            summary_success: cfg.status === 'Success' ? 1 : 0,
            summary_warning: cfg.status === 'Warning' ? 1 : 0,
            summary_error: cfg.status === 'Error' ? 1 : 0,
            start_time: cfg.start_time,
            end_time: cfg.end_time,
            duration: cfg.duration,
            total_size: cfg.data_size,
            backup_size: cfg.backup_size,
            data_read: '-',
            dedupe: '-',
            transferred: '-',
            compression: cfg.compression,
            email_id: cfg.email_id,
            config_backup_id: cfg.id, // Para detalhes
            is_config_backup: true,
            warnings: cfg.warnings
        }));
        return [...jobs, ...configJobs];
    });
    allJobs.forEach(job => {
        if (job.summary_error == 1) {
            error++;
        } else if ((job.status && (job.status === 'Warning' || job.status === 'warning'))) {
            warning++;
        } else if (job.status && (job.status === 'Success' || job.status === 'success')) {
            success++;
        } else {
            let email = null;
            if (job.email_id && Array.isArray(emailsForSummary)) {
                email = emailsForSummary.find(e => e.id === job.email_id);
            }
            if (email && (email.is_processed === 1 || email.is_processed === true)) {
                success++;
            } else if (email && (email.is_processed === 0 || email.is_processed === false)) {
                warning++;
            } else {
                error++;
            }
        }
    });

    summarySuccess.textContent = success;
    summaryWarning.textContent = warning;
    summaryError.textContent = error;
    if (summaryTotal) summaryTotal.textContent = allJobs.length; // Atualiza o card de total

    updateBackupSummaryTable(allJobs);
}
function createPaginationControls(totalItems, currentPage, pageSize, onPageChange) {
    const totalPages = Math.ceil(totalItems / pageSize);
    const container = document.createElement('div');
    container.className = 'flex justify-end items-center gap-2 mb-4';

    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = `<span class="inline-block align-middle mr-1">&#8592;</span>Anterior`;
    prevBtn.className = 'px-4 py-1 rounded-lg bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition-all text-sm flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => onPageChange(currentPage - 1);

    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = `Próxima<span class="inline-block align-middle ml-1">&#8594;</span>`;
    nextBtn.className = 'px-4 py-1 rounded-lg bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition-all text-sm flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed';
    nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    nextBtn.onclick = () => onPageChange(currentPage + 1);

    const pageInfo = document.createElement('span');
    pageInfo.className = 'text-xs text-gray-600 px-2';
    pageInfo.textContent = `Página ${currentPage} de ${totalPages || 1}`;

    container.appendChild(prevBtn);
    container.appendChild(pageInfo);
    container.appendChild(nextBtn);

    return container;
}
function addExportPdfButton(tableContainer, tables) {
    // Agora o botão é criado junto com o filtro, só precisa adicionar o evento aqui
    const btn = document.getElementById('export-backup-summary-pdf');
    if (!btn) return;
    if (btn.dataset.listenerAttached) return;
    btn.dataset.listenerAttached = '1';

    btn.onclick = async () => {
        // Carrega jsPDF e autoTable dinamicamente se não existir
        async function loadScript(src) {
            return new Promise(resolve => {
                if (document.querySelector(`script[src="${src}"]`)) return resolve();
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                document.body.appendChild(script);
            });
        }
        if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        }
        if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
            alert('Erro ao carregar jsPDF');
            return;
        }
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.autoTable === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
        }

        const jsPDF = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'A4' });

        let y = 40;
        tables.forEach((table, idx) => {
            // Adiciona título da seção
            const section = table.previousSibling;
            if (section && section.className && section.className.includes('font-semibold')) {
                doc.setFontSize(14);
                doc.text(section.textContent, 40, y);
                y += 16;
            }
            // Cabeçalhos e dados
            const headers = [];
            table.querySelectorAll('thead th').forEach(th => headers.push(th.textContent.trim()));
            const body = [];
            table.querySelectorAll('tbody tr').forEach(tr => {
                const row = [];
                tr.querySelectorAll('td').forEach(td => row.push(td.textContent.trim()));
                body.push(row);
            });

            // autoTable mantém o layout da tabela
            doc.autoTable({
                head: [headers],
                body: body,
                startY: y,
                theme: 'grid',
                headStyles: {
                    fillColor: [243, 244, 246],
                    textColor: [55, 65, 81],
                    fontStyle: 'bold',
                    halign: 'left'
                },
                bodyStyles: {
                    textColor: [31, 41, 55],
                    fontSize: 10,
                    halign: 'left'
                },
                alternateRowStyles: {
                    fillColor: [249, 250, 251]
                },
                margin: { left: 40, right: 40 },
                styles: {
                    cellPadding: 4,
                    overflow: 'linebreak',
                    minCellHeight: 18,
                },
                didDrawPage: (data) => {
                    y = data.cursor.y + 24;
                }
            });
            // Se não for a última tabela, adiciona espaço extra
            if (idx < tables.length - 1 && y > 500) {
                doc.addPage();
                y = 40;
            }
        });

        doc.save('backup-summary.pdf');
    };

    // Adiciona o botão no placeholder dos filtros, se existir
    const pdfPlaceholder = document.getElementById('pdf-btn-placeholder');
    if (pdfPlaceholder) {
        pdfPlaceholder.innerHTML = '';
        pdfPlaceholder.appendChild(btn);
    } else {
        // fallback: adiciona após a tabela
        tableContainer.appendChild(btn);
    }
}
function updateBackupSummaryTable(backupJobs) {
    renderBackupSummaryFilter();
    lastBackupSummaryJobs = backupJobs || [];
    const tableContainer = document.getElementById('backup-summary-table');
    tableContainer.innerHTML = '';

    if (!backupJobs || backupJobs.length === 0) {
        tableContainer.innerHTML = `
            <div class="p-4 text-center text-gray-500">
                Nenhum dado de backup encontrado para os dispositivos no período selecionado.
            </div>
        `;
        return;
    }

    // Ordena todos os jobs por data (mais recente para mais antiga)
    const sortedJobs = [...backupJobs].sort((a, b) => {
        let aDate = '', bDate = '';
        let aTime = '', bTime = '';
        if (a.email_id && Array.isArray(filteredEmails)) {
            const emailA = filteredEmails.find(e => e.id === a.email_id);
            aDate = emailA && emailA.date ? emailA.date : '';
            // Hora: tenta pegar start_time, senão sent_time, senão vazio
            aTime = a.start_time || (emailA && emailA.sent_time ? emailA.sent_time : '');
        }
        if (b.email_id && Array.isArray(filteredEmails)) {
            const emailB = filteredEmails.find(e => e.id === b.email_id);
            bDate = emailB && emailB.date ? emailB.date : '';
            bTime = b.start_time || (emailB && emailB.sent_time ? emailB.sent_time : '');
        }
        // Se não houver data, mantém no final
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        // Compara data primeiro
        if (bDate !== aDate) return bDate.localeCompare(aDate);
        // Se datas iguais, compara hora (decrescente)
        if (aTime && bTime) {
            // Normaliza para HH:MM:SS
            const normA = aTime.split(' ')[1] || aTime.split('T')[1] || aTime;
            const normB = bTime.split(' ')[1] || bTime.split('T')[1] || bTime;
            return (normB || '').localeCompare(normA || '');
        }
        return 0;
    });

    // Paginação
    const PAGE_SIZE = 10;
    // Corrige: não reseta o objeto de páginas, apenas inicializa se não existir
    if (!window._backupSummaryTablePages) window._backupSummaryTablePages = {};
    // Mantém a página atual se já existir, senão começa em 1
    if (typeof window._backupSummaryTablePages['ALL'] !== 'number') window._backupSummaryTablePages['ALL'] = 1;
    const currentPage = window._backupSummaryTablePages['ALL'];
    const totalPages = Math.ceil(sortedJobs.length / PAGE_SIZE);
    // Garante que currentPage nunca ultrapasse o total de páginas
    const safePage = Math.max(1, Math.min(currentPage, totalPages || 1));
    window._backupSummaryTablePages['ALL'] = safePage;
    const paginatedItems = sortedJobs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    // Tabela única
    const table = document.createElement('table');
    table.className = 'min-w-full mb-4 rounded-xl overflow-hidden shadow-sm bg-white border border-gray-100';
    table.innerHTML = `
        <thead class="bg-gray-50">
            <tr>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100">
                    <i class="fa-solid fa-desktop mr-1 text-gray-700"></i> Dispositivo
                </th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100">
                    <i class="fa-solid fa-calendar-day mr-1 text-gray-700"></i> Data
                </th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100">
                    <i class="fa-solid fa-clock mr-1 text-gray-700"></i> Hora
                </th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100">
                    <i class="fa-solid fa-circle-check mr-1 text-gray-700"></i> Status
                </th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100">
                    <i class="fa-solid fa-database mr-1 text-gray-700"></i> Total Size
                </th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100">
                    <i class="fa-solid fa-hourglass-half mr-1 text-gray-700"></i> Duração
                </th>
            </tr>
        </thead>
        <tbody>
            ${paginatedItems.map((item, idx) => {
                // Buscar status e data da tabela emails (email relacionado)
                let email = null;
                if (item.email_id && Array.isArray(filteredEmails)) {
                    email = filteredEmails.find(e => e.id === item.email_id);
                }
                // Data do e-mail
                let data = email && email.date ? formatSimpleDate(email.date) : '-';
                // Status do e-mail
                let statusEmail = email && typeof email.is_processed !== 'undefined'
                    ? (email.is_processed ? 'Sucesso' : 'Pendente')
                    : '-';
                // Se summary_error maior do que zero, força status para "Erro"
                if (item.summary_error > 0) {
                    statusEmail = 'Falha';
                } else if (item.summary_warning > 0 || (item.status && (item.status === 'Warning' || item.status === 'warning'))) {
                    statusEmail = 'Aviso';
                } else if (item.status && (item.status === 'Success' || item.status === 'success')) {
                    statusEmail = 'Sucesso';
                }
                // Hora (mantém lógica anterior)
                let hora = '-';
                if (item.data) {
                    hora = item.data;
                } else if (item.start_time) {
                    const parts = item.start_time.split(' ');
                    hora = parts[0] || '-';
                } else if (item.created_at) {
                    hora = item.created_at.split(' ')[0];
                }
                // Total Size e Duração (padronizado)
                const totalSize = item.backup_size || '-';
                const duracao = item.duration || '-';
                // Alterna cor de fundo das linhas
                const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                // Badge de status mais moderno
                let badgeClass = '';
                if (statusEmail === 'Sucesso') badgeClass = 'bg-green-100 text-green-700 border border-green-200';
                else if (statusEmail === 'Aviso') badgeClass = 'bg-yellow-100 text-yellow-800 border border-yellow-200';
                else if (statusEmail === 'Falha') badgeClass = 'bg-red-100 text-red-700 border border-red-200';
                else if (statusEmail === 'Pendente') badgeClass = 'bg-gray-100 text-gray-700 border border-gray-200';
                else badgeClass = 'bg-gray-50 text-gray-500 border border-gray-100';
                return `
                <tr class="${rowBg} transition hover:bg-blue-100/60">
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        <a href="#" class="text-blue-600 hover:underline" onclick="showBackupJobDetail(${item.email_id}, '${(item.job_name || item.host || '').replace(/'/g, "\\'")}'); return false;">
                            ${item.job_name || item.host || 'N/A'}
                        </a>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700">${data}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700">${hora}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm">
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${badgeClass} shadow-sm">
                            ${statusEmail}
                        </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700">${totalSize}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700">${duracao}</td>
                </tr>
                `;
            }).join('')}
        </tbody>
    `;
    tableContainer.appendChild(table);

    // Controles de paginação
    if (sortedJobs.length > PAGE_SIZE) {
        const pagination = createPaginationControls(
            sortedJobs.length,
            safePage,
            PAGE_SIZE,
            (newPage) => {
                window._backupSummaryTablePages['ALL'] = newPage;
                updateBackupSummaryTable(lastBackupSummaryJobs);
            }
        );
        tableContainer.appendChild(pagination);
    }

    // Adiciona botão de exportação para PDF após a tabela única
    addExportPdfButton(tableContainer, [table]);
}
function onBackupSummaryFilterChange() {
    const search = document.getElementById('backup-summary-search')?.value || '';
    const status = document.getElementById('backup-summary-status')?.value || '';
    const dateStart = document.getElementById('backup-summary-date-start')?.value || '';
    const dateEnd = document.getElementById('backup-summary-date-end')?.value || '';
    const filtered = filterBackupJobs(lastBackupSummaryJobs, search, status, dateStart, dateEnd);
    const tableContainer = document.getElementById('backup-summary-table');
    tableContainer.innerHTML = '';

    // Resetar páginas ao filtrar
    window._backupSummaryTablePages = {};

    if (!filtered || filtered.length === 0) {
        tableContainer.innerHTML = `
            <div class="p-4 text-center text-gray-500">
                Nenhum dado de backup encontrado para o filtro aplicado.
            </div>
        `;
        return;
    }

    // Todos os itens em uma única tabela, ordenados por data decrescente
    const sortedItems = [...filtered].sort((a, b) => {
        let aDate = '', bDate = '';
        let aTime = '', bTime = '';
        if (a.email_id && Array.isArray(filteredEmails)) {
            const emailA = filteredEmails.find(e => e.id === a.email_id);
            aDate = emailA && emailA.date ? emailA.date : '';
            aTime = a.start_time || (emailA && emailA.sent_time ? emailA.sent_time : '');
        }
        if (b.email_id && Array.isArray(filteredEmails)) {
            const emailB = filteredEmails.find(e => e.id === b.email_id);
            bDate = emailB && emailB.date ? emailB.date : '';
            bTime = b.start_time || (emailB && emailB.sent_time ? emailB.sent_time : '');
        }
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        if (bDate !== aDate) return bDate.localeCompare(aDate);
        if (aTime && bTime) {
            const normA = aTime.split(' ')[1] || aTime.split('T')[1] || aTime;
            const normB = bTime.split(' ')[1] || bTime.split('T')[1] || bTime;
            return (normB || '').localeCompare(normA || '');
        }
        return 0;
    });

    // Paginação
    const PAGE_SIZE = 10;
    if (!window._backupSummaryTablePages) window._backupSummaryTablePages = {};
    // Mantém a página atual se já existir, senão começa em 1
    if (typeof window._backupSummaryTablePages['FILTERED'] !== 'number') window._backupSummaryTablePages['FILTERED'] = 1;
    const currentPage = window._backupSummaryTablePages['FILTERED'];
    const totalPages = Math.ceil(sortedItems.length / PAGE_SIZE);
    // Garante que currentPage nunca ultrapasse o total de páginas
    const safePage = Math.max(1, Math.min(currentPage, totalPages || 1));
    window._backupSummaryTablePages['FILTERED'] = safePage;
    const paginatedItems = sortedItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    // Tabela única para todos os itens filtrados
    const table = document.createElement('table');
    table.className = 'min-w-full mb-4 rounded-xl overflow-hidden shadow-sm bg-white border border-gray-100';
    table.innerHTML = `
        <thead class="bg-gray-50">
            <tr>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100">
                    <i class="fa-solid fa-desktop mr-1 text-gray-700"></i> Dispositivo
                </th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100">
                    <i class="fa-solid fa-calendar-day mr-1 text-gray-700"></i> Data
                </th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100">
                    <i class="fa-solid fa-clock mr-1 text-gray-700"></i> Hora
                </th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100">
                    <i class="fa-solid fa-circle-check mr-1 text-gray-700"></i> Status
                </th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100">
                    <i class="fa-solid fa-database mr-1 text-gray-700"></i> Total Size
                </th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-gray-100">
                    <i class="fa-solid fa-hourglass-half mr-1 text-gray-700"></i> Duração
                </th>
            </tr>
        </thead>
        <tbody>
            ${paginatedItems.map((item, idx) => {
                // Buscar status e data da tabela emails (email relacionado)
                let email = null;
                if (item.email_id && Array.isArray(filteredEmails)) {
                    email = filteredEmails.find(e => e.id === item.email_id);
                }
                // Data do e-mail
                let data = email && email.date ? formatSimpleDate(email.date) : '-';
                // Status do e-mail
                let statusEmail = email && typeof email.is_processed !== 'undefined'
                    ? (email.is_processed ? 'Sucesso' : 'Pendente')
                    : '-';
                // Se summary_error maior do que zero, força status para "Erro"
                if (item.summary_error > 0) {
                    statusEmail = 'Falha';
                } else if (item.summary_warning > 0 || (item.status && (item.status === 'Warning' || item.status === 'warning'))) {
                    statusEmail = 'Aviso';
                } else if (item.status && (item.status === 'Success' || item.status === 'success')) {
                    statusEmail = 'Sucesso';
                }
                // Hora (mantém lógica anterior)
                let hora = '-';
                if (item.data) {
                    hora = item.data;
                } else if (item.start_time) {
                    const parts = item.start_time.split(' ');
                    hora = parts[0] || '-';
                } else if (item.created_at) {
                    hora = item.created_at.split(' ')[0];
                }
                // Total Size e Duração (padronizado)
                const totalSize = item.backup_size || '-';
                const duracao = item.duration || '-';
                // Alterna cor de fundo das linhas
                const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                // Badge de status mais moderno
                let badgeClass = '';
                if (statusEmail === 'Sucesso') badgeClass = 'bg-green-100 text-green-700 border border-green-200';
                else if (statusEmail === 'Aviso') badgeClass = 'bg-yellow-100 text-yellow-800 border border-yellow-200';
                else if (statusEmail === 'Falha') badgeClass = 'bg-red-100 text-red-700 border border-red-200';
                else if (statusEmail === 'Pendente') badgeClass = 'bg-gray-100 text-gray-700 border border-gray-200';
                else badgeClass = 'bg-gray-50 text-gray-500 border border-gray-100';
                return `
                <tr class="${rowBg} transition hover:bg-blue-100/60">
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                        <a href="#" class="text-blue-600 hover:underline" onclick="showBackupJobDetail(${item.email_id}, '${(item.job_name || item.host || '').replace(/'/g, "\\'")}'); return false;">
                            ${item.job_name || item.host || 'N/A'}
                        </a>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700">${data}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700">${hora}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm">
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${badgeClass} shadow-sm">
                            ${statusEmail}
                        </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700">${totalSize}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700">${duracao}</td>
                </tr>
                `;
            }).join('')}
        </tbody>
    `;
    tableContainer.appendChild(table);

    // Controles de paginação
    if (sortedItems.length > PAGE_SIZE) {
        const pagination = createPaginationControls(
            sortedItems.length,
            safePage,
            PAGE_SIZE,
            (newPage) => {
                window._backupSummaryTablePages['FILTERED'] = newPage;
                onBackupSummaryFilterChange();
            }
        );
        tableContainer.appendChild(pagination);
    }

    // Adiciona botão de exportação para PDF após a tabela única
    addExportPdfButton(tableContainer, [table]);
}

// Adiciona eventos de clique nos cards de resumo para filtrar
function attachSummaryCardFilters() {
    // Card Total: limpa filtro de status
    if (summaryTotal && summaryTotal.parentElement) {
        summaryTotal.parentElement.style.cursor = 'pointer';
        summaryTotal.parentElement.onclick = () => {
            const statusSelect = document.getElementById('backup-summary-status');
            if (statusSelect) {
                statusSelect.value = '';
                onBackupSummaryFilterChange();
            }
        };
    }
    // Card Sucesso
    if (summarySuccess && summarySuccess.parentElement) {
        summarySuccess.parentElement.style.cursor = 'pointer';
        summarySuccess.parentElement.onclick = () => {
            const statusSelect = document.getElementById('backup-summary-status');
            if (statusSelect) {
                statusSelect.value = 'success';
                onBackupSummaryFilterChange();
            }
        };
    }
    // Card Aviso
    if (summaryWarning && summaryWarning.parentElement) {
        summaryWarning.parentElement.style.cursor = 'pointer';
        summaryWarning.parentElement.onclick = () => {
            const statusSelect = document.getElementById('backup-summary-status');
            if (statusSelect) {
                statusSelect.value = 'warning';
                onBackupSummaryFilterChange();
            }
        };
    }
    // Card Falha
    if (summaryError && summaryError.parentElement) {
        summaryError.parentElement.style.cursor = 'pointer';
        summaryError.parentElement.onclick = () => {
            const statusSelect = document.getElementById('backup-summary-status');
            if (statusSelect) {
                statusSelect.value = 'error';
                onBackupSummaryFilterChange();
            }
        };
    }
}

// ==================== Funções de Modais ====================
async function showBackupJobDetail(emailId, jobName) {
    backupJobDetailContent.innerHTML = `
        <div class="flex justify-center items-center h-32">
            <i class="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
        </div>
    `;
    backupJobDetailModal.classList.remove('hidden');
    setTimeout(() => {
        const closeBtn = document.getElementById('close-backup-job-modal');
        if (closeBtn) {
            closeBtn.onclick = () => {
                backupJobDetailModal.classList.add('hidden');
            };
        }
    }, 0);
    try {
        // Busca jobs tradicionais e config_backups
        const [jobsResp, configResp] = await Promise.all([
            fetch(`/api/backup-jobs/by-email/${emailId}`),
            fetch(`/api/config-backups/by-email/${emailId}`)
        ]);
        const jobs = jobsResp.ok ? await jobsResp.json() : [];
        const configs = configResp.ok ? await configResp.json() : [];
        // Busca pelo nome normalizado, mas prioriza id se possível
        let job = null;
        let config = null;
        // Se jobName for id numérico, tente buscar por id
        if (!isNaN(Number(jobName))) {
            job = jobs.find(j => String(j.id) === String(jobName));
            config = configs.find(c => String(c.id) === String(jobName));
        }
        // Se não achou por id, busca por nome normalizado
        if (!job && !config) {
            job = jobs.find(j => ((j.job_name || j.host || '').trim().toLowerCase() === (jobName || '').trim().toLowerCase()));
            config = configs.find(c => (`Configuração: ${c.server}`.toLowerCase() === (jobName || '').trim().toLowerCase()));
        }
        if (job) {
            // ...exibe detalhes do job tradicional (como já faz)...
            backupJobDetailContent.innerHTML = `
                <h4 class="text-lg font-semibold mb-2">Detalhes do Job: ${job.job_name || job.host}</h4>
                <div class="bg-gray-50 p-4 rounded-lg mb-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <p class="text-sm text-gray-500">Nome do Job</p>
                            <p class="font-medium">${job.job_name || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Usuário que Criou</p>
                            <p class="font-medium">${job.created_by || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Data de Criação</p>
                            <p class="font-medium">${job.created_at || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">VMs Processadas</p>
                            <p class="font-medium">${job.processed_vms || '-'} de ${job.processed_vms_total || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Backups com Sucesso</p>
                            <p class="font-medium">${job.summary_success || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Backups com Aviso</p>
                            <p class="font-medium">${job.summary_warning || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Backups com Falha</p>
                            <p class="font-medium">${job.summary_error || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Início do Job</p>
                            <p class="font-medium">${job.start_time || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Fim do Job</p>
                            <p class="font-medium">${job.end_time || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Duração Total</p>
                            <p class="font-medium">${job.duration || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Tamanho Total do Backup</p>
                            <p class="font-medium">${job.total_size || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Tamanho do Backup Gerado</p>
                            <p class="font-medium">${job.backup_size || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Dados Lidos</p>
                            <p class="font-medium">${job.data_read || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Deduplicação</p>
                            <p class="font-medium">${job.dedupe || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Dados Transferidos</p>
                            <p class="font-medium">${job.transferred || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Compressão</p>
                            <p class="font-medium">${job.compression || '-'}</p>
                        </div>
                    </div>
                </div>
            `;
            // ...pode adicionar detalhes de VMs se desejar...
            return;
        }
        if (config) {
            // Exibe detalhes do backup de configuração
            // Busca catálogos
            // let catalogs = [];
            // try {
            //     const resp = await fetch(`/api/config-catalogs/by-config/${config.id}`);
            //     catalogs = resp.ok ? await resp.json() : [];
            // } catch {}
            backupJobDetailContent.innerHTML = `
                <h4 class="text-lg font-semibold mb-2">Backup de Configuração: ${config.server}</h4>
                <div class="bg-gray-50 p-4 rounded-lg mb-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <p class="text-sm text-gray-500">Servidor</p>
                            <p class="font-medium">${config.server || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Repositório</p>
                            <p class="font-medium">${config.repository || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Status</p>
                            <p class="font-medium">${config.status || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Catálogos Processados</p>
                            <p class="font-medium">${config.catalogs_processed || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Data do Backup</p>
                            <p class="font-medium">${config.backup_date || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Início</p>
                            <p class="font-medium">${config.start_time || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Fim</p>
                            <p class="font-medium">${config.end_time || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Data Size</p>
                            <p class="font-medium">${config.data_size || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Backup Size</p>
                            <p class="font-medium">${config.backup_size || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Duração</p>
                            <p class="font-medium">${config.duration || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Compressão</p>
                            <p class="font-medium">${config.compression || '-'}</p>
                        </div>
                        <div class="md:col-span-2">
                            <p class="text-sm text-gray-500">Avisos</p>
                            <p class="font-medium">${config.warnings || '-'}</p>
                        </div>
                    </div>
                </div>
            `;
            return;
        }
        backupJobDetailContent.innerHTML = `<div class="p-4 text-center text-gray-500">Job não encontrado.</div>`;
    } catch (error) {
        backupJobDetailContent.innerHTML = `
            <div class="bg-red-50 border-l-4 border-red-400 p-4">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <i class="fas fa-exclamation-circle text-red-400"></i>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm text-red-700">
                            Erro ao carregar detalhes do backup_job. Tente novamente.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
}
async function showEmailDetail(emailId) {
    try {
        emailDetailContent.innerHTML = `
            <div class="flex justify-center items-center h-32">
                <i class="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
            </div>
        `;
        emailDetailModal.classList.remove('hidden');

        const [emailResponse, dataResponse, jobsResponse] = await Promise.all([
            fetch(`/api/emails/${emailId}`),
            fetchEmailDetails(emailId),
            fetch(`/api/backup-jobs/by-email/${emailId}`)
        ]);
        if (!emailResponse.ok) throw new Error('Erro ao carregar e-mail');
        const email = await emailResponse.json();
        const jobs = jobsResponse.ok ? await jobsResponse.json() : [];

        let vms = [];
        if (jobs.length > 0) {
            const vmsResp = await fetch(`/api/backup-vms/by-job/${jobs[0].id}`);
            vms = vmsResp.ok ? await vmsResp.json() : [];
        }

        emailDetailContent.innerHTML = `
            <div class="mb-6">
                <h4 class="text-lg font-semibold mb-2">Informações do E-mail</h4>
                <div class="bg-gray-50 p-4 rounded-lg">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <p class="text-sm text-gray-500">ID</p>
                            <p class="font-medium">${email.id}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Assunto</p>
                            <p class="font-medium">${email.subject || 'Sem assunto'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Data/Hora</p>
                            <p class="font-medium">${formatDate(email.date + 'T' + email.sent_time)}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Status</p>
                            <p class="font-medium">${email.is_processed ? 'Processado' : 'Pendente'}</p>
                        </div>
                        ${email.processed_date ? `
                        <div>
                            <p class="text-sm text-gray-500">Processado em</p>
                            <p class="font-medium">${formatDate(email.processed_date)}</p>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
            <div class="mb-6">
                <h4 class="text-lg font-semibold mb-2">Dados do Backup</h4>
                ${dataResponse.length > 0 ? `
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Host</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${dataResponse.map(item => `
                            <tr>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${item.host}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.ip || 'N/A'}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    <span class="px-2 py-1 text-xs rounded-full ${
                                        item.status === 'Success' ? 'bg-green-100 text-green-800' :
                                        item.status === 'Warning' ? 'bg-yellow-100 text-yellow-800' :
                                        'bg-red-100 text-red-800'
                                    }">
                                        ${item.status}
                                    </span>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatSimpleDate(item.date)}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ` : `
                <div class="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
                    Nenhum dado de backup encontrado para este e-mail
                </div>
                `}
            </div>
            ${jobs.length > 0 ? `
            <div class="mb-6">
                <h4 class="text-lg font-semibold mb-2">Resumo do Job</h4>
                <div class="bg-gray-50 p-4 rounded-lg mb-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <p class="text-sm text-gray-500">Job</p>
                            <p class="font-medium">${jobs[0].job_name || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Criado por</p>
                            <p class="font-medium">${jobs[0].created_by || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Criado em</p>
                            <p class="font-medium">${jobs[0].created_at || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">VMs processadas</p>
                            <p class="font-medium">${jobs[0].processed_vms || '-'} de ${jobs[0].processed_vms_total || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Success</p>
                            <p class="font-medium">${jobs[0].summary_success || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Warning</p>
                            <p class="font-medium">${jobs[0].summary_warning || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Error</p>
                            <p class="font-medium">${jobs[0].summary_error || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Início</p>
                            <p class="font-medium">${jobs[0].start_time || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Fim</p>
                            <p class="font-medium">${jobs[0].end_time || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Duração</p>
                            <p class="font-medium">${jobs[0].duration || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Total Size</p>
                            <p class="font-medium">${jobs[0].total_size || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Backup Size</p>
                            <p class="font-medium">${jobs[0].backup_size || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Data Read</p>
                            <p class="font-medium">${jobs[0].data_read || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Dedupe</p>
                            <p class="font-medium">${jobs[0].dedupe || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Transferred</p>
                            <p class="font-medium">${jobs[0].transferred || '-'}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-500">Compression</p>
                            <p class="font-medium">${jobs[0].compression || '-'}</p>
                        </div>
                    </div>
                </div>
                <h4 class="text-lg font-semibold mb-2">VMs do Job</h4>
                ${vms.length > 0 ? `
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Início</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fim</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tamanho</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lido</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Transferido</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duração</th>
                                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Detalhes</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${vms.map(vm => `
                            <tr>
                                <td class="px-4 py-2">${vm.name}</td>
                                <td class="px-4 py-2">${vm.status}</td>
                                <td class="px-4 py-2">${vm.start_time}</td>
                                <td class="px-4 py-2">${vm.end_time}</td>
                                <td class="px-4 py-2">${vm.size}</td>
                                <td class="px-4 py-2">${vm.read}</td>
                                <td class="px-4 py-2">${vm.transferred}</td>
                                <td class="px-4 py-2">${vm.duration}</td>
                                <td class="px-4 py-2">${vm.details}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ` : `
                <div class="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
                    Nenhuma VM encontrada para este job
                </div>
                `}
            </div>
            ` : ''}
        `;
    } catch (error) {
        console.error('Erro:', error);
        emailDetailContent.innerHTML = `
            <div class="bg-red-50 border-l-4 border-red-400 p-4">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <i class="fas fa-exclamation-circle text-red-400"></i>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm text-red-700">
                            Erro ao carregar detalhes do e-mail. Tente novamente.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
}

// ==================== Dashboard ====================

// ==================== Eventos Globais ====================
window.showEmailDetail = showEmailDetail;
window.showBackupJobDetail = showBackupJobDetail;

document.addEventListener('DOMContentLoaded', () => {
    fetchEmails();
    // Garante que o filtro será renderizado ao carregar a página
    setTimeout(() => {
        renderBackupSummaryFilter();
        attachSummaryCardFilters();
    }, 500);
});