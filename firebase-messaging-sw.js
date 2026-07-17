/* Service worker voor push-meldingen (FCM). Los bestand omdat web push een SW op
   scope-root vereist. Draait in SW-context, los van de app — gebruikt daarom de
   compat-SDK via importScripts. Toont de melding wanneer de app dicht is.
   LET OP: GitHub Pages serveert deze app op een subpad (/klusjes-7x9k2m/), dus alle
   paden hieronder zijn RELATIEF (geen leidende '/'), anders wijzen ze naar de domein-root. */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBMLoS2ybJV-G0cYOIP_PHcc3BAbdAXI2c",
  authDomain: "klusjesv2.firebaseapp.com",
  databaseURL: "https://klusjesv2-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "klusjesv2",
  storageBucket: "klusjesv2.firebasestorage.app",
  messagingSenderId: "1066695207859",
  appId: "1:1066695207859:web:3a5a9dfdde234b02acb9c6"
});

const messaging = firebase.messaging();

// We sturen bewust DATA-only berichten (geen 'notification'-payload), zodat enkel deze
// handler de melding toont — anders zou de browser er zelf óók één tonen (dubbel).
messaging.onBackgroundMessage((payload) => {
  const d = (payload && payload.data) || {};
  const title = d.title || 'Klusjes';
  return self.registration.showNotification(title, {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'klusjes-herinnering',
    data: { url: d.url || '.' }
  });
});

// Tik op de melding → een openstaand app-venster focussen, anders de app openen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '.';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
