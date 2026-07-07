// ============================================
// UTILIDADES GLOBALES
// ============================================

// Firebase ya está cargado globalmente desde el HTML
// const { useState, useEffect } = React; // ya está disponible globalmente

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmt = n => '$' + Number(n || 0).toFixed(2);
const fDate = d => new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });

// Almacén por defecto (ajustar según ubicación real)
const ALMACEN = { lat: 28.5, lng: -106.0 };

// Calcular distancia entre coordenadas (fórmula de Haversine)
const calcularDistancia = (coord1, coord2) => {
  if (!coord1 || !coord2) return Infinity;
  const R = 6371;
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLon = (coord2.lng - coord1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// WhatsApp con detección de país
const makeWA = (cl, items, tot, fp) => {
  const lines = items.map(x => `• ${x.nombre} x${x.cant} = ${fmt(x.precio * x.cant)}`).join('\n');
  const text = `🧾 *PEDIDO*\n👤 ${cl.nombre}\n\n${lines}\n\n💰 *Total: ${fmt(tot)}*\nPago: ${fp}`;
  let telefono = (cl.telefono || '').replace(/\D/g, '');
  if (!telefono.startsWith('52') && telefono.length <= 10) {
    telefono = '52' + telefono;
  }
  return `https://wa.me/${telefono}?text=${encodeURIComponent(text)}`;
};

// Exportar al scope global para que otros archivos los usen
window.uid = uid;
window.fmt = fmt;
window.fDate = fDate;
window.ALMACEN = ALMACEN;
window.calcularDistancia = calcularDistancia;
window.makeWA = makeWA;