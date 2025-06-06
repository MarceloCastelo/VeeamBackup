import subprocess

# Executa o email_processor_db.py
subprocess.run(['python', 'email_processor_db.py'], check=True)

# Inicializa a aplicação Flask (app.py)
subprocess.run(['python', 'app.py'], check=True)
