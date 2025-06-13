import sqlite3
import os

class DuplicateRemover:
    def __init__(self, db_path: str):
        self.db_path = db_path

    def remove_duplicates_emails(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # Duplicados definidos por subject, date e sent_time iguais
            cursor.execute('''
                DELETE FROM emails
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM emails
                    GROUP BY subject, date, sent_time
                )
            ''')
            conn.commit()
            print(f"Duplicates removed from emails: {cursor.rowcount}")

    def remove_duplicates_backup_jobs(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # Duplicados definidos por email_id, job_name, start_time, end_time, created_by, created_at
            cursor.execute('''
                DELETE FROM backup_jobs
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM backup_jobs
                    GROUP BY job_name, start_time, end_time, backup_size, total_size, data_read, transferred, duration
                )
            ''')
            conn.commit()
            print(f"Duplicates removed from backup_jobs: {cursor.rowcount}")

    def remove_duplicates_backup_vms(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # Duplicados definidos por job_id, name, start_time, end_time, status
            cursor.execute('''
                DELETE FROM backup_vms
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM backup_vms
                    GROUP BY job_id, name, start_time, end_time, status
                )
            ''')
            conn.commit()
            print(f"Duplicates removed from backup_vms: {cursor.rowcount}")

    def remove_duplicates_config_backups(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # Duplicados definidos por email_id, server, repository, backup_date, start_time, status
            cursor.execute('''
                DELETE FROM config_backups
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM config_backups
                    GROUP BY email_id, server, repository, backup_date, start_time, status
                )
            ''')
            conn.commit()
            print(f"Duplicates removed from config_backups: {cursor.rowcount}")

    def remove_all_duplicates(self):
        print("Removing duplicates from emails...")
        self.remove_duplicates_emails()
        print("Removing duplicates from backup_jobs...")
        self.remove_duplicates_backup_jobs()
        print("Removing duplicates from backup_vms...")
        self.remove_duplicates_backup_vms()
        print("Removing duplicates from config_backups...")
        self.remove_duplicates_config_backups()
        print("Duplicate removal process completed.")

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_file = os.path.join(base_dir, "veeam_emails.db")

    remover = DuplicateRemover(db_file)
    remover.remove_all_duplicates()
