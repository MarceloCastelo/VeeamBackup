from flask import Flask, jsonify, render_template, request
import sqlite3
from typing import List, Dict
from datetime import datetime

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

class EmailAPI:
    def __init__(self, db_name: str = "veeam_emails.db"):
        self.db_name = db_name
    
    def _execute_query(self, query: str, params: tuple = (), fetch_all: bool = True) -> List[Dict]:
        try:
            with sqlite3.connect(self.db_name) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(query, params)
                rows = cursor.fetchall() if fetch_all else [cursor.fetchone()]
                return [dict(row) for row in rows if row]
        except sqlite3.OperationalError as e:
            # Retorna uma lista vazia e adiciona a mensagem de erro para debug
            return [{"error": f"Erro operacional no banco de dados: {str(e)}"}]

    # 📩 Tabela emails
    def get_all_emails(self) -> List[Dict]:
        return self._execute_query('''
            SELECT id, subject, date, sent_time, processed_date, is_processed
            FROM emails
            ORDER BY date DESC, sent_time DESC
        ''')

    def get_email_metadata(self, email_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT id, subject, date, sent_time, processed_date, is_processed
            FROM emails
            WHERE id = ?
        ''', (email_id,))

    def get_email_by_date(self, date: str) -> List[Dict]:
        return self._execute_query('''
            SELECT id, subject, date, sent_time, processed_date, is_processed
            FROM emails
            WHERE date(date) = date(?)
            ORDER BY sent_time DESC
        ''', (date,))
    
    # 📊 Tabela email_data
    def get_all_email_data(self) -> List[Dict]:
        return self._execute_query('''
            SELECT email_id, host, ip, status, date
            FROM email_data
            ORDER BY date DESC, host
        ''')

    def get_email_data(self, email_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT host, ip, status, date
            FROM email_data
            WHERE email_id = ?
            ORDER BY host
        ''', (email_id,))

    def get_email_data_by_date(self, date: str) -> List[Dict]:
        return self._execute_query('''
            SELECT email_id, host, ip, status, date
            FROM email_data
            WHERE date(date) = date(?)
            ORDER BY host
        ''', (date,))

    # 📦 Tabela backup_jobs
    def get_all_backup_jobs(self) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM backup_jobs
            ORDER BY id DESC
        ''')

    def get_backup_job(self, job_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM backup_jobs WHERE id = ?
        ''', (job_id,))

    def get_backup_jobs_by_email(self, email_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM backup_jobs WHERE email_id = ?
        ''', (email_id,))

    # 🖥️ Tabela backup_vms
    def get_vms_by_job(self, job_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM backup_vms WHERE job_id = ?
        ''', (job_id,))

    def get_all_vms(self) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM backup_vms
            ORDER BY id DESC
        ''')

    # 🔧 Tabela config_backups
    def get_all_config_backups(self) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM config_backups
            ORDER BY id DESC
        ''')

    def get_config_backup(self, config_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM config_backups WHERE id = ?
        ''', (config_id,))

    def get_config_backups_by_email(self, email_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM config_backups WHERE email_id = ?
        ''', (email_id,))

    # 🔧 Tabela config_catalogs
    def get_catalogs_by_config(self, config_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM config_catalogs WHERE config_backup_id = ?
        ''', (config_id,))

    def get_all_config_catalogs(self) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM config_catalogs
            ORDER BY id DESC
        ''')


# Inicializa a API
email_api = EmailAPI(db_name="veeam_emails.db")


# 📩 Rotas para tabela emails
@app.route('/api/emails/', methods=['GET'])
def get_all_emails():
    emails = email_api.get_all_emails()
    # Para cada e-mail, anexa os backup_jobs relacionados e ajusta data/hora
    for email in emails:
        jobs = email_api.get_backup_jobs_by_email(email['id'])
        for job in jobs:
            # Se start_time existir e for no formato 'YYYY-MM-DD HH:MM:SS'
            if 'start_time' in job and job['start_time']:
                parts = job['start_time'].split(' ')
                job['data'] = parts[0] if len(parts) > 0 else ''
                job['hora'] = parts[1][:5] if len(parts) > 1 else ''
            else:
                job['data'] = ''
                job['hora'] = ''
        email['backup_jobs'] = jobs
    return jsonify(emails)

@app.route('/api/emails/<int:email_id>', methods=['GET'])
def get_email_metadata(email_id):
    email = email_api.get_email_metadata(email_id)
    if not email:
        return jsonify({"error": "Email não encontrado"}), 404
    return jsonify(email[0])

