# Guia de Instalação e Configuração do go2rtc

Este guia explica como configurar o go2rtc para converter streams RTSP das suas câmeras IP em formatos compatíveis com navegadores web (WebRTC, HLS, MSE).

## 📋 Visão Geral

O **go2rtc** é um conversor de streams de vídeo que permite:
- Receber streams RTSP de câmeras IP
- Converter para WebRTC (menor latência) ou HLS/MSE (maior compatibilidade)
- Servir múltiplos clientes sem sobrecarregar as câmeras

```
[Câmera IP] --RTSP--> [go2rtc] --WebRTC--> [PortaCerta no Browser]
```

## 🖥️ Requisitos

- Computador ou Raspberry Pi na mesma rede das câmeras
- Câmeras IP com suporte RTSP
- Acesso à rede local

## 📥 Instalação

### Windows

1. **Baixar go2rtc:**
   - Acesse: https://github.com/AlexxIT/go2rtc/releases
   - Baixe `go2rtc_win64.zip`
   - Extraia para uma pasta (ex: `C:\go2rtc\`)

2. **Criar arquivo de configuração:**
   - Na pasta do go2rtc, crie o arquivo `go2rtc.yaml`

3. **Executar:**
   ```cmd
   cd C:\go2rtc
   go2rtc.exe
   ```

### Linux / Raspberry Pi

1. **Instalar via script:**
   ```bash
   # Criar diretório
   sudo mkdir -p /opt/go2rtc
   cd /opt/go2rtc
   
   # Baixar última versão (ajuste a arquitetura se necessário)
   # Para Raspberry Pi 4: linux_arm64
   # Para Raspberry Pi 3 ou Zero 2: linux_arm
   # Para PC Linux: linux_amd64
   sudo wget https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_amd64
   
   # Tornar executável
   sudo chmod +x go2rtc_linux_amd64
   sudo mv go2rtc_linux_amd64 go2rtc
   ```

2. **Criar configuração:**
   ```bash
   sudo nano /opt/go2rtc/go2rtc.yaml
   ```

3. **Executar:**
   ```bash
   cd /opt/go2rtc
   sudo ./go2rtc
   ```

### Docker

```bash
docker run -d \
  --name go2rtc \
  --network host \
  -v /path/to/go2rtc.yaml:/config/go2rtc.yaml \
  alexxit/go2rtc
```

## ⚙️ Configuração

### Arquivo go2rtc.yaml

Crie o arquivo `go2rtc.yaml` com suas câmeras:

```yaml
# go2rtc.yaml

# Configuração de rede
api:
  listen: ":1984"

# Suas câmeras RTSP
streams:
  # Câmera de Entrada
  entrada: rtsp://usuario:senha@192.168.1.101:554/stream1
  
  # Câmera de Saída
  saida: rtsp://usuario:senha@192.168.1.102:554/stream1
```

### URLs RTSP por Fabricante

#### Hikvision
```yaml
streams:
  entrada: rtsp://admin:senha@192.168.1.101:554/Streaming/Channels/101
  # Canal 101 = Stream principal
  # Canal 102 = Substream (menor resolução, mais leve)
```

#### Dahua
```yaml
streams:
  entrada: rtsp://admin:senha@192.168.1.101:554/cam/realmonitor?channel=1&subtype=0
  # subtype=0 = Stream principal
  # subtype=1 = Substream
```

#### Intelbras (baseado em Dahua)
```yaml
streams:
  entrada: rtsp://admin:senha@192.168.1.101:554/cam/realmonitor?channel=1&subtype=1
```

#### Tapo (TP-Link)
```yaml
streams:
  entrada: rtsp://usuario:senha@192.168.1.101:554/stream1
```

#### Reolink
```yaml
streams:
  entrada: rtsp://admin:senha@192.168.1.101:554/h264Preview_01_main
  # ou para substream: rtsp://admin:senha@192.168.1.101:554/h264Preview_01_sub
```

#### ONVIF Genérico
```yaml
streams:
  entrada: rtsp://admin:senha@192.168.1.101:554/onvif1
```

### Dica: Descobrir URL RTSP

1. **Use o ONVIF Device Manager** (Windows):
   - Baixe: https://sourceforge.net/projects/onvifdm/
   - Detecta câmeras ONVIF automaticamente e mostra URLs RTSP

2. **VLC Media Player:**
   - Teste a URL via: Mídia > Abrir Fluxo de Rede

## ✅ Testando

1. **Inicie o go2rtc**

2. **Acesse a interface web:**
   ```
   http://IP_DO_SERVIDOR:1984
   ```

3. **Verifique os streams:**
   - Você verá os streams "entrada" e "saida" listados
   - Clique em um deles para ver o vídeo

4. **API de verificação:**
   ```bash
   curl http://192.168.1.100:1984/api/streams
   ```
   
   Deve retornar algo como:
   ```json
   {
     "entrada": {
       "producers": [...],
       "consumers": [...]
     },
     "saida": {
       "producers": [...],
       "consumers": [...]
     }
   }
   ```

## 🔧 Executar como Serviço

### Linux (systemd)

1. **Criar arquivo de serviço:**
   ```bash
   sudo nano /etc/systemd/system/go2rtc.service
   ```

2. **Conteúdo do arquivo:**
   ```ini
   [Unit]
   Description=go2rtc RTSP to WebRTC Converter
   After=network.target

   [Service]
   Type=simple
   ExecStart=/opt/go2rtc/go2rtc -config /opt/go2rtc/go2rtc.yaml
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

3. **Ativar e iniciar:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable go2rtc
   sudo systemctl start go2rtc
   
   # Verificar status
   sudo systemctl status go2rtc
   ```

### Windows (Executar na Inicialização)

1. Crie um arquivo `start-go2rtc.bat`:
   ```batch
   @echo off
   cd C:\go2rtc
   go2rtc.exe
   ```

2. Pressione `Win + R`, digite `shell:startup`
3. Crie um atalho para o arquivo `.bat` nessa pasta

## 🌐 Configuração no PortaCerta

1. Acesse **Configurações > Câmeras IP**

2. Preencha:
   - **URL do Servidor:** `http://192.168.1.100:1984` (IP do computador com go2rtc)
   - **Stream Entrada:** `entrada`
   - **Stream Saída:** `saida`

3. Use o botão **Testar** para verificar conexão

4. Selecione **Câmera IP** como fonte de vídeo para cada câmera

5. Salve e acesse o **Monitoramento Dual**

## 🔥 Solução de Problemas

### Câmera não conecta

1. **Verifique a URL RTSP:**
   ```bash
   ffplay rtsp://usuario:senha@IP_CAMERA:554/stream
   ```

2. **Verifique firewall:**
   - Porta 554 (RTSP) deve estar acessível da máquina go2rtc
   - Porta 1984 deve estar acessível do browser

3. **Credenciais:**
   - Confirme usuário e senha da câmera
   - Alguns fabricantes exigem ativar RTSP nas configurações

### Latência alta

1. Use substream (menor resolução) em vez de stream principal
2. No go2rtc.yaml, adicione configuração de buffer:
   ```yaml
   streams:
     entrada:
       - rtsp://admin:senha@192.168.1.101:554/stream
       - "ffmpeg:entrada#video=copy#audio=copy"
   ```

### Conexão WebRTC falha

1. Verifique se a porta UDP está aberta (WebRTC usa portas dinâmicas)
2. Se estiver atrás de NAT, configure STUN/TURN:
   ```yaml
   webrtc:
     ice_servers:
       - urls: [stun:stun.l.google.com:19302]
   ```

### go2rtc não inicia

1. Verifique logs:
   ```bash
   journalctl -u go2rtc -f
   ```

2. Teste configuração:
   ```bash
   ./go2rtc -config go2rtc.yaml
   ```

## 📚 Recursos Adicionais

- **Documentação go2rtc:** https://github.com/AlexxIT/go2rtc
- **Wiki com exemplos:** https://github.com/AlexxIT/go2rtc/wiki
- **Issues/Suporte:** https://github.com/AlexxIT/go2rtc/issues

## 🔒 Segurança

⚠️ **Importante:** O go2rtc por padrão não tem autenticação. Para ambientes de produção:

1. Use firewall para limitar acesso à porta 1984
2. Considere usar proxy reverso (nginx) com autenticação
3. Mantenha o go2rtc atualizado

```yaml
# Exemplo com limitação de IP (go2rtc.yaml)
api:
  listen: "127.0.0.1:1984"  # Apenas localhost
```
