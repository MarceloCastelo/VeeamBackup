from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

# Importa as rotas do módulo routes/email_routes.py
from routes.email_routes import *

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
