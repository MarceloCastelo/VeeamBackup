import sqlite3
from typing import List, Dict

class EmailAPI:
    def __init__(self, db_name: str = "veeam_emails.db"):
        self.db_name = db_name

    def _execute_query(self, query: str, params: tuple = (), fetch_all: bool = True) -> List[Dict]:
        try:
            with sqlite3.connect(self.db_name) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute(query, params)
                rows = cursor.fetchall() if fetch_all else [cursor.fetchone()]
                return [dict(row) for row in rows if row]
        except sqlite3.OperationalError as e:
            return [{"error": f"Erro operacional no banco de dados: {str(e)}"}]

    # 📩 Tabela emails
    def get_all_emails(self) -> List[Dict]:
        return self._execute_query('''
            SELECT id, subject, date, sent_time, processed_date, is_processed
            FROM emails
            ORDER BY date DESC, sent_time DESC
        ''')

    def get_email_metadata(self, email_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT id, subject, date, sent_time, processed_date, is_processed
            FROM emails
            WHERE id = ?
        ''', (email_id,))

    def get_email_by_date(self, date: str) -> List[Dict]:
        return self._execute_query('''
            SELECT id, subject, date, sent_time, processed_date, is_processed
            FROM emails
            WHERE date(date) = date(?)
            ORDER BY sent_time DESC
        ''', (date,))

    # 📊 Tabela email_data
    def get_all_email_data(self) -> List[Dict]:
        return self._execute_query('''
            SELECT email_id, host, ip, status, date
            FROM email_data
            ORDER BY date DESC, host
        ''')

    def get_email_data(self, email_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT host, ip, status, date
            FROM email_data
            WHERE email_id = ?
            ORDER BY host
        ''', (email_id,))

    def get_email_data_by_date(self, date: str) -> List[Dict]:
        return self._execute_query('''
            SELECT email_id, host, ip, status, date
            FROM email_data
            WHERE date(date) = date(?)
            ORDER BY host
        ''', (date,))

    # 📦 Tabela backup_jobs
    def get_all_backup_jobs(self) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM backup_jobs
            ORDER BY id DESC
        ''')

    def get_backup_job(self, job_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM backup_jobs WHERE id = ?
        ''', (job_id,))

    def get_backup_jobs_by_email(self, email_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM backup_jobs WHERE email_id = ?
        ''', (email_id,))

    # 🖥️ Tabela backup_vms
    def get_vms_by_job(self, job_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM backup_vms WHERE job_id = ?
        ''', (job_id,))

    def get_all_vms(self) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM backup_vms
            ORDER BY id DESC
        ''')

    # 🔧 Tabela config_backups
    def get_all_config_backups(self) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM config_backups
            ORDER BY id DESC
        ''')

    def get_config_backup(self, config_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM config_backups WHERE id = ?
        ''', (config_id,))

    def get_config_backups_by_email(self, email_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM config_backups WHERE email_id = ?
        ''', (email_id,))

    # 🔧 Tabela config_catalogs
    def get_catalogs_by_config(self, config_id: int) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM config_catalogs WHERE config_backup_id = ?
        ''', (config_id,))

    def get_all_config_catalogs(self) -> List[Dict]:
        return self._execute_query('''
            SELECT * FROM config_catalogs
            ORDER BY id DESC
        ''')