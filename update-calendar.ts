import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

// 1. Add imports
if (!code.includes('date-fns')) {
  code = code.replace(
    /} from "lucide-react";/,
    `, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";\nimport { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, getDay, startOfWeek, endOfWeek } from 'date-fns';`
  );
}

// 2. Add state
if (!code.includes('const [currentMonthDate,')) {
  code = code.replace(
    'const [editingItemId, setEditingItemId] = useState<string | null>(null);',
    'const [editingItemId, setEditingItemId] = useState<string | null>(null);\n  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());'
  );
}

// 3. Replace the end of the history tab
const targetString = `}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}`;

const calendarUI = `}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="glass-card p-4 md:p-6 border border-white/60">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-indigo-600" />
                    Calendar View
                  </h2>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setCurrentMonthDate(subMonths(currentMonthDate, 1))} className="p-1 hover:bg-gray-100 rounded-lg transition">
                      <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <span className="font-semibold text-gray-800 min-w-[120px] text-center">
                      {format(currentMonthDate, 'MMMM yyyy')}
                    </span>
                    <button onClick={() => setCurrentMonthDate(addMonths(currentMonthDate, 1))} className="p-1 hover:bg-gray-100 rounded-lg transition">
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider py-2">
                      {day}
                    </div>
                  ))}
                  {Array.from({ length: getDay(startOfMonth(currentMonthDate)) }).map((_, i) => (
                    <div key={\`empty-\${i}\`} className="p-2 md:p-4 rounded-xl bg-gray-50/30 border border-transparent" />
                  ))}
                  {eachDayOfInterval({ start: startOfMonth(currentMonthDate), end: endOfMonth(currentMonthDate) }).map((date, i) => {
                    const isCurrent = isToday(date);
                    return (
                      <div 
                        key={i} 
                        className={\`p-2 md:p-4 rounded-xl border flex flex-col items-center justify-center aspect-square transition-all cursor-default \${
                          isCurrent 
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200' 
                            : 'bg-white/40 border-white/60 hover:border-indigo-200 hover:bg-indigo-50/50 text-gray-700'
                        }\`}
                      >
                        <span className={\`text-sm font-medium \${isCurrent ? 'text-white' : ''}\`}>
                          {format(date, 'd')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}`;

if (code.includes(targetString)) {
  code = code.replace(targetString, calendarUI);
  fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
  console.log("Calendar injected");
} else {
  console.log("Failed to inject calendar");
}
