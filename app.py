from flask import Flask, jsonify, render_template, request
import sqlite3
from typing import List, Dict
from datetime import datetime

app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/emails/latest', methods=['GET'])
def get_latest_email():
    """Retorna os dados do e-mail mais recente"""
    conn = sqlite3.connect("veeam_emails.db")
    cursor = conn.cursor()
    
    # Encontrar o ID do e-mail mais recente
    cursor.execute('SELECT MAX(email_id) FROM email_data')
    latest_id = cursor.fetchone()[0]
    
    if not latest_id:
        return jsonify({"error": "Nenhum e-mail encontrado"}), 404
    
    # Reutilizar a função existente para buscar os dados
    email_data = email_api.get_email_data(latest_id)
    return jsonify({
        "email_id": latest_id, 
        "data": email_data, 
        "count": len(email_data)
    })

@app.route('/api/emails/by-date', methods=['GET'])
def get_email_by_date():
    """Retorna os dados do e-mail mais recente para uma data específica"""
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({"error": "Parâmetro 'date' é obrigatório"}), 400
    
    try:
        # Converter a data para o formato do banco de dados
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({"error": "Formato de data inválido. Use YYYY-MM-DD"}), 400
    
    conn = sqlite3.connect("veeam_emails.db")
    cursor = conn.cursor()
    
    # Encontrar o ID do e-mail mais recente para a data especificada
    cursor.execute('''
        SELECT email_id, MAX(date) 
        FROM email_data 
        WHERE date(date) = date(?)
        GROUP BY email_id
        ORDER BY MAX(date) DESC
        LIMIT 1
    ''', (target_date.strftime('%Y-%m-%d'),))
    
    result = cursor.fetchone()
    if not result:
        return jsonify({"error": "Nenhum e-mail encontrado para esta data"}), 404
    
    latest_id = result[0]
    
    # Reutilizar a função existente para buscar os dados
    email_data = email_api.get_email_data(latest_id)
    return jsonify({
        "email_id": latest_id, 
        "data": email_data, 
        "count": len(email_data)
    })

class EmailAPI:
    def __init__(self, db_name: str = "emails.db"):
        self.db_name = db_name
    
    def _execute_query(self, query: str, params: tuple = (), fetch_all: bool = True) -> List[Dict]:
        """Método genérico para executar queries e retornar resultados como dicionários"""
        with sqlite3.connect(self.db_name) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(query, params)
            return [dict(row) for row in (cursor.fetchall() if fetch_all else [cursor.fetchone()])]
    
    def get_email_data(self, email_id: int) -> List[Dict]:
        """Retorna os dados extraídos de um e-mail específico"""
        return self._execute_query('''
            SELECT host, ip, status, date 
            FROM email_data 
            WHERE email_id = ?
            ORDER BY host
        ''', (email_id,))

# Inicializa a API
email_api = EmailAPI(db_name="veeam_emails.db")

@app.route('/api/emails/<int:email_id>', methods=['GET'])
def get_email_details(email_id):
    email_data = email_api.get_email_data(email_id)
    return jsonify({
        "email_id": email_id, 
        "data": email_data, 
        "count": len(email_data)
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)