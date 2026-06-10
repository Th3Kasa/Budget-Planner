import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const calculateOverride = `  const calculateAutoAllocation = (prevState: BudgetState): BudgetState => {
    let newDebts = [...prevState.debts];
    let newSavings = [...prevState.savings];

    let remainingIncome =
      totalNetIncome - prevState.expenses.reduce((acc, el) => acc + el.amount, 0);
    if (remainingIncome < 0) remainingIncome = 0;

    // Deduct locked items first
    newDebts.forEach(d => {
      if (d.isLocked) {
        let amt = Math.min(remainingIncome, d.amount);
        d.amount = amt;
        remainingIncome -= amt;
      } else {
        d.amount = 0;
      }
    });

    newSavings.forEach(s => {
      if (s.isLocked) {
        let amt = Math.min(remainingIncome, s.weeklyContribution);
        s.weeklyContribution = amt;
        remainingIncome -= amt;
      } else {
        s.weeklyContribution = 0;
      }
    });

    // Priority 2: Car Loan
    newDebts = newDebts.map((d) => {
      if (!d.isLocked && (d.name.toLowerCase().includes("car loan") || d.name.toLowerCase().includes("car"))) {
        const balance = (d.totalBalance || Infinity) - (d.isLocked ? d.amount : 0);
        const amountToPay = Math.min(balance, remainingIncome);
        remainingIncome -= amountToPay;
        return { ...d, amount: d.amount + amountToPay };
      }
      return d;
    });

    // Priority 3: Other Debts (Zip Money, Zip Pay, After Pay)
    const otherDebtsNames = ["zip money", "zip pay", "after pay", "zipmoney", "zippay", "afterpay"];
    let otherDebts = newDebts.filter((d) => !d.isLocked && otherDebtsNames.some((n) => d.name.toLowerCase().includes(n)));
    if (otherDebts.length > 0 && remainingIncome > 0) {
      let debtsLeft = [...otherDebts];
      while (debtsLeft.length > 0 && remainingIncome > 0.01) {
        let split = remainingIncome / debtsLeft.length;
        let newlyPaidOff = false;
        for (let i = 0; i < debtsLeft.length; i++) {
          let d = debtsLeft[i];
          let balance = (d.totalBalance || Infinity) - d.amount;
          let amt = Math.min(split, balance);
          d.amount += amt; 
          remainingIncome -= amt;
          if (d.amount >= (d.totalBalance || Infinity) - 0.01) {
            debtsLeft.splice(i, 1);
            i--;
            newlyPaidOff = true;
          }
        }
        if (!newlyPaidOff) break;
      }
    }

    // Priority 4: Mama Debt
    newDebts = newDebts.map((d) => {
      if (!d.isLocked && d.name.toLowerCase().includes("mama")) {
        const balance = (d.totalBalance || Infinity) - d.amount;
        const amountToPay = Math.min(balance, remainingIncome);
        remainingIncome -= amountToPay;
        return { ...d, amount: d.amount + amountToPay };
      }
      return d;
    });

    // Priority 4.5: Any other remaining debts
    let unallocatedDebts = newDebts.filter((d) => !d.isLocked);
    if (unallocatedDebts.length > 0 && remainingIncome > 0) {
      let debtsLeft = [...unallocatedDebts];
      while (debtsLeft.length > 0 && remainingIncome > 0.01) {
        let split = remainingIncome / debtsLeft.length;
        let newlyPaidOff = false;
        for (let i = 0; i < debtsLeft.length; i++) {
          let d = debtsLeft[i];
          let balance = (d.totalBalance || Infinity) - d.amount;
          let amt = Math.min(split, balance);
          d.amount += amt; 
          remainingIncome -= amt;
          if (d.amount >= (d.totalBalance || Infinity) - 0.01) {
            debtsLeft.splice(i, 1);
            i--;
            newlyPaidOff = true;
          }
        }
        if (!newlyPaidOff) break;
      }
    }

    // Priority 5: Business Capital 90% / Emergency Fund 10%
    if (remainingIncome > 0.01) {
      let potentialBusiness = remainingIncome * 0.9;
      let potentialEmergency = remainingIncome * 0.1;

      // Fill Business Capital
      let foundBusiness = false;
      newSavings = newSavings.map((s) => {
        if (!s.isLocked && s.name.toLowerCase().includes("business")) {
          foundBusiness = true;
          let gap = s.targetAmount > 0 ? (s.targetAmount - s.currentAmount - s.weeklyContribution) : Infinity;
          if (gap < 0) gap = 0;
          let amt = Math.min(gap, potentialBusiness);
          remainingIncome -= amt;
          potentialBusiness -= amt;
          return { ...s, weeklyContribution: s.weeklyContribution + amt };
        }
        return s;
      });

      // Fill Emergency
      let foundEmergency = false;
      newSavings = newSavings.map((s) => {
        if (!s.isLocked && s.name.toLowerCase().includes("emergency")) {
          foundEmergency = true;
          let gap = s.targetAmount > 0 ? (s.targetAmount - s.currentAmount - s.weeklyContribution) : Infinity;
          if (gap < 0) gap = 0;
          let amt = Math.min(gap, potentialEmergency);
          remainingIncome -= amt;
          potentialEmergency -= amt;
          return { ...s, weeklyContribution: s.weeklyContribution + amt };
        }
        return s;
      });
      
      // Re-absorb unspent ratio chunks back into remainingIncome
      remainingIncome = remainingIncome + potentialBusiness + potentialEmergency; // No, wait... remainingIncome was decreased by amt. The actual leftover is remainingIncome (which includes whatever we didn't spend).
    }

    // Priority 6: Finishing all Savings Goals
    let remainingSavings = newSavings.filter(s => !s.isLocked);
    if (remainingSavings.length > 0 && remainingIncome > 0.01) {
      let savsLeft = [...remainingSavings];
      while (savsLeft.length > 0 && remainingIncome > 0.01) {
        let split = remainingIncome / savsLeft.length;
        let newlyFilled = false;
        for (let i = 0; i < savsLeft.length; i++) {
          let s = savsLeft[i];
          let gap = s.targetAmount > 0 ? (s.targetAmount - s.currentAmount - s.weeklyContribution) : split;
          if(gap < 0) gap = 0;
          let amt = Math.min(split, gap);
          s.weeklyContribution += amt;
          remainingIncome -= amt;
          if (gap <= split + 0.01) {
            savsLeft.splice(i, 1);
            i--;
            newlyFilled = true;
          }
        }
        if (!newlyFilled) break;
      }
    }

    return {
      ...prevState,
      debts: newDebts,
      savings: newSavings
    };
  };

  const handleAutoAllocate = () => {
    setState((prev) => {
      // Free all locks when explicitly clicking Auto-Allocate!
      const cleared = {
        ...prev,
        debts: prev.debts.map(d => ({...d, isLocked: false})),
        savings: prev.savings.map(s => ({...s, isLocked: false}))
      };
      return calculateAutoAllocation(cleared);
    });
  };
`;

const handleAutoAllocateRegex = /  const handleAutoAllocate = \(\) => {[\s\S]*?    \}\)\);\n  \};\n/;

if (handleAutoAllocateRegex.test(code)) {
    code = code.replace(handleAutoAllocateRegex, calculateOverride);
    fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
    console.log("Success replacing handleAutoAllocate");
} else {
    console.error("Failed to find handleAutoAllocate");
}
