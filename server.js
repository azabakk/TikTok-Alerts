const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const { TikTokLiveConnection, SignConfig } = require('tiktok-live-connector');

// CONFIGURACIÓN DEL SERVIDOR DE FIRMAS (EULER STREAM)
// Coloca aquí tu API Key del plan gratuito de eulerstream.com para evitar bloqueos
SignConfig.apiKey = "euler_NjFlOTE3NWRjZWQwZTg5ODY4ZjJhMTBiMTQwOTBmZjZhY2NjZmUyMzdjMzcxZDVjNDdlY2Nm"; 

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

let activeUsers = {
    followers: [],
    gifters: []
};

function getAvailableSounds() {
    try {
        const soundsDir = path.join(__dirname, 'public', 'sounds');
        if (!fs.existsSync(soundsDir)) return [];
        return fs.readdirSync(soundsDir).filter(file => file.endsWith('.mp3'));
    } catch (error) {
        return [];
    }
}

io.on('connection', (socket) => {
    console.log('Cliente conectado al panel web');
    let tiktokConnection = null;
    let sessionTimeout = null;

    socket.emit('available-sounds', getAvailableSounds());

    socket.on('start-live', (tiktokUsername) => {
        if (!tiktokUsername) return;
        const cleanUsername = tiktokUsername.replace('@', '').trim();
        console.log(`Intentando conectar con TikTok LIVE: @${cleanUsername}`);
        
        try {
            tiktokConnection = new TikTokLiveConnection(cleanUsername, {
                enableWebsocketUpgrade: true
            });
            
            tiktokConnection.connect().then(state => {
                console.log(`Conectado al Room ID de TikTok: ${state.roomId}`);
                socket.emit('connection-status', { status: 'connected', message: `Conectado a @${cleanUsername}` });
                io.emit('update-interactions', activeUsers);

                sessionTimeout = setTimeout(() => {
                    if (tiktokConnection) tiktokConnection.disconnect();
                    socket.emit('connection-status', { status: 'disconnected', message: 'Límite de tiempo alcanzado' });
                }, 21600000); 

            }).catch(err => {
                console.error('Error al conectar con TikTok:', err.message);
                socket.emit('connection-status', { status: 'disconnected', message: 'Error o streamer fuera de línea' });
            });

            // 1. Seguidores
            tiktokConnection.on('roomUser', (data) => {
                let username = null;
                if (data.createUser && data.createUser.uniqueId) {
                    username = data.createUser.uniqueId;
                } else if (data.uniqueId) {
                    username = data.uniqueId;
                }

                if (username && !activeUsers.followers.includes(username)) {
                    activeUsers.followers.push(username);
                    io.emit('update-interactions', activeUsers);
                }
                io.emit('play-alert', { type: 'follow', name: username || 'Usuario' });
            });

            // 2. Regalos detallados
            tiktokConnection.on('gift', (data) => {
                if (data.giftType === 1 && !data.repeatEnd) return;
                
                const username = data.uniqueId || 'Donador';
                const giftName = data.giftName || 'Regalo';
                const diamondCount = data.diamondCount * (data.repeatCount || 1);
                
                activeUsers.gifters.push({
                    username: username,
                    giftName: giftName,
                    diamonds: diamondCount
                });
                
                io.emit('update-interactions', activeUsers);

                let tier = 'low';
                if (diamondCount >= 5000) tier = 'epic';
                else if (diamondCount >= 1000) tier = 'high';
                else if (diamondCount >= 100) tier = 'medium';
                
                io.emit('play-alert', { 
                    type: 'gift', 
                    name: username, 
                    giftName: giftName, 
                    tier: tier, 
                    diamonds: diamondCount 
                });
            });

        } catch (error) {
            console.error('Error crítico:', error.message);
            socket.emit('connection-status', { status: 'disconnected', message: 'Error interno de inicialización' });
        }
    });

    socket.on('stop-live', () => {
        if (tiktokConnection) {
            try { tiktokConnection.disconnect(); } catch (e) {}
            clearTimeout(sessionTimeout);
            activeUsers = { followers: [], gifters: [] };
            io.emit('update-interactions', activeUsers);
            socket.emit('connection-status', { status: 'disconnected', message: 'Desconectado' });
        }
    });

    socket.on('disconnect', () => {
        if (tiktokConnection) {
            try { tiktokConnection.disconnect(); } catch (e) {}
        }
        clearTimeout(sessionTimeout);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
});
