# Monitoramento de Backups Veeam

Este projeto é uma solução web para monitoramento automatizado dos backups realizados pelo Veeam Backup & Replication. Ele coleta informações dos e-mails enviados pelo Veeam, armazena em um banco de dados SQLite e apresenta dashboards e relatórios acessíveis via interface web.

## Funcionalidades

- **Coleta automática de e-mails** do Veeam via IMAP.
- **Processamento e extração** de dados de jobs, VMs e backups de configuração.
- **Armazenamento estruturado** em banco SQLite.
- **Dashboard web** com filtros, resumo de status, detalhes de jobs e exportação para PDF.
- **API RESTful** para consulta dos dados.
- **Execução agendada** para processamento automático.

## Estrutura do Projeto

```
.
├── app.py                # Inicialização do Flask e integração com processamento de e-mails
├── api/                  # Lógica de API REST (email_api.py)
├── backup/               # Scripts de processamento e testes
├── database/             # Banco de dados SQLite e lógica de acesso
├── routes/               # Rotas Flask para API
├── static/               # Arquivos estáticos (JS, imagens)
├── templates/            # Templates HTML (index.html)
├── utils/                # Utilitários de parsing e processamento de e-mails
├── requirements.txt      # Dependências Python
├── .env                  # Variáveis de ambiente (credenciais)
└── README.md             # Este arquivo
```

## Como executar

1. **Clone o repositório** e instale as dependências:
   ```sh
   pip install -r requirements.txt
   ```

2. **Configure as variáveis de ambiente** no arquivo `.env`:
   ```
   EMAIL_USER=seu_email@dominio.com
   EMAIL_PASSWORD=sua_senha
   EMAIL_TARGET_SENDER=remetente@veeam.com
   ```

3. **Execute a aplicação**:
   ```sh
   python app.py
   ```

4. **Acesse o dashboard** em [http://localhost:5000](http://localhost:5000)

## Agendamento

O processamento de e-mails é feito automaticamente a cada 5 minutos por uma thread em background. Também é possível rodar manualmente scripts em `backup/` para testes.

## API

A API REST está disponível sob o prefixo `/api/`. Exemplos de endpoints:

- `/api/emails/` — Lista todos os e-mails processados
- `/api/backup-jobs/` — Lista todos os jobs de backup
- `/api/backup-vms/` — Lista todas as VMs de backup
- `/api/config-backups/` — Lista backups de configuração

## Tecnologias

- Python 3
- Flask
- SQLite
- JavaScript (frontend)
- Tailwind CSS (frontend)

## Licença

Projeto de uso interno ADTSA.

Desenvolvido por Marcelo Castelo.
