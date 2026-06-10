import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const regexIncome = /    else if \(newItemType === "income"\) \{\n      const itemToSave = \{\n        id: editingItemId[\s\S]*?        shifts: newItem\.useShifts[\s\S]*?                : shift,\n            \)\n          : \[\]\n      \};\n\n      setState\(\(prev\) => \(\{\n        \.\.\.prev,\n        incomes: editingItemId\n[\s\S]*?              : item,\n            \)\n          : \[\.\.\.prev\.incomes, itemToSave\],\n      \}\)\);\n    \}/;

// Wait, the regex is complex. Let's just do a string replace or a simpler regex.
const simpleRegex = /      setState\(\(prev\) => \(\{\n        \.\.\.prev,\n        incomes: editingItemId\n          \? prev\.incomes\.map\(\(item: any\) =>\n              item\.id === editingItemId \? \{ \.\.\.item, \.\.\.itemToSave \} : item,\n            \)\n          : \[\.\.\.prev\.incomes, itemToSave\],\n      \}\)\);\n    \}/;

const replacement = `      setState((prev) => {
        const nextState = {
          ...prev,
          incomes: editingItemId
            ? prev.incomes.map((item: any) =>
                item.id === editingItemId ? { ...item, ...itemToSave } : item,
              )
            : [...prev.incomes, itemToSave],
        };
        return calculateAutoAllocation(nextState);
      });
    }`;

if(code.includes('incomes: editingItemId')) {
  code = code.replace(simpleRegex, replacement);
  fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
  console.log("Success replacing incomes");
} else {
  console.log("Failed replacing incomes");
}
