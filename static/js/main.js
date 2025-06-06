// Variáveis globais
        let allEmails = [];
        let filteredEmails = [];
        let statusChart = null;

        // Elementos DOM
        const totalEmailsSpan = document.getElementById('total-emails');
        const processedEmailsSpan = document.getElementById('processed-emails');
        const pendingEmailsSpan = document.getElementById('pending-emails');
        // Adicionado para erros:
        const errorEmailsSpan = document.getElementById('error-emails');
        const refreshBtn = document.getElementById('refresh-btn');
        const currentDateSpan = document.getElementById('current-date');
        const emailDetailModal = document.getElementById('email-detail-modal');
        const closeModalBtn = document.getElementById('close-modal');
        const emailDetailContent = document.getElementById('email-detail-content');
        const statusChartCanvas = document.getElementById('status-chart');

        // Elementos DOM para o resumo dos backups
        const summarySuccess = document.getElementById('summary-success');
        const summaryWarning = document.getElementById('summary-warning');
        const summaryError = document.getElementById('summary-error');
        const backupSummaryInfo = document.getElementById('backup-summary-info');
        // Elemento do filtro de data
        const backupSummaryDateInput = document.getElementById('backup-summary-date');
        // Variável para armazenar a data filtrada
        let backupSummarySelectedDate = null;

        // Adiciona modal para detalhes do backup_job
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
        // Remover o antigo event listener e adicionar um novo após cada abertura do modal
        function attachCloseBackupJobModalBtn() {
            closeBackupJobModalBtn = document.getElementById('close-backup-job-modal');
            if (closeBackupJobModalBtn) {
                closeBackupJobModalBtn.onclick = () => {
                    backupJobDetailModal.classList.add('hidden');
                };
            }
        }
        attachCloseBackupJobModalBtn();

        // Funções
        function formatDate(dateString) {
            const date = new Date(dateString);
            return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR').slice(0, 5);
        }

        function formatSimpleDate(dateString) {
            const date = new Date(dateString);
            return date.toLocaleDateString('pt-BR');
        }

        function getStatusBadge(isProcessed, email) {
            // Verifica se o email tem status "Warning" ou algum backup_job com "Retry"
            let isWarning = false;
            // Checa campo status (caso exista)
            if (email && (email.status === 'Warning' || email.status === 'warning')) {
                isWarning = true;
            }
            // Checa jobs com "Retry"
            if (email && Array.isArray(email.backup_jobs)) {
                isWarning = email.backup_jobs.some(job =>
                    ((job.job_name || job.host || '').toLowerCase().includes('retry'))
                ) || isWarning;
            }
            if (isWarning) {
                return '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Aviso</span>';
            }
            if (isProcessed) {
                return '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Processado</span>';
            } else {
                return '<span class="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Pendente</span>';
            }
        }

        async function fetchEmails() {
            try {
                const response = await fetch('/api/emails/');
                if (!response.ok) throw new Error('Erro ao carregar e-mails');
                allEmails = await response.json();
                // Buscar dados de backup para cada e-mail (se não vier junto)
                // Suporte para API que já retorna backup_data junto do e-mail
                // Caso não venha, buscar manualmente
                const needsBackupData = allEmails.some(email => !email.backup_data);
                if (needsBackupData) {
                    await Promise.all(allEmails.map(async (email) => {
                        try {
                            const resp = await fetch(`/api/email-data/by-email/${email.id}`);
                            if (resp.ok) {
                                email.backup_data = await resp.json();
                            } else {
                                email.backup_data = [];
                            }
                        } catch {
                            email.backup_data = [];
                        }
                    }));
                }
                filteredEmails = [...allEmails];
                updateDashboard();
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

        // Função para filtrar os emails por data para o resumo dos backups
        function getFilteredEmailsBySummaryDate() {
            if (!backupSummarySelectedDate) return allEmails;
            // backupSummarySelectedDate está em formato 'YYYY-MM-DD'
            return allEmails.filter(email => {
                if (!email.date) return false;
                const emailDate = new Date(email.date).toISOString().slice(0, 10);
                return emailDate === backupSummarySelectedDate;
            });
        }

        // Função para atualizar o resumo dos backups
        function updateBackupSummary() {
            // Usa os emails filtrados pela data selecionada do resumo (NÃO usa filteredEmails)
            const emailsForSummary = getFilteredEmailsBySummaryDate();
            // Contadores por status baseados nos jobs (não só na tabela emails)
            let success = 0, warning = 0, error = 0;
            const allJobs = emailsForSummary.flatMap(email => email.backup_jobs || []);
            allJobs.forEach(job => {
                // Se Error == 1, conta como erro
                if (job.Error == 1 || job.summary_error == 1 || job.error == 1) {
                    error++;
                } else if ((job.status && (job.status === 'Warning' || job.status === 'warning'))) {
                    warning++;
                // Removido: lógica de retry como warning
                // } else if ((job.status && (job.status === 'Warning' || job.status === 'warning')) ||
                //     ((job.job_name || job.host || '').toLowerCase().includes('retry'))) {
                //     warning++;
                } else if (job.status && (job.status === 'Success' || job.status === 'success')) {
                    success++;
                } else {
                    // Se não tem status, tenta usar o status do e-mail
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

            // Texto informativo
            let infoText = '';
            if (success + warning + error === 0) {
                infoText = 'Nenhum dado de backup encontrado para os dispositivos no período selecionado.';
            } else if (error > 0) {
                infoText = `Atenção: ${error} backup(s) com erro.`;
            } else if (warning > 0) {
                infoText = `Aviso: ${warning} Backups foram concluídos, porém, com problemas. Verifique os detalhes.`;
            } else {
                infoText = 'Todos os backups foram processados com sucesso!';
            }
            backupSummaryInfo.textContent = infoText;

            // Atualizar tabela de resumo (mantém jobs)
            updateBackupSummaryTable(allJobs);
        }

        // Função para mostrar detalhes do backup_job
        async function showBackupJobDetail(emailId, jobName) {
            backupJobDetailContent.innerHTML = `
                <div class="flex justify-center items-center h-32">
                    <i class="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
                </div>
            `;
            backupJobDetailModal.classList.remove('hidden');
            // Garante que o botão fechar funcione sempre que o modal for aberto
            setTimeout(() => {
                const closeBtn = document.getElementById('close-backup-job-modal');
                if (closeBtn) {
                    closeBtn.onclick = () => {
                        backupJobDetailModal.classList.add('hidden');
                    };
                }
            }, 0);
            try {
                // Busca jobs do e-mail
                const jobsResp = await fetch(`/api/backup-jobs/by-email/${emailId}`);
                const jobs = jobsResp.ok ? await jobsResp.json() : [];
                // Busca VMs do job selecionado
                const job = jobs.find(j => (j.job_name || j.host) === jobName);
                let vms = [];
                if (job && job.id) {
                    const vmsResp = await fetch(`/api/backup-vms/by-job/${job.id}`);
                    vms = vmsResp.ok ? await vmsResp.json() : [];
                }
                if (!job) {
                    backupJobDetailContent.innerHTML = `<div class="p-4 text-center text-gray-500">Job não encontrado.</div>`;
                    return;
                }
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
                                <p class="text-sm text-gray-500">Backups com Erro</p>
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
                    <h4 class="text-lg font-semibold mb-2">Máquinas Virtuais (VMs) do Job</h4>
                    ${vms.length > 0 ? `
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nome da VM</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status do Backup</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Início do Backup</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fim do Backup</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tamanho do Backup</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dados Lidos</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dados Transferidos</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duração</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Detalhes Adicionais</th>
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
                `;
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

        // Função para filtrar os emails por data para o resumo dos backups
        function getFilteredEmailsBySummaryDate() {
            if (!backupSummarySelectedDate) return allEmails;
            // backupSummarySelectedDate está em formato 'YYYY-MM-DD'
            return allEmails.filter(email => {
                if (!email.date) return false;
                const emailDate = new Date(email.date).toISOString().slice(0, 10);
                return emailDate === backupSummarySelectedDate;
            });
        }

        // Função para atualizar o resumo dos backups
        function updateBackupSummary() {
            // Usa os emails filtrados pela data selecionada do resumo (NÃO usa filteredEmails)
            const emailsForSummary = getFilteredEmailsBySummaryDate();
            // Contadores por status baseados nos jobs (não só na tabela emails)
            let success = 0, warning = 0, error = 0;
            const allJobs = emailsForSummary.flatMap(email => email.backup_jobs || []);
            allJobs.forEach(job => {
                // Se Error == 1, conta como erro
                if (job.Error == 1 || job.summary_error == 1 || job.error == 1) {
                    error++;
                } else if ((job.status && (job.status === 'Warning' || job.status === 'warning'))) {
                    warning++;
                // Removido: lógica de retry como warning
                // } else if ((job.status && (job.status === 'Warning' || job.status === 'warning')) ||
                //     ((job.job_name || job.host || '').toLowerCase().includes('retry'))) {
                //     warning++;
                } else if (job.status && (job.status === 'Success' || job.status === 'success')) {
                    success++;
                } else {
                    // Se não tem status, tenta usar o status do e-mail
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

            // Texto informativo
            let infoText = '';
            if (success + warning + error === 0) {
                infoText = 'Nenhum dado de backup encontrado para os dispositivos no período selecionado.';
            } else if (error > 0) {
                infoText = `Atenção: ${error} backup(s) com erro.`;
            } else if (warning > 0) {
                infoText = `Aviso: ${warning} Backups foram concluídos, porém, com problemas. Verifique os detalhes.`;
            } else {
                infoText = 'Todos os backups foram processados com sucesso!';
            }
            backupSummaryInfo.textContent = infoText;

            // Atualizar tabela de resumo (mantém jobs)
            updateBackupSummaryTable(allJobs);
        }

        function updateBackupSummaryTable(backupJobs) {
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

            // Agrupar por status
            const groupedByStatus = backupJobs.reduce((acc, item) => {
                const status = item.status ? (item.status.charAt(0).toUpperCase() + item.status.slice(1).toLowerCase()) : 'Total de dispositivos';
                if (!acc[status]) {
                    acc[status] = [];
                }
                acc[status].push(item);
                return acc;
            }, {});

            // Ordenar chaves
            const sortedStatusKeys = Object.keys(groupedByStatus).sort((a, b) => {
                const order = ['Success', 'Warning', 'Error'];
                return order.indexOf(a) - order.indexOf(b);
            });

            sortedStatusKeys.forEach(status => {
                const items = groupedByStatus[status];
                // Cabeçalho da seção
                const sectionHeader = document.createElement('div');
                sectionHeader.className = 'font-semibold text-gray-800 mt-4';
                sectionHeader.textContent = `${status} (${items.length})`;
                tableContainer.appendChild(sectionHeader);

                // Tabela para os itens
                const table = document.createElement('table');
                table.className = 'min-w-full divide-y divide-gray-200 mb-4';
                table.innerHTML = `
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Dispositivo</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hora</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total Size</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duração</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${items.map(item => {
                            // Buscar status e data da tabela emails (email relacionado)
                            // Supondo que o item tenha email_id e que filteredEmails está acessível
                            let email = null;
                            if (item.email_id && Array.isArray(filteredEmails)) {
                                email = filteredEmails.find(e => e.id === item.email_id);
                            }
                            // Data do e-mail
                            let data = email && email.date ? email.date : '-';
                            // Status do e-mail
                            let statusEmail = email && typeof email.is_processed !== 'undefined'
                                ? (email.is_processed ? 'Processado' : 'Pendente')
                                : '-';
                            // Removido: lógica de retry como aviso
                            // const nameForRetry = (item.job_name || item.host || '').toLowerCase();
                            // if (nameForRetry.includes('retry')) {
                            //     statusEmail = 'Aviso';
                            // }
                            // Se Error == 1, força status para "Erro"
                            if (item.Error == 1 || item.summary_error == 1 || item.error == 1) {
                                statusEmail = 'Erro';
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
                            // Total Size e Duração
                            const totalSize = item.total_size || item.totalSize || '-';
                            const duracao = item.duration || item.duracao || '-';
                            // Torna o nome do dispositivo clicável
                            return `
                            <tr>
                                <td class="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                                    <a href="#" class="text-blue-600 hover:underline" onclick="showBackupJobDetail(${item.email_id}, '${(item.job_name || item.host || '').replace(/'/g, "\\'")}'); return false;">
                                        ${item.job_name || item.host || 'N/A'}
                                    </a>
                                </td>
                                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${data}</td>
                                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${hora}</td>
                                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                    <span class="px-2 py-1 text-xs rounded-full ${
                                        statusEmail === 'Processado' ? 'bg-green-100 text-green-800' :
                                        statusEmail === 'Pendente' ? 'bg-yellow-100 text-yellow-800' :
                                        statusEmail === 'Aviso' ? 'bg-yellow-100 text-yellow-800' :
                                        statusEmail === 'Erro' ? 'bg-red-100 text-red-800' :
                                        'bg-gray-100 text-gray-800'
                                    }">
                                        ${statusEmail}
                                    </span>
                                </td>
                                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${totalSize}</td>
                                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${duracao}</td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                `;
                tableContainer.appendChild(table);
            });
        }

        function updateDashboard() {
            // Soma total de backup_jobs em todos os e-mails
            const allJobs = allEmails.flatMap(email => Array.isArray(email.backup_jobs) ? email.backup_jobs : []);
            const totalBackupJobs = allJobs.length;
            totalEmailsSpan.textContent = totalBackupJobs;

            // Processados: jobs com summary_success == 1
            const processed = allJobs.filter(job => job.summary_success == 1).length;
            processedEmailsSpan.textContent = processed;

            // Erros: jobs com summary_error == 1
            const error = allJobs.filter(job => job.summary_error == 1).length;
            errorEmailsSpan.textContent = error;

            // Pendentes: todos os outros jobs (não processados nem erro)
            const pending = totalBackupJobs - processed - error;
            pendingEmailsSpan.textContent = pending;
        }

        async function showEmailDetail(emailId) {
            try {
                // Mostrar loading
                emailDetailContent.innerHTML = `
                    <div class="flex justify-center items-center h-32">
                        <i class="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
                    </div>
                `;
                emailDetailModal.classList.remove('hidden');

                // Buscar detalhes do e-mail, dados antigos, jobs e VMs
                const [emailResponse, dataResponse, jobsResponse] = await Promise.all([
                    fetch(`/api/emails/${emailId}`),
                    fetchEmailDetails(emailId),
                    fetch(`/api/backup-jobs/by-email/${emailId}`)
                ]);
                if (!emailResponse.ok) throw new Error('Erro ao carregar e-mail');
                const email = await emailResponse.json();
                const jobs = jobsResponse.ok ? await jobsResponse.json() : [];

                // Buscar VMs do primeiro job (se houver)
                let vms = [];
                if (jobs.length > 0) {
                    const vmsResp = await fetch(`/api/backup-vms/by-job/${jobs[0].id}`);
                    vms = vmsResp.ok ? await vmsResp.json() : [];
                }

                // Renderizar conteúdo
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

        // Funções globais para acesso no HTML
        window.showEmailDetail = showEmailDetail;
        window.showBackupJobDetail = showBackupJobDetail;

        // Event Listeners
        refreshBtn.addEventListener('click', () => {
            fetchEmails();
        });

        closeModalBtn.addEventListener('click', () => {
            emailDetailModal.classList.add('hidden');
        });

        // Ajustar carregamento inicial para não depender dos filtros removidos
        document.addEventListener('DOMContentLoaded', () => {
            // Atualizar data atual
            const today = new Date();
            currentDateSpan.textContent = today.toLocaleDateString('pt-BR');
            // Define valor padrão do filtro de data como dia anterior
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().slice(0, 10);
            backupSummaryDateInput.value = yesterdayStr;
            backupSummarySelectedDate = yesterdayStr;
            // Carregar dados
            fetchEmails();
        });

        // Event listener para filtro de data do resumo dos backups
        backupSummaryDateInput.addEventListener('change', (e) => {
            backupSummarySelectedDate = e.target.value;
            updateBackupSummary();
        });