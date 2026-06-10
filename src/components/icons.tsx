import React from "react";
import {
  Smartphone,
  CarFront,
  Utensils,
  CreditCard,
  Briefcase,
  Receipt,
} from "lucide-react";

export function getIcon(name: string) {
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
