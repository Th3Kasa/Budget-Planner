import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// 1. Insert undoWindfall and replace handleSellAsset
const handleSellAssetRegex = /const handleSellAsset = \(e: React\.FormEvent\) => \{[\s\S]*?setAssetDebtToPay\(''\);\n  \};/;

const newHandleSellAsset = `const handleSellAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName || !assetAmount) return;
    
    let totalAmount = Number(assetAmount);
    
    setState(prev => {
      let remainingCash = totalAmount;
      let newDebts = [...prev.debts].map(d => ({...d}));
      let newSavings = [...prev.savings].map(s => ({...s}));
      let distributions: any[] = [];
      
      const recordDist = (type: 'debt'|'savings', id: string, name: string, amt: number) => {
        if (amt <= 0.001) return;
        let existing = distributions.find(x => x.id === id);
        if (existing) existing.amount += amt;
        else distributions.push({ type, id, name, amount: amt });
      };

      const payDebt = (d: any, maxAmt: number) => {
         let bal = d.totalBalance || 0;
         if (bal <= 0) return 0;
         let pay = Math.min(bal, maxAmt);
         d.totalBalance = bal - pay;
         recordDist('debt', d.id, d.name, pay);
         return pay;
      };

      const fillSaving = (s: any, maxAmt: number) => {
         let gap = s.targetAmount > 0 ? (s.targetAmount - (s.currentAmount || 0)) : Infinity;
         if (gap <= 0) return 0;
         let pay = Math.min(gap, maxAmt);
         s.currentAmount = (s.currentAmount || 0) + pay;
         recordDist('savings', s.id, s.name, pay);
         return pay;
      };

      // Priority 2: Car Loan
      newDebts.forEach(d => {
        if (d.name.toLowerCase().includes("car loan") || d.name.toLowerCase().includes("car")) {
           let paid = payDebt(d, remainingCash);
           remainingCash -= paid;
        }
      });
      
      // Priority 3: Other Debts
      const otherDebtsNames = ["zip money", "zip pay", "after pay", "zipmoney", "zippay", "afterpay"];
      let otherDebts = newDebts.filter((d) => otherDebtsNames.some((n) => d.name.toLowerCase().includes(n)));
      if (otherDebts.length > 0 && remainingCash > 0) {
        let itemsLeft = [...otherDebts];
        while (itemsLeft.length > 0 && remainingCash > 0.01) {
          let split = remainingCash / itemsLeft.length;
          let newlyPaidOff = false;
          for (let i = 0; i < itemsLeft.length; i++) {
             let d = itemsLeft[i];
             let bal = d.totalBalance || 0;
             if (bal <= 0) { itemsLeft.splice(i, 1); i--; newlyPaidOff = true; continue; }
             let amt = Math.min(split, bal);
             d.totalBalance -= amt;
             remainingCash -= amt;
             recordDist('debt', d.id, d.name, amt);
             if (d.totalBalance <= 0.01) { d.totalBalance = 0; itemsLeft.splice(i, 1); i--; newlyPaidOff = true; }
          }
          if (!newlyPaidOff) break;
        }
      }

      // Priority 4: Mama Debt
      newDebts.forEach(d => {
        if (d.name.toLowerCase().includes("mama")) {
           let paid = payDebt(d, remainingCash);
           remainingCash -= paid;
        }
      });

      // Priority 4.5: Any other remaining debts
      let unallocatedDebts = newDebts.filter(d => (d.totalBalance || 0) > 0 && !otherDebtsNames.some((n) => d.name.toLowerCase().includes(n)) && !d.name.toLowerCase().includes("car") && !d.name.toLowerCase().includes("mama"));
      if (unallocatedDebts.length > 0 && remainingCash > 0) {
        let itemsLeft = [...unallocatedDebts];
        while (itemsLeft.length > 0 && remainingCash > 0.01) {
          let split = remainingCash / itemsLeft.length;
          let newlyPaidOff = false;
          for (let i = 0; i < itemsLeft.length; i++) {
             let d = itemsLeft[i];
             let bal = d.totalBalance || 0;
             if (bal <= 0) { itemsLeft.splice(i, 1); i--; newlyPaidOff = true; continue; }
             let amt = Math.min(split, bal);
             d.totalBalance -= amt;
             remainingCash -= amt;
             recordDist('debt', d.id, d.name, amt);
             if (d.totalBalance <= 0.01) { d.totalBalance = 0; itemsLeft.splice(i, 1); i--; newlyPaidOff = true; }
          }
          if (!newlyPaidOff) break;
        }
      }
      
      // Priority 5: Business Capital 90% / Emergency Fund 10%
      if (remainingCash > 0.01) {
         let businessSavings = newSavings.filter(s => s.name.toLowerCase().includes("business"));
         let emergencySavings = newSavings.filter(s => s.name.toLowerCase().includes("emergency"));
         
         if (businessSavings.length > 0 && emergencySavings.length > 0) {
             let potentialBusiness = remainingCash * 0.9;
             let potentialEmergency = remainingCash * 0.1;
    
             businessSavings.forEach(s => {
                let paid = fillSaving(s, potentialBusiness);
                potentialBusiness -= paid;
                remainingCash -= paid;
             });
             emergencySavings.forEach(s => {
                let paid = fillSaving(s, potentialEmergency);
                potentialEmergency -= paid;
                remainingCash -= paid;
             });
         }
      }
      
      // Priority 6: Finishing all Savings Goals
      let remainingSavings = newSavings.filter(s => (s.targetAmount > 0 ? (s.targetAmount - (s.currentAmount || 0)) : Infinity) > 0.01);
      if (remainingSavings.length > 0 && remainingCash > 0.01) {
        let itemsLeft = [...remainingSavings];
        while (itemsLeft.length > 0 && remainingCash > 0.01) {
          let split = remainingCash / itemsLeft.length;
          let newlyFilled = false;
          for (let i = 0; i < itemsLeft.length; i++) {
             let s = itemsLeft[i];
             let gap = s.targetAmount > 0 ? (s.targetAmount - (s.currentAmount || 0)) : Infinity;
             if (gap <= 0) { itemsLeft.splice(i, 1); i--; newlyFilled = true; continue; }
             let amt = Math.min(split, gap);
             s.currentAmount = (s.currentAmount || 0) + amt;
             remainingCash -= amt;
             recordDist('savings', s.id, s.name, amt);
             
             gap = s.targetAmount > 0 ? (s.targetAmount - (s.currentAmount || 0)) : Infinity;
             if (gap <= 0.01) { itemsLeft.splice(i, 1); i--; newlyFilled = true; }
          }
          if (!newlyFilled) break;
        }
      }

      const windfall = {
        id: "windfall-" + Date.now(),
        name: assetName,
        sourceAmount: totalAmount,
        date: Date.now(),
        distributions,
        unallocatedCash: remainingCash
      };

      return calculateAutoAllocation({
        ...prev,
        debts: newDebts,
        savings: newSavings,
        cashBalance: (prev.cashBalance || 0) + remainingCash,
        windfalls: [...(prev.windfalls || []), windfall]
      });
    });
    
    setIsSellingAsset(false);
    setAssetName('');
    setAssetAmount('');
  };

  const handleUndoWindfall = (id: string) => {
    setState(prev => {
      let wf = (prev.windfalls || []).find((w: any) => w.id === id);
      if (!wf) return prev;
      
      let newDebts = [...prev.debts].map(d => ({...d}));
      let newSavings = [...prev.savings].map(s => ({...s}));
      
      wf.distributions.forEach((dist: any) => {
         if (dist.type === 'debt') {
            let d = newDebts.find(x => x.id === dist.id);
            if (d) d.totalBalance = (d.totalBalance || 0) + dist.amount;
         } else if (dist.type === 'savings') {
            let s = newSavings.find(x => x.id === dist.id);
            if (s) s.currentAmount = Math.max(0, (s.currentAmount || 0) - dist.amount);
         }
      });
      
      return calculateAutoAllocation({
        ...prev,
        debts: newDebts,
        savings: newSavings,
        cashBalance: Math.max(0, (prev.cashBalance || 0) - wf.unallocatedCash),
        windfalls: prev.windfalls!.filter((w: any) => w.id !== id)
      });
    });
  };`;
