import imaplib
import email
from email.header import decode_header
import re
from datetime import datetime
from typing import List, Dict, Tuple, Optional

class EmailParser:
    def __init__(self, email_addr: str, password: str, target_sender: str):
        self.email = email_addr
        self.password = password
        self.target_sender = target_sender

    def fetch_emails(self) -> List[Dict]:
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

    def _process_messages(self, mail, email_ids: List[bytes]) -> List[Dict]:
        emails = []
        for email_id in email_ids:
            status, data = mail.fetch(email_id, "(RFC822)")
            if status == "OK":
                msg = email.message_from_bytes(data[0][1])
                subject = self._decode_header(msg["Subject"])
                date = msg["Date"]
                emails.append({
                    "subject": subject,
                    "date": date,
                    "body": self._extract_body(msg)
                })
        return emails

    @staticmethod
    def _decode_header(header):
        if header is None:
            return "Sem assunto"
        decoded, encoding = decode_header(header)[0]
        return decoded.decode(encoding) if encoding else decoded

    @staticmethod
    def _extract_body(msg):
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    return part.get_payload(decode=True).decode()
        return msg.get_payload(decode=True).decode()

    @staticmethod
    def parse_email_datetime(date_str: str) -> Tuple[datetime, str]:
        try:
            date_obj = datetime.strptime(date_str, '%a, %d %b %Y %H:%M:%S %z')
            return date_obj, date_obj.strftime('%H:%M:%S')
        except Exception:
            now = datetime.now()
            return now, now.strftime('%H:%M:%S')

    @staticmethod
    def is_config_backup_email(body: str) -> bool:
        return bool(re.search(r'^Configuration Backup for ', body, re.MULTILINE))

    # Métodos de parsing de jobs, VMs, config backup (copiados do código original)
    @staticmethod
    def extract_jobs_info(body: str) -> list:
        job_blocks = re.split(r'(?=(?:Agent )?Backup job:)', body)
        result = []
        seen_jobs = set()
        for block in job_blocks:
            job_info = EmailParser.extract_job_info(block)
            if job_info:
                # Deduplicação de jobs por múltiplos campos relevantes
                job_key = (
                    job_info.get('job_name'),
                    job_info.get('start_time'),
                    job_info.get('end_time'),
                    job_info.get('created_by'),
                    job_info.get('created_at')
                )
                if job_key and job_key not in seen_jobs:
                    vm_list = EmailParser.extract_vm_details(block)
                    # Deduplica VMs por nome, start_time, end_time e status
                    unique_vms = []
                    seen_vm_keys = set()
                    for vm in vm_list:
                        vm_key = (
                            vm.get('name'),
                            vm.get('start_time'),
                            vm.get('end_time'),
                            vm.get('status')
                        )
                        if vm_key and vm_key not in seen_vm_keys:
                            unique_vms.append(vm)
                            seen_vm_keys.add(vm_key)
                    result.append((job_info, unique_vms))
                    seen_jobs.add(job_key)
        return result

    @staticmethod
    def extract_job_info(body: str) -> dict:
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

    @staticmethod
    def extract_vm_details(body: str) -> list:
        m = re.search(r'Details\s*\*Name\*.*?\*Details\*\n(.+?)(?=(?:Agent )?Backup job:|Backup job:|$)', body, re.DOTALL)
        if not m:
            return []
        lines = m.group(1).strip().split('\n')
        vms = []
        for line in lines:
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

    @staticmethod
    def extract_config_backup_info(body: str) -> dict:
        info = {}
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
        warnings = []
        for warn in re.findall(r'Warning[^\n]*\n(.+?)(?=\n\d{2}/\d{2}/\d{4}|\nEnd time|\nDuration|\nCompression|$)', body, re.DOTALL):
            warnings.append(warn.strip().replace('\n', ' '))
        info["warnings"] = " | ".join(warnings) if warnings else None
        return info if info.get("server") else None

    @staticmethod
    def clean_size_field(value: str) -> str:
        if not value:
            return ""
        m = re.match(r'^\s*([\d\.,]+)\s*([KMGTP]?B)', value.strip(), re.IGNORECASE)
        if m:
            num = m.group(1).replace(',', '.')
            unit = m.group(2).upper()
            return f"{num} {unit}"
        return value.strip().split()[0] + " B"