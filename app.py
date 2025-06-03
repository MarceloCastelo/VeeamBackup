from flask import Flask, jsonify, render_template, request
import sqlite3
from typing import List, Dict
from datetime import datetime

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

class EmailAPI:
    def __init__(self, db_name: str = "emails.db"):
        self.db_name = db_name
    
    def _execute_query(self, query: str, params: tuple = (), fetch_all: bool = True) -> List[Dict]:
        with sqlite3.connect(self.db_name) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall() if fetch_all else [cursor.fetchone()]
            return [dict(row) for row in rows if row]

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


# Inicializa a API
email_api = EmailAPI(db_name="veeam_emails.db")


# 📩 Rotas para tabela emails
@app.route('/api/emails/', methods=['GET'])
def get_all_emails():
    emails = email_api.get_all_emails()
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


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
