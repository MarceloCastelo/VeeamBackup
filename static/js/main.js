 // Variáveis globais
        let currentPage = 1;
        const itemsPerPage = 5;
        let allEmails = [];
        let filteredEmails = [];
        let statusChart = null;

        // Elementos DOM
        const emailsTableBody = document.getElementById('emails-table-body');
        const totalEmailsSpan = document.getElementById('total-emails');
        const processedEmailsSpan = document.getElementById('processed-emails');
        const pendingEmailsSpan = document.getElementById('pending-emails');
        // Adicionado para erros:
        const errorEmailsSpan = document.getElementById('error-emails');
        const showingCountSpan = document.getElementById('showing-count');
        const totalCountSpan = document.getElementById('total-count');
        const prevPageBtn = document.getElementById('prev-page');
        const nextPageBtn = document.getElementById('next-page');
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
        // Elemento do filtro de data dos backups recentes
        const recentBackupsDateInput = document.getElementById('recent-backups-date');
        let recentBackupsSelectedDate = null;
        // Variável para armazenar a data filtrada
        let backupSummarySelectedDate = null;

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
                renderEmailsTable();
                updateChart();
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
            // Contadores por status baseados na tabela emails (não nos jobs)
            let success = 0, warning = 0, error = 0;
            emailsForSummary.forEach(email => {
                // Verifica se algum backup_job desse email tem "Retry" no nome
                const hasRetry = (email.backup_jobs || []).some(job =>
                    ((job.job_name || job.host || '').toLowerCase().includes('retry'))
                );
                if (hasRetry) {
                    warning++;
                } else if (email.is_processed === 1 || email.is_processed === true) {
                    success++;
                } else if (email.is_processed === 0 || email.is_processed === false) {
                    warning++;
                } else {
                    error++;
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
                infoText = `Atenção: ${error} backup(s) com status desconhecido.`;
            } else if (warning > 0) {
                infoText = `Aviso: ${warning} Backups foram concluídos, porém, com problemas. Verifique os detalhes.`;
            } else {
                infoText = 'Todos os backups foram processados com sucesso!';
            }
            backupSummaryInfo.textContent = infoText;

            // Atualizar tabela de resumo (mantém jobs)
            updateBackupSummaryTable(
                emailsForSummary.flatMap(email => email.backup_jobs || [])
            );
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
                const status = item.status ? (item.status.charAt(0).toUpperCase() + item.status.slice(1).toLowerCase()) : 'Máquinas virtuais';
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
                            // Se o nome do job ou host contém "Retry", força status para "Aviso"
                            const nameForRetry = (item.job_name || item.host || '').toLowerCase();
                            if (nameForRetry.includes('retry')) {
                                statusEmail = 'Aviso';
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
                            return `
                            <tr>
                                <td class="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">${item.job_name || item.host || 'N/A'}</td>
                                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${data}</td>
                                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${hora}</td>
                                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                                    <span class="px-2 py-1 text-xs rounded-full ${
                                        statusEmail === 'Processado' ? 'bg-green-100 text-green-800' :
                                        statusEmail === 'Pendente' ? 'bg-yellow-100 text-yellow-800' :
                                        statusEmail === 'Aviso' ? 'bg-yellow-100 text-yellow-800' :
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

        function renderEmailsTable() {
            emailsTableBody.innerHTML = '';
            
            const startIndex = (currentPage - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const emailsToShow = filteredEmails.slice(startIndex, endIndex);
            
            if (emailsToShow.length === 0) {
                emailsTableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="px-6 py-4 text-center text-gray-500">Nenhum e-mail encontrado</td>
                    </tr>
                `;
                return;
            }
            
            emailsToShow.forEach(email => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${email.id}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${email.subject || 'Sem assunto'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(email.date + 'T' + email.sent_time)}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${getStatusBadge(email.is_processed, email)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button onclick="showEmailDetail(${email.id})" class="text-blue-600 hover:text-blue-800 mr-3">
                            <i class="fas fa-eye"></i> Detalhes
                        </button>
                    </td>
                `;
                emailsTableBody.appendChild(row);
            });
            
            updatePagination();
            updateBackupSummary();
        }

        function updatePagination() {
            const totalPages = Math.ceil(filteredEmails.length / itemsPerPage);
            
            showingCountSpan.textContent = Math.min(
                currentPage * itemsPerPage, 
                filteredEmails.length
            );
            totalCountSpan.textContent = filteredEmails.length;
            
            prevPageBtn.disabled = currentPage === 1;
            nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
        }

        function updateDashboard() {
            totalEmailsSpan.textContent = allEmails.length;

            // Processados: emails que são processados e NÃO são aviso (não têm status Warning e não têm Retry)
            const processed = allEmails.filter(email => {
                // Não é warning nem retry
                const isWarning =
                    (email.status === 'Warning' || email.status === 'warning') ||
                    (Array.isArray(email.backup_jobs) && email.backup_jobs.some(job =>
                        ((job.job_name || job.host || '').toLowerCase().includes('retry'))
                    ));
                return (email.is_processed === 1 || email.is_processed === true) && !isWarning;
            }).length;
            processedEmailsSpan.textContent = processed;

            // Avisos: emails com status Warning OU algum backup_job com Retry
            const warning = allEmails.filter(email =>
                (email.status === 'Warning' || email.status === 'warning') ||
                (Array.isArray(email.backup_jobs) && email.backup_jobs.some(job =>
                    ((job.job_name || job.host || '').toLowerCase().includes('retry'))
                ))
            ).length;
            pendingEmailsSpan.textContent = warning;

            // Erros (mantém lógica anterior)
            let error = 0;
            allEmails.forEach(email => {
                if (
                    email.is_processed !== 1 &&
                    email.is_processed !== true &&
                    email.is_processed !== 0 &&
                    email.is_processed !== false
                ) {
                    error++;
                }
            });
            errorEmailsSpan.textContent = error;
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

        function updateChart() {
            // Gera os últimos 7 dias (incluindo hoje)
            const days = [];
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                days.push(d);
            }
            const labels = days.map(d => d.toLocaleDateString('pt-BR'));

            // Inicializa contadores por status para cada dia
            const dataByDay = labels.map(() => ({ success: 0, warning: 0, error: 0 }));

            // Para cada e-mail, aplica a mesma lógica do resumo para determinar o status
            allEmails.forEach(email => {
                // Descobre o índice do dia correspondente
                const emailDate = new Date(email.date);
                const label = emailDate.toLocaleDateString('pt-BR');
                const idx = labels.indexOf(label);
                if (idx === -1) return; // fora dos 7 dias

                // Lógica igual ao updateBackupSummary
                const hasRetry = (email.backup_jobs || []).some(job =>
                    ((job.job_name || job.host || '').toLowerCase().includes('retry'))
                );
                if (hasRetry) {
                    dataByDay[idx].warning++;
                } else if (email.is_processed === 1 || email.is_processed === true) {
                    dataByDay[idx].success++;
                } else if (email.is_processed === 0 || email.is_processed === false) {
                    dataByDay[idx].warning++;
                } else {
                    dataByDay[idx].error++;
                }
            });

            // Prepara datasets para Chart.js
            const successData = dataByDay.map(d => d.success);
            const warningData = dataByDay.map(d => d.warning);
            const errorData = dataByDay.map(d => d.error);

            if (statusChart) {
                statusChart.destroy();
            }

            statusChart = new Chart(statusChartCanvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Sucesso',
                            data: successData,
                            backgroundColor: '#10B981',
                            stack: 'Status'
                        },
                        {
                            label: 'Aviso',
                            data: warningData,
                            backgroundColor: '#F59E0B',
                            stack: 'Status'
                        },
                        {
                            label: 'Erro',
                            data: errorData,
                            backgroundColor: '#EF4444',
                            stack: 'Status'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        x: { stacked: true },
                        y: {
                            stacked: true,
                            beginAtZero: true,
                            ticks: { precision: 0 }
                        }
                    }
                }
            });
        }

        function filterBySubject(subject) {
            const search = subject.trim().toLowerCase();
            if (!search) {
                filteredEmails = [...allEmails];
            } else {
                filteredEmails = allEmails.filter(email =>
                    (email.subject || '').toLowerCase().includes(search)
                );
            }
            currentPage = 1;
            renderEmailsTable();
        }

        // Função para filtrar por data em backups recentes
        function filterEmailsByRecentDate() {
            if (!recentBackupsSelectedDate) {
                filteredEmails = [...allEmails];
            } else {
                filteredEmails = allEmails.filter(email => {
                    if (!email.date) return false;
                    const emailDate = new Date(email.date).toISOString().slice(0, 10);
                    return emailDate === recentBackupsSelectedDate;
                });
            }
            currentPage = 1;
            renderEmailsTable();
        }

        // Event Listeners
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderEmailsTable();
            }
        });

        nextPageBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(filteredEmails.length / itemsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                renderEmailsTable();
            }
        });

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
            // Define valor padrão do filtro de data dos backups recentes como vazio (mostrar todos)
            recentBackupsDateInput.value = '';
            recentBackupsSelectedDate = null;
            // Carregar dados
            fetchEmails();
        });

        // Event listener para filtro de data do resumo dos backups
        backupSummaryDateInput.addEventListener('change', (e) => {
            backupSummarySelectedDate = e.target.value;
            updateBackupSummary();
        });

        // Event listener para filtro de data dos backups recentes
        recentBackupsDateInput.addEventListener('change', (e) => {
            recentBackupsSelectedDate = e.target.value;
            filterEmailsByRecentDate();
        });

        // Funções globais para acesso no HTML
        window.showEmailDetail = showEmailDetail;

        // Event Listener para pesquisa por assunto
        searchSubjectInput.addEventListener('input', (e) => {
            filterBySubject(e.target.value);
        });