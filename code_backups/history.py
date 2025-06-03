import imaplib
import email
from email.header import decode_header
import os
from typing import List, Dict, Optional


class EmailDecoder:
    """Classe responsável por decodificar partes do e-mail"""
    
    @staticmethod
    def decode_text(text, encoding=None) -> str:
        """Decodifica texto com encoding opcional (evita erros de caracteres)"""
        if isinstance(text, bytes):
            return text.decode(encoding or 'utf-8', errors='ignore')
        return text


class EmailParser:
    """Classe responsável por analisar e extrair informações de e-mails"""
    
    def __init__(self, email_message):
        self.msg = email_message
    
    def parse(self) -> Dict:
        """Extrai informações importantes do e-mail"""
        info = {
            "assunto": self._get_subject(),
            "de": self._get_sender(),
            "data": self._get_date(),
            "corpo": self._get_body(),
            "anexos": self._has_attachments()
        }
        return info
    
    def _get_subject(self) -> str:
        """Decodifica o assunto do e-mail"""
        assunto, encoding = decode_header(self.msg["Subject"])[0]
        return EmailDecoder.decode_text(assunto, encoding)
    
    def _get_sender(self) -> str:
        """Obtém o remetente do e-mail"""
        de, encoding = decode_header(self.msg.get("From"))[0]
        return EmailDecoder.decode_text(de, encoding)
    
    def _get_date(self) -> str:
        """Obtém a data do e-mail"""
        return self.msg.get("Date", "Sem data")
    
    def _get_body(self) -> str:
        """Extrai o corpo do e-mail (texto simples ou HTML)"""
        if self.msg.is_multipart():
            for part in self.msg.walk():
                content_type = part.get_content_type()
                if content_type == "text/plain":
                    corpo = part.get_payload(decode=True)
                    return EmailDecoder.decode_text(corpo)
        else:
            corpo = self.msg.get_payload(decode=True)
            return EmailDecoder.decode_text(corpo)
        return ""
    
    def _has_attachments(self) -> bool:
        """Verifica se o e-mail tem anexos"""
        if self.msg.is_multipart():
            for part in self.msg.walk():
                if part.get_content_maintype() != "text" and part.get("Content-Disposition"):
                    return True
        return False


class EmailSaver:
    """Classe responsável por salvar e-mails em arquivos"""
    
    def __init__(self, output_folder: str = "emails_salvos"):
        self.output_folder = output_folder
        os.makedirs(self.output_folder, exist_ok=True)
    
    def save_email(self, email_info: Dict, email_number: int) -> str:
        """Salva o conteúdo do e-mail em um arquivo TXT"""
        assunto_sanitizado = self._sanitize_subject(email_info['assunto'])
        nome_arquivo = f"email_{email_number}_{assunto_sanitizado[:50]}.txt"
        caminho_arquivo = os.path.join(self.output_folder, nome_arquivo)
        
        with open(caminho_arquivo, 'w', encoding='utf-8') as f:
            f.write(self._format_email_content(email_info))
        
        return caminho_arquivo
    
    def _sanitize_subject(self, subject: str) -> str:
        """Remove caracteres inválidos do assunto para nome de arquivo"""
        return "".join(c for c in subject if c.isalnum() or c in (' ', '-', '_')).rstrip()
    
    def _format_email_content(self, email_info: Dict) -> str:
        """Formata o conteúdo do e-mail para salvar no arquivo"""
        content = [
            f"De: {email_info['de']}",
            f"Data: {email_info['data']}",
            f"Assunto: {email_info['assunto']}",
            f"Tem anexos? {'Sim' if email_info['anexos'] else 'Não'}",
            "\nConteúdo:",
            "=" * 50,
            email_info['corpo'].strip(),
            "=" * 50
        ]
        return "\n".join(content)


class EmailFetcher:
    """Classe responsável por buscar e-mails de um servidor IMAP"""
    
    def __init__(self, server: str, port: int, email: str, password: str):
        self.server = server
        self.port = port
        self.email = email
        self.password = password
    
    def fetch_emails_from_sender(self, target_sender: str, mailbox: str = "inbox") -> List[Dict]:
        """Busca e-mails de um remetente específico"""
        try:
            with imaplib.IMAP4_SSL(self.server, self.port) as mail:
                mail.login(self.email, self.password)
                mail.select(mailbox)
                
                status, messages = mail.search(None, f'FROM "{target_sender}"')
                if status != "OK":
                    print("Erro ao buscar e-mails.")
                    return []
                
                return self._process_messages(mail, messages[0].split())
        
        except Exception as e:
            print(f"Erro: {e}")
            return []
    
    def _process_messages(self, mail, email_ids: List[bytes]) -> List[Dict]:
        """Processa as mensagens encontradas"""
        emails_found = []
        
        for email_id in email_ids:
            status, data = mail.fetch(email_id, "(RFC822)")
            if status != "OK":
                continue
            
            msg = email.message_from_bytes(data[0][1])
            email_info = EmailParser(msg).parse()
            emails_found.append(email_info)
        
        return emails_found


class EmailClient:
    """Classe principal que coordena todo o processo"""
    
    def __init__(self, email: str, password: str, target_sender: str):
        self.email = email
        self.password = password
        self.target_sender = target_sender
        self.fetcher = EmailFetcher(
            server="imap.skymail.net.br",
            port=993,
            email=email,
            password=password
        )
        self.saver = EmailSaver()
    
    def run(self):
        """Executa o processo completo de busca e salvamento de e-mails"""
        emails = self.fetcher.fetch_emails_from_sender(self.target_sender)
        
        if not emails:
            print("Nenhum e-mail encontrado do remetente especificado.")
            return
        
        print(f"🔎 E-mails encontrados de {self.target_sender}: {len(emails)}\n")
        for i, email_info in enumerate(emails, 1):
            self._display_email_info(email_info, i)
            caminho_arquivo = self.saver.save_email(email_info, i)
            print(f"💾 E-mail salvo em: {caminho_arquivo}\n")
    
    def _display_email_info(self, email_info: Dict, index: int):
        """Exibe informações do e-mail na saída padrão"""
        print(f"📧 E-mail #{index}")
        print(f"📌 Assunto: {email_info['assunto']}")
        print(f"📅 Data: {email_info['data']}")
        print("📝 Corpo completo:")
        print("-" * 50)
        print(email_info['corpo'].strip())
        print("-" * 50)
        print(f"📎 Tem anexos? {'Sim' if email_info['anexos'] else 'Não'}\n")


# Uso do sistema
if __name__ == "__main__":
    # Configurações (substitua pelas suas)
    EMAIL = "veeam.adtsa@adtsa.com.br"
    SENHA = "adt@curado1932"
    REMETENTE_ALVO = "veeam.adtsa@gmail.com"
    
    # Cria e executa o cliente de e-mail
    client = EmailClient(EMAIL, SENHA, REMETENTE_ALVO)
    client.run()