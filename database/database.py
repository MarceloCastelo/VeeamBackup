import sqlite3
import os
from typing import List, Dict, Optional, Tuple

class DatabaseManager:
    def __init__(self, db_name: str = "veeam_emails.db"):
        # Garante que o banco será criado dentro da pasta database
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.db_name = os.path.join(base_dir, db_name)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            # ...criação das tabelas conforme o código original...
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
            cursor.execute("PRAGMA table_info(emails)")
            columns = [column[1] for column in cursor.fetchall()]
            if 'sent_time' not in columns:
                cursor.execute('ALTER TABLE emails ADD COLUMN sent_time TEXT')
                print("✅ Coluna sent_time adicionada à tabela emails")
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
            conn.commit()

    def store_email(self, subject: str, date: str, sent_time: str) -> Optional[int]:
        try:
            with sqlite3.connect(self.db_name) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT id FROM emails 
                    WHERE subject = ? AND date = ? AND sent_time = ?
                ''', (subject, date, sent_time))
                if cursor.fetchone():
                    return None
                cursor.execute('''
                    INSERT INTO emails (subject, date, sent_time)
                    VALUES (?, ?, ?)
                ''', (subject, date, sent_time))
                email_id = cursor.lastrowid
                conn.commit()
                return email_id
        except Exception as e:
            print(f"❌ Erro ao armazenar e-mail: {e}")
            return None

    def get_processed_emails(self) -> List[Tuple]:
        with sqlite3.connect(self.db_name) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, subject, date, sent_time 
                FROM emails 
                WHERE is_processed = 1
                ORDER BY date DESC, sent_time DESC
            ''')
            return cursor.fetchall()

    def mark_email_processed(self, email_id: int):
        try:
            with sqlite3.connect(self.db_name) as conn:
                conn.execute('UPDATE emails SET is_processed = 1 WHERE id = ?', (email_id,))
                conn.commit()
        except Exception as e:
            print(f"❌ Erro ao marcar e-mail: {e}")

    def store_job(self, email_id: int, job: dict) -> Optional[int]:
        try:
            with sqlite3.connect(self.db_name) as conn:
                cursor = conn.cursor()
                # Verifica se já existe um job igual para o mesmo email, nome, start_time, end_time, created_by e created_at
                cursor.execute('''
                    SELECT id FROM backup_jobs
                    WHERE email_id = ? AND job_name = ? AND start_time = ? AND end_time = ? AND created_by = ? AND created_at = ?
                ''', (
                    email_id,
                    job.get('job_name'),
                    job.get('start_time'),
                    job.get('end_time'),
                    job.get('created_by'),
                    job.get('created_at')
                ))
                if cursor.fetchone():
                    return None
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
        except Exception as e:
            print(f"❌ Erro ao armazenar job: {e}")
            return None

    def store_vm_details(self, job_id: int, vms: list):
        try:
            with sqlite3.connect(self.db_name) as conn:
                cursor = conn.cursor()
                for vm in vms:
                    # Verifica se já existe VM igual para o mesmo job_id, nome, start_time, end_time e status
                    cursor.execute('''
                        SELECT id FROM backup_vms
                        WHERE job_id = ? AND name = ? AND start_time = ? AND end_time = ? AND status = ?
                    ''', (
                        job_id,
                        vm.get('name'),
                        vm.get('start_time'),
                        vm.get('end_time'),
                        vm.get('status')
                    ))
                    if cursor.fetchone():
                        continue
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
        except Exception as e:
            print(f"❌ Erro ao armazenar detalhes da VM: {e}")

    def store_config_backup(self, email_id: int, info: dict) -> Optional[int]:
        try:
            with sqlite3.connect(self.db_name) as conn:
                cursor = conn.cursor()
                # Verifica se já existe um config igual para o mesmo email, server, repository, backup_date, start_time e status
                cursor.execute('''
                    SELECT id FROM config_backups
                    WHERE email_id = ? AND server = ? AND repository = ? AND backup_date = ? AND start_time = ? AND status = ?
                ''', (
                    email_id,
                    info.get("server"),
                    info.get("repository"),
                    info.get("backup_date"),
                    info.get("start_time"),
                    info.get("status")
                ))
                if cursor.fetchone():
                    return None
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
        except Exception as e:
            print(f"❌ Erro ao armazenar config backup: {e}")
            return None
