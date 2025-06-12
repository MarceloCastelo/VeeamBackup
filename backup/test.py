import os
import csv
import re
from datetime import datetime

pasta = 'emails_salvos'
arquivos = [arq for arq in os.listdir(pasta) if arq.endswith('.txt')]

for arquivo in arquivos:
    caminho_arquivo = os.path.join(pasta, arquivo)
    
    with open(caminho_arquivo, 'r', encoding='utf-8') as file:
        conteudo = file.read()

    # Extrair data
    data_email = re.search(r'Date:\s*(.*)', conteudo)
    data_formatada = datetime.now().strftime('%Y-%m-%d')
    if data_email:
        try:
            data_str = data_email.group(1).strip()
            data_formatada = datetime.strptime(data_str, '%a, %d %b %Y %H:%M:%S %z').strftime('%Y-%m-%d')
        except ValueError:
            pass

    # Extrair a tabela de hosts
    tabela_match = re.search(r'\*Name\*.*?\n(.*?)(?:\n\nVeeam|\Z)', conteudo, re.DOTALL)
    if not tabela_match:
        print(f"Nenhuma tabela encontrada no arquivo {arquivo}")
        continue

    # Processamento direto - versão simplificada
    registros = []
    padrao_host = re.compile(
        r'^([^\s]+)\s+(\d+\.\d+\.\d+\.\d+)\s+(Success|Warning|Error)',
        re.MULTILINE
    )

    for match in padrao_host.finditer(tabela_match.group(1)):
        nome = match.group(1)
        ip = match.group(2)
        status = match.group(3)
        registros.append([nome, ip, status, data_formatada])

    # Salvar CSV
    if registros:
        nome_csv = arquivo.replace('.txt', '.csv')
        caminho_csv = os.path.join(pasta, nome_csv)

        with open(caminho_csv, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(['Nome', 'IP', 'Status', 'Data'])
            writer.writerows(registros)
        
        print(f'✅ {nome_csv} criado com {len(registros)} registros!')
        print('Registros capturados:')
        for idx, reg in enumerate(registros, 1):
            print(f"{idx}. {reg[0]} ({reg[1]}) - {reg[2]}")
    else:
        print(f'⚠️ Nenhum registro válido encontrado em {arquivo}')