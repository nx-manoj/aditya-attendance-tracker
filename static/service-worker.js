self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    
    const title = data.title || "Aditya Tracker";
    const options = {
        body: data.body || "Your daily attendance sync is complete.",
        icon: '/static/icon.png',
        badge: '/static/icon.png',
        data: data.url || '/'
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data)
    );
});
