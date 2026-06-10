import fs from 'fs';

let code = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

code = code.replace(
  '{activeTab === "history" && "Historical Summary"}',
  '{activeTab === "history" && "Weekly, Monthly, Yearly Log"}'
);

code = code.replace(
  'Review your past monthly & yearly financial health.',
  'Track your progress on a weekly, monthly, and yearly basis.'
);

fs.writeFileSync('src/components/Dashboard.tsx', code, 'utf8');
console.log("Updated title");
