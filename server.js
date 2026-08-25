const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let likedUsers = new Set();

io.on('connection', (socket) => {
    console.log('📱 Dispositivo móvil conectado al panel de control');

    let tiktokConnection = null;
    let sessionTimeout = null;

    socket.on('start-live', (tiktokUsername) => {
        if (!tiktokUsername) return;

        // Limpiamos el usuario por si se escribió con un '@' extra accidentalmente
        const cleanUsername = tiktokUsername.replace('@', '').trim();
        console.log(`🔍 Conectando con el live de: @${cleanUsername}`);
        
        try {
            // El "escudo" principal: si esto falla, el catch lo atrapa sin apagar el servidor
            tiktokConnection = new WebcastPushConnection(cleanUsername);

            tiktokConnection.connect().then(state => {
                console.log(`✅ Conectado exitosamente al Room ID: ${state.roomId}`);
                socket.emit('connection-status', { status: 'connected', message: `Conectado a @${cleanUsername}` });

                sessionTimeout = setTimeout(() => {
                    console.log('⏰ Límite de 6 horas alcanzado. Cerrando conexión.');
                    if (tiktokConnection) tiktokConnection.disconnect();
                    socket.emit('connection-status', { status: 'disconnected', message: 'Límite de 6 horas alcanzado' });
                }, 6 * 60 * 60 * 1000); 

            }).catch(err => {
                console.error('❌ Error al conectar (Promesa):', err.message);
                // Si TikTok bloquea la conexión o no hay live, descongela el botón de la app
                socket.emit('connection-status', { status: 'disconnected', message: 'Error de conexión. Intenta de nuevo.' });
            });

            tiktokConnection.on('member', (data) => {
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
                else tier = 'low';

                socket.emit('play-alert', { 
                    type: 'gift', 
                    name: data.uniqueId, 
                    giftName: data.giftName, 
                    tier: tier,
                    diamonds: diamondCount 
                });
            });

        } catch (error) {
            console.error('💥 Error crítico en el constructor:', error.message);
            // Avisa a la app para que quite el estado "Conectando..."
            socket.emit('connection-status', { status: 'disconnected', message: 'Error interno. Intenta de nuevo.' });
        }
    });

    socket.on('stop-live', () => {
        if (tiktokConnection) {
            try { tiktokConnection.disconnect(); } catch (e) {}
            clearTimeout(sessionTimeout);
            likedUsers.clear();
            console.log('🔌 Transmisión desconectada manualmente');
            socket.emit('connection-status', { status: 'disconnected', message: 'Desconectado' });
        }
    });

    socket.on('disconnect', () => {
        if (tiktokConnection) {
            try { tiktokConnection.disconnect(); } catch (e) {}
        }
        clearTimeout(sessionTimeout);
        console.log('📱 Dispositivo desconectado');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
                console.log('⏰ Límite de 6 horas alcanzado. Cerrando conexión.');
                if (tiktokConnection) tiktokConnection.disconnect();
                socket.emit('connection-status', { status: 'disconnected', message: 'Límite de 6 horas alcanzado' });
            }, 6 * 60 * 60 * 1000); // 6 horas en milisegundos

        }).catch(err => {
            console.error('❌ Error al conectar:', err);
            socket.emit('connection-status', { status: 'error', message: 'No se pudo conectar. Verifica si estás en vivo.' });
        });

        // 1. EVENTO: NUEVOS SEGUIDORES / UNIONES
        tiktokConnection.on('member', (data) => {
            socket.emit('play-alert', { type: 'follow', name: data.uniqueId });
        });

        // 2. EVENTO: ME GUSTA (Filtro del primer tap)
        tiktokConnection.on('like', (data) => {
            const userId = data.uniqueId;
            if (!likedUsers.has(userId)) {
                likedUsers.add(userId); // Registramos que ya dio su primer tap
                socket.emit('play-alert', { type: 'like', name: userId });
            }
        });

        // 3. EVENTO: REGALOS (Clasificación por valor en monedas)
        tiktokConnection.on('gift', (data) => {
            if (data.giftType === 1 && !data.repeatEnd) return; // Ignorar ráfagas intermedias

            const diamondCount = data.diamondCount * data.repeatCount;
            let tier = 'low';

            if (diamondCount >= 5000) tier = 'epic';       // Ej: León, Universo
            else if (diamondCount >= 1000) tier = 'high';  // Ej: Carrusel
            else if (diamondCount >= 100) tier = 'medium'; // Ej: Regalos medianos
            else tier = 'low';                             // Ej: Rosas

            socket.emit('play-alert', { 
                type: 'gift', 
                name: data.uniqueId, 
                giftName: data.giftName, 
                tier: tier,
                diamonds: diamondCount 
            });
        });
    });

    // Desconectar manualmente desde la app
    socket.on('stop-live', () => {
        if (tiktokConnection) {
            tiktokConnection.disconnect();
            clearTimeout(sessionTimeout);
            likedUsers.clear();
            console.log('🔌 Transmisión desconectada manualmente');
            socket.emit('connection-status', { status: 'disconnected', message: 'Desconectado' });
        }
    });

    socket.on('disconnect', () => {
        if (tiktokConnection) tiktokConnection.disconnect();
        clearTimeout(sessionTimeout);
        console.log('📱 Dispositivo desconectado');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
