(function attachSeatPricing(root, factory) {
  const pricing = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = pricing;
  }

  if (root) {
    root.StandupSeatPricing = pricing;
  }
})(typeof window !== 'undefined' ? window : null, function createSeatPricingModule() {
  'use strict';

  const EVENT_ID = 'standup-therapy-deja-de-joder-pareja-bogota-5nov2026';
  const SEAT_PATTERN = /^(?:[A-J]-(?:[1-9]|1\d|2[0-2])|K-(?:[1-9]|1\d))$/;

  function createPricingEngine(config) {
    const tiers = Array.isArray(config?.tiers) ? config.tiers : [];
    const rules = Array.isArray(config?.rules) ? config.rules : [];
    const defaultTierId = String(config?.defaultTierId || '');
    const tiersById = new Map();

    tiers.forEach((tier) => {
      const id = String(tier?.id || '').trim();
      const price = Number(tier?.price);

      if (!id || tiersById.has(id)) {
        throw new Error('Cada categoría de precio debe tener un identificador único');
      }

      if (!Number.isInteger(price) || price <= 0) {
        throw new Error('Cada categoría debe tener un precio entero positivo');
      }

      tiersById.set(id, Object.freeze({
        id,
        label: String(tier.label || id),
        price,
        color: String(tier.color || '#f9b609'),
      }));
    });

    if (!tiersById.has(defaultTierId)) {
      throw new Error('La categoría predeterminada no existe');
    }

    const normalizedRules = rules.map((rule) => {
      const tierId = String(rule?.tierId || '');
      if (!tiersById.has(tierId)) {
        throw new Error('Una regla de precio referencia una categoría inexistente');
      }

      return Object.freeze({
        tierId,
        seats: Array.isArray(rule.seats)
          ? rule.seats.map((seat) => String(seat).toUpperCase())
          : null,
        rows: Array.isArray(rule.rows)
          ? rule.rows.map((row) => String(row).toUpperCase())
          : null,
        numbers: Array.isArray(rule.numbers)
          ? rule.numbers.map(Number)
          : null,
        from: Number.isInteger(Number(rule.from)) ? Number(rule.from) : null,
        to: Number.isInteger(Number(rule.to)) ? Number(rule.to) : null,
      });
    });

    function normalizeSeatId(seatId) {
      return String(seatId || '').trim().toUpperCase();
    }

    function isValidSeat(seatId) {
      return SEAT_PATTERN.test(normalizeSeatId(seatId));
    }

    function ruleMatches(rule, seatId) {
      const [row, rawNumber] = seatId.split('-');
      const number = Number(rawNumber);

      if (rule.seats && !rule.seats.includes(seatId)) return false;
      if (rule.rows && !rule.rows.includes(row)) return false;
      if (rule.numbers && !rule.numbers.includes(number)) return false;
      if (rule.from !== null && number < rule.from) return false;
      if (rule.to !== null && number > rule.to) return false;

      return Boolean(
        rule.seats ||
        rule.rows ||
        rule.numbers ||
        rule.from !== null ||
        rule.to !== null
      );
    }

    function getTierForSeat(seatId) {
      const normalizedSeatId = normalizeSeatId(seatId);
      if (!isValidSeat(normalizedSeatId)) {
        throw new Error('Silla inválida: ' + normalizedSeatId);
      }

      const matchingRule = normalizedRules.find((rule) => ruleMatches(rule, normalizedSeatId));
      return tiersById.get(matchingRule?.tierId || defaultTierId);
    }

    function getPriceForSeat(seatId) {
      return getTierForSeat(seatId).price;
    }

    function summarizeSeats(seatIds) {
      if (!Array.isArray(seatIds) || seatIds.length === 0) {
        return { total: 0, items: [], breakdown: [] };
      }

      const uniqueSeats = [...new Set(seatIds.map(normalizeSeatId))];
      if (uniqueSeats.length !== seatIds.length) {
        throw new Error('La selección contiene sillas repetidas');
      }

      const items = uniqueSeats.map((seatId) => {
        const tier = getTierForSeat(seatId);
        return Object.freeze({ seatId, tierId: tier.id, tierLabel: tier.label, price: tier.price });
      });

      const totalsByTier = new Map();
      items.forEach((item) => {
        const current = totalsByTier.get(item.tierId) || {
          tierId: item.tierId,
          tierLabel: item.tierLabel,
          quantity: 0,
          subtotal: 0,
        };
        current.quantity += 1;
        current.subtotal += item.price;
        totalsByTier.set(item.tierId, current);
      });

      return {
        total: items.reduce((sum, item) => sum + item.price, 0),
        items,
        breakdown: [...totalsByTier.values()],
      };
    }

    return Object.freeze({
      tiers: Object.freeze([...tiersById.values()]),
      rules: Object.freeze(normalizedRules),
      defaultTierId,
      isValidSeat,
      getTierForSeat,
      getPriceForSeat,
      summarizeSeats,
    });
  }

  // La primera regla coincidente tiene prioridad sobre las siguientes.
  const engine = createPricingEngine({
    defaultTierId: 'preventa',
    tiers: [
      { id: 'preventa', label: 'Preventa', price: 59000, color: '#f9b609' },
      { id: 'lateral', label: 'Tarifa lateral', price: 49000, color: '#fff0d6' },
      { id: 'preferencial', label: 'Preferencial', price: 79000, color: '#e00c26' },
    ],
    rules: [
      {
        tierId: 'lateral',
        rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
        numbers: [1, 2, 3, 20, 21, 22],
      },
      {
        tierId: 'preferencial',
        rows: ['A', 'B', 'C'],
        from: 6,
        to: 17,
      },
    ],
  });

  return Object.freeze({ EVENT_ID, createPricingEngine, ...engine });
});
