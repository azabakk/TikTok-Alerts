const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir la interfaz visual (el archivo index.html que creamos antes)
app.use(express.static('public'));

// Memoria temporal para el filtro de "Me gusta" (solo el primer tap por usuario)
let likedUsers = new Set();

io.on('connection', (socket) => {
    console.log('📱 Dispositivo móvil conectado al panel de control');

    let tiktokConnection = null;
    let sessionTimeout = null;

    // Escuchar cuando la app presiona el botón de conectar
    socket.on('start-live', (tiktokUsername) => {
        if (!tiktokUsername) return;

        console.log(`🔍 Conectando con el live de: @${tiktokUsername}`);
        
        // Conexión oficial mediante el conector de TikTok (sin contraseñas) [cite: 1.1.2]
        tiktokConnection = new WebcastPushConnection(tiktokUsername);

        tiktokConnection.connect().then(state => {
            console.log(`✅ Conectado exitosamente al Room ID: ${state.roomId}`);
            socket.emit('connection-status', { status: 'connected', message: `Conectado a @${tiktokUsername}` });

            // ⏱️ LÍMITE DE 6 HORAS: Apagado automático para proteger los recursos del servidor
            sessionTimeout = setTimeout(() => {
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
