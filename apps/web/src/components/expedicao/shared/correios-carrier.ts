export function isCorreiosCarrier(carrierName?: string | null): boolean {
  const upper = (carrierName ?? '').toUpperCase();
  return (
    upper.includes('PAC') ||
    upper.includes('SEDEX') ||
    upper.includes('MINI ENVIOS')
  );
}
