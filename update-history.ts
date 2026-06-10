import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const regex = /{activeTab === "history" && \([\s\S]*?<\/BarChart>\n                <\/ResponsiveContainer>\n              <\/div>\n            <\/div>\n          \)}/;

const replacement = `{activeTab === "history" && (
            <div className="space-y-6">
              <div className="glass-card p-4 md:p-6 border border-white/60">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Financial Log</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 rounded-lg">
                      <tr>
                        <th className="px-6 py-4 rounded-tl-lg font-bold">Metric</th>
                        <th className="px-6 py-4 font-bold text-right">Weekly</th>
                        <th className="px-6 py-4 font-bold text-right">Monthly</th>
                        <th className="px-6 py-4 rounded-tr-lg font-bold text-right">Yearly</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white border-b border-gray-100 shadow-sm">
                        <td className="px-6 py-4 font-bold text-emerald-600 bg-emerald-50/30">Total Net Income</td>
                        <td className="px-6 py-4 text-right text-emerald-600 font-semibold">\${totalNetIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-right text-emerald-600 font-semibold">\${(totalNetIncome * 4.33).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-right text-emerald-600 font-semibold">\${(totalNetIncome * 52).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                      <tr className="bg-white border-b border-gray-100 shadow-sm">
                        <td className="px-6 py-4 font-medium text-amber-600">Expenses</td>
                        <td className="px-6 py-4 text-right font-medium text-amber-600 font-semibold">\${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-right font-medium text-amber-600 font-semibold">\${(totalExpenses * 4.33).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-right font-medium text-amber-600 font-semibold">\${(totalExpenses * 52).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                      <tr className="bg-white border-b border-gray-100 shadow-sm">
                        <td className="px-6 py-4 font-medium text-rose-600">Debts</td>
                        <td className="px-6 py-4 text-right font-medium text-rose-600 font-semibold">\${totalDebts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-right font-medium text-rose-600 font-semibold">\${(totalDebts * 4.33).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-right font-medium text-rose-600 font-semibold">\${(totalDebts * 52).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                      <tr className="bg-white border-b border-gray-100 shadow-sm">
                        <td className="px-6 py-4 font-medium text-blue-600">Savings Contributions</td>
                        <td className="px-6 py-4 text-right font-medium text-blue-600 font-semibold">\${totalSavingsCont.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-right font-medium text-blue-600 font-semibold">\${(monthlySavings).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-right font-medium text-blue-600 font-semibold">\${(totalSavingsCont * 52).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                      <tr className="bg-white font-bold bg-gray-50/50">
                        <td className="px-6 py-4 text-gray-900">Surplus / Deficit</td>
                        <td className={\`px-6 py-4 text-right \${weeklySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}\`}>\${weeklySurplus.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className={\`px-6 py-4 text-right \${monthlySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}\`}>\${monthlySurplus.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className={\`px-6 py-4 text-right \${(weeklySurplus * 52) >= 0 ? "text-emerald-700" : "text-rose-700"}\`}>\${(weeklySurplus * 52).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}`;

if (!regex.test(code)) {
  console.log("No match found for history tab regex!");
  process.exit(1);
} else {
  code = code.replace(regex, replacement);
  fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
  console.log("History tab updated successfully!");
}
