'use strict';

const EVENT = Object.freeze({
  id: 'standup-therapy-deja-de-joder-pareja-bogota-5nov2026',
  name: 'Deja de joder a tu pareja',
  date: 'jueves 5 de noviembre de 2026',
  time: '7:00 p. m.',
  venue: 'Teatro Belarte',
  address: 'Cra. 7 # 152-54, Bogot\u00e1',
  price: 59000,
});

const LEGAL = Object.freeze({
  privacyPolicyVersion: '2026-09-04',
  termsVersion: '2026-09-04',
  controllerName: 'JV Bienestar y Salud Mental S.A.S.',
  controllerNit: '901912952-9',
  controllerAddress: 'Calle 23G No. 81-66',
  contactEmail: 'jvbienestarysaludmental@javipenaloza.com',
  contactWhatsApp: '+57 323 801 6527',
});

function eventDetailsHtml() {
  return [
    '<p><strong>Fecha:</strong> ' + EVENT.date + ', ' + EVENT.time + '</p>',
    '<p><strong>Lugar:</strong> ' + EVENT.venue + ', ' + EVENT.address + '</p>',
  ].join('');
}

function eventDetailsText() {
  return [
    'Fecha: ' + EVENT.date,
    'Inicio: ' + EVENT.time,
    'Lugar: ' + EVENT.venue,
    'Direcci\u00f3n: ' + EVENT.address,
  ];
}

function getPublicSiteUrl() {
  const configured = String(process.env.EVENT_PUBLIC_URL || '').trim();
  if (!configured) throw new Error('EVENT_PUBLIC_URL is required for public links');

  const url = new URL(configured);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocal) {
    throw new Error('EVENT_PUBLIC_URL must use HTTPS');
  }

  return url.origin;
}

function publicUrl(pathname, searchParams = {}) {
  const url = new URL(pathname, getPublicSiteUrl());
  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function eventOperationsEnabled() {
  return process.env.ENABLE_EVENT_OPERATIONS === 'true' &&
    process.env.EVENT_RELEASE_ID === EVENT.id;
}

function realPaymentsEnabled() {
  return process.env.ENABLE_REAL_PAYMENTS === 'true' &&
    process.env.EVENT_RELEASE_ID === EVENT.id;
}

module.exports = {
  EVENT,
  LEGAL,
  eventDetailsHtml,
  eventDetailsText,
  eventOperationsEnabled,
  realPaymentsEnabled,
  getPublicSiteUrl,
  publicUrl,
};
