import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// 1. Move "+ Debt" button to underneath "Debts" subheader
const addDebtBtn = `<button
                          onClick={() => {
                            setIsAddingItem(true);
                            setNewItemType("debt");
                          }}
                          className="flex items-center gap-1 text-xs md:text-sm text-red-600 font-medium hover:text-red-800 transition-colors bg-red-50 px-2 py-1.5 md:px-3 rounded-lg"
                        >
                          <Plus className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />{" "}
                          Debt
                        </button>`;

const expensesAndDebtsBlock = new RegExp('<div className="flex gap-2">\\\\s*<button[\\\\s\\\\S]*?Expense\\\\s*</button>\\\\s*<button[\\\\s\\\\S]*?Debt\\\\s*</button>\\\\s*</div>');
const justExpenseBtn = `<div className="flex gap-2">
                        <button
                          onClick={() => {
                            setIsAddingItem(true);
                            setNewItemType("expense");
                          }}
                          className="flex items-center gap-1 text-xs md:text-sm text-indigo-600 font-medium hover:text-indigo-800 transition-colors bg-indigo-50 px-2 py-1.5 md:px-3 rounded-lg"
                        >
                          <Plus className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" /> Expense
                        </button>
                      </div>`;
code = code.replace(expensesAndDebtsBlock, justExpenseBtn);

// Also I'll do a fallback if the regex fails
if(!code.includes('Expense\n                        </button>\n                      </div>')) {
   const rx2 = /<div className="flex gap-2">\s*<button[\s\S]*?Expense\s*<\/button>\s*<button[\s\S]*?Debt\s*<\/button>\s*<\/div>/;
   code = code.replace(rx2, justExpenseBtn);
}


const debtsHeaderBlock = new RegExp('<h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">\\\\s*Debts\\\\s*</h3>');
const newDebtsHeaderBlock = `<div className="flex justify-between items-center w-full mb-4">
                              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                Debts
                              </h3>
                              ADD_DEBT_BTN
                            </div>`.replace('ADD_DEBT_BTN', addDebtBtn);
const rx3 = /<h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">\s*Debts\s*<\/h3>/;
code = code.replace(rx3, newDebtsHeaderBlock);


// Remove 50/30/20 Breakdown
const r1 = code.indexOf('{/* 50/30/20 Rule Breakdown */}');
const r2 = code.indexOf('{/* Add Item Modal */}');
if (r1 !== -1 && r2 !== -1) {
    code = code.substring(0, r1) + '</div></div></div>{/* Add Item Modal */}' + code.substring(r2 + '{/* Add Item Modal */}'.length);
}

// 3. Setup state for Calendar and Cash
const extendedState = `const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [calTitle, setCalTitle] = useState('');
  const [calAmount, setCalAmount] = useState('');
  const [calType, setCalType] = useState<'income'|'expense'>('expense');
  const [calIdToEdit, setCalIdToEdit] = useState<string | null>(null);

  const handleSaveCalendarEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!calTitle || !calAmount) return;

    const ev = {
      id: calIdToEdit || Date.now().toString(),
      date: selectedDate,
      title: calTitle,
      amount: Number(calAmount),
      type: calType,
    };

    setState(prev => {
      const events = prev.calendarEvents || [];
      const updatedEvents = calIdToEdit ? events.map(x => x.id === calIdToEdit ? ev : x) : [...events, ev];
      return { ...prev, calendarEvents: updatedEvents };
    });

    setCalTitle('');
    setCalAmount('');
    setCalIdToEdit(null);
  };
  
  const handleEditCalEvent = (ev: any) => {
    setCalIdToEdit(ev.id);
    setSelectedDate(ev.date);
    setCalTitle(ev.title);
    setCalAmount(String(ev.amount));
    setCalType(ev.type);
  };

  const handleDeleteCalEvent = (id: string) => {
    setState(prev => ({
      ...prev,
      calendarEvents: (prev.calendarEvents || []).filter(e => e.id !== id)
    }));
  };

  const [isSellingAsset, setIsSellingAsset] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [assetAmount, setAssetAmount] = useState('');
  const [assetDebtToPay, setAssetDebtToPay] = useState('');

  const handleSellAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName || !assetAmount) return;
    
    let amount = Number(assetAmount);
    setState(prev => {
      let newDebts = [...prev.debts].map(d => ({...d}));
      let remainder = amount;
      
      if (assetDebtToPay) {
        let d = newDebts.find(x => x.id === assetDebtToPay);
        if (d && (d.totalBalance || 0) > 0) {
          let bal = d.totalBalance || 0;
          let payAmt = Math.min(bal, remainder);
          d.totalBalance = bal - payAmt;
          remainder -= payAmt;
        }
      }
      return calculateAutoAllocation({
        ...prev,
        debts: newDebts,
        cashBalance: (prev.cashBalance || 0) + remainder
      });
    });
    
    setIsSellingAsset(false);
    setAssetName('');
    setAssetAmount('');
    setAssetDebtToPay('');
  };
`;
code = code.replace('const [currentMonthDate, setCurrentMonthDate] = useState(new Date());', extendedState);

