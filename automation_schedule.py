import subprocess
import schedule
import time
import logging
from datetime import datetime
import os
import signal

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('automation.log'),
        logging.StreamHandler()
    ]
)

# Variáveis globais para controle dos processos
flask_process = None
email_processor_script = 'email_processor_db.py'  # Arquivo do código 01
flask_app_script = 'app.py'              # Arquivo do código 02

def run_email_processor():
    """Executa o script de processamento de e-mails"""
    try:
        logging.info("Iniciando processamento de e-mails...")
        result = subprocess.run(
            ['python', email_processor_script],
            check=True,
            capture_output=True,
            text=True
        )
        logging.info(f"Processamento concluído:\n{result.stdout}")
        return True
    except subprocess.CalledProcessError as e:
        logging.error(f"Falha no processamento:\n{e.stderr}")
        return False

def start_flask_server():
    """Inicia o servidor Flask em um processo separado"""
    global flask_process
    try:
        logging.info("Iniciando servidor Flask...")
        flask_process = subprocess.Popen(
            ['python', flask_app_script],
            stdout=subprocess.DEVNULL,  # Evita travamento por buffer cheio
            stderr=subprocess.DEVNULL,
            text=True
        )
        logging.info(f"Servidor Flask iniciado (PID: {flask_process.pid})")
        return True
    except Exception as e:
        logging.error(f"Falha ao iniciar servidor Flask: {str(e)}")
        return False

def restart_flask_server():
    """Reinicia o servidor Flask"""
    global flask_process
    try:
        # Encerra o processo existente
        if flask_process and flask_process.poll() is None:
            logging.info(f"Encerrando servidor Flask (PID: {flask_process.pid})...")
            os.kill(flask_process.pid, signal.SIGTERM)
            flask_process.wait(timeout=10)
        
        # Inicia novo processo
        return start_flask_server()
    except Exception as e:
        logging.error(f"Falha ao reiniciar servidor Flask: {str(e)}")
        return False

def daily_task():
    """Tarefa diária para atualizar dados e reiniciar o servidor"""
    logging.info("Executando tarefa diária programada")
    
    # 1. Atualiza os e-mails
    if not run_email_processor():
        logging.error("Continuando apesar do erro no processamento")
    
    # 2. Reinicia o Flask para garantir que os novos dados estejam disponíveis
    if not restart_flask_server():
        logging.error("Falha ao reiniciar o servidor Flask")

def monitor_processes():
    """Verifica periodicamente se o Flask está rodando"""
    global flask_process
    if flask_process is None or flask_process.poll() is not None:
        logging.warning("Servidor Flask não está rodando. Reiniciando...")
        start_flask_server()

def main():
    # Executa o processamento de e-mails imediatamente ao iniciar
    run_email_processor()
    # Inicia o servidor Flask imediatamente ao iniciar
    if not start_flask_server():
        exit(1)

    # Agenda a tarefa diária às 7h
    schedule.every().day.at("07:00").do(daily_task)
    # Verificação periódica do servidor (a cada 30 minutos)
    schedule.every(30).minutes.do(monitor_processes)

    logging.info("Agendador iniciado. Tarefa diária programada para 7:00")
    
    try:
        while True:
            schedule.run_pending()
            time.sleep(60)  # Verifica a cada minuto
    except KeyboardInterrupt:
        logging.info("Encerrando agendador...")
        if flask_process:
            flask_process.terminate()
            flask_process.wait(timeout=10)  # Aguarda o término do processo

if __name__ == '__main__':
    main()