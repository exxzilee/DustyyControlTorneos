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
//           ".read": true,
//           ".write": "auth != null && (root.child('admins').child(auth.uid).val() === true || auth.token.firebase.sign_in_provider === 'password')"
//         },
//         "admins": {
//           ".read": "auth != null",
//           ".write": false
//         },
//         "inscriptions": {
//           ".read": "auth != null",
//           "$tid": {
//             "$rid": {
//               ".write": "auth != null"
//             }
//           }
//         }
//       }
//     }
//     → Publicar
//
// NOTA: Para dar rol admin a un usuario Google:
//   En Firebase Console → Realtime Database → agregar nodo:
//   admins / {UID del usuario} = true
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
const auth           = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();
const db             = firebase.database();
const dbRef          = db.ref('data');
const inscRef        = db.ref('inscriptions');
const functions      = firebase.functions();
// Para desarrollo local con emulador, descomentar la línea siguiente:
// functions.useEmulator('localhost', 5001);
