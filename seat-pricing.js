(function attachSeatPricing(root, factory) {
  const config = typeof module !== 'undefined' && module.exports
    ? require('./event-config') : root.StandupEvent;
  const pricing = factory(config);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = pricing;
  }

  if (root) {
    root.StandupSeatPricing = pricing;
  }
})(typeof window !== 'undefined' ? window : null, function createSeatPricingModule(config) {
  'use strict';
  const { EVENT, ROWS } = config;

  const EVENT_ID = EVENT.id;
  const SEAT_PATTERN = /^(?:[A-J]-(?:[1-9]|1\d|2[0-2])|K-(?:[1-9]|1\d))$/;
  const MASTERCLASS_PROMOTION = Object.freeze({
    id: 'descuento-20-hasta-domingo-8nov2026',
    label: '20% de descuento en todas las ubicaciones',
    discountPercent: 20,
    startsAt: '2026-11-06T08:08:11-05:00',
    endsAt: '2026-11-08T22:00:00-05:00',
    timeZone: 'America/Bogota',
  });

  function createPricingEngine(config) {
    const tiers = Array.isArray(config?.tiers) ? config.tiers : [];
    const rules = Array.isArray(config?.rules) ? config.rules : [];
    const defaultTierId = String(config?.defaultTierId || '');
    const tiersById = new Map();
    const promotion = config?.promotion || null;
    const promotionStartsAt = promotion ? Date.parse(promotion.startsAt) : NaN;
    const promotionEndsAt = promotion ? Date.parse(promotion.endsAt) : NaN;

    if (promotion && (
      !Number.isFinite(promotionStartsAt) ||
      !Number.isFinite(promotionEndsAt) ||
      promotionStartsAt >= promotionEndsAt ||
      !Number.isInteger(promotion.discountPercent) ||
      promotion.discountPercent <= 0 ||
      promotion.discountPercent >= 100
    )) {
      throw new Error('La promoción tiene una configuración inválida');
    }

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

    function timestampFor(value) {
      if (value === undefined) return Date.now();
      if (value instanceof Date) return value.getTime();
      if (typeof value === 'string') return Date.parse(value);
      return Number(value);
    }

    function promotionIsActive(at) {
      if (!promotion) return false;
      const timestamp = timestampFor(at);
      return Number.isFinite(timestamp) &&
        timestamp >= promotionStartsAt &&
        timestamp < promotionEndsAt;
    }

    function pricedTier(tier, active) {
      const basePrice = tier.price;
      const price = active
        ? Math.round(basePrice * (100 - promotion.discountPercent) / 100)
        : basePrice;

      return Object.freeze({
        ...tier,
        basePrice,
        price,
        discountPercent: active ? promotion.discountPercent : 0,
      });
    }

    function getPricingState(at) {
      const active = promotionIsActive(at);
      const pricedTiers = [...tiersById.values()].map(tier => pricedTier(tier, active));

      return Object.freeze({
        active,
        id: promotion?.id || null,
        label: promotion?.label || '',
        discountPercent: active ? promotion.discountPercent : 0,
        startsAt: promotion?.startsAt || null,
        endsAt: promotion?.endsAt || null,
        timeZone: promotion?.timeZone || null,
        tiers: Object.freeze(pricedTiers),
      });
    }

    function getBaseTierForSeat(seatId) {
      const normalizedSeatId = normalizeSeatId(seatId);
      if (!isValidSeat(normalizedSeatId)) {
        throw new Error('Silla inválida: ' + normalizedSeatId);
      }

      const matchingRule = normalizedRules.find((rule) => ruleMatches(rule, normalizedSeatId));
      return tiersById.get(matchingRule?.tierId || defaultTierId);
    }

    function getTierForSeat(seatId, at) {
      return pricedTier(getBaseTierForSeat(seatId), promotionIsActive(at));
    }

    function getPriceForSeat(seatId, at) {
      return getTierForSeat(seatId, at).price;
    }

    function summarizeSeats(seatIds, at) {
      if (!Array.isArray(seatIds) || seatIds.length === 0) {
        return { total: 0, items: [], breakdown: [], promotion: getPricingState(at) };
      }

      const uniqueSeats = [...new Set(seatIds.map(normalizeSeatId))];
      if (uniqueSeats.length !== seatIds.length) {
        throw new Error('La selección contiene sillas repetidas');
      }

      const pricingState = getPricingState(at);
      const pricedTiersById = new Map(pricingState.tiers.map(tier => [tier.id, tier]));

      const items = uniqueSeats.map((seatId) => {
        const baseTier = getBaseTierForSeat(seatId);
        const tier = pricedTiersById.get(baseTier.id);
        return Object.freeze({
          seatId,
          tierId: tier.id,
          tierLabel: tier.label,
          price: tier.price,
          basePrice: tier.basePrice,
        });
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
        promotion: pricingState,
      };
    }

    return Object.freeze({
      tiers: Object.freeze([...tiersById.values()]),
      rules: Object.freeze(normalizedRules),
      defaultTierId,
      isValidSeat,
      getTierForSeat,
      getPriceForSeat,
      getPricingState,
      summarizeSeats,
    });
  }

  // La primera regla coincidente tiene prioridad sobre las siguientes.
  const engine = createPricingEngine({
    defaultTierId: 'preventa',
    promotion: MASTERCLASS_PROMOTION,
    tiers: [
      { id: 'preventa', label: 'General', price: 59000, color: '#f9b609' },
      { id: 'lateral', label: 'Tarifa lateral', price: 49000, color: '#fff0d6' },
      { id: 'preferencial', label: 'Preferencial', price: 79000, color: '#78c4ff' },
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

  function getAvailability(takenSeats) {
    if (!Array.isArray(takenSeats)) throw new Error('Falta consultar la disponibilidad');
    const occupied = new Set(takenSeats.map(seat => String(seat).trim().toUpperCase()));
    const available = Object.fromEntries(engine.tiers.map(tier => [tier.id, 0]));
    ROWS.forEach(row => {
      [...row.left, ...row.center, ...row.right].forEach(number => {
        const seat = row.label + '-' + number;
        if (!occupied.has(seat)) available[engine.getTierForSeat(seat).id] += 1;
      });
    });
    return Object.freeze(available);
  }

  return Object.freeze({ EVENT_ID, MASTERCLASS_PROMOTION, createPricingEngine, getAvailability, ...engine });
});
