from utils.email_processor import EmailProcessor


if __name__ == "__main__":
    processor = EmailProcessor(
        email="veeam.adtsa@adtsa.com.br",
        password="adt@curado1932",
        target_sender="veeam.adtsa@gmail.com"
    )
    processor.fetch_and_process()
    print("\n📋 Relatório de processamento:")
    for email in processor.get_processed_emails():
        email_id, subject, date, time_ = email
        print(f"\n📩 ID: {email_id} | {date} {time_}")
        print(f"📌 Assunto: {subject[:60]}...")
