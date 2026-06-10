import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

code = code.replace(
  'ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";',
  'ChevronLeft, ChevronRight, Calendar as CalendarIcon, Lock } from "lucide-react";'
);

code = code.replace(
  /<div className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0"[\s\S]*?<\/div>/g,
  (match) => { return match; }
)

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
console.log("Lucide imported");
