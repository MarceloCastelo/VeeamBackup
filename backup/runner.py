import subprocess
import schedule
import time

def run_scripts():
    # Executa o email_processor_db.py
    subprocess.run(['python', 'email_processor_db.py'], check=True)
    # Inicializa a aplicação Flask (app.py)

# Agenda para rodar todos os dias às 7h da manhã
schedule.every().day.at("07:00").do(run_scripts)

if __name__ == "__main__":
    run_scripts()  # Executa imediatamente ao iniciar
    while True:
        schedule.run_pending()
        time.sleep(60)
