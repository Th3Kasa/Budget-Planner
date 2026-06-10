import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const helper = `  const computeNetIncome = (calcState: BudgetState) => {
    const calcIncomeAmount = (inc: any) => {
      if (inc.type === "fixed") return inc.amount || 0;
      if (inc.type === "casual") {
        if (inc.useShifts && inc.shifts) {
          return inc.shifts.reduce((sum: number, shift: any) => {
            const basePay = (shift.hours || 0) * (inc.hourlyRate || 0);
            const otPay = (shift.overtimeHours || 0) * (shift.overtimeRate || 0);
            const travel = shift.travelAllowance || 0;
            const meal = shift.mealAllowance || 0;
            return sum + basePay + otPay + travel + meal;
          }, 0);
        }
        return (inc.hourlyRate || 0) * (inc.hoursWorked || 0);
      }
      return 0;
    };

    const taxInc = calcState.incomes.filter((i) => !i.isCash).reduce((acc, inc) => acc + calcIncomeAmount(inc), 0);
    const untaxInc = calcState.incomes.filter((i) => i.isCash).reduce((acc, inc) => acc + calcIncomeAmount(inc), 0);
    
    const { netWeekly: nWeekly } = calculateWeeklyTax(taxInc);
    const { weeklyPayment: cWeekly } = calculateCentrelink(taxInc);
    
    return nWeekly + cWeekly + untaxInc;
  };
`;

const calculateRegex = /  const calculateAutoAllocation = \(prevState: BudgetState\): BudgetState => \{/;
const calculateReplacement = helper + `\n  const calculateAutoAllocation = (prevState: BudgetState): BudgetState => {
    let newDebts = [...prevState.debts].map(d => ({...d}));
    let newSavings = [...prevState.savings].map(s => ({...s}));

    let currentTotalNetIncome = computeNetIncome(prevState);

    let remainingIncome =
      currentTotalNetIncome - prevState.expenses.reduce((acc, el) => acc + el.amount, 0);`;

code = code.replace(
    /  const calculateAutoAllocation = \(prevState: BudgetState\): BudgetState => \{\n    let newDebts = \[\.\.\.prevState\.debts\];\n    let newSavings = \[\.\.\.prevState\.savings\];\n\n    let remainingIncome =\n      totalNetIncome - prevState\.expenses\.reduce\(\(acc, el\) => acc \+ el\.amount, 0\);/,
    calculateReplacement
);

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
console.log("Replaced net calculation");
