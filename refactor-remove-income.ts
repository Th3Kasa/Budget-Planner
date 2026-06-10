import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const regexRemoveIncome = /  const removeIncome = \(id: string\) => \{\n    setState\(\(prev\) => \(\{\n      \.\.\.prev,\n      incomes: prev\.incomes\.filter\(\(item\) => item\.id !== id\),\n    \}\)\);\n  \};/;

const replacementRemoveIncome = `  const removeIncome = (id: string) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        incomes: prev.incomes.filter((item) => item.id !== id),
      };
      return calculateAutoAllocation(nextState);
    });
  };`;

code = code.replace(regexRemoveIncome, replacementRemoveIncome);

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
console.log("Success replacing removeIncome");
