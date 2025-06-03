import sqlite3
from typing import List, Dict, Optional, Tuple
import imaplib
import email
from email.header import decode_header
import os
import re
from datetime import datetime
import csv

class EmailProcessor:
    """Classe que processa e-mails e armazena em banco de dados SQLite"""
    
    def __init__(self, email: str, password: str, target_sender: str, db_name: str = "emails.db"):
        self.email = email
        self.password = password
        self.target_sender = target_sender
        self.output_folder = "processed_emails"
        self.db_name = db_name
        
        # Criar pasta para arquivos processados
        os.makedirs(self.output_folder, exist_ok=True)
        
        # Inicializar banco de dados
        self._init_db()
    
    def _init_db(self):
        """Inicializa o banco de dados SQLite com as tabelas necessárias"""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            
            # Tabela de e-mails (cabeçalhos)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS emails (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject TEXT,
                    date TEXT,
                    processed_date TEXT DEFAULT CURRENT_TIMESTAMP,
                    is_processed INTEGER DEFAULT 0
                )
            ''')
            
            # Tabela de dados extraídos (conteúdo tabular)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS email_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email_id INTEGER,
                    host TEXT,
                    ip TEXT,
                    status TEXT,
                    date TEXT,
                    FOREIGN KEY (email_id) REFERENCES emails (id)
                )
            ''')
            
            conn.commit()
    
    def fetch_and_process(self):
        """Fluxo completo: busca e-mails -> processa -> armazena no BD -> gera CSV"""
        emails = self._fetch_emails()
        if not emails:
            print("Nenhum e-mail novo encontrado.")
            return
        
        print(f"\n🔎 {len(emails)} e-mails encontrados. Processando...")
        
        for i, email_data in enumerate(emails, 1):
            email_id = self._store_email_in_db(email_data)
            if email_id:
                self._process_email_content(email_data, email_id, i)
    
    def _fetch_emails(self) -> List[Dict]:
        """Busca e-mails do remetente"""
        try:
            with imaplib.IMAP4_SSL("imap.skymail.net.br", 993) as mail:
                mail.login(self.email, self.password)
                mail.select("inbox")
                
                # Buscar apenas e-mails não processados (não marcados no BD)
                status, messages = mail.search(None, f'FROM "{self.target_sender}"')
                if status != "OK":
                    return []
                
                return self._process_messages(mail, messages[0].split())
        except Exception as e:
            print(f"Erro ao buscar e-mails: {e}")
            return []
    
    def _store_email_in_db(self, email_data: Dict) -> Optional[int]:
        """Armazena o e-mail no banco de dados e retorna o ID"""
        try:
            with sqlite3.connect(self.db_name) as conn:
                cursor = conn.cursor()
                
                # Verificar se o e-mail já existe (pelo assunto e data)
                cursor.execute('''
                    SELECT id FROM emails 
                    WHERE subject = ? AND date = ?
                ''', (email_data["subject"], email_data["date"]))
                
                existing = cursor.fetchone()
                if existing:
                    return None  # E-mail já processado
                
                # Inserir novo e-mail
                cursor.execute('''
                    INSERT INTO emails (subject, date)
                    VALUES (?, ?)
                ''', (email_data["subject"], email_data["date"]))
                
                email_id = cursor.lastrowid
                conn.commit()
                return email_id
        except Exception as e:
            print(f"Erro ao armazenar e-mail no BD: {e}")
            return None
    
    def _process_messages(self, mail, email_ids: List[bytes]) -> List[Dict]:
        """Processa as mensagens IMAP"""
        emails = []
        for email_id in email_ids:
            status, data = mail.fetch(email_id, "(RFC822)")
            if status == "OK":
                msg = email.message_from_bytes(data[0][1])
                emails.append({
                    "subject": self._decode_header(msg["Subject"]),
                    "date": msg["Date"],
                    "body": self._extract_body(msg)
                })
        return emails
    
    def _process_email_content(self, email_data: Dict, email_id: int, index: int):
        """Processa o conteúdo do e-mail e armazena no BD"""
        # Extração de data
        try:
            date_str = email_data["date"]
            formatted_date = datetime.strptime(date_str, '%a, %d %b %Y %H:%M:%S %z').strftime('%Y-%m-%d')
        except:
            formatted_date = datetime.now().strftime('%Y-%m-%d')
        
        # Extração da tabela
        table_data = self._extract_table_data(email_data["body"])
        if not table_data:
            print(f"⚠️ E-mail {index} não contém dados tabulares")
            return
        
        # Armazenar dados no BD
        self._store_email_data_in_db(email_id, table_data, formatted_date)
        
        # Gerar CSV (opcional)
        filename = f"report_{index}_{formatted_date}.csv"
        self._generate_csv(table_data, filename, formatted_date)
        print(f"✅ E-mail {index} processado. {len(table_data)} registros armazenados.")
        
        # Marcar e-mail como processado
        self._mark_email_as_processed(email_id)
    
    def _store_email_data_in_db(self, email_id: int, table_data: List[List[str]], date: str):
        """Armazena os dados extraídos no banco de dados"""
        try:
            with sqlite3.connect(self.db_name) as conn:
                cursor = conn.cursor()
                
                for row in table_data:
                    cursor.execute('''
                        INSERT INTO email_data (email_id, host, ip, status, date)
                        VALUES (?, ?, ?, ?, ?)
                    ''', (email_id, row[0], row[1], row[2], date))
                
                conn.commit()
        except Exception as e:
            print(f"Erro ao armazenar dados no BD: {e}")
    
    def _mark_email_as_processed(self, email_id: int):
        """Marca o e-mail como processado no banco de dados"""
        try:
            with sqlite3.connect(self.db_name) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE emails SET is_processed = 1 WHERE id = ?
                ''', (email_id,))
                conn.commit()
        except Exception as e:
            print(f"Erro ao marcar e-mail como processado: {e}")
    
    def _extract_table_data(self, body: str) -> List[List[str]]:
        """Extrai dados tabulares usando regex"""
        pattern = re.compile(
            r'^([^\s]+)\s+(\d+\.\d+\.\d+\.\d+)\s+(Success|Warning|Error)',
            re.MULTILINE
        )
        return [list(match.groups()) for match in pattern.finditer(body)]
    
    def _generate_csv(self, data: List[List[str]], filename: str, date: str):
        """Gera arquivo CSV (opcional)"""
        with open(os.path.join(self.output_folder, filename), 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['Host', 'IP', 'Status', 'Date'])
            for row in data:
                writer.writerow([*row, date])
    
    # Métodos auxiliares para consulta ao banco de dados
    def get_processed_emails(self) -> List[Tuple]:
        """Retorna lista de e-mails já processados"""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT id, subject, date FROM emails WHERE is_processed = 1')
            return cursor.fetchall()
    
    def get_email_data(self, email_id: int) -> List[Tuple]:
        """Retorna os dados extraídos de um e-mail específico"""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT host, ip, status, date 
                FROM email_data 
                WHERE email_id = ?
            ''', (email_id,))
            return cursor.fetchall()
    
    @staticmethod
    def _decode_header(header):
        """Decodifica cabeçalhos de e-mail"""
        if header is None:
            return "Sem assunto"
        decoded, encoding = decode_header(header)[0]
        return decoded.decode(encoding) if encoding else decoded
    
    @staticmethod
    def _extract_body(msg):
        """Extrai o corpo do e-mail"""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    return part.get_payload(decode=True).decode()
        return msg.get_payload(decode=True).decode()

# Exemplo de uso aprimorado
if __name__ == "__main__":
    # Configuração
    processor = EmailProcessor(
        email="veeam.adtsa@adtsa.com.br",
        password="adt@curado1932",
        target_sender="veeam.adtsa@gmail.com",
        db_name="veeam_emails.db"
    )
    
    # Processar novos e-mails
    processor.fetch_and_process()
    
    # Exemplo de consulta ao banco de dados
    print("\n📊 E-mails processados:")
    for email in processor.get_processed_emails():
        email_id, subject, date = email
        print(f"\nID: {email_id} | Assunto: {subject[:50]}... | Data: {date}")
        
        data = processor.get_email_data(email_id)
        print(f"Dados associados ({len(data)} registros):")
        for row in data[:3]:  # Mostrar apenas os 3 primeiros para exemplo
            print(f"- {row[0]}: {row[2]} (IP: {row[1]})")