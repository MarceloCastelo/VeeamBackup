from database.database import DatabaseManager
from utils.email_parser import EmailParser

class EmailProcessor:
    """Classe para processar e-mails do Veeam e armazenar no banco de dados SQLite"""
    
    def __init__(self, email: str, password: str, target_sender: str, db_name: str = "veeam_emails.db"):
        self.db = DatabaseManager(db_name)
        self.parser = EmailParser(email, password, target_sender)

    def fetch_and_process(self):
        """Fluxo principal: buscar, processar e armazenar e-mails"""
        emails = self.parser.fetch_emails()
        if not emails:
            print("ℹ️ Nenhum e-mail novo encontrado.")
            return

        print(f"\n🔎 {len(emails)} e-mails encontrados. Processando...")

        for i, email_data in enumerate(emails, 1):
            date_obj, time_str = self.parser.parse_email_datetime(email_data["date"])
            date_str = date_obj.strftime('%Y-%m-%d')
            email_id = self.db.store_email(email_data["subject"], date_str, time_str)
            if email_id:
                if self.parser.is_config_backup_email(email_data["body"]):
                    config_info = self.parser.extract_config_backup_info(email_data["body"])
                    if config_info:
                        config_info["data_size"] = self.parser.clean_size_field(config_info.get("data_size", ""))
                        config_info["backup_size"] = self.parser.clean_size_field(config_info.get("backup_size", ""))
                        self.db.store_config_backup(email_id, config_info)
                    self.db.mark_email_processed(email_id)
                    print(f"✅ E-mail {i} (config backup) processado.")
                else:
                    jobs_info = self.parser.extract_jobs_info(email_data["body"])
                    if jobs_info:
                        for job_info, vm_list in jobs_info:
                            job_info['total_size'] = self.parser.clean_size_field(job_info.get('total_size', ''))
                            job_info['backup_size'] = self.parser.clean_size_field(job_info.get('backup_size', ''))
                            job_info['data_read'] = self.parser.clean_size_field(job_info.get('data_read', ''))
                            job_info['transferred'] = self.parser.clean_size_field(job_info.get('transferred', ''))
                            job_id = self.db.store_job(email_id, job_info)
                            if vm_list:
                                self.db.store_vm_details(job_id, vm_list)
                    self.db.mark_email_processed(email_id)
                    print(f"✅ E-mail {i} processado.")

    def get_processed_emails(self):
        return self.db.get_processed_emails()