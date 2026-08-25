const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const tiktokLiveConnector = require('tiktok-live-connector');
const TikTokLiveConnection = tiktokLiveConnector.TikTokLiveConnection || 
                             tiktokLiveConnector.WebcastPushConnection || 
                             tiktokLiveConnector;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let activeUsers = {
    followers: [],
    likers: [],
    gifters: []
};

function getAvailableSounds() {
    const soundsDir = path.join(__dirname, 'public', 'sounds');
    if (!fs.existsSync(soundsDir)) return [];
    return fs.readdirSync(soundsDir).filter(file => file.endsWith('.mp3'));
}

io.on('connection', (socket) => {
    console.log('Dispositivo movil conectado');
    let tiktokConnection = null;
    let sessionTimeout = null;

    socket.emit('available-sounds', getAvailableSounds());

    socket.on('start-live', (tiktokUsername) => {
        if (!tiktokUsername) return;
        const cleanUsername = tiktokUsername.replace('@', '').trim();
        console.log(`Conectando con: @${cleanUsername}`);
        
        try {
            tiktokConnection = new TikTokLiveConnection(cleanUsername, {
                enableWebsocketUpgrade: true
            });
            
            tiktokConnection.connect().then(state => {
                console.log(`Conectado al Room ID: ${state.roomId}`);
                
                socket.emit('connection-status', { status: 'connected', message: `Conectado a @${cleanUsername}` });
                io.emit('update-interactions', activeUsers);

                sessionTimeout = setTimeout(() => {
                    if (tiktokConnection) tiktokConnection.disconnect();
                    socket.emit('connection-status', { status: 'disconnected', message: 'Limite de tiempo' });
                }, 21600000); 

            }).catch(err => {
                console.error('Error al conectar:', err.message);
                socket.emit('connection-status', { status: 'disconnected', message: 'Error o el streamer no está en vivo' });
            });

                                    // 1. Seguidores o entradas al live
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

            // 2. Likes recibidos (Optimizado para procesar likes masivos)
            tiktokConnection.on('like', (data) => {
                const username = data.uniqueId || 'Espectador';
                
                // Si el usuario no está registrado en el histórico, lo añadimos
                if (!activeUsers.likers.includes(username)) {
                    activeUsers.likers.push(username);
                }
                
                // Sincronizamos las interacciones reflejando el incremento
                io.emit('update-interactions', activeUsers);
                io.emit('play-alert', { type: 'like', name: username });
            });

            // 3. Regalos recibidos (Optimizado para mapear cantidad exacta)
            tiktokConnection.on('gift', (data) => {
                // Validación para evitar procesar ráfagas incompletas
                if (data.giftType === 1 && !data.repeatEnd) return;
                
                const username = data.uniqueId || 'Donador';
                if (!activeUsers.gifters.includes(username)) {
                    activeUsers.gifters.push(username);
                }
                
                io.emit('update-interactions', activeUsers);

                const diamondCount = data.diamondCount * (data.repeatCount || 1);
                let tier = 'low';
                if (diamondCount >= 5000) tier = 'epic';
                else if (diamondCount >= 1000) tier = 'high';
                else if (diamondCount >= 100) tier = 'medium';
                
                io.emit('play-alert', { 
                    type: 'gift', 
                    name: username, 
                    giftName: data.giftName || 'Regalo', 
                    tier: tier, 
                    diamonds: diamondCount 
                });
            });

            
        } catch (error) {
            console.error('Error critico:', error.message);
            socket.emit('connection-status', { status: 'disconnected', message: 'Error interno' });
        }
    });

    socket.on('stop-live', () => {
        if (tiktokConnection) {
            try { tiktokConnection.disconnect(); } catch (e) {}
            clearTimeout(sessionTimeout);
            activeUsers = { followers: [], likers: [], gifters: [] };
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
