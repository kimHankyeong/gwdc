export function quoteFor(run) {
  const limit = Math.max(1, Number(run?.maxTotal || 1000000));
  const quantity = Math.max(1, Number(run?.quantity || 1));
  const shipping = limit >= 5000 ? Math.min(3000, Math.floor(limit * 0.06)) : 0;
  const unitPrice = Math.max(1, Math.min(84900, Math.floor((limit - shipping) / quantity)));
  return {quantity, unitPrice, shipping, total: unitPrice * quantity + shipping};
}
