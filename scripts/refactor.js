const fs = require('fs');
const path = require('path');

const directoryPath = 'c:\\Users\\gusta\\OneDrive\\Desktop\\Veltronik V2\\frontend\\src';

const replacements = {
    'business_type': 'businessType',
    'full_name': 'fullName',
    'membership_start': 'membershipStart',
    'membership_end': 'membershipEnd',
    'birth_date': 'birthDate',
    'attendance_days': 'attendanceDays',
    'payment_date': 'paymentDate',
    'payment_method': 'paymentMethod',
    'period_start': 'periodStart',
    'period_end': 'periodEnd'
};

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walkDir(fullPath));
        } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
            results.push(fullPath);
        }
    });
    return results;
}

const files = walkDir(directoryPath);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    for (const [snake, camel] of Object.entries(replacements)) {
        // Use a regex with word boundaries to ensure we don't partially replace something else
        // but wait, variables could be `m.full_name` or `data.full_name`.
        // \b is a word boundary.
        const regex = new RegExp(`\\b${snake}\\b`, 'g');
        content = content.replace(regex, camel);
    }

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated: ${file}`);
    }
});

console.log('Refactor complete.');
