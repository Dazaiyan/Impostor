# Impostor

Lobby de juego social (tipo impostor) con servidor Node + WebSocket y frontend en React (Vite). Permite crear/unirse a lobbies, asignar roles, votar y terminar partidas. El servidor sirve los assets de `client/dist`, así que todo corre en el mismo puerto (ideal para ngrok).

## Requisitos
- Node 18+ (recomendado)
- npm

## Instalación
```bash
# en la raíz
npm install

# frontend
cd client
npm install
```

## Build del frontend
```bash
cd client
npm run build
```

Esto genera `client/dist` que es servido automáticamente por `server.js`.

## Ejecutar servidor (HTTP + WS + assets)
```bash
# desde la raíz
PORT=3001 npm run dev
```
El servidor sirve:
- HTTP: `client/dist` (frontend React) en `http://localhost:3001`
- WebSocket: en el mismo host/puerto

## Usar con ngrok (mismo puerto para front y WS)
1. Asegúrate de haber hecho el build: `cd client && npm run build`.
2. Levanta el servidor: `PORT=3001 npm run dev` (raíz).
3. En otra terminal: `ngrok http 3001`.
4. Comparte el enlace HTTPS que te da ngrok (`https://xxxxx.ngrok-free.app`). El front y el WS usan el mismo dominio, no hace falta configurar nada extra.

## Variables opcionales
- `PORT`: puerto del servidor (default 3001).
- `VITE_WS_URL`: si quieres apuntar el front a otro WS (solo en casos especiales). Normalmente no lo uses: el front toma el mismo host/puerto donde se sirve.

## Flujo básico
1. Ingresa tu nombre.
2. Crea un lobby o entra con código (el link compartido ya lleva `?lobby=CODE` y oculta la creación).
3. El host selecciona temática, impostores y da “Iniciar ronda”.
4. Aparece flash de rol (IMPOSTOR/INOCENTE), luego el panel de rol y votación.
5. Vota, cancela voto si quieres, y sigue las rondas hasta el final.

## Desarrollo local con Vite (solo para desarrollo)
```bash
cd client
npm run dev
```
En este caso, si necesitas que el front apunte al backend en otro puerto, puedes usar `VITE_WS_URL` (ej: `VITE_WS_URL=ws://localhost:3001 npm run dev`). Para compartir, se recomienda el flujo de un solo puerto con build + server.js + ngrok.