// 4. Update Calendar View UI
const currentCalendarStart = code.indexOf('<div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">');
const currentCalendarEndStr = '</div>\n                </div>\n              </div>\n            </div>\n          )}';
const currentCalendarEnd = code.indexOf(currentCalendarEndStr, currentCalendarStart);

const updatedCalendarUI = `<div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div key={day} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider py-2">
                      {day}
                    </div>
                  ))}
                  {Array.from({ length: getDay(startOfMonth(currentMonthDate)) }).map((_, i) => (
                    <div key={'empty-'+i} className="p-2 md:p-4 rounded-xl bg-gray-50/30 border border-transparent" />
                  ))}
                  {eachDayOfInterval({ start: startOfMonth(currentMonthDate), end: endOfMonth(currentMonthDate) }).map((date, i) => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const isCurrent = dateStr === selectedDate;
                    const dayEvents = (state.calendarEvents || []).filter(e => e.date === dateStr);
                    
                    return (
                      <div 
                        key={i} 
                        onClick={() => { setSelectedDate(dateStr); setCalIdToEdit(null); setCalTitle(''); setCalAmount(''); }}
                        className={\`p-1 md:p-2 rounded-xl border flex flex-col items-center justify-start min-h-[60px] md:min-h-[80px] transition-all cursor-pointer \${
                          isCurrent 
                            ? 'bg-indigo-50 border-indigo-300 shadow-sm' 
                            : 'bg-white/40 border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/20 text-gray-700'
                        }\`}
                      >
                        <span className={\`text-sm font-medium \${isCurrent ? 'text-indigo-700' : ''}\`}>
                          {format(date, 'd')}
                        </span>
                        <div className="flex flex-col w-full px-1 gap-0.5 mt-1">
                          {dayEvents.map(e => (
                             <div key={e.id} className={\`text-[9px] md:text-[10px] leading-tight truncate px-1 py-0.5 rounded flex items-center \${e.type === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}\`}>
                               {e.amount} {e.title}
                             </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Event Form & List for Selected Date */}
                <div className="mt-6 pt-6 border-t border-gray-100">
                   <h3 className="font-bold text-gray-800 mb-4 flex justify-between items-center">
                     <span>Events for {format(new Date(selectedDate), 'MMMM do, yyyy')}</span>
                     {calIdToEdit && <button onClick={() => { setCalIdToEdit(null); setCalTitle(''); setCalAmount(''); }} className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 transition-colors">Cancel Edit</button>}
                   </h3>
                   
                   <div className="flex flex-col lg:flex-row gap-6">
                     <div className="flex-1 space-y-4">
                       <form onSubmit={handleSaveCalendarEvent} className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 relative">
                         <div className="flex gap-2">
                           <button type="button" onClick={() => setCalType('expense')} className={\`flex-1 py-1.5 text-sm rounded-lg font-bold transition \${calType==='expense' ? 'bg-rose-100 text-rose-700':'text-gray-500 hover:bg-gray-50'}\`}>Expense</button>
                           <button type="button" onClick={() => setCalType('income')} className={\`flex-1 py-1.5 text-sm rounded-lg font-bold transition \${calType==='income' ? 'bg-emerald-100 text-emerald-700':'text-gray-500 hover:bg-gray-50'}\`}>Income</button>
                         </div>
                         <input type="text" placeholder="Title (e.g. Groceries)" value={calTitle} onChange={e => setCalTitle(e.target.value)} className="w-full text-sm px-4 py-2 bg-gray-50 border-gray-200 border outline-none focus:border-indigo-400 focus:bg-white transition-colors rounded-xl" required />
                         <input type="number" step="0.01" placeholder="Amount" value={calAmount} onChange={e => setCalAmount(e.target.value)} className="w-full text-sm px-4 py-2 bg-gray-50 border-gray-200 border outline-none focus:border-indigo-400 focus:bg-white transition-colors rounded-xl" required />
                         <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-2 rounded-xl shadow-sm hover:shadow-md hover:bg-indigo-700 transition flex items-center justify-center text-sm">
                           {calIdToEdit ? 'Save Changes' : 'Add Event'}
                         </button>
                       </form>
                     </div>
                     <div className="flex-1 space-y-3 max-h-[300px] overflow-y-auto pr-2">
                       {(state.calendarEvents || []).filter(e => e.date === selectedDate).length === 0 ? (
                         <div className="text-sm text-gray-400 p-6 bg-white/50 border border-gray-100 rounded-2xl text-center italic">No events on this day.</div>
                       ) : (
                         (state.calendarEvents || []).filter(e => e.date === selectedDate).map(e => (
                           <div key={e.id} className="flex justify-between items-center p-3 md:p-4 rounded-xl border border-gray-100 bg-white shadow-sm group">
                             <div>
                               <div className="text-sm font-semibold text-gray-800">{e.title}</div>
                               <div className={\`text-xs font-bold mt-0.5 \${e.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}\`}>
                                 {e.type === 'income' ? '+' : '-'}\${Number(e.amount).toFixed(2)}
                               </div>
                             </div>
                             <div className="flex gap-2">
                               <button onClick={() => handleEditCalEvent(e)} className="p-1.5 text-gray-400 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                               <button onClick={() => handleDeleteCalEvent(e.id)} className="p-1.5 text-gray-400 bg-gray-50 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                             </div>
                           </div>
                         ))
                       )}
                     </div>
                   </div>
                </div>`;

