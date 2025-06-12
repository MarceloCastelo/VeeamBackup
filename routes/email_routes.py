from flask import jsonify, request
from datetime import datetime
import sqlite3
import os
from api.email_api import EmailAPI
from app import app

# Define o caminho absoluto do banco de dados na pasta database
db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'database', 'veeam_emails.db')
db_path = os.path.abspath(db_path)
email_api = EmailAPI(db_name=db_path)

# 📩 Rotas para tabela emails
@app.route('/api/emails/', methods=['GET'])
def get_all_emails():
    emails = email_api.get_all_emails()
    # Remove duplicatas por id
    unique_emails = {email['id']: email for email in emails}.values()
    for email in unique_emails:
        jobs = email_api.get_backup_jobs_by_email(email['id'])
        # Remove duplicatas de jobs por id
        jobs = {job['id']: job for job in jobs}.values()
        for job in jobs:
            if 'start_time' in job and job['start_time']:
                parts = job['start_time'].split(' ')
                job['data'] = parts[0] if len(parts) > 0 else ''
                job['hora'] = parts[1][:5] if len(parts) > 1 else ''
            else:
                job['data'] = ''
                job['hora'] = ''
        email['backup_jobs'] = list(jobs)
    return jsonify(list(unique_emails))

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
    # Remove duplicatas por id
    unique_jobs = {job['id']: job for job in jobs}.values()
    return jsonify(list(unique_jobs))

@app.route('/api/backup-jobs/errors', methods=['GET'])
def get_backup_jobs_with_errors():
    with sqlite3.connect(email_api.db_name) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM backup_jobs WHERE summary_error = 1")
        rows = cursor.fetchall()
        jobs = [dict(row) for row in rows]
    # Remove duplicatas por id
    unique_jobs = {job['id']: job for job in jobs}.values()
    return jsonify(list(unique_jobs))

@app.route('/api/backup-jobs/<int:job_id>', methods=['GET'])
def get_backup_job(job_id):
    job = email_api.get_backup_job(job_id)
    if not job:
        return jsonify({"error": "Job não encontrado"}), 404
    return jsonify(job[0])

@app.route('/api/backup-jobs/by-email/<int:email_id>', methods=['GET'])
def get_backup_jobs_by_email(email_id):
    jobs = email_api.get_backup_jobs_by_email(email_id)
    # Remove duplicatas por id
    unique_jobs = {job['id']: job for job in jobs}.values()
    return jsonify(list(unique_jobs))

@app.route('/api/backup-jobs/errors/by-email/<int:email_id>', methods=['GET'])
def get_backup_jobs_with_errors_by_email(email_id):
    with sqlite3.connect(email_api.db_name) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM backup_jobs WHERE summary_error = 1 AND email_id = ?", (email_id,))
        rows = cursor.fetchall()
        jobs = [dict(row) for row in rows]
    # Remove duplicatas por id
    unique_jobs = {job['id']: job for job in jobs}.values()
    return jsonify(list(unique_jobs))

# 🖥️ Rotas para backup_vms
@app.route('/api/backup-vms/', methods=['GET'])
def get_all_vms():
    vms = email_api.get_all_vms()
    # Remove duplicatas por id
    unique_vms = {vm['id']: vm for vm in vms}.values()
    return jsonify(list(unique_vms))

@app.route('/api/backup-vms/by-job/<int:job_id>', methods=['GET'])
def get_vms_by_job(job_id):
    vms = email_api.get_vms_by_job(job_id)
    # Remove duplicatas por id
    unique_vms = {vm['id']: vm for vm in vms}.values()
    return jsonify(list(unique_vms))

# 🔧 Rotas para config_backups
@app.route('/api/config-backups/', methods=['GET'])
def get_all_config_backups():
    backups = email_api.get_all_config_backups()
    # Remove duplicatas por id
    unique_backups = {b['id']: b for b in backups}.values()
    return jsonify(list(unique_backups))

@app.route('/api/config-backups/<int:config_id>', methods=['GET'])
def get_config_backup(config_id):
    backup = email_api.get_config_backup(config_id)
    if not backup:
        return jsonify({"error": "Config backup não encontrado"}), 404
    return jsonify(backup[0])

@app.route('/api/config-backups/by-email/<int:email_id>', methods=['GET'])
def get_config_backups_by_email(email_id):
    backups = email_api.get_config_backups_by_email(email_id)
    # Remove duplicatas por id
    unique_backups = {b['id']: b for b in backups}.values()
    return jsonify(list(unique_backups))

# 🔧 Rotas para config_catalogs
@app.route('/api/config-catalogs/', methods=['GET'])
def get_all_config_catalogs():
    catalogs = email_api.get_all_config_catalogs()
    # Remove duplicatas por id
    unique_catalogs = {c['id']: c for c in catalogs}.values()
    return jsonify(list(unique_catalogs))

@app.route('/api/config-catalogs/by-config/<int:config_id>', methods=['GET'])
def get_catalogs_by_config(config_id):
    catalogs = email_api.get_catalogs_by_config(config_id)
    # Remove duplicatas por id
    unique_catalogs = {c['id']: c for c in catalogs}.values()
    return jsonify(list(unique_catalogs))