code = code.replace(handleSellAssetRegex, newHandleSellAsset);


// 2. Replace Cash Vault Section UI
const cashVaultUIRegex = /\{\/\* Cash Vault Section \*\/\}[\s\S]*?\{\/\* Right Column: Visualization & Breakdown \*\/\}/;

const newCashVaultUI = `{/* Cash Vault Section */}
                  <div className="glass-card mb-6 p-4 md:p-6 border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-teal-50/50 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <CircleDollarSign className="w-24 h-24" />
                    </div>
                    <div className="flex justify-between items-start mb-6 relative">
                      <div>
                        <h2 className="text-base md:text-xl font-bold text-gray-900">Cash Vault</h2>
                        <p className="text-sm text-gray-600">Proceeds from one-off sales or windfalls</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl md:text-3xl font-bold text-emerald-600 drop-shadow-sm">
                          \${(state.cashBalance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </div>
                      </div>
                    </div>
                    
                    {!isSellingAsset ? (
                      <button onClick={() => setIsSellingAsset(true)} className="w-full relative flex items-center justify-center gap-2 bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-colors font-bold py-3 text-sm md:text-base rounded-xl shadow-sm">
                        <Plus className="w-4 h-4 md:w-5 md:h-5" /> Record Windfall / Auto-Allocate Cash
                      </button>
                    ) : (
                      <form onSubmit={handleSellAsset} className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-4 relative mb-4">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-bold text-gray-800">Record Cash Inflow</h3>
                          <button type="button" onClick={() => setIsSellingAsset(false)} className="text-gray-400 hover:text-gray-600 bg-gray-50 rounded-lg p-1 transition-colors"><X className="w-4 h-4" /></button>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">This cash will be automatically allocated down your priority list (Debts -> Savings -> Vault)</p>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wider">Item Name / Source</label>
                          <input type="text" placeholder="e.g. Sold Car, Tax Return" value={assetName} onChange={e => setAssetName(e.target.value)} required className="w-full text-sm px-4 py-2.5 bg-gray-50 border outline-none focus:border-emerald-400 focus:bg-white border-gray-200 transition-colors rounded-xl" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wider">Total Amount</label>
                          <div className="relative">
                            <span className="absolute left-4 top-2.5 text-gray-500 font-medium">$</span>
                            <input type="number" step="0.01" placeholder="0.00" value={assetAmount} onChange={e => setAssetAmount(e.target.value)} required className="w-full text-sm pl-8 pr-4 py-2.5 bg-gray-50 border outline-none focus:border-emerald-400 focus:bg-white border-gray-200 transition-colors rounded-xl" />
                          </div>
                        </div>
                        
                        <button type="submit" className="w-full bg-emerald-500 text-white font-bold py-3 shadow-md rounded-xl hover:bg-emerald-600 hover:shadow-lg transition-all mt-4 text-sm md:text-base">
                          Add & Auto-Allocate
                        </button>
                      </form>
                    )}

                    {(state.windfalls && state.windfalls.length > 0) && (
                      <div className="mt-6 pt-4 border-t border-emerald-200/50">
                        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Windfall History</h3>
                        <div className="space-y-3">
                          {state.windfalls.slice().reverse().map(wf => (
                            <div key={wf.id} className="bg-white/80 border border-emerald-100 p-3 rounded-xl shadow-sm relative group">
                               <div className="flex justify-between items-start">
                                 <div>
                                   <div className="font-bold text-sm text-gray-800">{wf.name}</div>
                                   <div className="text-xs text-gray-500">{new Date(wf.date).toLocaleDateString()}</div>
                                 </div>
                                 <div className="text-right">
                                   <div className="font-bold text-sm text-emerald-600">+\${wf.sourceAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                   <button 
                                     onClick={() => handleUndoWindfall(wf.id)}
                                     className="text-[10px] text-gray-400 hover:text-red-500 font-medium underline mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                   >
                                      Undo Allocation
                                   </button>
                                 </div>
                               </div>
                               {wf.distributions && wf.distributions.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-gray-100/50 flex flex-wrap gap-1">
                                    {wf.distributions.map((d: any, idx: number) => (
                                       <span key={idx} className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-600">
                                         {d.name}: \${d.amount.toFixed(0)}
                                       </span>
                                    ))}
                                    {wf.unallocatedCash > 0.01 && (
                                       <span className="text-[10px] bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-emerald-700 font-medium">
                                         Vault: \${wf.unallocatedCash.toFixed(0)}
                                       </span>
                                    )}
                                  </div>
                               )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>\n\n                  {/* Right Column: Visualization & Breakdown */}`;
code = code.replace(cashVaultUIRegex, newCashVaultUI);


fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
console.log("Success modifying handleSellAsset and Cash Vault");
