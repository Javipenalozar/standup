(function attachEvent(root, factory) {
  const config = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
  if (root) root.StandupEvent = config;
})(typeof window !== 'undefined' ? window : null, function createEvent() {
  'use strict';
  const EVENT = Object.freeze({
    id: 'standup-therapy-deja-de-joder-pareja-2-0-bogota-18feb2027',
    name: 'Deja de joder a tu pareja 2.0',
    date: 'jueves 18 de febrero de 2027',
    startsAt: '2027-02-18T19:30:00-05:00',
    doorsAt: '2027-02-18T19:00:00-05:00',
    doorsTime: '7:00 p. m.',
    time: '7:30 p. m.',
    venue: 'Teatro Belarte',
    address: 'Cra. 7 # 152-54, Bogotá',
    price: 59000,
    capacity: 239,
    referencePrefix: 'ST-18FEB27-',
  });
  const numbers = (from, to) => Object.freeze(Array.from({ length: to - from + 1 }, (_, i) => from + i));
  const ROWS = Object.freeze([... 'ABCDEFGHIJK'].map(label => Object.freeze({
    label,
    left: numbers(1, label === 'K' ? 4 : 5),
    center: numbers(label === 'K' ? 5 : 6, label === 'K' ? 15 : 17),
    right: numbers(label === 'K' ? 16 : 18, label === 'K' ? 19 : 22),
  })));
  return Object.freeze({ EVENT, ROWS });
});
