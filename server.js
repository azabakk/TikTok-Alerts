const express = require('express');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const { TikTokLiveConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
    allowEIO3: true
});

// Ajustado a mayúscula para coincidir con tu carpeta de GitHub
app.use(express.static('Public'));

let activeUsers = { followers: [], gifters: [] };
let sessionTimeout = null;

function getAvailableSounds() {
    try {
        // Ajustado a mayúsculas para leer tu repositorio
        const soundsDir = path.join(__dirname, 'Public', 'Sounds');
        if (!fs.existsSync(soundsDir)) return [];
        return fs.readdirSync(soundsDir).filter(file => file.endsWith('.mp3'));
    } catch (error) {
        return [];
    }
}

io.on('connection', (socket) => {
    let tiktokConnection = null;
    socket.emit('available-sounds', getAvailableSounds());

    socket.on('start-live', (tiktokUsername) => {
        if (!tiktokUsername) return;
        const cleanUsername = tiktokUsername.replace('@', '').trim();
        
        try {
            tiktokConnection = new TikTokLiveConnection(cleanUsername, { 
                processInitialData: false 
            });
            
            tiktokConnection.connect().then(state => {
                console.log(`Conectado exitosamente al live de @${cleanUsername}`);
                socket.emit('connection-status', { status: 'connected', message: `Conectado al live de @${cleanUsername}` });
                io.emit('update-interactions', activeUsers);

                sessionTimeout = setTimeout(() => {
                    if (tiktokConnection) tiktokConnection.disconnect();
                    socket.emit('connection-status', { status: 'disconnected', message: 'Límite de tiempo alcanzado' });
                }, 21600000); 

            }).catch(err => {
                console.error(`TikTok rechazó la conexión a @${cleanUsername}:`, err.message);
                socket.emit('connection-status', { status: 'disconnected', message: `Rechazado: ${err.message}` });
            });

            tiktokConnection.on('member', (data) => {
                const username = data.uniqueId || data.nickname || (data.user && data.user.uniqueId) || (data.user && data.user.nickname);
                if (username && !activeUsers.followers.includes(username)) {
                    activeUsers.followers.push(username);
                    io.emit('update-interactions', activeUsers);
                }
                io.emit('play-alert', { type: 'follow', name: username || 'Usuario' });
            });

            tiktokConnection.on('follow', (data) => {
                const username = data.uniqueId || data.nickname || (data.user && data.user.uniqueId) || (data.user && data.user.nickname);
                if (username && !activeUsers.followers.includes(username)) {
                    activeUsers.followers.push(username);
                    io.emit('update-interactions', activeUsers);
                }
                io.emit('play-alert', { type: 'follow', name: username || 'Nuevo Seguidor' });
            });

            tiktokConnection.on('gift', (data) => {
                if (data.giftType === 1 && !data.repeatEnd) return;
                
                const username = data.uniqueId || data.nickname || (data.user && data.user.uniqueId) || (data.user && data.user.nickname) || 'Donador';
                const giftName = data.giftName || (data.gift && data.gift.name) || 'Regalo';
                const diamondCount = (data.diamondCount || 1) * (data.repeatCount || 1);
                
                activeUsers.gifters.push({ username, giftName, diamonds: diamondCount });
                io.emit('update-interactions', activeUsers);

                let tier = diamondCount >= 5000 ? 'epic' : diamondCount >= 1000 ? 'high' : diamondCount >= 100 ? 'medium' : 'low';
                io.emit('play-alert', { type: 'gift', name: username, giftName, tier, diamonds: diamondCount });
            });

        } catch (error) {
            console.error("Fallo interno de la librería:", error.message);
            socket.emit('connection-status', { status: 'disconnected', message: `Fallo interno: ${error.message}` });
        }
    });

    socket.on('stop-live', () => {
        if (tiktokConnection) {
            try { tiktokConnection.disconnect(); } catch (e) {}
            clearTimeout(sessionTimeout);
            activeUsers = { followers: [], gifters: [] };
            io.emit('update-interactions', activeUsers);
            socket.emit('connection-status', { status: 'disconnected', message: 'Desconectado' });
            console.log("Desconexión manual solicitada por el usuario.");
        }
    });

    socket.on('disconnect', () => {
        if (tiktokConnection) {
            try { tiktokConnection.disconnect(); } catch (e) {}
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
