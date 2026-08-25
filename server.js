const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Importación precisa para evitar problemas de compatibilidad interna en Node.js
const tiktokLiveConnector = require('tiktok-live-connector');

// Accedemos explícitamente a la clase correcta según el empaquetado del autor
const TikTokLiveConnection = tiktokLiveConnector.TikTokLiveConnection || 
                             tiktokLiveConnector.WebcastPushConnection || 
                             tiktokLiveConnector;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
let likedUsers = new Set();

io.on('connection', (socket) => {
    console.log('Dispositivo movil conectado');
    let tiktokConnection = null;
    let sessionTimeout = null;

    socket.on('start-live', (tiktokUsername) => {
        if (!tiktokUsername) return;
        const cleanUsername = tiktokUsername.replace('@', '').trim();
        console.log(`Conectando con: @${cleanUsername}`);
        
        try {
            // Pasamos un objeto vacío de opciones {} como segundo parámetro para evitar que intente leer valores indefinidos
            tiktokConnection = new TikTokLiveConnection(cleanUsername, {});
            
            tiktokConnection.connect().then(state => {
                console.log(`Conectado al Room ID: ${state.roomId}`);
                socket.emit('connection-status', { status: 'connected', message: `Conectado a @${cleanUsername}` });

                sessionTimeout = setTimeout(() => {
                    if (tiktokConnection) tiktokConnection.disconnect();
                    socket.emit('connection-status', { status: 'disconnected', message: 'Limite de tiempo' });
                }, 21600000); 

            }).catch(err => {
                console.error('Error al conectar:', err.message);
                socket.emit('connection-status', { status: 'disconnected', message: 'Error de conexion' });
            });

            // Usamos "roomUser" que es el evento estándar de la última versión
            tiktokConnection.on('roomUser', (data) => {
                socket.emit('play-alert', { type: 'follow', name: data.uniqueId });
            });

            tiktokConnection.on('like', (data) => {
                const userId = data.uniqueId;
                if (!likedUsers.has(userId)) {
                    likedUsers.add(userId);
                    socket.emit('play-alert', { type: 'like', name: userId });
                }
            });

            tiktokConnection.on('gift', (data) => {
                if (data.giftType === 1 && !data.repeatEnd) return;
                const diamondCount = data.diamondCount * data.repeatCount;
                let tier = 'low';

                if (diamondCount >= 5000) tier = 'epic';
                else if (diamondCount >= 1000) tier = 'high';
                else if (diamondCount >= 100) tier = 'medium';
                
                socket.emit('play-alert', { type: 'gift', name: data.uniqueId, giftName: data.giftName, tier: tier, diamonds: diamondCount });
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
            likedUsers.clear();
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
