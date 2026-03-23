// ═══════════════════════════════════════════════════════════════════
// FIREBASE CONFIG — Picadas Argentinas
// ═══════════════════════════════════════════════════════════════════
// 
// ⚠ INSTRUCCIONES PARA CONFIGURAR FIREBASE:
// 
// 1. Ir a https://console.firebase.google.com/
// 2. Click "Agregar proyecto" → nombre: picadas-argentinas
// 3. Desactivar Google Analytics (no lo necesitás) → Crear proyecto
// 4. En la pantalla principal, click el ícono </> (Web)
// 5. Registrar app con nombre "picadas-web" → Registrar
// 6. Copiar los valores del firebaseConfig que te da Google
// 7. Pegarlos abajo reemplazando los "TU_..." 
//
// 8. En el menú lateral → Build → Realtime Database → Crear base de datos
//    → Elegir ubicación → Iniciar en modo de prueba → Habilitar
//
// 9. En el menú lateral → Build → Authentication → Comenzar
//    → Método de acceso → Email/Password → Habilitar → Guardar
//
// 10. IMPORTANTE: Después de que todo funcione, ir a:
//     Realtime Database → Reglas → Pegar estas reglas:
//     {
//       "rules": {
//         "data": {
//           ".read": "auth != null",
//           ".write": "auth != null"
//         }
//       }
//     }
//     → Publicar
//
// ═══════════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyBtF7iHNEMCdOsiPfolFk0BCNps3UaUEIk",
  authDomain: "dustyy-torneos.firebaseapp.com",
  databaseURL: "https://dustyy-torneos-default-rtdb.firebaseio.com",
  projectId: "dustyy-torneos",
  storageBucket: "dustyy-torneos.firebasestorage.app",
  messagingSenderId: "752977586937",
  appId: "1:752977586937:web:70a5d9c474dcaa829e5028"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.database();
const dbRef = db.ref('data');
