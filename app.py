from flask import Flask, render_template
import threading
import time

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

# Importa as rotas do módulo routes/email_routes.py
from routes.email_routes import *

# --- Integração com verificação de e-mails ---
from utils.email_processor import EmailProcessor

def email_checker():
    processor = EmailProcessor(
        email="veeam.adtsa@adtsa.com.br",
        password="adt@curado1932",
        target_sender="veeam.adtsa@gmail.com"
    )
    while True:
        processor.fetch_and_process()
        time.sleep(300)  # Verifica a cada 5 minutos

if __name__ == '__main__':
    threading.Thread(target=email_checker, daemon=True).start()
    app.run(host='0.0.0.0', port=5000, debug=True)
