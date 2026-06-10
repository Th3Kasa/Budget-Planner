import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const regexRemove = /  const removeItem = \(type: "expenses" \| "debts" \| "savings", id: string\) => \{\n    setState\(\(prev\) => \(\{\n      \.\.\.prev,\n      \[type\]: prev\[type\]\.filter\(\(item: any\) => item\.id !== id\),\n    \}\)\);\n  \};/;

const replacementRemove = `  const removeItem = (type: "expenses" | "debts" | "savings", id: string) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        [type]: prev[type].filter((item: any) => item.id !== id),
      };
      return calculateAutoAllocation(nextState);
    });
  };`;

code = code.replace(regexRemove, replacementRemove);

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
console.log("Success replacing removeItem");
