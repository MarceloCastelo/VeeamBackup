from flask import Flask, render_template
import threading
import time
import os
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

# Importa as rotas do módulo routes/email_routes.py
from routes.email_routes import *

# --- Integração com verificação de e-mails ---
from utils.email_processor import EmailProcessor

# Importe a classe para remoção de duplicados
from database.database_cleaner import DuplicateRemover  # ajuste o caminho conforme seu projeto

def email_checker():
    processor = EmailProcessor(
        email=os.environ.get("EMAIL_USER"),
        password=os.environ.get("EMAIL_PASSWORD"),
        target_sender=os.environ.get("EMAIL_TARGET_SENDER")
    )

    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base_dir, "database", "veeam_emails.db")
    remover = DuplicateRemover(db_path)

    while True:
        print("🧹 Limpando registros duplicados no banco...")
        remover.remove_all_duplicates()  # Faz a limpeza antes da verificação

        print("📧 Verificando novos e-mails...")
        processor.fetch_and_process()

        print("⏳ Aguardando 4 horas para próxima verificação...")
        time.sleep(14400)  # 4 horas

if __name__ == '__main__':
    threading.Thread(target=email_checker, daemon=True).start()
    app.run(host='0.0.0.0', port=5000, debug=True)
