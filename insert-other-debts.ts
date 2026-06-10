import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const anchor = "// Priority 5: Business Capital 90% / Emergency Fund 10%";
const newLogic = `    // Priority 4.5: Any other remaining debts
    let unallocatedDebts = newDebts.filter((d) => {
      let balance = (d.totalBalance || Infinity) - d.amount;
      return balance > 0.01;
    });

    if (unallocatedDebts.length > 0 && remainingIncome > 0) {
      let debtsLeft = [...unallocatedDebts];
      while (debtsLeft.length > 0 && remainingIncome > 0.01) {
        let split = remainingIncome / debtsLeft.length;
        let newlyPaidOff = false;
        for (let i = 0; i < debtsLeft.length; i++) {
          let d = debtsLeft[i];
          let balance = (d.totalBalance || Infinity) - d.amount;
          let amt = Math.min(split, balance);
          d.amount += amt; // Add to its amount
          remainingIncome -= amt;
          if (d.amount >= (d.totalBalance || Infinity) - 0.01) {
            debtsLeft.splice(i, 1);
            i--;
            newlyPaidOff = true;
          }
        }
        if (!newlyPaidOff) break;
      }

      newDebts = newDebts.map((d) => {
        const updated = unallocatedDebts.find((ud) => ud.id === d.id);
        return updated ? updated : d;
      });
    }

    `;

if (code.includes(anchor)) {
    code = code.replace(anchor, newLogic + anchor);
    fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
    console.log("Success");
} else {
    console.log("Anchor not found");
}
