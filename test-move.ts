import fs from 'fs';

let content = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const startStr = '                  {/* Add Item Modal */}';
const endStr = '                {/* Right Column: Visualization & Breakdown */}';

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr);

if (startIdx === -1 || Math.abs(endIdx) === 1) {
    console.log("Could not find start or end bounds. start:", startIdx, "end:", endIdx);
    process.exit(1);
}

const block = content.substring(startIdx, endIdx);

content = content.replace(block, "");

let insertStr = '          )}\n        </div>\n      </main>';
if (content.indexOf(insertStr) === -1) {
    insertStr = '          )}\n        </div>';
}

content = content.replace(insertStr, block + '\n' + insertStr);

fs.writeFileSync('src/components/Dashboard.tsx', content, 'utf8');
console.log("Moved successfully.");
