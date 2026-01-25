/**
 * Drop courses step - select and drop all enrolled/waitlisted courses
 */

const { sleep } = require('./utils');

/**
 * Navigate to drop classes page and drop all enrolled courses
 */
async function dropEnrolledCourses(page) {
    console.log('Navigating to courses page...');

    // Open Enrollment menu
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        buttons.find(btn => btn.textContent.includes('Enrollment'))?.click();
    });
    console.log('Clicked Enrollment button');
    await sleep(300);

    // Click Drop Classes
    await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        links.find(link => link.textContent.includes('Drop Classes'))?.click();
    });
    console.log('Clicked Drop Classes link');
    await sleep(500);

    // Select all enrolled (green) and waitlisted (yellow) courses
    console.log('Selecting courses...');
    const selectedCount = await page.evaluate(() => {
        let count = 0;
        const rows = document.querySelectorAll('tr, .course-row, [class*="course"]');
        rows.forEach(row => {
            const hasGreen = row.querySelector('.text-green-600, .text-green-500, svg.text-green-600');
            const hasYellow = row.querySelector('.text-yellow-600, .text-yellow-500, svg.text-yellow-600');
            if (hasGreen || hasYellow) {
                const checkbox = row.querySelector('input[type="checkbox"]');
                if (checkbox && !checkbox.checked) {
                    checkbox.click();
                    count++;
                }
            }
        });
        return count;
    });
    console.log(`Selected ${selectedCount} courses`);

    // Click Drop Selected Classes button
    await sleep(1500);
    const dropClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b =>
            b.textContent.includes('Drop Selected Classes') &&
            b.id?.startsWith('btn-drop')
        );
        if (btn && !btn.disabled) {
            btn.click();
            return true;
        }
        return false;
    });

    if (dropClicked) {
        console.log('Clicked Drop Selected Classes');
        await sleep(500);

        // Enter confirmation word (CONFIRM, PROCEED, etc.)
        const confirmWord = await page.evaluate(() => {
            const input = document.querySelector('input[placeholder*="Type"]');
            if (input) {
                const match = input.placeholder.match(/'([A-Z]+)'/);
                return match ? match[1] : null;
            }
            return null;
        });

        if (confirmWord) {
            console.log(`Typing ${confirmWord}...`);
            const confirmInput = await page.$('input[placeholder*="Type"]');
            if (confirmInput) {
                await confirmInput.type(confirmWord, { delay: 5 });
                await sleep(300);
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(btn =>
                        btn.textContent.includes('Confirm and Drop') && !btn.disabled
                    )?.click();
                });
                console.log('Clicked Confirm and Drop');
                await sleep(1000);
            }
        }
    }

    return selectedCount;
}

module.exports = { dropEnrolledCourses };
