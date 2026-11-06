'use strict';

const assert = require('assert');
const pricing = require('../seat-pricing');
const PROMOTION_ACTIVE_AT = '2026-10-19T22:30:00-05:00';
const PROMOTION_EXPIRED_AT = '2026-10-19T23:00:00-05:00';

assert.strictEqual(pricing.EVENT_ID, 'standup-therapy-deja-de-joder-pareja-2-0-bogota-18feb2027');
assert.strictEqual(pricing.getTierForSeat('A-1').id, 'lateral');
assert.strictEqual(pricing.getTierForSeat('A-1').color, '#fff0d6');
assert.strictEqual(pricing.getPriceForSeat('A-1', PROMOTION_EXPIRED_AT), 49000);
assert.strictEqual(pricing.getPriceForSeat('A-3', PROMOTION_EXPIRED_AT), 49000);
assert.strictEqual(pricing.getPriceForSeat('A-4', PROMOTION_EXPIRED_AT), 59000);
assert.strictEqual(pricing.getPriceForSeat('A-5', PROMOTION_EXPIRED_AT), 59000);
assert.strictEqual(pricing.getTierForSeat('A-6').id, 'preferencial');
assert.strictEqual(pricing.getPriceForSeat('A-6', PROMOTION_EXPIRED_AT), 79000);
assert.strictEqual(pricing.getPriceForSeat('C-17', PROMOTION_EXPIRED_AT), 79000);
assert.strictEqual(pricing.getPriceForSeat('C-18', PROMOTION_EXPIRED_AT), 59000);
assert.strictEqual(pricing.getPriceForSeat('D-6', PROMOTION_EXPIRED_AT), 59000);
assert.strictEqual(pricing.getPriceForSeat('J-20', PROMOTION_EXPIRED_AT), 49000);
assert.strictEqual(pricing.getPriceForSeat('J-22', PROMOTION_EXPIRED_AT), 49000);
assert.strictEqual(pricing.getPriceForSeat('K-19', PROMOTION_EXPIRED_AT), 59000);
assert.strictEqual(pricing.summarizeSeats(['A-1', 'A-6', 'K-19'], PROMOTION_EXPIRED_AT).total, 187000);
assert.equal(pricing.getPricingState(PROMOTION_ACTIVE_AT).active, false);
assert.equal(pricing.summarizeSeats(['A-1', 'A-4', 'A-6'], PROMOTION_ACTIVE_AT).total, 187000);
assert.throws(() => pricing.getPriceForSeat('K-20'), /Silla inválida/);
assert.throws(() => pricing.summarizeSeats(['A-1', 'A-1']), /repetidas/);

const configuredLateralSeats = [];
for (const row of 'ABCDEFGHIJ') {
  for (const number of [1, 2, 3, 20, 21, 22]) {
    configuredLateralSeats.push(row + '-' + number);
  }
}
assert.strictEqual(configuredLateralSeats.length, 60);
assert(configuredLateralSeats.every(seat => pricing.getPriceForSeat(seat, PROMOTION_EXPIRED_AT) === 49000));

const configuredPreferentialSeats = [];
for (const row of 'ABC') {
  for (let number = 6; number <= 17; number += 1) {
    configuredPreferentialSeats.push(row + '-' + number);
  }
}
assert.strictEqual(configuredPreferentialSeats.length, 36);
assert(configuredPreferentialSeats.every(seat => pricing.getPriceForSeat(seat, PROMOTION_EXPIRED_AT) === 79000));

const mixedPricing = pricing.createPricingEngine({
  defaultTierId: 'general',
  tiers: [
    { id: 'general', label: 'General', price: 59000, color: '#f9b609' },
    { id: 'economica', label: 'Económica', price: 39000, color: '#fff0d6' },
  ],
  rules: [
    { tierId: 'economica', seats: ['A-1'] },
    { tierId: 'economica', rows: ['K'] },
    { tierId: 'economica', rows: ['J'], from: 1, to: 5 },
  ],
});

assert.strictEqual(mixedPricing.getTierForSeat('A-1').id, 'economica');
assert.strictEqual(mixedPricing.getPriceForSeat('A-2'), 59000);
assert.strictEqual(mixedPricing.getPriceForSeat('J-5'), 39000);
assert.strictEqual(mixedPricing.getPriceForSeat('J-6'), 59000);
assert.strictEqual(mixedPricing.getPriceForSeat('K-19'), 39000);

const mixedSummary = mixedPricing.summarizeSeats(['A-1', 'A-2', 'K-19']);
assert.strictEqual(mixedSummary.total, 137000);
assert.deepStrictEqual(
  mixedSummary.breakdown.map((item) => [item.tierId, item.quantity, item.subtotal]),
  [['economica', 2, 78000], ['general', 1, 59000]],
);

console.log('seat-pricing tests passed');

const promo = pricing.MASTERCLASS_PROMOTION;
const start = Date.parse(promo.startsAt);
const end = Date.parse(promo.endsAt);
assert.equal(pricing.getPricingState(start - 1).active, false);
assert.equal(pricing.getPricingState(start).active, true);
assert.equal(pricing.getPricingState(end - 1).active, true);
assert.equal(pricing.getPricingState(end).active, false);
assert.equal(end, Date.parse('2026-11-09T03:00:00Z'));
assert.deepEqual(['A-1', 'A-4', 'C-6'].map(seat => pricing.getPriceForSeat(seat, start)), [39200, 47200, 63200]);
for (const row of require('../event-config').ROWS) {
  for (const number of [...row.left, ...row.center, ...row.right]) {
    const seat = row.label + '-' + number;
    assert.equal(pricing.getPriceForSeat(seat, end - 1), pricing.getPriceForSeat(seat, end) * 0.8);
  }
}
const blocks = ['A', 'B'].flatMap(row => Array.from({ length: 12 }, (_, i) => row + '-' + (i + 6)));
assert.deepEqual(pricing.getAvailability([]), { lateral: 60, preventa: 143, preferencial: 36 });
assert.deepEqual(pricing.getAvailability(blocks), { lateral: 60, preventa: 143, preferencial: 12 });
assert.deepEqual(pricing.getAvailability([...blocks, 'A-1', 'A-1', 'K-19', 'K-20']), { lateral: 59, preventa: 142, preferencial: 12 });
assert.throws(() => pricing.getAvailability(null));
