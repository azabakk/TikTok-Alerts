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

// Estructura para almacenar los usuarios activos de la sesión
let activeUsers = {
    followers: [],
    likers: [],
    gifters: []
};

// Función para obtener la lista de sonidos mp3 automáticamente
function getAvailableSounds() {
    const soundsDir = path.join(__dirname, 'public', 'sounds');
    if (!fs.existsSync(soundsDir)) return [];
    return fs.readdirSync(soundsDir).filter(file => file.endsWith('.mp3'));
}

io.on('connection', (socket) => {
    console.log('Dispositivo movil conectado');
    let tiktokConnection = null;
    let sessionTimeout = null;

    // Enviamos el repositorio de sonidos al conectar la pestaña
    socket.emit('available-sounds', getAvailableSounds());

    socket.on('start-live', (tiktokUsername) => {
        if (!tiktokUsername) return;
        const cleanUsername = tiktokUsername.replace('@', '').trim();
        console.log(`Conectando con: @${cleanUsername}`);
        
        try {
            tiktokConnection = new TikTokLiveConnection(cleanUsername, {});
            
            tiktokConnection.connect().then(state => {
                console.log(`Conectado al Room ID: ${state.roomId}`);
                
                // Confirmamos la conexión al frontend
                socket.emit('connection-status', { status: 'connected', message: `Conectado a @${cleanUsername}` });
                
                // Sincronizamos el estado inicial del monitor para activar el panel
                io.emit('update-interactions', activeUsers);

                sessionTimeout = setTimeout(() => {
                    if (tiktokConnection) tiktokConnection.disconnect();
                    socket.emit('connection-status', { status: 'disconnected', message: 'Limite de tiempo' });
                }, 21600000); 

            }).catch(err => {
                console.error('Error al conectar:', err.message);
                socket.emit('connection-status', { status: 'disconnected', message: 'Error de conexion o no esta en LIVE' });
            });

            // 1. Seguidores o entradas al live
            tiktokConnection.on('roomUser', (data) => {
                const username = data.uniqueId;
                if (!activeUsers.followers.includes(username)) {
                    activeUsers.followers.push(username);
                    io.emit('update-interactions', activeUsers);
                }
                socket.emit('play-alert', { type: 'follow', name: username });
            });

            // 2. Likes recibidos
            tiktokConnection.on('like', (data) => {
                const username = data.uniqueId;
                if (!activeUsers.likers.includes(username)) {
                    activeUsers.likers.push(username);
                    io.emit('update-interactions', activeUsers);
                }
                socket.emit('play-alert', { type: 'like', name: username });
            });

            // 3. Regalos recibidos
            tiktokConnection.on('gift', (data) => {
                if (data.giftType === 1 && !data.repeatEnd) return;
                
                const username = data.uniqueId;
                if (!activeUsers.gifters.includes(username)) {
                    activeUsers.gifters.push(username);
                    io.emit('update-interactions', activeUsers);
                }

                const diamondCount = data.diamondCount * data.repeatCount;
                let tier = 'low';
                if (diamondCount >= 5000) tier = 'epic';
                else if (diamondCount >= 1000) tier = 'high';
                else if (diamondCount >= 100) tier = 'medium';
                
                socket.emit('play-alert', { type: 'gift', name: username, giftName: data.giftName, tier: tier, diamonds: diamondCount });
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
