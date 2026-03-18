export function addMonths(date, months) {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() !== day) {
    result.setDate(0);
  }
  return result;
}

export function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

export function generateCashflowDates(issueDateStr, maturityStr, stepMonths) {
  const issueDate = new Date(issueDateStr + 'T12:00:00');
  const maturity = new Date(maturityStr + 'T12:00:00');
  if (maturity <= issueDate) return [];

  const dates = [toDateStr(maturity)];
  let current = new Date(maturity);

  while (true) {
    const prev = addMonths(current, -stepMonths);
    const minFirstPayment = addMonths(issueDate, stepMonths);
    if (prev < minFirstPayment) break;
    dates.unshift(toDateStr(prev));
    current = prev;
  }

  return dates;
}
