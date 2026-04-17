// ═══════════════════════════════════════════════════════════════════════════
// PICADAS AR — Firebase Cloud Functions
// Integración Mercado Pago (PreApproval / Suscripciones)
//
// Funciones expuestas:
//   • createSubscription  [HTTPS Callable] — crea la suscripción en MP y
//     devuelve la URL de pago (init_point) al front-end.
//   • mpWebhook           [HTTPS Request]  — recibe notificaciones de MP,
//     verifica la firma y actualiza isVIP en Firebase Realtime Database.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret }                  = require('firebase-functions/params');
const admin                             = require('firebase-admin');
const crypto                            = require('crypto');
const { MercadoPagoConfig, PreApproval } = require('mercadopago');

// ── Inicializar Firebase Admin ───────────────────────────────────────────────
admin.initializeApp();
const db = admin.database();

// ── Secrets (se configuran con: firebase functions:secrets:set MP_ACCESS_TOKEN)
const MP_ACCESS_TOKEN  = defineSecret('MP_ACCESS_TOKEN');   // Token de producción de MP
const MP_WEBHOOK_SECRET = defineSecret('MP_WEBHOOK_SECRET'); // Clave secreta del webhook en MP

// ── Precio de la membresía (en ARS)
const VIP_PRICE_ARS = 4500;


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: obtener cliente MP
// ═══════════════════════════════════════════════════════════════════════════
function getMPClient(accessToken) {
  return new MercadoPagoConfig({ accessToken, options: { timeout: 5000 } });
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: verificar firma del webhook de Mercado Pago
// Documentación: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
//
// MP envía en los headers:
//   x-signature:   "ts=<timestamp>&v1=<hash>"
//   x-request-id:  "<uuid>"
// El hash se calcula: HMAC-SHA256("id:<notif_id>;request-id:<req_id>;ts:<ts>;", secretKey)
// ═══════════════════════════════════════════════════════════════════════════
function verifyMPSignature(req, secret) {
  const signatureHeader = req.headers['x-signature'];
  const requestId       = req.headers['x-request-id'];
  const dataId          = req.query['data.id'] || (req.body?.data?.id ?? '');

  if (!signatureHeader || !requestId) return false;

  // Extraer ts y v1 del header
  const parts = {};
  signatureHeader.split('&').forEach(part => {
    const [k, v] = part.split('=');
    parts[k] = v;
  });

  const { ts, v1 } = parts;
  if (!ts || !v1) return false;

  // Construir el manifest que MP firmó
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;

  // Calcular HMAC
  const expected = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(v1,       'hex')
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: buscar jugador por username (case-insensitive) en Firebase
// ═══════════════════════════════════════════════════════════════════════════
async function findPlayerByUsername(username) {
  const snap = await db.ref('data/jugadores').once('value');
  const jugadores = snap.val();
  if (!Array.isArray(jugadores)) return null;

  const lower = username.toLowerCase();
  return jugadores.find(j => j.username?.toLowerCase() === lower) ?? null;
}


// ═══════════════════════════════════════════════════════════════════════════
// HELPER: actualizar isVIP de un jugador en Firebase
// ═══════════════════════════════════════════════════════════════════════════
async function setPlayerVIP(playerId, isVIP) {
  const snap = await db.ref('data/jugadores').once('value');
  const jugadores = snap.val();
  if (!Array.isArray(jugadores)) throw new Error('jugadores no es un array');

  const idx = jugadores.findIndex(j => j.id === playerId);
  if (idx === -1) throw new Error(`Jugador ${playerId} no encontrado`);

  jugadores[idx].isVIP = isVIP;
  await db.ref('data/jugadores').set(jugadores);

  // También registrar en el changelog
  const changelogRef = db.ref('data/changelog');
  const logSnap      = await changelogRef.once('value');
  const changelog    = logSnap.val() || [];

  changelog.unshift({
    id:    Date.now().toString(36),
    fecha: new Date().toLocaleString('es-AR'),
    tipo:  'VIP',
    desc:  `VIP ${isVIP ? 'activado automáticamente' : 'desactivado'} para ${jugadores[idx].username} (Mercado Pago)`,
  });

  // Mantener solo los últimos 100 registros
  await changelogRef.set(changelog.slice(0, 100));

  return jugadores[idx].username;
}


// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN 1: createSubscription
// Tipo: HTTPS Callable (llamada desde el front-end con Firebase SDK)
//
// Payload esperado: { username: string }
// Retorna:          { init_point: string, subscription_id: string }
// ═══════════════════════════════════════════════════════════════════════════
exports.createSubscription = onCall(
  { secrets: [MP_ACCESS_TOKEN] },
  async (request) => {
    const { username } = request.data;

    // Validar input
    if (!username || typeof username !== 'string' || username.trim().length < 2) {
      throw new HttpsError('invalid-argument', 'Username inválido.');
    }

    const cleanUsername = username.trim();

    // Verificar que el jugador existe en la base de datos
    const player = await findPlayerByUsername(cleanUsername);
    if (!player) {
      throw new HttpsError(
        'not-found',
        `El piloto "${cleanUsername}" no existe. Pedile al admin que te registre primero.`
      );
    }

    // Verificar que no tiene VIP ya activo
    if (player.isVIP) {
      throw new HttpsError(
        'already-exists',
        `El piloto "${cleanUsername}" ya tiene membresía VIP activa.`
      );
    }

    // Crear suscripción en Mercado Pago
    const client      = getMPClient(MP_ACCESS_TOKEN.value());
    const preApproval = new PreApproval(client);

    const response = await preApproval.create({
      body: {
        reason:             'Membresía VIP — Picadas AR',
        external_reference: player.id,          // usamos el ID interno del jugador
        payer_email:        request.auth?.token?.email ?? undefined,
        auto_recurring: {
          frequency:          1,
          frequency_type:     'months',
          transaction_amount: VIP_PRICE_ARS,
          currency_id:        'ARS',
        },
        back_url: 'https://picadas-ar.com',     // reemplazar con tu dominio real
        status:   'pending',
      },
    });

    if (!response?.init_point) {
      throw new HttpsError('internal', 'No se pudo crear la suscripción en Mercado Pago.');
    }

    console.log(`Suscripción creada para jugador ${cleanUsername} (${player.id}): ${response.id}`);

    return {
      init_point:      response.init_point,
      subscription_id: response.id,
    };
  }
);


// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN 2: mpWebhook
// Tipo: HTTPS Request (URL pública para recibir notificaciones de MP)
//
// URL a configurar en el panel de MP:
//   https://us-central1-dustyy-torneos.cloudfunctions.net/mpWebhook
//
// Eventos manejados:
//   • subscription_preapproval (authorized) → isVIP = true
//   • subscription_preapproval (cancelled / paused) → isVIP = false
// ═══════════════════════════════════════════════════════════════════════════
exports.mpWebhook = onRequest(
  { secrets: [MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET] },
  async (req, res) => {
    // Solo aceptar POST
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Verificar firma del webhook
    const signatureValid = verifyMPSignature(req, MP_WEBHOOK_SECRET.value());
    if (!signatureValid) {
      console.warn('Webhook rechazado: firma inválida', {
        headers: req.headers,
        query:   req.query,
      });
      res.status(401).send('Unauthorized');
      return;
    }

    const { type, data } = req.body;

    // Solo procesar eventos de suscripción
    if (type !== 'subscription_preapproval') {
      res.status(200).send('OK (evento ignorado)');
      return;
    }

    const subscriptionId = data?.id;
    if (!subscriptionId) {
      res.status(400).send('Bad Request: falta data.id');
      return;
    }

    try {
      // Obtener detalles de la suscripción desde la API de MP
      const client      = getMPClient(MP_ACCESS_TOKEN.value());
      const preApproval = new PreApproval(client);
      const subscription = await preApproval.get({ id: subscriptionId });

      const { status, external_reference: playerId, payer_email } = subscription;

      console.log(`Webhook MP → suscripción ${subscriptionId}, estado: ${status}, jugador: ${playerId}`);

      if (!playerId) {
        console.error('Webhook sin external_reference — no se puede identificar al jugador.');
        res.status(200).send('OK (sin external_reference)');
        return;
      }

      // Mapear estado MP → isVIP
      const isVIP = status === 'authorized';

      // Actualizar en Firebase
      const username = await setPlayerVIP(playerId, isVIP);
      console.log(`✓ Jugador "${username}" → isVIP=${isVIP} (estado MP: ${status})`);

      res.status(200).send('OK');
    } catch (err) {
      console.error('Error procesando webhook:', err);
      // Responder 200 igual para que MP no reintente indefinidamente si el error es nuestro
      res.status(200).send('OK (error interno, ver logs)');
    }
  }
);
