import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const anchor = "const removeIncome = (id: string) => {";

const autoAllocFunc = `const handleAutoAllocate = () => {
    let remainingIncome = totalNetIncome - state.expenses.reduce((acc, el) => acc + el.amount, 0);
    if (remainingIncome < 0) remainingIncome = 0;

    let newDebts = state.debts.map(d => ({ ...d, amount: 0 }));
    let newSavings = state.savings.map(s => ({ ...s, weeklyContribution: 0 }));

    // Priority 2: Car Loan
    newDebts = newDebts.map(d => {
        if (d.name.toLowerCase().includes("car loan") || d.name.toLowerCase().includes("car")) {
            const balance = d.totalBalance || Infinity;
            const amountToPay = Math.min(balance, remainingIncome);
            remainingIncome -= amountToPay;
            return { ...d, amount: amountToPay };
        }
        return d;
    });

    // Priority 3: Other Debts (Zip Money, Zip Pay, After Pay)
    const otherDebtsNames = ["zip money", "zip pay", "after pay", "zipmoney", "zippay", "afterpay"];
    let otherDebts = newDebts.filter(d => otherDebtsNames.some(n => d.name.toLowerCase().includes(n)) && d.amount === 0);
    if (otherDebts.length > 0 && remainingIncome > 0) {
        let debtsLeft = [...otherDebts];
        while (debtsLeft.length > 0 && remainingIncome > 0) {
            let split = remainingIncome / debtsLeft.length;
            let newlyPaidOff = false;
            for (let i = 0; i < debtsLeft.length; i++) {
                let d = debtsLeft[i];
                let balance = (d.totalBalance || Infinity) - d.amount; 
                let amt = Math.min(split, balance);
                d.amount += amt; // Add to its amount
                remainingIncome -= amt;
                if (d.amount >= (d.totalBalance || Infinity)) {
                    debtsLeft.splice(i, 1);
                    i--;
                    newlyPaidOff = true;
                }
            }
            if (!newlyPaidOff) break;
        }
        
        newDebts = newDebts.map(d => {
            const updated = otherDebts.find(od => od.id === d.id);
            return updated ? updated : d;
        });
    }

    // Priority 4: Mama Debt
    newDebts = newDebts.map(d => {
        if (d.name.toLowerCase().includes("mama")) {
            const balance = (d.totalBalance || Infinity) - d.amount;
            const amountToPay = Math.min(balance, remainingIncome);
            remainingIncome -= amountToPay;
            return { ...d, amount: d.amount + amountToPay };
        }
        return d;
    });

    // Priority 5: Business Capital 90% / Emergency Fund 10%
    if (remainingIncome > 0) {
        let businessAmount = remainingIncome * 0.9;
        let emergencyAmount = remainingIncome * 0.1;

        let foundBusiness = false;
        newSavings = newSavings.map(s => {
            if (s.name.toLowerCase().includes("business")) {
                foundBusiness = true;
                return { ...s, weeklyContribution: businessAmount };
            }
            return s;
        });
        if (!foundBusiness && businessAmount > 0) {
            newSavings.push({
                id: "business-auto-" + Date.now(),
                name: "Business Capital",
                targetAmount: 0,
                currentAmount: 0,
                weeklyContribution: businessAmount,
                color: "#f59e0b"
            });
        }

        let foundEmergency = false;
        newSavings = newSavings.map(s => {
            if (s.name.toLowerCase().includes("emergency")) {
                foundEmergency = true;
                return { ...s, weeklyContribution: emergencyAmount };
            }
            return s;
        });
        if (!foundEmergency && emergencyAmount > 0) {
            newSavings.push({
                id: "emergency-auto-" + Date.now(),
                name: "Emergency Fund",
                targetAmount: 0,
                currentAmount: 0,
                weeklyContribution: emergencyAmount,
                color: "#10b981"
            });
        }
    }

    setState(prev => ({
        ...prev,
        debts: newDebts,
        savings: newSavings
    }));
};

`;

code = code.replace(anchor, autoAllocFunc + anchor);

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
console.log("Added allocation function");
