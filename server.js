const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
    allowEIO3: true
});

app.use(express.static('public'));

let activeUsers = { followers: [], gifters: [] };
let sessionTimeout = null;

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
    let tiktokConnection = null;
    socket.emit('available-sounds', getAvailableSounds());

    socket.on('start-live', (tiktokUsername) => {
        if (!tiktokUsername) return;
        const cleanUsername = tiktokUsername.replace('@', '').trim();
        
        try {
            // Conexión pura, sin opciones extras que causen conflictos de versión
            tiktokConnection = new WebcastPushConnection(cleanUsername);
            
            tiktokConnection.connect().then(state => {
                socket.emit('connection-status', { status: 'connected', message: `Conectado a @${cleanUsername}` });
                io.emit('update-interactions', activeUsers);

                sessionTimeout = setTimeout(() => {
                    if (tiktokConnection) tiktokConnection.disconnect();
                    socket.emit('connection-status', { status: 'disconnected', message: 'Límite de tiempo alcanzado' });
                }, 21600000); 

            }).catch(err => {
                // Si TikTok rechaza la conexión (ej. usuario desconectado)
                socket.emit('connection-status', { status: 'disconnected', message: `TikTok rechazó: ${err.message}` });
            });

            tiktokConnection.on('member', (data) => {
                let username = data.uniqueId;
                if (username && !activeUsers.followers.includes(username)) {
                    activeUsers.followers.push(username);
                    io.emit('update-interactions', activeUsers);
                }
                io.emit('play-alert', { type: 'follow', name: username || 'Usuario' });
            });

            tiktokConnection.on('gift', (data) => {
                if (data.giftType === 1 && !data.repeatEnd) return;
                
                const username = data.uniqueId || 'Donador';
                const giftName = data.giftName || 'Regalo';
                const diamondCount = data.diamondCount * (data.repeatCount || 1);
                
                activeUsers.gifters.push({ username, giftName, diamonds: diamondCount });
                io.emit('update-interactions', activeUsers);

                let tier = diamondCount >= 5000 ? 'epic' : diamondCount >= 1000 ? 'high' : diamondCount >= 100 ? 'medium' : 'low';
                io.emit('play-alert', { type: 'gift', name: username, giftName, tier, diamonds: diamondCount });
            });

        } catch (error) {
            // Si la librería falla al intentar inicializarse, enviamos el error REAL a tu celular
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
