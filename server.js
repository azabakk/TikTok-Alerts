const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Servir archivos estáticos desde la carpeta 'Public'
app.use(express.static(path.join(__dirname, 'Public')));
// Servir la carpeta de sonidos con la 'S' mayúscula
app.use('/Sounds', express.static(path.join(__dirname, 'Sounds')));

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    // Leer la carpeta Sounds y enviar la lista al cliente de inmediato
    const soundsDir = path.join(__dirname, 'Sounds');
    if (fs.existsSync(soundsDir)) {
        fs.readdir(soundsDir, (err, files) => {
            if (!err) {
                const audioFiles = files.filter(file => file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.ogg'));
                socket.emit('available-sounds', audioFiles);
            } else {
                socket.emit('available-sounds', []);
            }
        });
    } else {
        socket.emit('available-sounds', []);
    }

    let tiktokLiveConnection = null;
    let activeUsers = {
        followers: [],
        gifters: []
    };

    socket.on('start-live', (tiktokUsername) => {
        if (!tiktokUsername) return;
        
        if (tiktokLiveConnection) {
            try {
                tiktokLiveConnection.disconnect();
            } catch(e) {}
        }

        const cleanUsername = tiktokUsername.replace(/^@/, '');
        
        // Conexión estable y blindada para capturar nombres reales
        tiktokLiveConnection = new WebcastPushConnection(cleanUsername, {
            processInitialData: false
        });

        tiktokLiveConnection.connect().then(state => {
            console.log(`Conectado a la sala de TikTok: ${state.roomId}`);
            socket.emit('connection-status', { status: 'connected', message: `Conectado a @${cleanUsername}` });
        }).catch(err => {
            console.error('Error al conectar a TikTok:', err);
            socket.emit('connection-status', { status: 'disconnected', message: 'No se pudo conectar. ¿El usuario está en directo?' });
        });

        // Evento de Seguidores
        tiktokLiveConnection.on('social', (data) => {
            if (data.displayType && data.displayType.includes('follow')) {
                const username = data.uniqueId || data.nickname || 'Usuario';
                if (!activeUsers.followers.includes(username)) {
                    activeUsers.followers.unshift(username);
                    if (activeUsers.followers.length > 20) activeUsers.followers.pop();
                }
                socket.emit('update-interactions', activeUsers);
                socket.emit('play-alert', { type: 'follow' });
            }
        });

        // Evento de Regalos
        tiktokLiveConnection.on('gift', (data) => {
            if (data.giftType === 1 || !data.repeatEnd || data.repeatEnd === true) {
                const giftObj = {
                    username: data.uniqueId || data.nickname || 'Usuario',
                    giftName: data.giftName || 'Regalo',
                    diamonds: (data.diamondCount || 0) * (data.repeatCount || 1)
                };
                activeUsers.gifters.unshift(giftObj);
                if (activeUsers.gifters.length > 20) activeUsers.gifters.pop();
                
                socket.emit('update-interactions', activeUsers);
                socket.emit('play-alert', { type: 'gift' });
            }
        });
    });

    socket.on('stop-live', () => {
        if (tiktokLiveConnection) {
            try {
                tiktokLiveConnection.disconnect();
            } catch(e) {}
            tiktokLiveConnection = null;
        }
        activeUsers = { followers: [], gifters: [] };
        socket.emit('connection-status', { status: 'disconnected', message: 'Desconectado de la transmisión' });
        socket.emit('update-interactions', activeUsers);
    });

    socket.on('disconnect', () => {
        if (tiktokLiveConnection) {
            try {
                tiktokLiveConnection.disconnect();
            } catch(e) {}
        }
        console.log('Cliente desconectado');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
