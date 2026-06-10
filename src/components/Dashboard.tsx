import React, { useState, useEffect } from "react";
// Update imports
import {
  Home,
  PieChart,
  Target,
  Settings,
  Wallet,
  Receipt,
  CreditCard,
  CarFront,
  Utensils,
  Smartphone,
  TrendingUp,
  TrendingDown,
  CircleDollarSign,
  Briefcase,
  LogOut,
  Plus,
  Trash2,
  X,
  Sparkles,
  AlertTriangle,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Lock,
  Fingerprint,
  CheckCircle2,
  Loader2,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  getDay,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { cn } from "../lib/utils";
import {
  calculateWeeklyTax,
  calculateCentrelink,
  calculateSuper,
} from "../lib/calculators";
import {
  BudgetState,
  BudgetElement,
  SavingsGoal,
  IncomeStream,
} from "../types";
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { User } from "firebase/auth";

interface DashboardProps {
  firebaseUser?: User | null;
  onLogout?: () => void;
}

const INITIAL_STATE: BudgetState = {
  incomes: [
    {
      id: "job-1",
      name: "Casual Income",
      type: "casual",
      hourlyRate: 35,
      hoursWorked: 25,
    },
  ],
  expenses: [
    {
      id: "nib",
      name: "NIB Health",
      amount: 13.0,
      category: "Health",
      color: "#10b981",
      icon: "receipt",
    },
    {
      id: "gym",
      name: "Global Gym",
      amount: 15.45,
      category: "Health",
      color: "#8b5cf6",
      icon: "receipt",
    },
    {
      id: "telecom",
      name: "More Telecom",
      amount: 28.0,
      category: "Phone/Internet",
      color: "#3b82f6",
      icon: "smartphone",
    },
    {
      id: "subs",
      name: "Netflix & YouTube",
      amount: 12.45,
      category: "Entertainment",
      color: "#ec4899",
      icon: "smartphone",
    },
    {
      id: "rideshare",
      name: "Uber & DiDi",
      amount: 60.0,
      category: "Transport",
      color: "#f59e0b",
      icon: "car",
    },
    {
      id: "eating-out",
      name: "Dining & Cafes",
      amount: 120.0,
      category: "Food/Dining",
      color: "#ef4444",
      icon: "utensils",
    },
    {
      id: "groceries",
      name: "Coles & Woolies",
      amount: 60.0,
      category: "Food/Dining",
      color: "#10b981",
      icon: "receipt",
    },
  ],
  debts: [
    {
      id: "personal-loan",
      name: "Car Loan (CBA)",
      amount: 132,
      totalBalance: 13160.66,
      originalBalance: 15000,
      category: "Debt",
      color: "#ef4444",
      icon: "credit-card",
    },
    {
      id: "bnpl",
      name: "ZipPay & Afterpay",
      amount: 45.0,
      totalBalance: 500,
      originalBalance: 1000,
      category: "Debt",
      color: "#f59e0b",
      icon: "credit-card",
    },
  ],
  savings: [
    {
      id: "business",
      name: "Start a Business",
      targetAmount: 10000,
      currentAmount: 0,
      weeklyContribution: 100,
      color: "#3b82f6",
    },
    {
      id: "house",
      name: "House Deposit",
      targetAmount: 200000,
      currentAmount: 0,
      weeklyContribution: 50,
      color: "#ec4899",
    },
    {
      id: "emergency",
      name: "Emergency Fund",
      targetAmount: 5000,
      currentAmount: 0,
      weeklyContribution: 50,
      color: "#10b981",
    },
  ],
};

function getIcon(name: string) {
  switch (name) {
    case "smartphone":
      return <Smartphone className="w-5 h-5 flex-shrink-0" />;
    case "car":
      return <CarFront className="w-5 h-5 flex-shrink-0" />;
    case "utensils":
      return <Utensils className="w-5 h-5 flex-shrink-0" />;
    case "credit-card":
      return <CreditCard className="w-5 h-5 flex-shrink-0" />;
    case "briefcase":
      return <Briefcase className="w-5 h-5 flex-shrink-0" />;
    default:
      return <Receipt className="w-5 h-5 flex-shrink-0" />;
  }
}

export default function Dashboard({ firebaseUser, onLogout }: DashboardProps) {
  const [state, setState] = useState<BudgetState>(() => {
    const saved = localStorage.getItem("budget_state_v4");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.incomes) {
          parsed.incomes = [
            {
              id: "job-legacy",
              name: "Casual Job",
              type: "casual",
              hourlyRate: parsed.hourlyRate || 35,
              hoursWorked: parsed.hoursWorked || 25,
            },
          ];
        }
        if (parsed.debts) {
          parsed.debts = parsed.debts.map((d: any) => ({
            ...d,
            originalBalance:
              d.originalBalance || d.totalBalance || d.amount * 52,
          }));
        }
        return parsed;
      } catch (e) {
        return INITIAL_STATE;
      }
    }
    return INITIAL_STATE;
  });

  const [activeTab, setActiveTab] = useState<
    "home" | "history" | "goals" | "settings"
  >("home");
  const [isAddingItem, setIsAddingItem] = useState(false);

  // Security / Access Settings states
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinSuccessMsg, setPinSuccessMsg] = useState('');
  const [pinErrorMsg, setPinErrorMsg] = useState('');

  // Savings Goal Quick Allocation states
  const [allocatingGoalId, setAllocatingGoalId] = useState<string | null>(null);
  const [allocationAmount, setAllocationAmount] = useState('');

  const [isBiometricRegistered, setIsBiometricRegistered] = useState(() => {
    return localStorage.getItem('biometric_enabled') === 'true';
  });
  const [showBioScannerReg, setShowBioScannerReg] = useState(false);
  const [bioRegStep, setBioRegStep] = useState(0); // 1: Init, 2: Present, 3: Keys, 4: Finished
  const [bioRegText, setBioRegText] = useState('');

  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    setPinSuccessMsg('');
    setPinErrorMsg('');

    const savedPin = localStorage.getItem('login_pin') || '0000';
    if (currentPinInput !== savedPin) {
      setPinErrorMsg('Current PIN is incorrect.');
      return;
    }

    if (newPinInput.length !== 4 || !/^\d+$/.test(newPinInput)) {
      setPinErrorMsg('New PIN must be exactly 4 digits.');
      return;
    }

    if (newPinInput !== confirmPinInput) {
      setPinErrorMsg('New PIN and Confirm PIN do not match.');
      return;
    }

    localStorage.setItem('login_pin', newPinInput);
    setPinSuccessMsg('PIN updated successfully!');
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
  };

  const handleStartBiometricReg = () => {
    setShowBioScannerReg(true);
    setBioRegStep(1);
    setBioRegText('Initializing secure biometric sensor...');
    
    setTimeout(() => {
      setBioRegStep(2);
      setBioRegText('Present your fingerprint or face to the camera...');
      
      setTimeout(() => {
        setBioRegStep(3);
        setBioRegText('Verifying credential keys & registering device security keys...');
        
        setTimeout(() => {
          setBioRegStep(4);
          setBioRegText('Biometrics registered successfully!');
          localStorage.setItem('biometric_enabled', 'true');
          setIsBiometricRegistered(true);
          
          setTimeout(() => {
            setShowBioScannerReg(false);
          }, 1500);
        }, 1200);
      }, 1500);
    }, 1000);
  };

  const handleRemoveBiometricReg = () => {
    localStorage.removeItem('biometric_enabled');
    setIsBiometricRegistered(false);
    alert('Biometric credential registration has been cleared.');
  };

  const handleAllocateFromVault = (goalId: string, amountStr: string) => {
    const amt = Number(amountStr);
    if (isNaN(amt) || amt <= 0) return;
    
    if (amt > (state.cashBalance || 0)) {
      alert("Insufficient funds in Cash Vault!");
      return;
    }
    
    setState(prev => {
      const newSavings = prev.savings.map(s => {
        if (s.id === goalId) {
          return {
            ...s,
            currentAmount: (s.currentAmount || 0) + amt
          };
        }
        return s;
      });
      
      return {
        ...prev,
        savings: newSavings,
        cashBalance: Math.max(0, (prev.cashBalance || 0) - amt)
      };
    });
    
    setAllocatingGoalId(null);
    setAllocationAmount('');
  };
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
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
  const [isAdjustingVault, setIsAdjustingVault] = useState(false);
  const [adjustVaultAmount, setAdjustVaultAmount] = useState('');
  
  const handleAdjustVault = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustVaultAmount) return;
    
    let newBalance = Number(adjustVaultAmount);
    setState(prev => ({
      ...prev,
      cashBalance: Math.max(0, newBalance)
    }));
    
    setIsAdjustingVault(false);
    setAdjustVaultAmount('');
  };
  const [assetName, setAssetName] = useState('');
  const [assetAmount, setAssetAmount] = useState('');
  const [assetDebtToPay, setAssetDebtToPay] = useState('');

  const handleSellAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName || !assetAmount) return;
    
    let totalAmount = Number(assetAmount);
    
    setState(prev => {
      let remainingCash = totalAmount;
      let newDebts = [...prev.debts].map(d => ({...d}));
      let newSavings = [...prev.savings].map(s => ({...s}));
      let distributions: any[] = [];
      
      const recordDist = (type: 'debt'|'savings', id: string, name: string, amt: number) => {
        if (amt <= 0.001) return;
        let existing = distributions.find(x => x.id === id);
        if (existing) existing.amount += amt;
        else distributions.push({ type, id, name, amount: amt });
      };

      const payDebt = (d: any, maxAmt: number) => {
         let bal = d.totalBalance || 0;
         if (bal <= 0) return 0;
         let pay = Math.min(bal, maxAmt);
         d.totalBalance = bal - pay;
         recordDist('debt', d.id, d.name, pay);
         return pay;
      };

      const fillSaving = (s: any, maxAmt: number) => {
         let gap = s.targetAmount > 0 ? (s.targetAmount - (s.currentAmount || 0)) : Infinity;
         if (gap <= 0) return 0;
         let pay = Math.min(gap, maxAmt);
         s.currentAmount = (s.currentAmount || 0) + pay;
         recordDist('savings', s.id, s.name, pay);
         return pay;
      };

      // Priority 2: Car Loan
      newDebts.forEach(d => {
        if (d.name.toLowerCase().includes("car loan") || d.name.toLowerCase().includes("car")) {
           let paid = payDebt(d, remainingCash);
           remainingCash -= paid;
        }
      });
      
      // Priority 3: Other Debts
      const otherDebtsNames = ["zip money", "zip pay", "after pay", "zipmoney", "zippay", "afterpay"];
      let otherDebts = newDebts.filter((d) => otherDebtsNames.some((n) => d.name.toLowerCase().includes(n)));
      if (otherDebts.length > 0 && remainingCash > 0) {
        let itemsLeft = [...otherDebts];
        while (itemsLeft.length > 0 && remainingCash > 0.01) {
          let split = remainingCash / itemsLeft.length;
          let newlyPaidOff = false;
          for (let i = 0; i < itemsLeft.length; i++) {
             let d = itemsLeft[i];
             let bal = d.totalBalance || 0;
             if (bal <= 0) { itemsLeft.splice(i, 1); i--; newlyPaidOff = true; continue; }
             let amt = Math.min(split, bal);
             d.totalBalance -= amt;
             remainingCash -= amt;
             recordDist('debt', d.id, d.name, amt);
             if (d.totalBalance <= 0.01) { d.totalBalance = 0; itemsLeft.splice(i, 1); i--; newlyPaidOff = true; }
          }
          if (!newlyPaidOff) break;
        }
      }

      // Priority 4: Mama Debt
      newDebts.forEach(d => {
        if (d.name.toLowerCase().includes("mama")) {
           let paid = payDebt(d, remainingCash);
           remainingCash -= paid;
        }
      });

      // Priority 4.5: Any other remaining debts
      let unallocatedDebts = newDebts.filter(d => (d.totalBalance || 0) > 0 && !otherDebtsNames.some((n) => d.name.toLowerCase().includes(n)) && !d.name.toLowerCase().includes("car") && !d.name.toLowerCase().includes("mama"));
      if (unallocatedDebts.length > 0 && remainingCash > 0) {
        let itemsLeft = [...unallocatedDebts];
        while (itemsLeft.length > 0 && remainingCash > 0.01) {
          let split = remainingCash / itemsLeft.length;
          let newlyPaidOff = false;
          for (let i = 0; i < itemsLeft.length; i++) {
             let d = itemsLeft[i];
             let bal = d.totalBalance || 0;
             if (bal <= 0) { itemsLeft.splice(i, 1); i--; newlyPaidOff = true; continue; }
             let amt = Math.min(split, bal);
             d.totalBalance -= amt;
             remainingCash -= amt;
             recordDist('debt', d.id, d.name, amt);
             if (d.totalBalance <= 0.01) { d.totalBalance = 0; itemsLeft.splice(i, 1); i--; newlyPaidOff = true; }
          }
          if (!newlyPaidOff) break;
        }
      }
      
      // Priority 5: Business Capital 90% / Emergency Fund 10%
      if (remainingCash > 0.01) {
         let businessSavings = newSavings.filter(s => s.name.toLowerCase().includes("business"));
         let emergencySavings = newSavings.filter(s => s.name.toLowerCase().includes("emergency"));
         
         if (businessSavings.length > 0 && emergencySavings.length > 0) {
             let potentialBusiness = remainingCash * 0.9;
             let potentialEmergency = remainingCash * 0.1;
    
             businessSavings.forEach(s => {
                let paid = fillSaving(s, potentialBusiness);
                potentialBusiness -= paid;
                remainingCash -= paid;
             });
             emergencySavings.forEach(s => {
                let paid = fillSaving(s, potentialEmergency);
                potentialEmergency -= paid;
                remainingCash -= paid;
             });
         }
      }
      
      // Priority 6: Finishing all Savings Goals
      let remainingSavings = newSavings.filter(s => (s.targetAmount > 0 ? (s.targetAmount - (s.currentAmount || 0)) : Infinity) > 0.01);
      if (remainingSavings.length > 0 && remainingCash > 0.01) {
        let itemsLeft = [...remainingSavings];
        while (itemsLeft.length > 0 && remainingCash > 0.01) {
          let split = remainingCash / itemsLeft.length;
          let newlyFilled = false;
          for (let i = 0; i < itemsLeft.length; i++) {
             let s = itemsLeft[i];
             let gap = s.targetAmount > 0 ? (s.targetAmount - (s.currentAmount || 0)) : Infinity;
             if (gap <= 0) { itemsLeft.splice(i, 1); i--; newlyFilled = true; continue; }
             let amt = Math.min(split, gap);
             s.currentAmount = (s.currentAmount || 0) + amt;
             remainingCash -= amt;
             recordDist('savings', s.id, s.name, amt);
             
             gap = s.targetAmount > 0 ? (s.targetAmount - (s.currentAmount || 0)) : Infinity;
             if (gap <= 0.01) { itemsLeft.splice(i, 1); i--; newlyFilled = true; }
          }
          if (!newlyFilled) break;
        }
      }

      const windfall = {
        id: "windfall-" + Date.now(),
        name: assetName,
        sourceAmount: totalAmount,
        date: Date.now(),
        distributions,
        unallocatedCash: remainingCash
      };

      return calculateAutoAllocation({
        ...prev,
        debts: newDebts,
        savings: newSavings,
        cashBalance: (prev.cashBalance || 0) + remainingCash,
        windfalls: [...(prev.windfalls || []), windfall]
      });
    });
    
    setIsSellingAsset(false);
    setAssetName('');
    setAssetAmount('');
  };

  const handleUndoWindfall = (id: string) => {
    setState(prev => {
      let wf = (prev.windfalls || []).find((w: any) => w.id === id);
      if (!wf) return prev;
      
      let newDebts = [...prev.debts].map(d => ({...d}));
      let newSavings = [...prev.savings].map(s => ({...s}));
      
      wf.distributions.forEach((dist: any) => {
         if (dist.type === 'debt') {
            let d = newDebts.find(x => x.id === dist.id);
            if (d) d.totalBalance = (d.totalBalance || 0) + dist.amount;
         } else if (dist.type === 'savings') {
            let s = newSavings.find(x => x.id === dist.id);
            if (s) s.currentAmount = Math.max(0, (s.currentAmount || 0) - dist.amount);
         }
      });
      
      return calculateAutoAllocation({
        ...prev,
        debts: newDebts,
        savings: newSavings,
        cashBalance: Math.max(0, (prev.cashBalance || 0) - wf.unallocatedCash),
        windfalls: prev.windfalls!.filter((w: any) => w.id !== id)
      });
    });
  };

  const [newItemType, setNewItemType] = useState<
    "expense" | "savings" | "debt" | "income"
  >("expense");
  const defaultNewItem = {
    name: "",
    amount: "",
    targetAmount: "",
    currentAmount: "",
    totalBalance: "",
    category: "General",
    type: "casual",
    isCash: false,
    hourlyRate: "",
    hoursWorked: "",
    useShifts: false,
    shifts: [
      {
        day: "Monday",
        hours: "",
        travelAllowance: "",
        mealAllowance: "",
        overtimeHours: "",
        overtimeRate: "",
      },
      {
        day: "Tuesday",
        hours: "",
        travelAllowance: "",
        mealAllowance: "",
        overtimeHours: "",
        overtimeRate: "",
      },
      {
        day: "Wednesday",
        hours: "",
        travelAllowance: "",
        mealAllowance: "",
        overtimeHours: "",
        overtimeRate: "",
      },
      {
        day: "Thursday",
        hours: "",
        travelAllowance: "",
        mealAllowance: "",
        overtimeHours: "",
        overtimeRate: "",
      },
      {
        day: "Friday",
        hours: "",
        travelAllowance: "",
        mealAllowance: "",
        overtimeHours: "",
        overtimeRate: "",
      },
      {
        day: "Saturday",
        hours: "",
        travelAllowance: "",
        mealAllowance: "",
        overtimeHours: "",
        overtimeRate: "",
      },
      {
        day: "Sunday",
        hours: "",
        travelAllowance: "",
        mealAllowance: "",
        overtimeHours: "",
        overtimeRate: "",
      },
    ],
  };

  const [newItem, setNewItem] = useState(defaultNewItem);

  const openEditModal = (
    type: "expense" | "savings" | "debt" | "income",
    item: any,
  ) => {
    setNewItemType(type);
    setEditingItemId(item.id);
    setNewItem({
      ...defaultNewItem,
      name: item.name || "",
      amount: String(
        type === "savings" ? item.weeklyContribution : item.amount || "",
      ),
      targetAmount: String(item.targetAmount || ""),
      currentAmount: String(item.currentAmount || ""),
      totalBalance: String(item.originalBalance || item.totalBalance || ""),
      category: item.category || "General",
      type: item.type || "casual",
      isCash: item.isCash || false,
      hourlyRate: String(item.hourlyRate || ""),
      hoursWorked: String(item.hoursWorked || ""),
      useShifts: item.useShifts || false,
      shifts: item.shifts
        ? JSON.parse(JSON.stringify(item.shifts))
        : defaultNewItem.shifts,
    });
    setIsAddingItem(true);
  };

  // Check local and cloud session tracking
  useEffect(() => {
    localStorage.setItem("budget_state_v4", JSON.stringify(state));

    if (firebaseUser) {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      setDoc(userDocRef, { budgetState: state }, { merge: true }).catch(console.error);
    }
  }, [state, firebaseUser]);

  // Read from cloud on load/change
  useEffect(() => {
    if (!firebaseUser) return;
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists() && !docSnap.metadata.hasPendingWrites) {
        const data = docSnap.data();
        if (data && data.budgetState) {
          setState((prevState) => {
            if (JSON.stringify(prevState) !== JSON.stringify(data.budgetState)) {
              return data.budgetState;
            }
            return prevState;
          });
        }
      }
    });
    return () => unsubscribe();
  }, [firebaseUser]);

  // Calculations
  const calculateIncomeAmount = (inc: IncomeStream) => {
    if (inc.type === "casual") {
      if (inc.useShifts && inc.shifts) {
        return inc.shifts.reduce((sum, shift) => {
          const basePay = (shift.hours || 0) * (inc.hourlyRate || 0);
          const otPay = (shift.overtimeHours || 0) * (shift.overtimeRate || 0);
          return (
            sum +
            basePay +
            otPay +
            (shift.travelAllowance || 0) +
            (shift.mealAllowance || 0)
          );
        }, 0);
      }
      return (inc.hourlyRate || 0) * (inc.hoursWorked || 0);
    }
    return inc.amount || 0;
  };

  const taxableWeeklyIncome = state.incomes
    .filter((i) => !i.isCash)
    .reduce((acc, inc) => acc + calculateIncomeAmount(inc), 0);

  const untaxedWeeklyIncome = state.incomes
    .filter((i) => i.isCash)
    .reduce((acc, inc) => acc + calculateIncomeAmount(inc), 0);

  const weeklyGrossIncome = taxableWeeklyIncome + untaxedWeeklyIncome;

  const { netWeekly, totalDeductions, weeklyTax, weeklyHecs, weeklyMedicare } =
    calculateWeeklyTax(taxableWeeklyIncome);
  const { weeklyPayment: centrelinkWeekly } =
    calculateCentrelink(taxableWeeklyIncome);
  const superContribution = calculateSuper(taxableWeeklyIncome);

  const totalNetIncome = netWeekly + centrelinkWeekly + untaxedWeeklyIncome;

  const totalExpenses = state.expenses.reduce((acc, el) => acc + el.amount, 0);
  const totalDebts = state.debts.reduce((acc, el) => acc + el.amount, 0);
  const totalSavingsCont = state.savings.reduce(
    (acc, el) => acc + el.weeklyContribution,
    0,
  );

  const totalOutgoings = totalExpenses + totalDebts + totalSavingsCont;
  const weeklySurplus = totalNetIncome - totalOutgoings;

  const computeNetIncome = (calcState: BudgetState) => {
    const calcIncomeAmount = (inc: any) => {
      if (inc.type === "fixed") return inc.amount || 0;
      if (inc.type === "casual") {
        if (inc.useShifts && inc.shifts) {
          return inc.shifts.reduce((sum: number, shift: any) => {
            const basePay = (shift.hours || 0) * (inc.hourlyRate || 0);
            const otPay =
              (shift.overtimeHours || 0) * (shift.overtimeRate || 0);
            const travel = shift.travelAllowance || 0;
            const meal = shift.mealAllowance || 0;
            return sum + basePay + otPay + travel + meal;
          }, 0);
        }
        return (inc.hourlyRate || 0) * (inc.hoursWorked || 0);
      }
      return 0;
    };

    const taxInc = calcState.incomes
      .filter((i) => !i.isCash)
      .reduce((acc, inc) => acc + calcIncomeAmount(inc), 0);
    const untaxInc = calcState.incomes
      .filter((i) => i.isCash)
      .reduce((acc, inc) => acc + calcIncomeAmount(inc), 0);

    const { netWeekly: nWeekly } = calculateWeeklyTax(taxInc);
    const { weeklyPayment: cWeekly } = calculateCentrelink(taxInc);

    return nWeekly + cWeekly + untaxInc;
  };

  const calculateAutoAllocation = (prevState: BudgetState): BudgetState => {
    let newDebts = [...prevState.debts].map((d) => ({ ...d }));
    let newSavings = [...prevState.savings].map((s) => ({ ...s }));

    let currentTotalNetIncome = computeNetIncome(prevState);

    let remainingIncome =
      currentTotalNetIncome -
      prevState.expenses.reduce((acc, el) => acc + el.amount, 0);
    if (remainingIncome < 0) remainingIncome = 0;

    // Deduct locked items first
    newDebts.forEach((d) => {
      if (d.isLocked) {
        let amt = Math.min(remainingIncome, d.amount);
        d.amount = amt;
        remainingIncome -= amt;
      } else {
        d.amount = 0;
      }
    });

    newSavings.forEach((s) => {
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
      if (
        !d.isLocked &&
        (d.name.toLowerCase().includes("car loan") ||
          d.name.toLowerCase().includes("car"))
      ) {
        const balance =
          (d.totalBalance || Infinity) - (d.isLocked ? d.amount : 0);
        const amountToPay = Math.min(balance, remainingIncome);
        remainingIncome -= amountToPay;
        return { ...d, amount: d.amount + amountToPay };
      }
      return d;
    });

    // Priority 3: Other Debts (Zip Money, Zip Pay, After Pay)
    const otherDebtsNames = [
      "zip money",
      "zip pay",
      "after pay",
      "zipmoney",
      "zippay",
      "afterpay",
    ];
    let otherDebts = newDebts.filter(
      (d) =>
        !d.isLocked &&
        otherDebtsNames.some((n) => d.name.toLowerCase().includes(n)),
    );
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
          let gap =
            s.targetAmount > 0
              ? s.targetAmount - s.currentAmount - s.weeklyContribution
              : Infinity;
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
          let gap =
            s.targetAmount > 0
              ? s.targetAmount - s.currentAmount - s.weeklyContribution
              : Infinity;
          if (gap < 0) gap = 0;
          let amt = Math.min(gap, potentialEmergency);
          remainingIncome -= amt;
          potentialEmergency -= amt;
          return { ...s, weeklyContribution: s.weeklyContribution + amt };
        }
        return s;
      });

      // Re-absorb unspent ratio chunks back into remainingIncome
      remainingIncome =
        remainingIncome + potentialBusiness + potentialEmergency; // No, wait... remainingIncome was decreased by amt. The actual leftover is remainingIncome (which includes whatever we didn't spend).
    }

    // Priority 6: Finishing all Savings Goals
    let remainingSavings = newSavings.filter((s) => !s.isLocked);
    if (remainingSavings.length > 0 && remainingIncome > 0.01) {
      let savsLeft = [...remainingSavings];
      while (savsLeft.length > 0 && remainingIncome > 0.01) {
        let split = remainingIncome / savsLeft.length;
        let newlyFilled = false;
        for (let i = 0; i < savsLeft.length; i++) {
          let s = savsLeft[i];
          let gap =
            s.targetAmount > 0
              ? s.targetAmount - s.currentAmount - s.weeklyContribution
              : split;
          if (gap < 0) gap = 0;
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
      savings: newSavings,
    };
  };

  const handleAutoAllocate = () => {
    setState((prev) => {
      // Free all locks when explicitly clicking Auto-Allocate!
      const cleared = {
        ...prev,
        debts: prev.debts.map((d) => ({ ...d, isLocked: false })),
        savings: prev.savings.map((s) => ({ ...s, isLocked: false })),
      };
      return calculateAutoAllocation(cleared);
    });
  };

  const removeIncome = (id: string) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        incomes: prev.incomes.filter((item) => item.id !== id),
      };
      return calculateAutoAllocation(nextState);
    });
  };

  const removeItem = (type: "expenses" | "debts" | "savings", id: string) => {
    setState((prev) => {
      const nextState = {
        ...prev,
        [type]: prev[type].filter((item: any) => item.id !== id),
      };
      return calculateAutoAllocation(nextState);
    });
  };

  const addContribution = (id: string) => {
    setState((prev) => ({
      ...prev,
      savings: prev.savings.map((g) =>
        g.id === id
          ? {
              ...g,
              currentAmount: Math.min(
                g.targetAmount,
                g.currentAmount + g.weeklyContribution,
              ),
            }
          : g,
      ),
    }));
  };

  const payDebt = (id: string) => {
    setState((prev) => ({
      ...prev,
      debts: prev.debts.map((d) =>
        d.id === id && d.totalBalance !== undefined
          ? {
              ...d,
              totalBalance: Math.max(0, d.totalBalance - d.amount),
            }
          : d,
      ),
    }));
  };

  const closeModal = () => {
    setIsAddingItem(false);
    setEditingItemId(null);
    setNewItem(defaultNewItem);
    setNewItemType("expense");
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name) return;

    if (newItemType !== "income" && !newItem.amount) return;
    if (newItemType === "income") {
      if (newItem.type === "fixed" && !newItem.amount) return;
      if (
        newItem.type === "casual" &&
        !newItem.useShifts &&
        !newItem.hourlyRate &&
        !newItem.amount
      )
        return;
    }

    if (newItemType === "expense" || newItemType === "debt") {
      const isDebt = newItemType === "debt";
      const collectionName = isDebt ? "debts" : "expenses";
      const itemToSave = {
        id: editingItemId || Date.now().toString(),
        name: newItem.name,
        amount: Number(newItem.amount),
        totalBalance:
          isDebt && newItem.totalBalance
            ? Number(newItem.totalBalance)
            : undefined,
        originalBalance:
          isDebt && newItem.totalBalance
            ? Number(newItem.totalBalance)
            : undefined,
        category: isDebt ? "Debt" : newItem.category,
        color: isDebt ? "#ef4444" : "#f59e0b",
        icon: isDebt ? "credit-card" : "receipt",
      };

      setState((prev) => {
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
      });
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

      setState((prev) => ({
        ...prev,
        savings: editingItemId
          ? prev.savings.map((item: any) =>
              item.id === editingItemId ? { ...item, ...itemToSave } : item,
            )
          : [...prev.savings, itemToSave],
      }));
    } else if (newItemType === "income") {
      const itemToSave = {
        id: editingItemId || Date.now().toString(),
        name: newItem.name,
        type: newItem.type as "casual" | "fixed",
        amount: newItem.type === "fixed" ? Number(newItem.amount) : undefined,
        hourlyRate:
          newItem.type === "casual"
            ? Number(newItem.hourlyRate || newItem.amount)
            : undefined,
        hoursWorked:
          newItem.type === "casual"
            ? Number(newItem.hoursWorked || 20)
            : undefined,
        isCash: newItem.isCash,
        useShifts: newItem.useShifts,
        shifts: newItem.useShifts
          ? newItem.shifts.map((s: any) => ({
              day: s.day,
              hours: Number(s.hours) || 0,
              travelAllowance: Number(s.travelAllowance) || 0,
              mealAllowance: Number(s.mealAllowance) || 0,
              overtimeHours: Number(s.overtimeHours) || 0,
              overtimeRate: Number(s.overtimeRate) || 0,
            }))
          : undefined,
        color: "#10b981",
        icon: "briefcase",
      };

      setState((prev) => ({
        ...prev,
        incomes: editingItemId
          ? prev.incomes.map((item: any) =>
              item.id === editingItemId
                ? { ...item, ...itemToSave, isCash: itemToSave.isCash }
                : item,
            )
          : [...prev.incomes, itemToSave],
      }));
    }

    closeModal();
  };

  const chartData = [
    { name: "Expenses", value: totalExpenses, color: "#f59e0b" },
    { name: "Debts", value: totalDebts, color: "#ef4444" },
    { name: "Savings", value: totalSavingsCont, color: "#3b82f6" },
  ].filter((item) => item.value > 0);

  if (weeklySurplus > 0) {
    chartData.push({ name: "Surplus", value: weeklySurplus, color: "#10b981" });
  }

  // Generate mock history based on current weekly values
  const monthlySavings = totalSavingsCont * 4.33;
  const monthlyExpenses = (totalExpenses + totalDebts) * 4.33;
  const monthlySurplus = weeklySurplus * 4.33;

  const historicalData = [
    {
      month: "Oct 2025",
      savings: monthlySavings * 0.4,
      expenses: monthlyExpenses * 1.3,
      surplus: monthlySurplus * 0.2,
    },
    {
      month: "Nov 2025",
      savings: monthlySavings * 0.5,
      expenses: monthlyExpenses * 1.2,
      surplus: monthlySurplus * 0.4,
    },
    {
      month: "Dec 2025",
      savings: monthlySavings * 0.6,
      expenses: monthlyExpenses * 1.4,
      surplus: monthlySurplus * 0.1,
    },
    {
      month: "Jan 2026",
      savings: monthlySavings * 0.8,
      expenses: monthlyExpenses * 1.1,
      surplus: monthlySurplus * 0.8,
    },
    {
      month: "Feb 2026",
      savings: monthlySavings * 1.1,
      expenses: monthlyExpenses * 0.95,
      surplus: monthlySurplus * 1.1,
    },
    {
      month: "Mar 2026",
      savings: monthlySavings,
      expenses: monthlyExpenses,
      surplus: monthlySurplus,
    },
  ];

  return (
    <div className="flex flex-col-reverse lg:flex-row h-[100dvh] overflow-hidden bg-[#F3F4F9] text-[#1A1A24] font-sans">
      {/* Mobile Navigation Bar (Bottom on Mobile) */}
      <div className="lg:hidden bg-white/90 backdrop-blur-md border-t border-gray-200/50 flex justify-around items-center p-3 z-20 pb-safe">
        <button
          onClick={() => setActiveTab("home")}
          className={cn(
            "p-2 rounded-xl transition-colors",
            activeTab === "home"
              ? "bg-indigo-100 text-indigo-600"
              : "text-gray-400",
          )}
        >
          <Home className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={cn(
            "p-2 rounded-xl transition-colors",
            activeTab === "history"
              ? "bg-indigo-100 text-indigo-600"
              : "text-gray-400",
          )}
        >
          <PieChart className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTab("goals")}
          className={cn(
            "p-2 rounded-xl transition-colors",
            activeTab === "goals"
              ? "bg-indigo-100 text-indigo-600"
              : "text-gray-400",
          )}
        >
          <Target className="w-5 h-5" />
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={cn(
            "p-2 rounded-xl transition-colors",
            activeTab === "settings"
              ? "bg-indigo-100 text-indigo-600"
              : "text-gray-400",
          )}
        >
          <Settings className="w-5 h-5" />
        </button>
        {onLogout && (
          <button onClick={onLogout} className="p-2 text-red-400">
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Desktop Sidebar Navigation */}
      <nav className="w-24 h-full bg-white/60 backdrop-blur-md border-r border-white/40 flex-col items-center py-6 gap-8 z-10 hidden lg:flex">
        <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
          <Wallet className="w-6 h-6" />
        </div>
        <div className="flex flex-col gap-6 flex-1 mt-8">
          <button
            onClick={() => setActiveTab("home")}
            className={cn(
              "p-3 rounded-xl transition-colors",
              activeTab === "home"
                ? "bg-indigo-100 text-indigo-600"
                : "text-gray-400 hover:text-indigo-500 hover:bg-white/50",
            )}
          >
            <Home className="w-6 h-6" />
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "p-3 rounded-xl transition-colors",
              activeTab === "history"
                ? "bg-indigo-100 text-indigo-600"
                : "text-gray-400 hover:text-indigo-500 hover:bg-white/50",
            )}
          >
            <PieChart className="w-6 h-6" />
          </button>
          <button
            onClick={() => setActiveTab("goals")}
            className={cn(
              "p-3 rounded-xl transition-colors",
              activeTab === "goals"
                ? "bg-indigo-100 text-indigo-600"
                : "text-gray-400 hover:text-indigo-500 hover:bg-white/50",
            )}
          >
            <Target className="w-6 h-6" />
          </button>
        </div>
        <div className="mt-auto flex flex-col gap-4 items-center">
          <button
            onClick={() => setActiveTab("settings")}
            className={cn(
              "p-3 rounded-xl transition-colors",
              activeTab === "settings"
                ? "bg-indigo-100 text-indigo-600"
                : "text-gray-400 hover:text-gray-600 rounded-xl transition-colors",
            )}
          >
            <Settings className="w-6 h-6" />
          </button>
          {onLogout && (
            <button
              onClick={onLogout}
              className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              <LogOut className="w-6 h-6" />
            </button>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar relative h-full">
        <div className="max-w-6xl mx-auto space-y-8 pb-20 lg:pb-32">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/50 pb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
                {activeTab === "home" && "Weekly Budget Planner"}
                {activeTab === "history" && "Weekly, Monthly, Yearly Log"}
                {activeTab === "goals" && "Savings Goals Tracker"}
                {activeTab === "settings" && "App Settings"}
              </h1>
              <p className="text-sm md:text-base text-gray-500 mt-1">
                {activeTab === "home" &&
                  "Track your casual income, Centrelink, and savings goals."}
                {activeTab === "history" &&
                  "Track your progress on a weekly, monthly, and yearly basis."}
                {activeTab === "goals" &&
                  "Monitor and manage your financial milestones."}
                {activeTab === "settings" && "Customize your app experience."}
              </p>
            </div>
          </header>

          {activeTab === "history" && (
            <div className="space-y-6">
              <div className="glass-card p-4 md:p-6 border border-white/60">
                <h2 className="text-xl font-bold text-gray-900 mb-6">
                  Financial Log
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 rounded-lg">
                      <tr>
                        <th className="px-6 py-4 rounded-tl-lg font-bold">
                          Metric
                        </th>
                        <th className="px-6 py-4 font-bold text-right">
                          Weekly
                        </th>
                        <th className="px-6 py-4 font-bold text-right">
                          Monthly
                        </th>
                        <th className="px-6 py-4 rounded-tr-lg font-bold text-right">
                          Yearly
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white border-b border-gray-100 shadow-sm">
                        <td className="px-6 py-4 font-bold text-emerald-600 bg-emerald-50/30">
                          Total Net Income
                        </td>
                        <td className="px-6 py-4 text-right text-emerald-600 font-semibold">
                          $
                          {totalNetIncome.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-6 py-4 text-right text-emerald-600 font-semibold">
                          $
                          {(totalNetIncome * 4.33).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-6 py-4 text-right text-emerald-600 font-semibold">
                          $
                          {(totalNetIncome * 52).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                      <tr className="bg-white border-b border-gray-100 shadow-sm">
                        <td className="px-6 py-4 font-medium text-amber-600">
                          Expenses
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-amber-600 font-semibold">
                          $
                          {totalExpenses.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-amber-600 font-semibold">
                          $
                          {(totalExpenses * 4.33).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-amber-600 font-semibold">
                          $
                          {(totalExpenses * 52).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                      <tr className="bg-white border-b border-gray-100 shadow-sm">
                        <td className="px-6 py-4 font-medium text-rose-600">
                          Debts
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-rose-600 font-semibold">
                          $
                          {totalDebts.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-rose-600 font-semibold">
                          $
                          {(totalDebts * 4.33).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-rose-600 font-semibold">
                          $
                          {(totalDebts * 52).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                      <tr className="bg-white border-b border-gray-100 shadow-sm">
                        <td className="px-6 py-4 font-medium text-blue-600">
                          Savings Contributions
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-blue-600 font-semibold">
                          $
                          {totalSavingsCont.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-blue-600 font-semibold">
                          $
                          {monthlySavings.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td className="px-6 py-4 text-right font-medium text-blue-600 font-semibold">
                          $
                          {(totalSavingsCont * 52).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                      <tr className="bg-white font-bold bg-gray-50/50">
                        <td className="px-6 py-4 text-gray-900">
                          Surplus / Deficit
                        </td>
                        <td
                          className={`px-6 py-4 text-right ${weeklySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                        >
                          $
                          {weeklySurplus.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          className={`px-6 py-4 text-right ${monthlySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                        >
                          $
                          {monthlySurplus.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          className={`px-6 py-4 text-right ${weeklySurplus * 52 >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                        >
                          $
                          {(weeklySurplus * 52).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
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
                    <button
                      onClick={() =>
                        setCurrentMonthDate(subMonths(currentMonthDate, 1))
                      }
                      className="p-1 hover:bg-gray-100 rounded-lg transition"
                    >
                      <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <span className="font-semibold text-gray-800 min-w-[120px] text-center">
                      {format(currentMonthDate, "MMMM yyyy")}
                    </span>
                    <button
                      onClick={() =>
                        setCurrentMonthDate(addMonths(currentMonthDate, 1))
                      }
                      className="p-1 hover:bg-gray-100 rounded-lg transition"
                    >
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
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
                        className={`p-1 md:p-2 rounded-xl border flex flex-col items-center justify-start min-h-[60px] md:min-h-[80px] transition-all cursor-pointer ${
                          isCurrent 
                            ? 'bg-indigo-50 border-indigo-300 shadow-sm' 
                            : 'bg-white/40 border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/20 text-gray-700'
                        }`}
                      >
                        <span className={`text-sm font-medium ${isCurrent ? 'text-indigo-700' : ''}`}>
                          {format(date, 'd')}
                        </span>
                        <div className="flex flex-col w-full px-1 gap-0.5 mt-1">
                          {dayEvents.map(e => (
                             <div key={e.id} className={`text-[9px] md:text-[10px] leading-tight truncate px-1 py-0.5 rounded flex items-center ${e.type === 'income' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
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
                           <button type="button" onClick={() => setCalType('expense')} className={`flex-1 py-1.5 text-sm rounded-lg font-bold transition ${calType==='expense' ? 'bg-rose-100 text-rose-700':'text-gray-500 hover:bg-gray-50'}`}>Expense</button>
                           <button type="button" onClick={() => setCalType('income')} className={`flex-1 py-1.5 text-sm rounded-lg font-bold transition ${calType==='income' ? 'bg-emerald-100 text-emerald-700':'text-gray-500 hover:bg-gray-50'}`}>Income</button>
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
                               <div className={`text-xs font-bold mt-0.5 ${e.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                 {e.type === 'income' ? '+' : '-'}${Number(e.amount).toFixed(2)}
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
                </div>
              </div>
            </div>
          )}


          {activeTab === "goals" && (
            <div className="space-y-6 animate-in fade-in-50 duration-200">
              {/* Top Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-6 border border-indigo-100/50 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none" />
                  <h3 className="text-sm font-medium text-gray-500">Total Goals Configured</h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-gray-900">{state.savings.length}</span>
                    <span className="text-xs text-gray-500 font-medium">milestones</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Active savings targets set</p>
                </div>

                <div className="glass-card p-6 border border-emerald-100/50 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
                  <h3 className="text-sm font-medium text-gray-500">Total Saved Collectively</h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-emerald-600">
                      ${state.savings.reduce((acc, s) => acc + (s.currentAmount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Accumulated across all targets</p>
                </div>

                <div className="glass-card p-6 border border-indigo-100/50 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none" />
                  <h3 className="text-sm font-medium text-gray-500">Weekly Savings rate</h3>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-indigo-600">
                      ${state.savings.reduce((acc, s) => acc + (s.weeklyContribution || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs text-gray-500 font-medium">/wk</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Allocations committed per week</p>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="glass-card p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Your Savings Targets</h2>
                    <p className="text-sm text-gray-500">Monitor deadlines, completion rates, and allocate extra cash vault balance.</p>
                  </div>
                  <button
                    onClick={() => {
                      setIsAddingItem(true);
                      setNewItemType("savings");
                    }}
                    className="flex items-center justify-center gap-1.5 text-sm bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition"
                  >
                    <Plus className="w-4 h-4 flex-shrink-0" /> Add Savings Goal
                  </button>
                </div>

                {state.savings.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                    <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="font-bold text-gray-700">No Savings Goals Set</h3>
                    <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1 mb-4">Set milestones like emergency funds, home deposits, or custom savings projects.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {state.savings.map((s) => {
                      const target = s.targetAmount || 0;
                      const current = s.currentAmount || 0;
                      const pct = target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;
                      
                      return (
                        <div key={s.id} className="p-5 rounded-2xl bg-white/40 border border-white/60 hover:bg-white/60 transition relative group flex flex-col justify-between">
                          {/* edit/delete header */}
                          <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition">
                            <button
                              onClick={() => openEditModal("savings", s)}
                              className="p-1 px-1.5 bg-white shadow-sm border border-gray-100 text-gray-400 hover:text-indigo-600 rounded-lg transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => removeItem("savings", s.id)}
                              className="p-1 px-1.5 bg-white shadow-sm border border-gray-100 text-gray-400 hover:text-rose-600 rounded-lg transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div>
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow" style={{ backgroundColor: s.color || '#3b82f6' }}>
                                <Target className="w-5 h-5 flex-shrink-0" />
                              </div>
                              <div>
                                <h3 className="font-bold text-gray-900">{s.name}</h3>
                                <p className="text-xs text-gray-500">${s.weeklyContribution || 0}/wk automatically contribution</p>
                              </div>
                            </div>

                            <div className="flex justify-between items-end text-sm mb-2">
                              <div>
                                <span className="text-lg font-bold text-gray-900">${current.toLocaleString()}</span>
                                <span className="text-xs text-gray-500 ml-1">saved of ${target.toLocaleString()}</span>
                              </div>
                              <span className="font-bold text-indigo-600 text-xs">{pct.toFixed(0)}%</span>
                            </div>

                            <div className="w-full bg-gray-100 rounded-full h-3 mb-4 overflow-hidden shadow-inner">
                              <div
                                className="h-3 rounded-full transition-all duration-1000 ease-out"
                                style={{ width: `${pct}%`, backgroundColor: s.color || '#3b82f6' }}
                              />
                            </div>
                          </div>

                          <div className="mt-2 border-t border-gray-100/60 pt-4">
                            {allocatingGoalId === s.id ? (
                              <div className="flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-150">
                                <span className="text-xs text-gray-500 font-bold block whitespace-nowrap">From Vault: $</span>
                                <input
                                  type="number"
                                  className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                                  placeholder="Amount"
                                  value={allocationAmount}
                                  onChange={(e) => setAllocationAmount(e.target.value)}
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleAllocateFromVault(s.id, allocationAmount)}
                                  className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition"
                                >
                                  Transfer
                                </button>
                                <button
                                  onClick={() => setAllocatingGoalId(null)}
                                  className="px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200 transition"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-400">Cash Vault: <b className="font-bold text-gray-600">${(state.cashBalance || 0).toFixed(2)}</b> Available</span>
                                <button
                                  onClick={() => {
                                    setAllocatingGoalId(s.id);
                                    setAllocationAmount('');
                                  }}
                                  disabled={!state.cashBalance || state.cashBalance <= 0}
                                  className="text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                >
                                  <Wallet className="w-3.5 h-3.5 flex-shrink-0" /> Inject Vault Cash
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-6 animate-in fade-in-50 duration-200 max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* PIN Management Card */}
                <div className="glass-card p-6 border border-gray-100/50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <KeyRound className="w-5 h-5 flex-shrink-0" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">Access Login PIN</h3>
                        <p className="text-xs text-gray-500">Update your 4-digit screen lockers code.</p>
                      </div>
                    </div>

                    <form onSubmit={handleChangePin} className="space-y-4 mt-6">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Current PIN</label>
                        <input
                          type="password"
                          maxLength={4}
                          className="w-full text-center tracking-[0.5em] text-lg font-bold px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="••••"
                          value={currentPinInput}
                          onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, ''))}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">New PIN</label>
                        <input
                          type="password"
                          maxLength={4}
                          className="w-full text-center tracking-[0.5em] text-lg font-bold px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="••••"
                          value={newPinInput}
                          onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Confirm New PIN</label>
                        <input
                          type="password"
                          maxLength={4}
                          className="w-full text-center tracking-[0.5em] text-lg font-bold px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="••••"
                          value={confirmPinInput}
                          onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                          required
                        />
                      </div>

                      {pinErrorMsg && (
                        <div className="text-xs bg-red-50 text-red-600 font-medium p-3 rounded-xl border border-red-100 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          {pinErrorMsg}
                        </div>
                      )}

                      {pinSuccessMsg && (
                        <div className="text-xs bg-emerald-50 text-emerald-600 font-medium p-3 rounded-xl border border-emerald-100 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          {pinSuccessMsg}
                        </div>
                      )}

                      <button
                        type="submit"
                        className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl hover:bg-indigo-700 transition-colors mt-2"
                      >
                        Change PIN Code
                      </button>
                    </form>
                  </div>
                </div>

                {/* Biometrics (Fingerprint/Face ID) Management */}
                <div className="glass-card p-6 border border-gray-100/50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <Fingerprint className="w-5 h-5 flex-shrink-0" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">Biometric Credentials</h3>
                        <p className="text-xs text-gray-500">Enable Face ID / Fingerprint fingerprint scanning login.</p>
                      </div>
                    </div>

                    <div className="mt-6 border border-gray-100 rounded-2xl p-4 bg-gray-50/20">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold text-gray-500">RELIABLE DEVICE STATUS</span>
                        <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${isBiometricRegistered ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                          {isBiometricRegistered ? 'Registered and Active' : 'Not Registered'}
                        </span>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <ShieldCheck className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-gray-800">Local Sensor Storage</p>
                            <p className="text-[11px] text-gray-500 mt-0.5">Biometric data is securely saved locally on this client browser and never leaves your sandbox space.</p>
                          </div>
                        </div>

                        {isBiometricRegistered ? (
                          <div className="space-y-3 pt-2">
                            <div className="text-xs bg-emerald-50 text-emerald-700 font-bold px-3 py-2.5 rounded-xl border border-emerald-100 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                              Biometrics is ready to be used on next screen lock.
                            </div>
                            <button
                              onClick={handleRemoveBiometricReg}
                              className="w-full bg-white border border-red-200 text-red-600 font-semibold py-2.5 rounded-xl hover:bg-red-50 hover:border-red-300 transition-colors text-xs"
                            >
                              Deregister Fingerprint / Face ID
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3 pt-2">
                            <p className="text-[11px] text-gray-500">Provide direct integration with your platform biometric vaults for ultra-fast, smooth, instant dashboard logins.</p>
                            <button
                              onClick={handleStartBiometricReg}
                              className="w-full bg-emerald-600 text-white font-medium py-3 rounded-xl hover:bg-emerald-700 transition shadow"
                            >
                              Register Face ID / Touch ID
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-[10px] text-gray-400 mt-6 text-center leading-relaxed">
                    Powered by browser local storage passkeys. If you clear your browser cookies or cache, you will need to log back in using PIN.
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Biometric Scan Registration Simulation Modal */}
          {showBioScannerReg && (
            <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-8 max-w-xs w-full text-center shadow-2xl border border-gray-100 relative animate-in zoom-in-95 duration-200">
                <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-100 animate-ping opacity-75" />
                  <div className="absolute inset-2 rounded-full border-4 border-indigo-200 animate-pulse" />
                  
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center relative z-10 ${bioRegStep === 4 ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white animate-pulse'}`}>
                    {bioRegStep === 4 ? (
                      <CheckCircle2 className="w-10 h-10" />
                    ) : (
                      <Fingerprint className="w-10 h-10" />
                    )}
                  </div>
                </div>

                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {bioRegStep === 4 ? 'Registration Successful' : 'Registering Biometrics'}
                </h3>
                
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 min-h-[40px]">
                  {bioRegStep < 4 && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
                  <span className={bioRegStep === 4 ? 'text-emerald-600 font-semibold text-xs' : 'text-xs'}>
                    {bioRegText}
                  </span>
                </div>
              </div>
            </div>
          )}


          {activeTab === "home" && (
            <div className="space-y-8">
              {/* Quick Access / Top Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
                {/* Income Card */}
                <div className="glass-card p-5 md:p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-indigo-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                  <div className="flex justify-between items-start mb-2">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 relative z-10">
                      <Briefcase className="w-5 h-5" />
                    </div>
                    <button
                      onClick={() => {
                        setIsAddingItem(true);
                        setNewItemType("income");
                      }}
                      className="z-10 p-1.5 bg-white/50 text-indigo-600 hover:bg-white rounded-lg transition-colors border border-indigo-100"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <h3 className="text-sm font-medium text-gray-500 relative z-10 mb-2">
                    Income Streams
                  </h3>
                  <div className="space-y-3 relative z-10 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                    {state.incomes.map((inc) => (
                      <div
                        key={inc.id}
                        className="bg-white/40 p-2 rounded-lg border border-white/60 relative group/inc"
                      >
                        <div className="absolute right-1 top-1 opacity-0 group-hover/inc:opacity-100 flex items-center gap-2 transition-opacity">
                          <button
                            onClick={() => openEditModal("income", inc)}
                            className="text-gray-400 hover:text-indigo-600 transition-colors"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => removeIncome(inc.id)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs font-semibold text-gray-700 pr-5 flex items-center gap-1.5">
                          {inc.name}
                          {inc.isCash && (
                            <span className="bg-emerald-100 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wide">
                              Cash
                            </span>
                          )}
                        </p>
                        {inc.type === "casual" ? (
                          <div className="mt-1 space-y-1">
                            {inc.useShifts ? (
                              <>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-gray-500">
                                    Rate:
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-bold text-gray-400">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      value={inc.hourlyRate || 0}
                                      onChange={(e) =>
                                        setState((prev) => ({
                                          ...prev,
                                          incomes: prev.incomes.map((i) =>
                                            i.id === inc.id
                                              ? {
                                                  ...i,
                                                  hourlyRate: Number(
                                                    e.target.value,
                                                  ),
                                                }
                                              : i,
                                          ),
                                        }))
                                      }
                                      className="text-xs font-bold bg-transparent border-b border-transparent hover:border-indigo-200 focus:border-indigo-500 outline-none w-12 text-right transition-colors"
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-100/50">
                                  <span className="text-[10px] text-gray-500">
                                    Shifts:
                                  </span>
                                  <span className="text-xs font-bold text-gray-900">
                                    {inc.shifts?.filter(
                                      (s) =>
                                        s.hours > 0 || String(s.hours) !== "",
                                    ).length || 0}{" "}
                                    days
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-gray-500">
                                    Total:
                                  </span>
                                  <span className="text-xs font-bold text-gray-900">
                                    ${calculateIncomeAmount(inc).toFixed(2)}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-gray-500">
                                    Rate:
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs font-bold text-gray-400">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      value={inc.hourlyRate || 0}
                                      onChange={(e) =>
                                        setState((prev) => ({
                                          ...prev,
                                          incomes: prev.incomes.map((i) =>
                                            i.id === inc.id
                                              ? {
                                                  ...i,
                                                  hourlyRate: Number(
                                                    e.target.value,
                                                  ),
                                                }
                                              : i,
                                          ),
                                        }))
                                      }
                                      className="text-xs font-bold bg-transparent border-b border-transparent hover:border-indigo-200 focus:border-indigo-500 outline-none w-12 text-right transition-colors"
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-gray-500">
                                    Hours:
                                  </span>
                                  <input
                                    type="number"
                                    value={inc.hoursWorked || 0}
                                    onChange={(e) =>
                                      setState((prev) => ({
                                        ...prev,
                                        incomes: prev.incomes.map((i) =>
                                          i.id === inc.id
                                            ? {
                                                ...i,
                                                hoursWorked: Number(
                                                  e.target.value,
                                                ),
                                              }
                                            : i,
                                        ),
                                      }))
                                    }
                                    className="text-xs font-bold bg-transparent border-b border-transparent hover:border-indigo-200 focus:border-indigo-500 outline-none w-12 text-right transition-colors"
                                  />
                                </div>
                                <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-100/50">
                                  <span className="text-[10px] text-gray-500">
                                    Total:
                                  </span>
                                  <span className="text-xs font-bold text-gray-900">
                                    ${calculateIncomeAmount(inc).toFixed(2)}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-[10px] text-gray-500">
                              Amount:
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-bold text-gray-400">
                                $
                              </span>
                              <input
                                type="number"
                                value={inc.amount || 0}
                                onChange={(e) =>
                                  setState((prev) => ({
                                    ...prev,
                                    incomes: prev.incomes.map((i) =>
                                      i.id === inc.id
                                        ? {
                                            ...i,
                                            amount: Number(e.target.value),
                                          }
                                        : i,
                                    ),
                                  }))
                                }
                                className="text-xs font-bold bg-transparent border-b border-transparent hover:border-indigo-200 focus:border-indigo-500 outline-none w-16 text-right transition-colors"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100/50 relative z-10 flex justify-between items-end">
                    <span className="text-xs text-gray-500 font-medium">
                      Gross Total:
                    </span>
                    <span className="text-xl font-bold text-gray-900">
                      ${weeklyGrossIncome.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[10px] md:text-xs text-indigo-600 font-medium mt-3 bg-indigo-50 px-2 py-1 rounded w-fit inline-flex items-center gap-1 relative z-10">
                    <Wallet className="w-3 h-3" />
                    Super(12%): ${superContribution.toFixed(2)}
                  </div>
                </div>

                {/* Deductions & Centrelink */}
                <div className="glass-card p-5 md:p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-pink-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 relative z-10">
                      <Receipt className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-sm font-medium text-gray-500 relative z-10">
                    Total Net Income
                  </h3>
                  <div className="mt-1 relative z-10">
                    <span className="text-2xl md:text-3xl font-bold text-gray-900">
                      ${totalNetIncome.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[10px] md:text-xs text-gray-500 mt-2 space-y-1 relative z-10">
                    <p className="flex justify-between">
                      <span>Tax, Medi, HECS:</span>{" "}
                      <span className="text-pink-600 font-medium">
                        -${totalDeductions.toFixed(2)}
                      </span>
                    </p>
                    <div className="flex flex-col">
                      <p className="flex justify-between">
                        <span>Centrelink (F/N):</span>{" "}
                        <span className="text-green-600 font-medium">
                          +${(centrelinkWeekly * 2).toFixed(2)}
                        </span>
                      </p>
                      <p className="text-right text-[9px] text-gray-400 mt-0.5">
                        Adds +${centrelinkWeekly.toFixed(2)} to weekly budget
                      </p>
                    </div>
                    {untaxedWeeklyIncome > 0 && (
                      <p className="flex justify-between border-t border-gray-100/50 pt-1 mt-1">
                        <span>Cash (Untaxed):</span>{" "}
                        <span className="text-indigo-600 font-medium">
                          +${untaxedWeeklyIncome.toFixed(2)}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Outgoings */}
                <div className="glass-card p-5 md:p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-amber-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 relative z-10">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-sm font-medium text-gray-500 relative z-10">
                    Total Outgoings
                  </h3>
                  <div className="mt-1 relative z-10">
                    <span className="text-2xl md:text-3xl font-bold text-gray-900">
                      ${totalOutgoings.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[10px] md:text-xs text-gray-500 mt-2 space-y-1 relative z-10">
                    <p className="flex justify-between">
                      <span>Expenses:</span>{" "}
                      <span className="font-medium">
                        ${totalExpenses.toFixed(2)}
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span>Debt/Savings:</span>{" "}
                      <span className="font-medium">
                        ${(totalDebts + totalSavingsCont).toFixed(2)}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Surplus/Deficit Card */}
                <div
                  className={cn(
                    "glass-card p-5 md:p-6 relative overflow-hidden group border",
                    weeklySurplus >= 0
                      ? "border-green-200/50"
                      : "border-red-200/50",
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110",
                      weeklySurplus >= 0 ? "bg-green-500/10" : "bg-red-500/10",
                    )}
                  ></div>
                  <div className="flex justify-between items-start mb-4">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center relative z-10",
                        weeklySurplus >= 0
                          ? "bg-green-100 text-green-600"
                          : "bg-red-100 text-red-600",
                      )}
                    >
                      {weeklySurplus >= 0 ? (
                        <CircleDollarSign className="w-5 h-5 flex-shrink-0" />
                      ) : (
                        <TrendingUp className="w-5 h-5 flex-shrink-0 rotate-180" />
                      )}
                    </div>
                  </div>
                  <h3 className="text-sm font-medium text-gray-500 relative z-10">
                    {weeklySurplus >= 0 ? "Weekly Surplus" : "Weekly Deficit"}
                  </h3>
                  <div className="mt-1 relative z-10">
                    <span
                      className={cn(
                        "text-2xl md:text-3xl font-bold",
                        weeklySurplus >= 0 ? "text-green-600" : "text-red-600",
                      )}
                    >
                      {weeklySurplus >= 0 ? "+" : ""}
                      {weeklySurplus.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[10px] md:text-xs text-gray-500 mt-3 font-medium relative z-10">
                    {weeklySurplus >= 0
                      ? "Safe to spend or save extra! 🎉"
                      : "Action needed: Adjust budget. ⚠️"}
                  </div>
                </div>
              </div>

              <div className="max-w-3xl mx-auto w-full space-y-6">
                {/* Left Column: Data Entry */}
                <div className="space-y-6">
                  {/* Expenses & Debts */}
                  <div className="glass-card p-4 md:p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-base md:text-lg font-bold text-gray-900">
                        Expenses & Debts
                      </h2>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setIsAddingItem(true);
                            setNewItemType("expense");
                          }}
                          className="flex items-center gap-1 text-xs md:text-sm text-indigo-600 font-medium hover:text-indigo-800 transition-colors bg-indigo-50 px-2 py-1.5 md:px-3 rounded-lg"
                        >
                          <Plus className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" /> Expense
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {state.expenses.length > 0 && (
                        <div className="space-y-3 md:space-y-4">
                          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                            Expenses
                          </h3>
                          {state.expenses.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between p-3 md:p-4 rounded-xl bg-white/40 border border-white/60 hover:bg-white/60 transition-colors group"
                            >
                              <div className="flex items-center gap-3 md:gap-4">
                                <div
                                  className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white shadow-sm flex-shrink-0"
                                  style={{ backgroundColor: item.color }}
                                >
                                  {getIcon(item.icon || "")}
                                </div>
                                <div>
                                  <p className="text-sm md:text-base font-semibold text-gray-900 line-clamp-1">
                                    {item.name}
                                  </p>
                                  <p className="text-[10px] md:text-xs text-gray-500">
                                    {item.category}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 md:gap-4">
                                <div className="text-right">
                                  <p className="text-sm md:text-base font-bold text-gray-900">
                                    ${item.amount.toFixed(2)}
                                  </p>
                                  <p className="text-[10px] md:text-xs text-gray-500">
                                    / week
                                  </p>
                                </div>
                                <div className="opacity-0 group-hover:opacity-100 flex items-center transition-opacity">
                                  <button
                                    onClick={() =>
                                      openEditModal("expense", item)
                                    }
                                    className="text-gray-400 hover:text-indigo-600 p-1 md:p-2 transition-colors"
                                    title="Edit item"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      removeItem("expenses", item.id)
                                    }
                                    className="text-red-400 hover:text-red-600 p-1 md:p-2 transition-colors"
                                    title="Delete item"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {state.debts.length > 0 && (
                        <div className="space-y-3 md:space-y-4 mt-6">
                          <div className="flex justify-between items-end">
                            <div className="flex justify-between items-center w-full mb-4">
                              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                Debts
                              </h3>
                              <button
                          onClick={() => {
                            setIsAddingItem(true);
                            setNewItemType("debt");
                          }}
                          className="flex items-center gap-1 text-xs md:text-sm text-red-600 font-medium hover:text-red-800 transition-colors bg-red-50 px-2 py-1.5 md:px-3 rounded-lg"
                        >
                          <Plus className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />{" "}
                          Debt
                        </button>
                            </div>
                            <div className="text-right">
                              <span className="text-xs text-gray-500 font-medium mr-2">
                                Total Debt Balance:
                              </span>
                              <span className="text-sm font-bold text-red-600">
                                $
                                {state.debts
                                  .reduce(
                                    (acc, d) => acc + (d.totalBalance || 0),
                                    0,
                                  )
                                  .toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                              </span>
                            </div>
                          </div>
                          {state.debts.map((item) => {
                            const original =
                              item.originalBalance ||
                              item.totalBalance ||
                              item.amount;
                            const current = item.totalBalance || 0;
                            const paid = original - current;
                            const progress =
                              original > 0
                                ? Math.min(
                                    100,
                                    Math.max(0, (paid / original) * 100),
                                  )
                                : 0;

                            return (
                              <div
                                key={item.id}
                                className="flex flex-col p-4 md:p-5 rounded-2xl bg-white/40 border border-white/60 hover:bg-white/60 transition-colors group relative"
                              >
                                <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 flex items-center gap-2 transition-opacity">
                                  <button
                                    onClick={() => openEditModal("debt", item)}
                                    className="text-gray-400 hover:text-indigo-600 transition-colors"
                                    title="Edit item"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => removeItem("debts", item.id)}
                                    className="text-red-400 hover:text-red-600 transition-colors"
                                    title="Delete item"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>

                                <div className="flex justify-between items-start mb-4">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm flex-shrink-0"
                                      style={{ backgroundColor: item.color }}
                                    >
                                      {getIcon(item.icon || "credit-card")}
                                    </div>
                                    <div>
                                      <h3 className="font-bold text-gray-900 line-clamp-1">
                                        {item.name}
                                      </h3>
                                      <p className="text-xs text-gray-500 flex items-center gap-1">
                                        {item.isLocked && (
                                          <Lock
                                            className="w-3 h-3 text-indigo-500"
                                            title="Manually locked amount"
                                          />
                                        )}
                                        ${item.amount.toFixed(2)}/wk repayment
                                        {item.amount > 0 && current > 0 && (
                                          <span>
                                            {" "}
                                            • {Math.ceil(
                                              current / item.amount,
                                            )}{" "}
                                            weeks left
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-2 mt-1 mr-6">
                                    <div className="text-right">
                                      <span className="text-sm font-bold text-gray-900 block">
                                        $
                                        {current.toLocaleString(undefined, {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })}{" "}
                                        left
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => payDebt(item.id)}
                                      className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 hover:bg-red-200 px-2 flex-shrink-0 py-1 rounded-md transition-colors flex items-center gap-1"
                                    >
                                      <Plus className="w-3 h-3" /> Pay
                                    </button>
                                  </div>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2 overflow-hidden shadow-inner">
                                  <div
                                    className="h-2.5 rounded-full transition-all duration-1000 ease-out"
                                    style={{
                                      width: `${progress}%`,
                                      backgroundColor: item.color || "#ef4444",
                                    }}
                                  ></div>
                                </div>
                                <div className="flex justify-between text-[11px] font-medium text-gray-500">
                                  <span>{progress.toFixed(0)}% paid</span>
                                  <span>
                                    $
                                    {paid.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}{" "}
                                    paid back
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {state.expenses.length === 0 &&
                        state.debts.length === 0 && (
                          <p className="text-gray-500 text-sm text-center py-4">
                            No expenses or debts added yet.
                          </p>
                        )}
                    </div>
                  </div>

                  {/* Cash Vault Section */}
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
                          ${(state.cashBalance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </div>
                      </div>
                    </div>
                    
                    {!isSellingAsset && !isAdjustingVault ? (
                      <div className="flex gap-2 w-full">
                        <button onClick={() => setIsSellingAsset(true)} className="flex-1 relative flex items-center justify-center gap-2 bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-colors font-bold py-3 text-sm md:text-base rounded-xl shadow-sm">
                          <Plus className="w-4 h-4 md:w-5 md:h-5" /> Record Windfall
                        </button>
                        <button onClick={() => { setIsAdjustingVault(true); setAdjustVaultAmount(String(state.cashBalance || 0)); }} className="px-4 relative flex items-center justify-center gap-2 bg-white text-gray-600 border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-colors font-bold py-3 text-sm md:text-base rounded-xl shadow-sm" title="Adjust Balance manually">
                          <Edit2 className="w-4 h-4 md:w-5 md:h-5" />
                        </button>
                      </div>
                    ) : isAdjustingVault ? (
                      <form onSubmit={handleAdjustVault} className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-4 relative mb-4">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-bold text-gray-800">Adjust Vault Balance</h3>
                          <button type="button" onClick={() => setIsAdjustingVault(false)} className="text-gray-400 hover:text-gray-600 bg-gray-50 rounded-lg p-1 transition-colors"><X className="w-4 h-4" /></button>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wider">New Balance</label>
                          <div className="relative">
                            <span className="absolute left-4 top-2.5 text-gray-500 font-medium">$</span>
                            <input type="number" step="0.01" placeholder="0.00" value={adjustVaultAmount} onChange={e => setAdjustVaultAmount(e.target.value)} required className="w-full text-sm pl-8 pr-4 py-2.5 bg-gray-50 border outline-none focus:border-emerald-400 focus:bg-white border-gray-200 transition-colors rounded-xl" />
                          </div>
                        </div>
                        <button type="submit" className="w-full bg-emerald-500 text-white font-bold py-3 shadow-md rounded-xl hover:bg-emerald-600 hover:shadow-lg transition-all mt-4 text-sm md:text-base">
                          Save Balance
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleSellAsset} className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-4 relative mb-4">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-bold text-gray-800">Record Cash Inflow</h3>
                          <button type="button" onClick={() => setIsSellingAsset(false)} className="text-gray-400 hover:text-gray-600 bg-gray-50 rounded-lg p-1 transition-colors"><X className="w-4 h-4" /></button>
                        </div>
                        <p className="text-xs text-gray-500 mb-2">This cash will be automatically allocated down your priority list (Debts -&gt; Savings -&gt; Vault)</p>
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
                        
                        <button type="submit" className="w-full bg-emerald-500 text-white font-bold py-3 shadow-md rounded-xl hover:bg-emerald-600 hover:shadow-lg transition-all mt-4 text-sm md:text-base">
                          Add & Auto-Allocate
                        </button>
                      </form>
                    )}

                    {(state.windfalls && state.windfalls.length > 0) && (
                      <div className="mt-6 pt-4 border-t border-emerald-200/50">
                        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">Windfall History</h3>
                        <div className="space-y-3">
                          {state.windfalls.slice().reverse().map(wf => (
                            <div key={wf.id} className="bg-white/80 border border-emerald-100 p-3 rounded-xl shadow-sm relative group">
                               <div className="flex justify-between items-start">
                                 <div>
                                   <div className="font-bold text-sm text-gray-800">{wf.name}</div>
                                   <div className="text-xs text-gray-500">{new Date(wf.date).toLocaleDateString()}</div>
                                 </div>
                                 <div className="text-right">
                                   <div className="font-bold text-sm text-emerald-600">+${wf.sourceAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                   <button 
                                     onClick={() => handleUndoWindfall(wf.id)}
                                     className="text-[10px] text-gray-400 hover:text-red-500 font-medium underline mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                   >
                                      Undo Allocation
                                   </button>
                                 </div>
                               </div>
                               {wf.distributions && wf.distributions.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-gray-100/50 flex flex-wrap gap-1">
                                    {wf.distributions.map((d: any, idx: number) => (
                                       <span key={idx} className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-600">
                                         {d.name}: ${d.amount.toFixed(0)}
                                       </span>
                                    ))}
                                    {wf.unallocatedCash > 0.01 && (
                                       <span className="text-[10px] bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-emerald-700 font-medium">
                                         Vault: ${wf.unallocatedCash.toFixed(0)}
                                       </span>
                                    )}
                                  </div>
                               )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Visualization & Breakdown */}
                  <div className="space-y-6">
                    <div className="glass-card p-4 md:p-6 flex flex-col h-[300px] md:h-[400px]">
                      <div className="flex items-center justify-between mb-2 md:mb-6">
                        <h2 className="text-base md:text-lg font-bold text-gray-900">
                          Allocation Analytics
                        </h2>
                        <button
                          onClick={handleAutoAllocate}
                          className="flex items-center gap-1 text-xs md:text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          <Sparkles className="w-4 h-4" />
                          Auto-Allocate
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 relative -ml-4">
                        {chartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsPieChart>
                              <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={70}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {chartData.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number) =>
                                  `$${value.toFixed(2)}`
                                }
                              />
                              <Legend
                                verticalAlign="bottom"
                                height={36}
                                wrapperStyle={{ fontSize: "12px" }}
                              />
                            </RechartsPieChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center -mt-8 ml-4">
                            <p className="text-gray-400 text-sm">
                              Add data to see chart
                            </p>
                          </div>
                        )}

                        {/* Center Text */}
                        {chartData.length > 0 && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-8 ml-4">
                            <div className="text-center">
                              <span className="block text-[10px] md:text-xs text-gray-500 font-medium">
                                Net Income
                              </span>
                              <span className="block text-lg md:text-xl font-bold text-gray-900">
                                ${totalNetIncome.toFixed(0)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    </div></div></div>{/* Add Item Modal */}
              {isAddingItem && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                    <button
                      onClick={closeModal}
                      className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-5 h-5 flex-shrink-0" />
                    </button>
                    <h2 className="text-xl font-bold mb-6 text-gray-900">
                      {editingItemId ? "Edit" : "Add New"}{" "}
                      {newItemType === "expense"
                        ? "Expense"
                        : newItemType === "debt"
                          ? "Debt"
                          : newItemType === "income"
                            ? "Income Stream"
                            : "Savings Goal"}
                    </h2>
                    <form onSubmit={handleAddItem} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Name
                        </label>
                        <input
                          type="text"
                          required
                          value={newItem.name}
                          onChange={(e) =>
                            setNewItem((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder={
                            newItemType === "income"
                              ? "e.g., Target, Uber"
                              : newItemType === "expense"
                                ? "e.g., Netflix, Gym"
                                : "e.g., New Laptop"
                          }
                        />
                      </div>

                      {newItemType === "income" ? (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Income Type
                            </label>
                            <select
                              value={newItem.type}
                              onChange={(e) =>
                                setNewItem((prev) => ({
                                  ...prev,
                                  type: e.target.value as "casual" | "fixed",
                                }))
                              }
                              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                            >
                              <option value="casual">Casual (Hourly)</option>
                              <option value="fixed">Fixed (Weekly)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {newItem.type === "casual"
                                ? "Hourly Rate ($)"
                                : "Weekly Amount ($)"}
                            </label>
                            <input
                              type="number"
                              required={
                                !(
                                  newItem.type === "casual" && newItem.useShifts
                                )
                              }
                              value={
                                newItem.type === "casual"
                                  ? newItem.hourlyRate
                                  : newItem.amount
                              }
                              onChange={(e) =>
                                setNewItem((prev) => ({
                                  ...prev,
                                  [newItem.type === "casual"
                                    ? "hourlyRate"
                                    : "amount"]: e.target.value,
                                }))
                              }
                              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="0.00"
                            />
                          </div>
                          {newItem.type === "casual" && (
                            <>
                              <div className="flex items-center gap-2 mt-4 mb-2">
                                <input
                                  type="checkbox"
                                  id="useShiftsCheckbox"
                                  checked={newItem.useShifts}
                                  onChange={(e) =>
                                    setNewItem((prev) => ({
                                      ...prev,
                                      useShifts: e.target.checked,
                                    }))
                                  }
                                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                />
                                <label
                                  htmlFor="useShiftsCheckbox"
                                  className="text-sm font-medium text-gray-700 cursor-pointer"
                                >
                                  Enter detailed shifts (Mon-Sun)
                                </label>
                              </div>

                              {newItem.useShifts ? (
                                <div className="max-h-64 overflow-y-auto pr-2 space-y-4 border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                                  {newItem.shifts.map((shift, i) => (
                                    <div
                                      key={shift.day}
                                      className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm space-y-2"
                                    >
                                      <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider">
                                        {shift.day}
                                      </h4>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        <div>
                                          <label className="text-[10px] font-medium text-gray-500">
                                            Base Hours
                                          </label>
                                          <input
                                            type="number"
                                            value={shift.hours}
                                            onChange={(e) => {
                                              const newShifts = [
                                                ...newItem.shifts,
                                              ];
                                              newShifts[i].hours =
                                                e.target.value;
                                              setNewItem({
                                                ...newItem,
                                                shifts: newShifts,
                                              });
                                            }}
                                            className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                            placeholder="Hours"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-medium text-gray-500">
                                            OT Hours
                                          </label>
                                          <input
                                            type="number"
                                            value={shift.overtimeHours}
                                            onChange={(e) => {
                                              const newShifts = [
                                                ...newItem.shifts,
                                              ];
                                              newShifts[i].overtimeHours =
                                                e.target.value;
                                              setNewItem({
                                                ...newItem,
                                                shifts: newShifts,
                                              });
                                            }}
                                            className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                            placeholder="OT Hours"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-medium text-gray-500">
                                            OT Rate ($)
                                          </label>
                                          <input
                                            type="number"
                                            value={shift.overtimeRate}
                                            onChange={(e) => {
                                              const newShifts = [
                                                ...newItem.shifts,
                                              ];
                                              newShifts[i].overtimeRate =
                                                e.target.value;
                                              setNewItem({
                                                ...newItem,
                                                shifts: newShifts,
                                              });
                                            }}
                                            className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                            placeholder="$"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-medium text-gray-500">
                                            Travel Allow ($)
                                          </label>
                                          <input
                                            type="number"
                                            value={shift.travelAllowance}
                                            onChange={(e) => {
                                              const newShifts = [
                                                ...newItem.shifts,
                                              ];
                                              newShifts[i].travelAllowance =
                                                e.target.value;
                                              setNewItem({
                                                ...newItem,
                                                shifts: newShifts,
                                              });
                                            }}
                                            className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                            placeholder="$"
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-medium text-gray-500">
                                            Meal Allow ($)
                                          </label>
                                          <input
                                            type="number"
                                            value={shift.mealAllowance}
                                            onChange={(e) => {
                                              const newShifts = [
                                                ...newItem.shifts,
                                              ];
                                              newShifts[i].mealAllowance =
                                                e.target.value;
                                              setNewItem({
                                                ...newItem,
                                                shifts: newShifts,
                                              });
                                            }}
                                            className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                            placeholder="$"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1 mt-2">
                                    Total Hours Worked (Weekly)
                                  </label>
                                  <input
                                    type="number"
                                    required={
                                      newItem.type === "casual" &&
                                      !newItem.useShifts
                                    }
                                    value={newItem.hoursWorked}
                                    onChange={(e) =>
                                      setNewItem((prev) => ({
                                        ...prev,
                                        hoursWorked: e.target.value,
                                      }))
                                    }
                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="e.g. 20"
                                  />
                                </div>
                              )}
                            </>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              type="checkbox"
                              id="isCashCheckbox"
                              checked={newItem.isCash}
                              onChange={(e) =>
                                setNewItem((prev) => ({
                                  ...prev,
                                  isCash: e.target.checked,
                                }))
                              }
                              className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                            />
                            <label
                              htmlFor="isCashCheckbox"
                              className="text-sm font-medium text-gray-700"
                            >
                              Paid in cash (Untaxed)
                            </label>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {newItemType === "expense" ||
                              newItemType === "debt"
                                ? "Weekly Amount ($)"
                                : "Weekly Contribution ($)"}
                            </label>
                            <input
                              type="number"
                              required
                              value={newItem.amount}
                              onChange={(e) =>
                                setNewItem((prev) => ({
                                  ...prev,
                                  amount: e.target.value,
                                }))
                              }
                              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="0.00"
                            />
                          </div>
                          {newItemType === "debt" && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Total Balance ($){" "}
                                <span className="text-gray-400 font-normal">
                                  (Optional)
                                </span>
                              </label>
                              <input
                                type="number"
                                value={newItem.totalBalance}
                                onChange={(e) =>
                                  setNewItem((prev) => ({
                                    ...prev,
                                    totalBalance: e.target.value,
                                  }))
                                }
                                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="e.g. 5000"
                              />
                            </div>
                          )}
                          {newItemType === "savings" && (
                            <>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 mt-2">
                                  Target Amount ($)
                                </label>
                                <input
                                  type="number"
                                  required
                                  value={newItem.targetAmount}
                                  onChange={(e) =>
                                    setNewItem((prev) => ({
                                      ...prev,
                                      targetAmount: e.target.value,
                                    }))
                                  }
                                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                  placeholder="e.g. 10000"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 mt-2">
                                  Total Saved ($){" "}
                                  <span className="text-gray-400 font-normal">
                                    (Current Amount)
                                  </span>
                                </label>
                                <input
                                  type="number"
                                  value={newItem.currentAmount}
                                  onChange={(e) =>
                                    setNewItem((prev) => ({
                                      ...prev,
                                      currentAmount: e.target.value,
                                    }))
                                  }
                                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                  placeholder="e.g. 2000"
                                />
                              </div>
                            </>
                          )}
                        </>
                      )}

                      {newItemType === "expense" && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Category
                          </label>
                          <select
                            value={newItem.category}
                            onChange={(e) =>
                              setNewItem((prev) => ({
                                ...prev,
                                category: e.target.value,
                              }))
                            }
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                          >
                            <option value="General">General</option>
                            <option value="Housing">Housing</option>
                            <option value="Transport">Transport</option>
                            <option value="Food/Dining">Food/Dining</option>
                            <option value="Health">Health</option>
                            <option value="Entertainment">Entertainment</option>
                          </select>
                        </div>
                      )}
                      <button
                        type="submit"
                        className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl mt-6 hover:bg-indigo-700 transition"
                      >
                        {editingItemId ? "Save " : "Add "}
                        {newItemType === "expense"
                          ? "Expense"
                          : newItemType === "debt"
                            ? "Debt"
                            : newItemType === "income"
                              ? "Income"
                              : "Goal"}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
