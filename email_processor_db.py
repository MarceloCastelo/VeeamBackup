import sqlite3
from typing import List, Dict, Optional, Tuple
import imaplib
import email
from email.header import decode_header
import re
from datetime import datetime
import time

class EmailProcessor:
    """Classe para processar e-mails do Veeam e armazenar no banco de dados SQLite"""
    
    def __init__(self, email: str, password: str, target_sender: str, db_name: str = "veeam_emails.db"):
        self.email = email
        self.password = password
        self.target_sender = target_sender
        self.db_name = db_name
        
        # Inicializar banco de dados com verificação de estrutura
        self._init_db()
    
    def _init_db(self):
        """Inicializa e verifica a estrutura do banco de dados"""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            
            # Verificar e criar tabela de e-mails se não existir
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS emails (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subject TEXT,
                    date TEXT,
                    sent_time TEXT,
                    processed_date TEXT DEFAULT CURRENT_TIMESTAMP,
                    is_processed INTEGER DEFAULT 0
                )
            ''')
            
            # Verificar se a coluna sent_time existe (para bancos antigos)
            cursor.execute("PRAGMA table_info(emails)")
            columns = [column[1] for column in cursor.fetchall()]
            if 'sent_time' not in columns:
                cursor.execute('ALTER TABLE emails ADD COLUMN sent_time TEXT')
                print("✅ Coluna sent_time adicionada à tabela emails")
            
            # Tabela de dados extraídos
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
            # Nova tabela para informações do job
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS backup_jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email_id INTEGER,
                    job_name TEXT,
                    created_by TEXT,
                    created_at TEXT,
                    summary_success TEXT,
                    summary_warning TEXT,
                    summary_error TEXT,
                    start_time TEXT,
                    end_time TEXT,
                    duration TEXT,
                    total_size TEXT,
                    backup_size TEXT,
                    data_read TEXT,
                    dedupe TEXT,
                    transferred TEXT,
                    compression TEXT,
                    processed_vms TEXT,
                    processed_vms_total TEXT,
                    processed_vms_success TEXT,
                    processed_vms_warning TEXT,
                    processed_vms_error TEXT,
                    FOREIGN KEY (email_id) REFERENCES emails (id)
                )
            ''')
            # Nova tabela para detalhes das VMs
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS backup_vms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id INTEGER,
                    name TEXT,
                    status TEXT,
                    start_time TEXT,
                    end_time TEXT,
                    size TEXT,
                    read TEXT,
                    transferred TEXT,
                    duration TEXT,
                    details TEXT,
                    FOREIGN KEY (job_id) REFERENCES backup_jobs (id)
                )
            ''')
            # Nova tabela para backups de configuração
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS config_backups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email_id INTEGER,
                    server TEXT,
                    repository TEXT,
                    status TEXT,
                    catalogs_processed INTEGER,
                    backup_date TEXT,
                    start_time TEXT,
                    end_time TEXT,
                    data_size TEXT,
                    backup_size TEXT,
                    duration TEXT,
                    compression TEXT,
                    warnings TEXT,
                    FOREIGN KEY (email_id) REFERENCES emails (id)
                )
            ''')
            # Nova tabela para detalhes dos catálogos de configuração
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS config_catalogs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    config_backup_id INTEGER,
                    catalog_name TEXT,
                    items INTEGER,
                    size TEXT,
                    packed TEXT,
                    FOREIGN KEY (config_backup_id) REFERENCES config_backups (id)
                )
            ''')
            conn.commit()
    
    def fetch_and_process(self):
        """Fluxo principal: buscar, processar e armazenar e-mails"""
        emails = self._fetch_emails()
        if not emails:
            print("ℹ️ Nenhum e-mail novo encontrado.")
            return

        print(f"\n🔎 {len(emails)} e-mails encontrados. Processando...")

        for i, email_data in enumerate(emails, 1):
            email_id = self._store_email_in_db(email_data)
            if email_id:
                # Detecta se é um e-mail de backup de configuração
                if self._is_config_backup_email(email_data["body"]):
                    self._process_config_backup_email(email_data, email_id, i)
                else:
                    self._process_email_content(email_data, email_id, i)
    
    def _fetch_emails(self) -> List[Dict]:
        """Busca e-mails não processados na caixa de entrada"""
        try:
            with imaplib.IMAP4_SSL("imap.skymail.net.br", 993) as mail:
                mail.login(self.email, self.password)
                mail.select("inbox")
                
                status, messages = mail.search(None, f'FROM "{self.target_sender}"')
                if status != "OK":
                    return []
                
                return self._process_messages(mail, messages[0].split())
        except Exception as e:
            print(f"❌ Erro ao buscar e-mails: {e}")
            return []
    
    def _store_email_in_db(self, email_data: Dict) -> Optional[int]:
        """Armazena metadados do e-mail e retorna o ID"""
        try:
            with sqlite3.connect(self.db_name) as conn:
                cursor = conn.cursor()
                
                # Processar data e hora
                date_obj, time_str = self._parse_email_datetime(email_data["date"])
                
                # Verificar se e-mail já existe (agora usando subject, date e sent_time)
                cursor.execute('''
                    SELECT id FROM emails 
                    WHERE subject = ? AND date = ? AND sent_time = ?
                ''', (email_data["subject"], date_obj.strftime('%Y-%m-%d'), time_str))
                
                if cursor.fetchone():
                    return None
                
                cursor.execute('''
                    INSERT INTO emails (subject, date, sent_time)
                    VALUES (?, ?, ?)
                ''', (email_data["subject"], date_obj.strftime('%Y-%m-%d'), time_str))
                
                email_id = cursor.lastrowid
                conn.commit()
                return email_id
        except Exception as e:
            print(f"❌ Erro ao armazenar e-mail: {e}")
            return None
    
    def _process_messages(self, mail, email_ids: List[bytes]) -> List[Dict]:
        """Extrai conteúdo das mensagens IMAP, evitando duplicidade"""
        emails = []
        # Buscar IDs de e-mails já processados
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            # Buscar subject, date, sent_time para evitar duplicidade corretamente
            cursor.execute('SELECT subject, date, sent_time FROM emails')
            processed = set((row[0], row[1], row[2]) for row in cursor.fetchall())
        for email_id in email_ids:
            status, data = mail.fetch(email_id, "(RFC822)")
            if status == "OK":
                msg = email.message_from_bytes(data[0][1])
                subject = self._decode_header(msg["Subject"])
                date = msg["Date"]
                # Extrair date_obj e time_str para comparar corretamente
                date_obj, time_str = self._parse_email_datetime(date)
                date_str = date_obj.strftime('%Y-%m-%d')
                # Evita processar e-mails já existentes (subject, date, sent_time)
                if (subject, date_str, time_str) in processed:
                    continue
                emails.append({
                    "subject": subject,
                    "date": date,
                    "body": self._extract_body(msg)
                })
        return emails
    
    def _process_email_content(self, email_data: Dict, email_id: int, index: int):
        """Processa o corpo do e-mail e armazena dados"""
        date_obj, time_str = self._parse_email_datetime(email_data["date"])
        formatted_date = date_obj.strftime('%Y-%m-%d')

        # Extrair e armazenar dados tabulares antigos
        table_data = self._extract_table_data(email_data["body"])
        if table_data:
            self._store_email_data(email_id, table_data, formatted_date)

        # Extrair e armazenar dados de múltiplos jobs e VMs
        jobs_info = self._extract_jobs_info(email_data["body"])
        if jobs_info:
            for job_info, vm_list in jobs_info:
                job_id = self._store_job_info(email_id, job_info)
                if vm_list:
                    self._store_vm_details(job_id, vm_list)

        self._mark_as_processed(email_id)
        print(f"✅ E-mail {index} processado. {len(table_data) if table_data else 0} registros.")
    
    def _parse_email_datetime(self, date_str: str) -> Tuple[datetime, str]:
        """Extrai data e hora do cabeçalho do e-mail"""
        try:
            date_obj = datetime.strptime(date_str, '%a, %d %b %Y %H:%M:%S %z')
            return date_obj, date_obj.strftime('%H:%M:%S')
        except Exception:
            now = datetime.now()
            return now, now.strftime('%H:%M:%S')
    
    def _store_email_data(self, email_id: int, table_data: List[List[str]], date: str):
        """Armazena dados extraídos no banco de dados"""
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
            print(f"❌ Erro ao armazenar dados: {e}")
    
    def _mark_as_processed(self, email_id: int):
        """Marca e-mail como processado"""
        try:
            with sqlite3.connect(self.db_name) as conn:
                conn.execute('UPDATE emails SET is_processed = 1 WHERE id = ?', (email_id,))
                conn.commit()
        except Exception as e:
            print(f"❌ Erro ao marcar e-mail: {e}")
    
    def _extract_table_data(self, body: str) -> List[List[str]]:
        """Extrai dados tabulares usando regex"""
        pattern = re.compile(
            r'^([^\s]+)\s+(\d+\.\d+\.\d+\.\d+)\s+(Success|Warning|Error)',
            re.MULTILINE
        )
        return [list(match.groups()) for match in pattern.finditer(body)]
    
    def get_processed_emails(self) -> List[Tuple]:
        """Retorna e-mails processados ordenados por data/hora"""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, subject, date, sent_time 
                FROM emails 
                WHERE is_processed = 1
                ORDER BY date DESC, sent_time DESC
            ''')
            return cursor.fetchall()
    
    def get_email_data(self, email_id: int) -> List[Tuple]:
        """Retorna dados de um e-mail específico"""
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

    def _extract_jobs_info(self, body: str) -> list:
        """
        Extrai todos os blocos de backup_job e suas VMs do corpo do e-mail.
        Retorna lista de tuplas: (job_info_dict, [vm_dicts])
        """
        # Divide o corpo em blocos de jobs pelo padrão "Backup job:" ou "Agent Backup job:"
        job_blocks = re.split(r'(?=(?:Agent )?Backup job:)', body)
        result = []
        for block in job_blocks:
            job_info = self._extract_job_info(block)
            if job_info:
                vm_list = self._extract_vm_details(block)
                result.append((job_info, vm_list))
        return result

    def _extract_job_info(self, body: str) -> dict:
        """Extrai informações do job do corpo do e-mail"""
        job = {}
        m = re.search(r'(?:Agent )?Backup job:\s*(.+)', body)
        if m:
            job['job_name'] = m.group(1).strip()
        m = re.search(r'Created by ([^\\]+\\[^\s]+) at ([\d/]+ [\d:]+)', body)
        if m:
            job['created_by'] = m.group(1)
            job['created_at'] = m.group(2)
        m = re.search(r'(\d+) of (\d+) (?:VMs|hosts) processed', body)
        if m:
            job['processed_vms'] = m.group(1)
            job['processed_vms_total'] = m.group(2)
        # Success/Warning/Error resumo
        m = re.search(r'\*Success\*\s*(\d+).*?\*Start time\*\s*([\d:]+).*?\*Total size\*\s*([^\*]+)\*Backup size\*\s*([^\n]+)', body, re.DOTALL)
        if m:
            job['summary_success'] = m.group(1)
            job['start_time'] = m.group(2)
            job['total_size'] = m.group(3).strip()
            job['backup_size'] = m.group(4).strip()
        m = re.search(r'\*Warning\*\s*(\d+).*?\*End time\*\s*([\d:]+).*?\*Data read\*\s*([^\*]+)\*Dedupe\*\s*([^\n]+)', body, re.DOTALL)
        if m:
            job['summary_warning'] = m.group(1)
            job['end_time'] = m.group(2)
            job['data_read'] = m.group(3).strip()
            job['dedupe'] = m.group(4).strip()
        m = re.search(r'\*Error\*\s*(\d+).*?\*Duration\*\s*([\d:]+).*?\*Transferred\*\s*([^\*]+)\*Compression\*\s*([^\n]+)', body, re.DOTALL)
        if m:
            job['summary_error'] = m.group(1)
            job['duration'] = m.group(2)
            job['transferred'] = m.group(3).strip()
            job['compression'] = m.group(4).strip()
        return job if job.get('job_name') else None

    def _store_job_info(self, email_id: int, job: dict) -> int:
        """Armazena informações do job no banco de dados e retorna o job_id"""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO backup_jobs (
                    email_id, job_name, created_by, created_at, summary_success, summary_warning, summary_error,
                    start_time, end_time, duration, total_size, backup_size, data_read, dedupe, transferred, compression,
                    processed_vms, processed_vms_total, processed_vms_success, processed_vms_warning, processed_vms_error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                email_id,
                job.get('job_name'),
                job.get('created_by'),
                job.get('created_at'),
                job.get('summary_success'),
                job.get('summary_warning'),
                job.get('summary_error'),
                job.get('start_time'),
                job.get('end_time'),
                job.get('duration'),
                job.get('total_size'),
                job.get('backup_size'),
                job.get('data_read'),
                job.get('dedupe'),
                job.get('transferred'),
                job.get('compression'),
                job.get('processed_vms'),
                job.get('processed_vms_total'),
                job.get('summary_success'),
                job.get('summary_warning'),
                job.get('summary_error')
            ))
            job_id = cursor.lastrowid
            conn.commit()
            return job_id

    def _extract_vm_details(self, body: str) -> list:
        """Extrai detalhes das VMs do corpo do e-mail"""
        # Ajuste: só pega a seção Details até o próximo job ou fim do texto
        m = re.search(r'Details\s*\*Name\*.*?\*Details\*\n(.+?)(?=(?:Agent )?Backup job:|Backup job:|$)', body, re.DOTALL)
        if not m:
            return []
        lines = m.group(1).strip().split('\n')
        vms = []
        for line in lines:
            # Exemplo de linha:
            # PRINTDEALER_ML-PG Success 19:00:43 19:21:40 100 GB 29,5 GB 13,3 GB 0:20:56
            parts = re.split(r'\s{2,}|\t| (?=\d{2}:\d{2}:\d{2})', line.strip())
            if len(parts) < 9:
                parts = line.strip().split()
            if len(parts) >= 9:
                vms.append({
                    'name': parts[0],
                    'status': parts[1],
                    'start_time': parts[2],
                    'end_time': parts[3],
                    'size': parts[4],
                    'read': parts[5],
                    'transferred': parts[6],
                    'duration': parts[7],
                    'details': ' '.join(parts[8:]) if len(parts) > 8 else ''
                })
            elif len(parts) >= 8:
                vms.append({
                    'name': parts[0],
                    'status': parts[1],
                    'start_time': parts[2],
                    'end_time': parts[3],
                    'size': parts[4],
                    'read': parts[5],
                    'transferred': parts[6],
                    'duration': parts[7],
                    'details': ''
                })
        return vms

    def _store_vm_details(self, job_id: int, vms: list):
        """Armazena detalhes das VMs no banco de dados"""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            for vm in vms:
                cursor.execute('''
                    INSERT INTO backup_vms (
                        job_id, name, status, start_time, end_time, size, read, transferred, duration, details
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    job_id,
                    vm.get('name'),
                    vm.get('status'),
                    vm.get('start_time'),
                    vm.get('end_time'),
                    vm.get('size'),
                    vm.get('read'),
                    vm.get('transferred'),
                    vm.get('duration'),
                    vm.get('details')
                ))
            conn.commit()

    def _is_config_backup_email(self, body: str) -> bool:
        """Detecta se o corpo do e-mail é de backup de configuração"""
        return bool(re.search(r'^Configuration Backup for ', body, re.MULTILINE))

    def _process_config_backup_email(self, email_data: Dict, email_id: int, index: int):
        """Processa e armazena e-mail de backup de configuração"""
        config_info = self._extract_config_backup_info(email_data["body"])
        if config_info:
            config_id = self._store_config_backup(email_id, config_info)
            if config_info.get("catalogs"):
                self._store_config_catalogs(config_id, config_info["catalogs"])
        self._mark_as_processed(email_id)
        print(f"✅ E-mail {index} (config backup) processado.")

    def _extract_config_backup_info(self, body: str) -> dict:
        """Extrai informações do backup de configuração do corpo do e-mail"""
        info = {}
        # Cabeçalho
        m = re.search(r'^Configuration Backup for ([^\n]+)', body, re.MULTILINE)
        if m:
            info["server"] = m.group(1).strip()
        m = re.search(r'^To:\s*(.+)', body, re.MULTILINE)
        if m:
            info["repository"] = m.group(1).strip()
        m = re.search(r'^(Success|Warning|Error)', body, re.MULTILINE)
        if m:
            info["status"] = m.group(1)
        m = re.search(r'^(\d+) catalogs processed', body, re.MULTILINE)
        if m:
            info["catalogs_processed"] = int(m.group(1))
        # Datas e horários
        m = re.search(r'^(\d{1,2} de .+? \d{4} \d{2}:\d{2}:\d{2})', body, re.MULTILINE)
        if m:
            info["backup_date"] = m.group(1)
        m = re.search(r'Start time (\d{2}:\d{2}:\d{2})', body)
        if m:
            info["start_time"] = m.group(1)
        m = re.search(r'End time (\d{2}:\d{2}:\d{2})', body)
        if m:
            info["end_time"] = m.group(1)
        m = re.search(r'Data size ([\d\.,A-Za-z ]+)', body)
        if m:
            info["data_size"] = m.group(1).strip()
        m = re.search(r'Backup size ([\d\.,A-Za-z ]+)', body)
        if m:
            info["backup_size"] = m.group(1).strip()
        m = re.search(r'Duration ([\d:]+)', body)
        if m:
            info["duration"] = m.group(1)
        m = re.search(r'Compression ([\d\.,x]+)', body)
        if m:
            info["compression"] = m.group(1)
        # Warnings
        warnings = []
        for warn in re.findall(r'Warning[^\n]*\n(.+?)(?=\n\d{2}/\d{2}/\d{4}|\nEnd time|\nDuration|\nCompression|$)', body, re.DOTALL):
            warnings.append(warn.strip().replace('\n', ' '))
        info["warnings"] = " | ".join(warnings) if warnings else None
        # Catálogos
        catalogs = []
        m = re.search(r'Details\s*Catalog Items Size Packed\n(.+)', body, re.DOTALL)
        if m:
            lines = m.group(1).strip().split('\n')
            for line in lines:
                parts = re.split(r'\s{2,}|\t', line.strip())
                if len(parts) < 4:
                    parts = line.strip().split()
                if len(parts) >= 4:
                    catalogs.append({
                        "catalog_name": parts[0] + (f" {parts[1]}" if not parts[1].replace('.', '', 1).isdigit() else ""),
                        "items": int(parts[1]) if parts[1].replace('.', '', 1).isdigit() else int(parts[2]),
                        "size": parts[2] if parts[1].replace('.', '', 1).isdigit() else parts[3],
                        "packed": parts[3] if parts[1].replace('.', '', 1).isdigit() else parts[4]
                    })
        info["catalogs"] = catalogs
        return info if info.get("server") else None

    def _store_config_backup(self, email_id: int, info: dict) -> int:
        """Armazena informações do backup de configuração"""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO config_backups (
                    email_id, server, repository, status, catalogs_processed, backup_date,
                    start_time, end_time, data_size, backup_size, duration, compression, warnings
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                email_id,
                info.get("server"),
                info.get("repository"),
                info.get("status"),
                info.get("catalogs_processed"),
                info.get("backup_date"),
                info.get("start_time"),
                info.get("end_time"),
                info.get("data_size"),
                info.get("backup_size"),
                info.get("duration"),
                info.get("compression"),
                info.get("warnings")
            ))
            config_id = cursor.lastrowid
            conn.commit()
            return config_id

    def _store_config_catalogs(self, config_id: int, catalogs: list):
        """Armazena detalhes dos catálogos de configuração"""
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            for cat in catalogs:
                cursor.execute('''
                    INSERT INTO config_catalogs (
                        config_backup_id, catalog_name, items, size, packed
                    ) VALUES (?, ?, ?, ?, ?)
                ''', (
                    config_id,
                    cat.get("catalog_name"),
                    cat.get("items"),
                    cat.get("size"),
                    cat.get("packed")
                ))
            conn.commit()

if __name__ == "__main__":
    # Configuração
    processor = EmailProcessor(
        email="veeam.adtsa@adtsa.com.br",
        password="adt@curado1932",
        target_sender="veeam.adtsa@gmail.com"
    )
    # Executa o processamento imediatamente ao rodar o script
    processor.fetch_and_process()
    print("\n📋 Relatório de processamento:")
    for email in processor.get_processed_emails():
        email_id, subject, date, time_ = email
        print(f"\n📩 ID: {email_id} | {date} {time_}")
        print(f"📌 Assunto: {subject[:60]}...")
        data = processor.get_email_data(email_id)
        print(f"📊 Dados ({len(data)} hosts):")
        for host, ip, status, _ in data[:3]:  # Mostrar apenas 3 itens
            print(f"  - {host}: {status} ({ip})")