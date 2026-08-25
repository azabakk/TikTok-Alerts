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

// Estructura simplificada sin likes
let activeUsers = {
    followers: [],
    gifters: [] // Aquí guardaremos objetos detallados: { username, giftName, diamonds }
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

            // 1. Evento de Seguidores / Entradas
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

            // 2. Evento de Regalos Detallado
            tiktokConnection.on('gift', (data) => {
                if (data.giftType === 1 && !data.repeatEnd) return;
                
                const username = data.uniqueId || 'Donador';
                const giftName = data.giftName || 'Regalo';
                const diamondCount = data.diamondCount * (data.repeatCount || 1);
                
                // Guardamos el historial del regalo con sus detalles
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
            console.error('Error critico:', error.message);
            socket.emit('connection-status', { status: 'disconnected', message: 'Error interno' });
        }
    });

    socket.on('stop-live', () => {
        if (tiktokConnection) {
            try { tiktokConnection.disconnect(); } catch (e) {}
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

// Cargamos la librería base y la configuración del Sign Server de forma integrada
const tiktokLiveConnector = require('tiktok-live-connector');
const { TikTokLiveConnection, SignConfig } = tiktokLiveConnector;

// =========================================================================
// OBLIGATORIO: Regístrate gratis en https://eulerstream.com para obtener tu API Key
// Esto evitará de por vida que TikTok bloquee la conexión de tu servidor de Render.
SignConfig.apiKey = "euler_NjFlOTE3NWRjZWQwZTg5ODY4ZjJhMTBiMTQwOTBmZjZhY2NjZmUyMzdjMzcxZDVjNDdlY2Nm";
// =========================================================================

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Estructura limpia y sin la carga pesada de los likes
let activeUsers = {
    followers: [],
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
            // Inicialización limpia compatible con el servidor de firmas
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
                socket.emit('connection-status', { status: 'disconnected', message: 'Error de conexión' });
            });

            // 1. Monitorear Seguidores
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

            // 2. Monitorear Regalos (Desglose Avanzado)
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
            console.error('Error critico:', error.message);
            socket.emit('connection-status', { status: 'disconnected', message: 'Error interno' });
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
