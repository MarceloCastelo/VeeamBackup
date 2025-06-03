import imaplib
import email
from email.header import decode_header
import os
import re
from datetime import datetime
import csv
from typing import List, Dict, Optional

class EmailProcessor:
    """Classe unificada que combina as funcionalidades dos dois códigos"""
    
    def __init__(self, email: str, password: str, target_sender: str):
        self.email = email
        self.password = password
        self.target_sender = target_sender
        self.output_folder = "processed_emails"
        os.makedirs(self.output_folder, exist_ok=True)
    
    def fetch_and_process(self):
        """Fluxo completo: busca e-mails -> processa -> gera CSV"""
        emails = self._fetch_emails()
        if not emails:
            print("Nenhum e-mail encontrado.")
            return
        
        print(f"\n🔎 {len(emails)} e-mails encontrados. Processando...")
        
        for i, email_data in enumerate(emails, 1):
            self._process_email_content(email_data, i)
    
    def _fetch_emails(self) -> List[Dict]:
        """Busca e-mails do remetente (adaptado do código 01)"""
        try:
            with imaplib.IMAP4_SSL("imap.skymail.net.br", 993) as mail:
                mail.login(self.email, self.password)
                mail.select("inbox")
                
                status, messages = mail.search(None, f'FROM "{self.target_sender}"')
                if status != "OK":
                    return []
                
                return self._process_messages(mail, messages[0].split())
        except Exception as e:
            print(f"Erro ao buscar e-mails: {e}")
            return []
    
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
    
    def _process_email_content(self, email_data: Dict, index: int):
        """Processa o conteúdo do e-mail e gera CSV (adaptado do código 02)"""
        # Extração de data
        try:
            date_str = email_data["date"]
            formatted_date = datetime.strptime(date_str, '%a, %d %b %Y %H:%M:%S %z').strftime('%Y-%m-%d')
        except:
            formatted_date = datetime.now().strftime('%Y-%m-%d')
        
        # Extração da tabela (exemplo para relatórios Veeam)
        table_data = self._extract_table_data(email_data["body"])
        if not table_data:
            print(f"⚠️ E-mail {index} não contém dados tabulares")
            return
        
        # Geração do CSV
        filename = f"report_{index}_{formatted_date}.csv"
        self._generate_csv(table_data, filename, formatted_date)
        print(f"✅ Arquivo {filename} gerado com {len(table_data)} registros")
    
    def _extract_table_data(self, body: str) -> List[List[str]]:
        """Extrai dados tabulares usando regex (do código 02)"""
        pattern = re.compile(
            r'^([^\s]+)\s+(\d+\.\d+\.\d+\.\d+)\s+(Success|Warning|Error)',
            re.MULTILINE
        )
        return [list(match.groups()) for match in pattern.finditer(body)]
    
    def _generate_csv(self, data: List[List[str]], filename: str, date: str):
        """Gera arquivo CSV (do código 02)"""
        with open(os.path.join(self.output_folder, filename), 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['Host', 'IP', 'Status', 'Date'])
            for row in data:
                writer.writerow([*row, date])
    
    # Métodos auxiliares do código 01
    @staticmethod
    def _decode_header(header):
        """Decodifica cabeçalhos de e-mail"""
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

# Exemplo de uso
if __name__ == "__main__":
    processor = EmailProcessor(
        email="veeam.adtsa@adtsa.com.br",
        password="adt@curado1932",
        target_sender="veeam.adtsa@gmail.com"
    )
    processor.fetch_and_process()