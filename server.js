<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StreamAlerts LIVE</title>
    <link rel="manifest" href="manifest.json">
    <style>
        body {
            background-color: #0f1115;
            color: #e1e1e6;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 15px;
        }
        h1, h2, h3 {
            margin: 0 0 10px 0;
        }
        .header-title {
            color: #ff3b5c;
            font-size: 1.1rem;
            font-weight: bold;
            margin-bottom: 12px;
        }
        .card {
            background-color: #1a1c23;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
            border: 1px solid #2a2d37;
        }
        .card-title {
            font-size: 0.9rem;
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        input, select {
            width: 100%;
            padding: 8px;
            background-color: #12141a;
            border: 1px solid #2a2d37;
            border-radius: 4px;
            color: #fff;
            margin-bottom: 8px;
            box-sizing: border-box;
            font-size: 0.9rem;
        }
        button {
            width: 100%;
            padding: 9px;
            background-color: #ff3b5c;
            color: white;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            font-size: 0.9rem;
        }
        button:active {
            opacity: 0.9;
        }
        .status {
            font-size: 0.8rem;
            color: #a0a0a5;
            margin-top: 5px;
        }
        .stats-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .stat-box {
            background-color: #1a1c23;
            border: 1px solid #2a2d37;
            border-radius: 8px;
            padding: 10px;
        }
        .stat-header {
            font-size: 0.75rem;
            color: #a0a0a5;
            font-weight: bold;
            margin-bottom: 4px;
        }
        .stat-value {
            font-size: 1.1rem;
            font-weight: bold;
        }
        .stat-desc {
            font-size: 0.7rem;
            color: #707075;
            margin-top: 4px;
        }
        .label-desc {
            font-size: 0.75rem;
            color: #a0a0a5;
            margin-bottom: 6px;
        }
        .label-group {
            margin-bottom: 8px;
        }
        .label-group label {
            font-size: 0.8rem;
            color: #b0b0b5;
            display: block;
            margin-bottom: 3px;
        }
    </style>
</head>
<body>

    <div class="header-title">StreamAlerts LIVE</div>

    <!-- Conectar Transmisión -->
    <div class="card">
        <div class="card-title">🔗 Conectar Transmisión</div>
        <input type="text" id="usernameInput" placeholder="Usuario de TikTok (ej. @usuario)">
        <button id="connectBtn">Conectar</button>
        <div class="status" id="connectionStatus">Estado: Desconectado</div>
    </div>

    <!-- Repositorio de Sonidos -->
    <div class="card">
        <div class="card-title">⚙️ Repositorio de Sonidos</div>
        <div class="label-desc">Asigna un audio para cada interacción en TikTok</div>
        
        <div class="label-group">
            <label>Nuevos Seguidores</label>
            <select id="soundFollower">
                <option value="">Ninguno (Silencio)</option>
                <option value="follower.mp3">Seguidor por defecto</option>
            </select>
        </div>

        <div class="label-group">
            <label>Alerta de Regalos</label>
            <select id="soundGift">
                <option value="">Ninguno (Silencio)</option>
                <option value="gift.mp3">Regalo por defecto</option>
            </select>
        </div>
    </div>

    <!-- Seguidores y Regalos -->
    <div class="stats-container">
        <div class="stat-box">
            <div class="stat-header">👥 SEGUIDORES</div>
            <div class="stat-value" id="followerCount">0</div>
            <div class="stat-desc" id="followerStatus">Esperando seguidores...</div>
        </div>
        <div class="stat-box">
            <div class="stat-header" style="color: #ff9800;">🎁 REGALOS</div>
            <div class="stat-value" id="giftCount">0</div>
            <div class="stat-desc" id="giftStatus">Esperando regalos...</div>
        </div>
    </div>

    <script>
        let ws = null;
        let isConnected = false;

        const connectBtn = document.getElementById('connectBtn');
        const usernameInput = document.getElementById('usernameInput');
        const connectionStatus = document.getElementById('connectionStatus');
        
        const followerCountEl = document.getElementById('followerCount');
        const giftCountEl = document.getElementById('giftCount');
        const followerStatusEl = document.getElementById('followerStatus');
        const giftStatusEl = document.getElementById('giftStatus');

        const soundFollowerSelect = document.getElementById('soundFollower');
        const soundGiftSelect = document.getElementById('soundGift');

        let followersCount = 0;
        let giftsCount = 0;

        // Reproductor de audio que lee el archivo seleccionado en el combo box
        function playSelectedSound(selectElement) {
            const filename = selectElement.value;
            if (!filename || filename === "") return;
            
            const audio = new Audio(`Sounds/${filename}`);
            audio.play().catch(error => {
                console.log("Audio bloqueado o error al reproducir:", error);
            });
        }

        // Determina la URL del WebSocket de forma segura para Render
        function getWSUrl() {
            const loc = window.location;
            const proto = loc.protocol === 'https:' ? 'wss://' : 'ws://';
            return `${proto}${loc.host}`;
        }

        function conectar() {
            const username = usernameInput.value.trim();
            if (!username) {
                alert("Por favor ingresa un usuario de TikTok");
                return;
            }

            connectionStatus.textContent = "Estado: Conectando...";
            connectionStatus.style.color = "#ff9800";

            // Desbloquear audio del navegador con interacción táctil
            const unlockAudio = new Audio();
            unlockAudio.play().catch(() => {});

            ws = new WebSocket(getWSUrl());

            ws.onopen = () => {
                isConnected = true;
                connectionStatus.textContent = "Estado: Conectado";
                connectionStatus.style.color = "#4caf50";
                
                // Enviar el usuario al servidor backend
                ws.send(JSON.stringify({ action: 'set_username', username: username }));
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'follower') {
                        followersCount++;
                        followerCountEl.textContent = followersCount;
                        followerStatusEl.textContent = `Nuevo: ${data.user || 'Usuario'}`;
                        playSelectedSound(soundFollowerSelect);
                    } 
                    else if (data.type === 'gift') {
                        giftsCount += (data.count || 1);
                        giftCountEl.textContent = giftsCount;
                        giftStatusEl.textContent = `${data.user || 'Usuario'} envió regalo`;
                        playSelectedSound(soundGiftSelect);
                    }
                    else if (data.type === 'status') {
                        connectionStatus.textContent = `Estado: ${data.message}`;
                    }
                } catch (e) {
                    console.error("Error al procesar mensaje del servidor:", e);
                }
            };

            ws.onclose = () => {
                desconectarUI("Estado: Desconectado");
            };

            ws.onerror = (error) => {
                console.error("Error en WebSocket:", error);
                desconectarUI("Estado: Error de conexión");
            };
        }

        function desconectarUI(mensaje) {
            isConnected = false;
            connectionStatus.textContent = mensaje;
            connectionStatus.style.color = "#f44336";
            if (ws) {
                ws.close();
                ws = null;
            }
        }

        connectBtn.addEventListener('click', () => {
            if (isConnected) {
                desconectarUI("Estado: Desconectado");
            } else {
                conectar();
            }
        });
    </script>
</body>
</html>
