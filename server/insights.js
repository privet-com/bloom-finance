export function buildInsights(transactions, monthlyBudget) {
  const expenses = transactions.filter(t => Number(t.amount) < 0);
  const totalSpent = expenses.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  const byCategory = {};
  for (const t of expenses) byCategory[t.category] = (byCategory[t.category] || 0) + Math.abs(Number(t.amount));
  const top = Object.entries(byCategory).sort((a,b) => b[1]-a[1])[0];
  const remaining = Math.max(0, monthlyBudget - totalSpent);
  const messages = [];
  if (top) messages.push(`${top[0]} is your largest spending category at AED ${Math.round(top[1]).toLocaleString()}.`);
  if (monthlyBudget > 0) messages.push(`You have AED ${Math.round(remaining).toLocaleString()} remaining in your monthly budget.`);
  return { totalSpent, remaining, topCategory: top?.[0] || null, messages };
}

export function anomalyScore(transaction, history) {
  const peer = history.filter(t => t.category === transaction.category && Number(t.amount) < 0);
  if (peer.length < 3) return { score: 0, reasons: [] };
  const avg = peer.reduce((s,t) => s + Math.abs(Number(t.amount)), 0) / peer.length;
  const amount = Math.abs(Number(transaction.amount));
  let score = 0;
  const reasons = [];
  if (amount > avg * 3) { score += 60; reasons.push(`Amount is over 3× your usual ${transaction.category} spend.`); }
  else if (amount > avg * 2) { score += 35; reasons.push(`Amount is over 2× your usual ${transaction.category} spend.`); }
  if (amount > 1000) { score += 20; reasons.push('High-value purchase.'); }
  return { score: Math.min(score, 100), reasons };
}
