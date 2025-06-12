from flask import Flask, render_template
import threading
import time
import os
import datetime
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
        now = datetime.datetime.now()
        # Próximos horários: 6h e 12h
        next_times = [
            now.replace(hour=6, minute=0, second=0, microsecond=0),
            now.replace(hour=12, minute=0, second=0, microsecond=0)
        ]
        # Se já passou do horário, agenda para o próximo dia
        next_times = [t if t > now else t + datetime.timedelta(days=1) for t in next_times]
        next_run = min(next_times)
        sleep_seconds = (next_run - now).total_seconds()
        time.sleep(sleep_seconds)
        processor.fetch_and_process()

if __name__ == '__main__':
    threading.Thread(target=email_checker, daemon=True).start()
    app.run(host='0.0.0.0', port=5000, debug=True)