if (currentCalendarStart !== -1 && currentCalendarEnd !== -1) {
    code = code.substring(0, currentCalendarStart) + updatedCalendarUI + "\n              </div>\n            </div>\n          )}\n" + code.substring(currentCalendarEnd + currentCalendarEndStr.length);
}

// 5. Add "Asset / Cash Vault" section
const rightColumnStr = '{/* Right Column: Visualization & Breakdown */}';
const cashVaultUI = `{/* Cash Vault Section */}
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
                        <Plus className="w-4 h-4 md:w-5 md:h-5" /> Record Windfall / Sell Asset
                      </button>
                    ) : (
                      <form onSubmit={handleSellAsset} className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-4 relative">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-bold text-gray-800">Record Cash Inflow</h3>
                          <button type="button" onClick={() => setIsSellingAsset(false)} className="text-gray-400 hover:text-gray-600 bg-gray-50 rounded-lg p-1 transition-colors"><X className="w-4 h-4" /></button>
                        </div>
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
                        
                        <div className="pt-2 border-t border-gray-100 mt-2">
                          <label className="text-xs font-bold text-gray-600 mb-2 block">Directly Pay Off Debt? (Optional)</label>
                          <select value={assetDebtToPay} onChange={e => setAssetDebtToPay(e.target.value)} className="w-full text-sm px-4 py-2.5 border border-gray-200 outline-none focus:border-emerald-400 rounded-xl bg-gray-50 focus:bg-white transition-colors text-gray-700 font-medium">
                            <option value="">-- No, keep it in Cash Vault --</option>
                            {state.debts.filter(d => (d.totalBalance || 0) > 0).map(d => (
                              <option key={d.id} value={d.id}>Pay off {d.name} (\${d.totalBalance?.toFixed(2)} remaining)</option>
                            ))}
                          </select>
                        </div>
                        
                        <button type="submit" className="w-full bg-emerald-500 text-white font-bold py-3 shadow-md rounded-xl hover:bg-emerald-600 hover:shadow-lg transition-all mt-4 text-sm md:text-base">
                          Confirm Sale
                        </button>
                      </form>
                    )}
                  </div>\n\n                  {/* Right Column: Visualization & Breakdown */}`;

code = code.replace(rightColumnStr, cashVaultUI);

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
console.log("Success modifications 2!");
