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

def email_checker():
    processor = EmailProcessor(
        email=os.environ.get("EMAIL_USER"),
        password=os.environ.get("EMAIL_PASSWORD"),
        target_sender=os.environ.get("EMAIL_TARGET_SENDER")
    )
    while True:
        processor.fetch_and_process()
        time.sleep(14400)  # Verifica a cada 4 horas

if __name__ == '__main__':
    threading.Thread(target=email_checker, daemon=True).start()
    app.run(host='0.0.0.0', port=5000, debug=True)
