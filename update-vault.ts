import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const regex1 = /const \[isSellingAsset, setIsSellingAsset\] = useState\(false\);/;
const replace1 = `const [isSellingAsset, setIsSellingAsset] = useState(false);
  const [isAdjustingVault, setIsAdjustingVault] = useState(false);
  const [adjustVaultAmount, setAdjustVaultAmount] = useState('');
  
  const handleAdjustVault = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustVaultAmount) return;
    
    let newBalance = Number(adjustVaultAmount);
    setState(prev => ({
      ...prev,
      cashBalance: Math.max(0, newBalance)
    }));
    
    setIsAdjustingVault(false);
    setAdjustVaultAmount('');
  };`;

const regex2 = /\{!isSellingAsset \? \(\s*<button onClick=\{\(\) => setIsSellingAsset\(true\)\}/;
const replace2 = `{!isSellingAsset && !isAdjustingVault ? (
                      <div className="flex gap-2 w-full">
                        <button onClick={() => setIsSellingAsset(true)} className="flex-1 relative flex items-center justify-center gap-2 bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-colors font-bold py-3 text-sm md:text-base rounded-xl shadow-sm">
                          <Plus className="w-4 h-4 md:w-5 md:h-5" /> Record Windfall
                        </button>
                        <button onClick={() => { setIsAdjustingVault(true); setAdjustVaultAmount(String(state.cashBalance || 0)); }} className="px-4 relative flex items-center justify-center gap-2 bg-white text-gray-600 border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-colors font-bold py-3 text-sm md:text-base rounded-xl shadow-sm" title="Adjust Balance manually">
                          <Edit2 className="w-4 h-4 md:w-5 md:h-5" />
                        </button>
                      </div>
                    ) : isAdjustingVault ? (
                      <form onSubmit={handleAdjustVault} className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-4 relative mb-4">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-bold text-gray-800">Adjust Vault Balance</h3>
                          <button type="button" onClick={() => setIsAdjustingVault(false)} className="text-gray-400 hover:text-gray-600 bg-gray-50 rounded-lg p-1 transition-colors"><X className="w-4 h-4" /></button>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wider">New Balance</label>
                          <div className="relative">
                            <span className="absolute left-4 top-2.5 text-gray-500 font-medium">$</span>
                            <input type="number" step="0.01" placeholder="0.00" value={adjustVaultAmount} onChange={e => setAdjustVaultAmount(e.target.value)} required className="w-full text-sm pl-8 pr-4 py-2.5 bg-gray-50 border outline-none focus:border-emerald-400 focus:bg-white border-gray-200 transition-colors rounded-xl" />
                          </div>
                        </div>
                        <button type="submit" className="w-full bg-emerald-500 text-white font-bold py-3 shadow-md rounded-xl hover:bg-emerald-600 hover:shadow-lg transition-all mt-4 text-sm md:text-base">
                          Save Balance
                        </button>
                      </form>
                    ) : (`;

code = code.replace(regex1, replace1);
code = code.replace(regex2, replace2);

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
console.log("Success modifications");
