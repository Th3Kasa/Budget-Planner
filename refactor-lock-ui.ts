import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// For Debts
const regexDebt = /<p className="text-xs text-gray-500">\s*\$\{(item\.amount\.toFixed\(2\))\}\/wk repayment/g;
code = code.replace(regexDebt, '<p className="text-xs text-gray-500 flex items-center gap-1">{item.isLocked && <Lock className="w-3 h-3 text-indigo-500" title="Manually locked amount" />}${item.amount.toFixed(2)}/wk repayment');

// For Savings
const regexSav = /<p className="text-xs text-gray-500">\s*\$\{(goal\.weeklyContribution\.toFixed\(2\))\}\/wk\s*contribution/g;
code = code.replace(regexSav, '<p className="text-xs text-gray-500 flex items-center gap-1">{goal.isLocked && <Lock className="w-3 h-3 text-indigo-500" title="Manually locked amount" />}${goal.weeklyContribution.toFixed(2)}/wk contribution');

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
console.log("Replaced lock icons");