@app.route('/api/emails/by-date', methods=['GET'])
def get_emails_by_date():
    date = request.args.get('date')
    if not date:
        return jsonify({"error": "Parâmetro 'date' é obrigatório"}), 400
    try:
        datetime.strptime(date, '%Y-%m-%d')
    except ValueError:
        return jsonify({"error": "Formato de data inválido. Use YYYY-MM-DD"}), 400
    
    emails = email_api.get_email_by_date(date)
    return jsonify(emails)


# 📊 Rotas para tabela email_data
@app.route('/api/email-data/', methods=['GET'])
def get_all_email_data():
    data = email_api.get_all_email_data()
    return jsonify(data)

@app.route('/api/email-data/by-email/<int:email_id>', methods=['GET'])
def get_email_data_by_email(email_id):
    data = email_api.get_email_data(email_id)
    return jsonify(data)

@app.route('/api/email-data/by-date', methods=['GET'])
def get_email_data_by_date():
    date = request.args.get('date')
    if not date:
        return jsonify({"error": "Parâmetro 'date' é obrigatório"}), 400
    try:
        datetime.strptime(date, '%Y-%m-%d')
    except ValueError:
        return jsonify({"error": "Formato de data inválido. Use YYYY-MM-DD"}), 400
    
    data = email_api.get_email_data_by_date(date)
    return jsonify(data)


# 📦 Rotas para backup_jobs
@app.route('/api/backup-jobs/', methods=['GET'])
def get_all_backup_jobs():
    jobs = email_api.get_all_backup_jobs()
    return jsonify(jobs)

@app.route('/api/backup-jobs/errors', methods=['GET'])
def get_backup_jobs_with_errors():
    # Retorna todos os backup_jobs com summary_error = 1
    with sqlite3.connect(email_api.db_name) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM backup_jobs WHERE summary_error = 1")
        rows = cursor.fetchall()
        jobs = [dict(row) for row in rows]
    return jsonify(jobs)

@app.route('/api/backup-jobs/<int:job_id>', methods=['GET'])
def get_backup_job(job_id):
    job = email_api.get_backup_job(job_id)
    if not job:
        return jsonify({"error": "Job não encontrado"}), 404
    return jsonify(job[0])

@app.route('/api/backup-jobs/by-email/<int:email_id>', methods=['GET'])
def get_backup_jobs_by_email(email_id):
    # Esta rota retorna TODOS os jobs relacionados ao email_id informado
    jobs = email_api.get_backup_jobs_by_email(email_id)
    return jsonify(jobs)

@app.route('/api/backup-jobs/errors/by-email/<int:email_id>', methods=['GET'])
def get_backup_jobs_with_errors_by_email(email_id):
    # Retorna todos os backup_jobs com summary_error = 1 para um email_id específico
    with sqlite3.connect(email_api.db_name) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM backup_jobs WHERE summary_error = 1 AND email_id = ?", (email_id,))
        rows = cursor.fetchall()
        jobs = [dict(row) for row in rows]
    return jsonify(jobs)

# 🖥️ Rotas para backup_vms
@app.route('/api/backup-vms/', methods=['GET'])
def get_all_vms():
    vms = email_api.get_all_vms()
    return jsonify(vms)

@app.route('/api/backup-vms/by-job/<int:job_id>', methods=['GET'])
def get_vms_by_job(job_id):
    vms = email_api.get_vms_by_job(job_id)
    return jsonify(vms)


# 🔧 Rotas para config_backups
@app.route('/api/config-backups/', methods=['GET'])
def get_all_config_backups():
    backups = email_api.get_all_config_backups()
    return jsonify(backups)

@app.route('/api/config-backups/<int:config_id>', methods=['GET'])
def get_config_backup(config_id):
    backup = email_api.get_config_backup(config_id)
    if not backup:
        return jsonify({"error": "Config backup não encontrado"}), 404
    return jsonify(backup[0])

@app.route('/api/config-backups/by-email/<int:email_id>', methods=['GET'])
def get_config_backups_by_email(email_id):
    backups = email_api.get_config_backups_by_email(email_id)
    return jsonify(backups)

# 🔧 Rotas para config_catalogs
@app.route('/api/config-catalogs/', methods=['GET'])
def get_all_config_catalogs():
    catalogs = email_api.get_all_config_catalogs()
    return jsonify(catalogs)

@app.route('/api/config-catalogs/by-config/<int:config_id>', methods=['GET'])
def get_catalogs_by_config(config_id):
    catalogs = email_api.get_catalogs_by_config(config_id)
    return jsonify(catalogs)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
