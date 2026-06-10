import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const regex = /      setState\(\(prev\) => \(\{\n        \.\.\.prev,\n        \[collectionName\]: editingItemId\n[\s\S]*?              :\s*item,\n            \)\n          : \[\.\.\.prev\[collectionName\], itemToSave\],\n      \}\)\);/;

const replacement = `      setState((prev) => {
        const nextState = {
          ...prev,
          [collectionName]: editingItemId
            ? prev[collectionName].map((item: any) =>
                item.id === editingItemId
                  ? {
                      ...itemToSave,
                      isLocked: true, // Mark it locked because it was manually modified
                    }
                  : item,
              )
            : [...prev[collectionName], { ...itemToSave, isLocked: true }],
        };
        // Auto-allocate cascade the rest!
        return calculateAutoAllocation(nextState);
      });`;

code = code.replace(regex, replacement);

const regexSavings = /      \}\)\);\n    \} else if \(newItemType === "savings"\) \{\n      const itemToSave = \{\n        id: editingItemId[\s\S]*?        color: "#3b82f6",\n      \};\n\n      setState\(\(prev\) => \(\{\n        \.\.\.prev,\n        savings: editingItemId\n[\s\S]*?              : item,\n            \)\n          : \[\.\.\.prev\.savings, itemToSave\],\n      \}\)\);/;

const replacementSavings = `      });
    } else if (newItemType === "savings") {
      const itemToSave = {
        id: editingItemId || Date.now().toString(),
        name: newItem.name,
        targetAmount:
          Number(newItem.targetAmount) || Number(newItem.amount) * 52,
        currentAmount: Number(newItem.currentAmount) || 0,
        weeklyContribution: Number(newItem.amount),
        color: "#3b82f6",
      };

      setState((prev) => {
        const nextState = {
          ...prev,
          savings: editingItemId
            ? prev.savings.map((item: any) =>
                item.id === editingItemId
                  ? { ...itemToSave, isLocked: true }
                  : item,
              )
            : [...prev.savings, { ...itemToSave, isLocked: true }],
        };
        return calculateAutoAllocation(nextState);
      });`;

code = code.replace(regexSavings, replacementSavings);
fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
console.log("Success replacing handleAddItem");
