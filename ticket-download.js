(function () {
  'use strict';
  function createDownload(qr, purchase) {
    const event = window.StandupEvent.EVENT;
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 2400;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff9ee';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#092358';
    ctx.textBaseline = 'top';
    let y = 65;
    function text(value, size, bold, gap) {
      ctx.font = (bold ? '700 ' : '') + size + 'px Arial, sans-serif';
      let line = '';
      for (const word of String(value).split(/\s+/)) {
        const next = line ? line + ' ' + word : word;
        if (line && ctx.measureText(next).width > 860) {
          ctx.fillText(line, 70, y);
          y += size * 1.35;
          line = word;
        } else line = next;
      }
      ctx.fillText(line, 70, y);
      y += size * 1.35 + (gap || 12);
    }
    text('STAND-UP THERAPY', 28, true);
    text(event.name, 48, true, 20);
    text('Jueves 18 de febrero de 2027', 30, true);
    text(event.venue + ' · ' + event.address, 27, false);
    text('Puertas ' + event.doorsTime + ' · Inicio ' + event.time, 27, false, 22);
    text(purchase.name, 32, true);
    text('Sillas: ' + purchase.seats.map(seat => seat.replace('-', ' #')).join(', '), 30, true);
    text(purchase.courtesy ? 'Entrada de cortesía · Sin cobro' : 'Pagado: $' + Number(purchase.amount).toLocaleString('es-CO') + ' COP', 26, false, 20);
    const qrTop = y;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, 290, qrTop, 420, 420);
    y = qrTop + 445;
    text(purchase.code, 22, true);
    text('Este QR incluye todas las sillas de esta compra.', 25, false);
    text(purchase.courtesy ? '¡Te esperamos! Que disfrutes el show.' : '¡Gracias por tu compra! Que disfrutes el show.', 28, true);
    text('No se realizan devoluciones, salvo los casos en que la ley lo exija.', 23, false);
    // Crop only blank space; keep all content and a generous bottom margin.
    const output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = Math.ceil(y + 55);
    output.getContext('2d').drawImage(canvas, 0, 0);
    return output.toDataURL('image/png');
  }
  window.StandupTicket = Object.freeze({ createDownload });
})();
